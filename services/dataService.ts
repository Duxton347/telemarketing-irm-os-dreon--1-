import { supabase, normalizePhone, getInternalEmail, slugify } from '../lib/supabase';
import {
  Task, Client, Question, User, CallRecord,
  UserRole, CallType, ProtocolStatus, ProtocolEvent,
  OperatorEventType, OperatorEvent, Sale, SaleStatus, Visit,
  CallSchedule, CallScheduleWithClient, ScheduleStatus, WhatsAppTask, ProductivityMetrics,
  UnifiedReportRow, Protocol, ClientTag, TagStatus, Quote, ClientHistoryData, ClientHistorySummary,
  OperationTeam, TaskTemplate, TaskInstance, TaskActivityLog, UserNotification, TaskList
} from '../types';
import { TagDecisionEngine } from './tagDecisionEngine';
import { SCORE_MAP, STAGE_CONFIG } from '../constants';
import { formatUnknownError } from '../utils/errorFormatting';
import { extractCampaignInsightsFromResponses, extractClientInsightsFromResponses, questionMatchesContext, resolveStoredResponseForQuestion } from '../utils/questionnaireInsights';
import {
  collectPortfolioMetadata,
  getClientEquipmentList,
  getClientPortfolioEntries,
  mergePortfolioEntries,
  mergeUniquePortfolioValues
} from '../utils/clientPortfolio';
import { normalizePortfolioEntriesWithCatalog } from '../utils/portfolioCatalog';
import {
  parseAddress,
  isLikelyInvalidStructuredCity,
  isLikelyInvalidStructuredNeighborhood,
  resolveKnownCity
} from '../utils/addressParser';
import { normalizeInterestProduct, normalizeInterestProductList } from '../utils/interestCatalog';
import { PortfolioCatalogService } from './portfolioCatalogService';
import { decodeLatin1 } from '../utils/textEncoding';
import { getTaskAssignableUsers } from '../utils/taskAssignment';
import {
  buildQuestionnaireBusinessContext,
  buildQuestionnaireClientContext
} from '../utils/questionnaireBusinessRules';

const normalize = (str: string) =>
  str ? str.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";

const normalizeClientNameKey = (value?: unknown) => normalize(String(value || ''));

const mergePhoneFields = (
  primaryCandidate?: string | null,
  secondaryCandidate?: string | null
): { phone?: string; phone_secondary?: string | null } => {
  const uniquePhones = Array.from(
    new Set(
      [primaryCandidate, secondaryCandidate]
        .map(value => normalizePhone(String(value || '')))
        .filter(Boolean)
    )
  );

  return {
    phone: uniquePhones[0],
    phone_secondary: uniquePhones[1] || null
  };
};

const isLikelyBrazilPhoneLength = (value?: string | null) => {
  const digits = normalizePhone(String(value || ''));
  return digits.length >= 10 && digits.length <= 13;
};

const isLikelyCombinedPhone = (value?: string | null) => {
  const digits = normalizePhone(String(value || ''));
  return digits.length >= 14;
};

const extractCandidatePhonesFromCombined = (value?: string | null): string[] => {
  const digits = normalizePhone(String(value || ''));
  if (!isLikelyCombinedPhone(digits)) return [];

  const candidates = new Set<string>();
  const sizes = [13, 12, 11, 10];

  for (const size of sizes) {
    if (digits.length > size) {
      const prefix = digits.slice(0, size);
      const suffix = digits.slice(-size);
      if (isLikelyBrazilPhoneLength(prefix)) candidates.add(prefix);
      if (isLikelyBrazilPhoneLength(suffix)) candidates.add(suffix);
    }
  }

  return Array.from(candidates);
};

const scoreClientRecordForMerge = (client: any) => {
  return [
    client?.status === 'CLIENT' ? 10 : 0,
    Array.isArray(client?.tags) ? client.tags.length : 0,
    getTrimmedText(client?.email) ? 2 : 0,
    getTrimmedText(client?.buyer_name) ? 2 : 0,
    getTrimmedText(client?.responsible_phone) ? 2 : 0,
    getTrimmedText(client?.phone_secondary) ? 1 : 0,
    Array.isArray(client?.portfolio_entries) ? client.portfolio_entries.length : 0
  ].reduce((sum, value) => sum + value, 0);
};

const COMMUNICATION_BLOCK_DAYS_SETTING_KEY = 'COMMUNICATION_BLOCK_DAYS';
const DEFAULT_COMMUNICATION_BLOCK_DAYS = 3;
const ACTIVE_SCHEDULE_BLOCK_STATUSES: ScheduleStatus[] = ['PENDENTE_APROVACAO', 'APROVADO', 'REPROGRAMADO'];

const getTrimmedText = (value?: unknown) => {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
};

const normalizeQuoteNumber = (value?: unknown) => getTrimmedText(value);

const normalizeUuidReference = (value?: unknown) => {
  const text = getTrimmedText(value);
  if (!text) return undefined;

  const lowered = text.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null') {
    return undefined;
  }

  return text;
};

const getSafeText = (value?: unknown, fallback = '') => {
  const text = getTrimmedText(value);
  return text ?? fallback;
};

const normalizeCommunicationBlockDays = (value?: unknown): number => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_COMMUNICATION_BLOCK_DAYS;
  }
  return parsed;
};

const getLocalDayBounds = (dateLike: string) => {
  const parsedDate = new Date(dateLike);
  const start = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    0,
    0,
    0,
    0
  );
  const end = new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    parsedDate.getDate(),
    23,
    59,
    59,
    999
  );

  return {
    dayKey: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`,
    startIso: start.toISOString(),
    endIso: end.toISOString()
  };
};

const mapScheduleRequestTypeToDb = (rawType?: string) => {
  const CALL_TYPE_DB_MAP: Record<string, string> = {
    'VENDA': 'VENDA',
    'PÃ“S-VENDA': 'POS_VENDA',
    'PÃ“S_VENDA': 'POS_VENDA',
    'POS_VENDA': 'POS_VENDA',
    'PROSPECÃ‡ÃƒO': 'PROSPECCAO',
    'PROSPECCAO': 'PROSPECCAO',
    'CONFIRMAÃ‡ÃƒO PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
    'CONFIRMACAO_PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
    'REATIVAÃ‡ÃƒO': 'POS_VENDA',
    'REATIVACAO': 'POS_VENDA',
    'WHATSAPP': 'WHATSAPP'
  };

  const type = rawType || 'VENDA';
  return CALL_TYPE_DB_MAP[type]
    || CALL_TYPE_DB_MAP[type.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '_')]
    || 'VENDA';
};

const getConfiguredCommunicationBlockDays = async (): Promise<number> => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', COMMUNICATION_BLOCK_DAYS_SETTING_KEY)
    .maybeSingle();

  if (error) {
    return DEFAULT_COMMUNICATION_BLOCK_DAYS;
  }

  return normalizeCommunicationBlockDays(data?.value);
};

const cleanupDuplicateWhatsAppQueueEntries = async (
  options?: {
    clientId?: string;
    operatorId?: string;
    taskType?: string;
  }
): Promise<number> => {
  const blockDays = await getConfiguredCommunicationBlockDays();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - blockDays);
  const cutoffIso = cutoff.toISOString();

  let openQuery = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, assigned_to, type, status, created_at, started_at, completed_at, updated_at')
    .in('status', ['pending', 'started'])
    .order('created_at', { ascending: true });

  let recentClosedQuery = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, assigned_to, type, status, created_at, started_at, completed_at, updated_at')
    .in('status', ['completed', 'skipped'])
    .gte('completed_at', cutoffIso)
    .order('completed_at', { ascending: false });

  if (options?.clientId) {
    openQuery = openQuery.eq('client_id', options.clientId);
    recentClosedQuery = recentClosedQuery.eq('client_id', options.clientId);
  }

  if (options?.taskType) {
    openQuery = openQuery.eq('type', options.taskType);
    recentClosedQuery = recentClosedQuery.eq('type', options.taskType);
  }

  const [{ data: openTasks, error: openTasksError }, { data: recentClosedTasks, error: recentClosedTasksError }] = await Promise.all([
    openQuery,
    recentClosedQuery
  ]);

  if (openTasksError) throw openTasksError;
  if (recentClosedTasksError) throw recentClosedTasksError;

  const groupedOpenTasks = new Map<string, any[]>();
  const groupedRecentClosedTasks = new Map<string, any[]>();

  for (const task of openTasks || []) {
    const key = `${task.client_id || ''}::${task.type || ''}`;
    const group = groupedOpenTasks.get(key) || [];
    group.push(task);
    groupedOpenTasks.set(key, group);
  }

  for (const task of recentClosedTasks || []) {
    const key = `${task.client_id || ''}::${task.type || ''}`;
    const group = groupedRecentClosedTasks.get(key) || [];
    group.push(task);
    groupedRecentClosedTasks.set(key, group);
  }

  const toDelete = new Set<string>();
  const recentCommunicationClientIds = await loadClientIdsWithRecentCommunication(
    (openTasks || []).map(task => task.client_id).filter(Boolean)
  );

  for (const [key, group] of groupedOpenTasks.entries()) {
    const orderedGroup = [...group].sort((left, right) =>
      new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime()
    );

    if (orderedGroup.length > 1) {
      orderedGroup.slice(1).forEach(task => toDelete.add(task.id));
    }

    const recentClosedGroup = groupedRecentClosedTasks.get(key) || [];
    if (recentClosedGroup.length > 0) {
      orderedGroup.forEach(task => toDelete.add(task.id));
    }

    orderedGroup
      .filter(task => task.status === 'pending' && recentCommunicationClientIds.has(task.client_id))
      .forEach(task => toDelete.add(task.id));
  }

  if (toDelete.size === 0) {
    return 0;
  }

  const ids = Array.from(toDelete);
  const chunkSize = 50;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const { error } = await supabase.from('whatsapp_tasks').delete().in('id', chunk);
    if (error) throw error;
  }

  return ids.length;
};

const findOpenWhatsAppTask = async (clientId: string, taskType?: string) => {
  let query = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, assigned_to, type, status, source, source_id, created_at')
    .eq('client_id', clientId)
    .in('status', ['pending', 'started'])
    .order('created_at', { ascending: true })
    .limit(1);

  if (taskType) {
    query = query.eq('type', taskType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
};

const findOpenVoiceTask = async (clientId: string, taskType?: string) => {
  let query = supabase
    .from('tasks')
    .select('id, client_id, assigned_to, type, status, campanha_id, proposito, created_at')
    .eq('client_id', clientId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  const normalizedType = mapTaskTypeToDb(taskType);
  if (normalizedType) {
    query = query.eq('type', normalizedType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
};

const getRecentCommunicationDetails = async (clientId: string) => {
  const blockDays = await getConfiguredCommunicationBlockDays();

  if (blockDays <= 0) {
    return {
      blocked: false,
      blockDays,
      lastCommunicationAt: undefined as string | undefined
    };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - blockDays);

  const cutoffIso = cutoff.toISOString();

  const [{ data: recentCalls, error: callsError }, { data: recentWhatsApp, error: whatsAppError }] = await Promise.all([
    supabase
      .from('call_logs')
      .select('id, start_time')
      .eq('client_id', clientId)
      .gte('start_time', cutoffIso)
      .order('start_time', { ascending: false })
      .limit(1),
    supabase
      .from('whatsapp_tasks')
      .select('id, created_at, started_at, completed_at, updated_at, status, skip_reason')
      .eq('client_id', clientId)
      .in('status', ['pending', 'started', 'completed', 'skipped'])
      .or(`created_at.gte.${cutoffIso},started_at.gte.${cutoffIso},completed_at.gte.${cutoffIso},updated_at.gte.${cutoffIso}`)
      .order('completed_at', { ascending: false })
      .limit(1)
  ]);

  if (callsError) throw callsError;
  if (whatsAppError) throw whatsAppError;

  const relevantRecentWhatsApp = (recentWhatsApp || []).find((task: any) => task?.skip_reason !== 'moved_to_voice');
  const lastCallAt = recentCalls?.[0]?.start_time;
  const lastWhatsAppAt = relevantRecentWhatsApp?.completed_at
    || relevantRecentWhatsApp?.started_at
    || relevantRecentWhatsApp?.updated_at
    || relevantRecentWhatsApp?.created_at;
  const lastCommunicationAt = [lastCallAt, lastWhatsAppAt]
    .filter(Boolean)
    .sort((left, right) => new Date(right as string).getTime() - new Date(left as string).getTime())[0];

  if (!lastCommunicationAt) {
    return {
      blocked: false,
      blockDays,
      lastCommunicationAt: undefined as string | undefined
    };
  }

  return {
    blocked: true,
    blockDays,
    lastCommunicationAt
  };
};

const loadClientIdsWithRecentCommunication = async (clientIds: string[]): Promise<Set<string>> => {
  const uniqueClientIds = Array.from(new Set(clientIds.filter(Boolean)));
  if (uniqueClientIds.length === 0) {
    return new Set<string>();
  }

  const blockDays = await getConfiguredCommunicationBlockDays();
  if (blockDays <= 0) {
    return new Set<string>();
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - blockDays);
  const cutoffIso = cutoff.toISOString();
  const recentClientIds = new Set<string>();
  const chunkSize = 200;

  for (let index = 0; index < uniqueClientIds.length; index += chunkSize) {
    const chunk = uniqueClientIds.slice(index, index + chunkSize);
    const [{ data: recentCalls, error: callsError }, { data: recentWhatsApp, error: whatsAppError }] = await Promise.all([
      supabase
        .from('call_logs')
        .select('client_id')
        .in('client_id', chunk)
        .gte('start_time', cutoffIso),
      supabase
        .from('whatsapp_tasks')
        .select('client_id, skip_reason')
        .in('client_id', chunk)
        .in('status', ['started', 'completed', 'skipped'])
        .or(`created_at.gte.${cutoffIso},started_at.gte.${cutoffIso},completed_at.gte.${cutoffIso},updated_at.gte.${cutoffIso}`)
    ]);

    if (callsError) throw callsError;
    if (whatsAppError) throw whatsAppError;

    (recentCalls || []).forEach((row: any) => {
      if (row?.client_id) recentClientIds.add(row.client_id);
    });
    (recentWhatsApp || [])
      .filter((row: any) => row?.skip_reason !== 'moved_to_voice')
      .forEach((row: any) => {
        if (row?.client_id) recentClientIds.add(row.client_id);
      });
  }

  return recentClientIds;
};

const restoreLatestBlockedVoiceTask = async (
  options: {
    clientId: string;
    operatorId?: string;
    taskType?: string;
  }
): Promise<string | null> => {
  let blockedTaskQuery = supabase
    .from('tasks')
    .select('id')
    .eq('client_id', options.clientId)
    .eq('status', 'skipped')
    .eq('skip_reason', 'recent_communication_block')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (options.operatorId) {
    blockedTaskQuery = blockedTaskQuery.eq('assigned_to', options.operatorId);
  }

  if (options.taskType) {
    blockedTaskQuery = blockedTaskQuery.eq('type', options.taskType);
  }

  const { data: blockedTasks, error: blockedTasksError } = await blockedTaskQuery;
  if (blockedTasksError) throw blockedTasksError;

  const blockedTaskId = blockedTasks?.[0]?.id;
  if (!blockedTaskId) {
    return null;
  }

  const { error: restoreError } = await runUpdateWithUpdatedAtFallback(
    'tasks',
    {
      status: 'pending',
      skip_reason: null,
      updated_at: new Date().toISOString()
    },
    async (safePayload) => await supabase.from('tasks').update(safePayload).eq('id', blockedTaskId)
  );
  if (restoreError) throw restoreError;

  return blockedTaskId;
};

const cleanupStaleVoiceQueueEntries = async (
  options?: {
    clientId?: string;
    operatorId?: string;
    taskType?: string;
  }
): Promise<number> => {
  let query = supabase
    .from('tasks')
    .select('id, client_id')
    .eq('status', 'pending');

  if (options?.clientId) {
    query = query.eq('client_id', options.clientId);
  }

  if (options?.operatorId) {
    query = query.eq('assigned_to', options.operatorId);
  }

  if (options?.taskType) {
    query = query.eq('type', options.taskType);
  }

  const { data: pendingTasks, error } = await query;
  if (error) throw error;
  if (!pendingTasks || pendingTasks.length === 0) return 0;

  const recentClientIds = await loadClientIdsWithRecentCommunication(
    pendingTasks.map(task => task.client_id).filter(Boolean)
  );

  const staleTaskIds = pendingTasks
    .filter(task => recentClientIds.has(task.client_id))
    .map(task => task.id);

  if (staleTaskIds.length === 0) return 0;

  const chunkSize = 50;
  for (let index = 0; index < staleTaskIds.length; index += chunkSize) {
    const chunk = staleTaskIds.slice(index, index + chunkSize);
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'skipped',
        skip_reason: 'recent_communication_block'
      })
      .in('id', chunk);
    if (updateError) throw updateError;
  }

  return staleTaskIds.length;
};

const cleanupInvalidVoiceQueueEntries = async (
  options?: {
    operatorId?: string;
  }
): Promise<number> => {
  let query = supabase
    .from('tasks')
    .select('id, client_id, status, clients(id, invalid)')
    .eq('status', 'pending');

  if (options?.operatorId) {
    query = query.eq('assigned_to', options.operatorId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const invalidTaskIds = (data || [])
    .filter((row: any) => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      return !client || client.invalid === true;
    })
    .map((row: any) => row.id);

  if (invalidTaskIds.length === 0) return 0;

  const chunkSize = 50;
  for (let index = 0; index < invalidTaskIds.length; index += chunkSize) {
    const chunk = invalidTaskIds.slice(index, index + chunkSize);
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        status: 'skipped',
        skip_reason: 'invalid_client'
      })
      .in('id', chunk);
    if (updateError) throw updateError;
  }

  return invalidTaskIds.length;
};

const cleanupInvalidWhatsAppQueueEntries = async (
  options?: {
    operatorId?: string;
  }
): Promise<number> => {
  let query = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, status, clients(id, invalid)')
    .in('status', ['pending', 'started']);

  if (options?.operatorId) {
    query = query.eq('assigned_to', options.operatorId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const invalidTaskIds = (data || [])
    .filter((row: any) => {
      const client = Array.isArray(row.clients) ? row.clients[0] : row.clients;
      return !client || client.invalid === true;
    })
    .map((row: any) => row.id);

  if (invalidTaskIds.length === 0) return 0;

  const chunkSize = 50;
  for (let index = 0; index < invalidTaskIds.length; index += chunkSize) {
    const chunk = invalidTaskIds.slice(index, index + chunkSize);
    const { error: deleteError } = await supabase
      .from('whatsapp_tasks')
      .delete()
      .in('id', chunk);
    if (deleteError) throw deleteError;
  }

  return invalidTaskIds.length;
};

const cleanupDuplicateSchedulesForEntries = async (
  entries: Array<{ customerId?: string; scheduledFor?: string }>
): Promise<number> => {
  const normalizedEntries = entries.filter(
    (entry): entry is { customerId: string; scheduledFor: string } =>
      Boolean(entry.customerId && entry.scheduledFor)
  );

  if (normalizedEntries.length === 0) {
    return 0;
  }

  const uniqueCustomerIds = Array.from(new Set(normalizedEntries.map(entry => entry.customerId)));
  const dayBoundsList = normalizedEntries.map(entry => getLocalDayBounds(entry.scheduledFor));
  const startIso = dayBoundsList.reduce((current, bounds) => bounds.startIso < current ? bounds.startIso : current, dayBoundsList[0].startIso);
  const endIso = dayBoundsList.reduce((current, bounds) => bounds.endIso > current ? bounds.endIso : current, dayBoundsList[0].endIso);

  const { data, error } = await supabase
    .from('call_schedules')
    .select('id, customer_id, scheduled_for, status, created_at')
    .in('customer_id', uniqueCustomerIds)
    .in('status', ACTIVE_SCHEDULE_BLOCK_STATUSES)
    .gte('scheduled_for', startIso)
    .lte('scheduled_for', endIso)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) {
    return 0;
  }

  const targetKeys = new Set(
    normalizedEntries.map(entry => {
      const bounds = getLocalDayBounds(entry.scheduledFor);
      return `${entry.customerId}::${bounds.dayKey}`;
    })
  );

  const groupedSchedules = new Map<string, any[]>();
  for (const schedule of data) {
    const dayKey = getLocalDayBounds(schedule.scheduled_for).dayKey;
    const groupKey = `${schedule.customer_id}::${dayKey}`;
    if (!targetKeys.has(groupKey)) continue;
    const group = groupedSchedules.get(groupKey) || [];
    group.push(schedule);
    groupedSchedules.set(groupKey, group);
  }

  const duplicateIds: string[] = [];
  for (const group of groupedSchedules.values()) {
    if (group.length <= 1) continue;
    duplicateIds.push(...group.slice(1).map(schedule => schedule.id));
  }

  if (duplicateIds.length === 0) {
    return 0;
  }

  const chunkSize = 50;
  for (let index = 0; index < duplicateIds.length; index += chunkSize) {
    const chunk = duplicateIds.slice(index, index + chunkSize);
    const { error: deleteError } = await supabase
      .from('call_schedules')
      .delete()
      .in('id', chunk);

    if (deleteError) throw deleteError;
  }

  return duplicateIds.length;
};

const validateScheduleRequests = async (
  schedules: Partial<CallSchedule>[],
  options?: { skipCleanup?: boolean }
) => {
  const normalizedSchedules = schedules.filter(
    (schedule): schedule is Partial<CallSchedule> & { customerId: string; scheduledFor: string } =>
      Boolean(schedule.customerId && schedule.scheduledFor)
  );

  if (normalizedSchedules.length === 0) {
    return;
  }

  if (!options?.skipCleanup) {
    await cleanupDuplicateSchedulesForEntries(normalizedSchedules);
  }

  const seenRequestKeys = new Set<string>();
  for (const schedule of normalizedSchedules) {
    const bounds = getLocalDayBounds(schedule.scheduledFor);
    const requestKey = `${schedule.customerId}::${bounds.dayKey}`;
    if (seenRequestKeys.has(requestKey)) {
      throw new Error('Bloqueado: a solicitação contém mais de um agendamento para o mesmo cliente no mesmo dia.');
    }
    seenRequestKeys.add(requestKey);
  }

  const uniqueCustomerIds = Array.from(new Set(normalizedSchedules.map(schedule => schedule.customerId)));
  const dayBoundsList = normalizedSchedules.map(schedule => getLocalDayBounds(schedule.scheduledFor));
  const startIso = dayBoundsList.reduce((current, bounds) => bounds.startIso < current ? bounds.startIso : current, dayBoundsList[0].startIso);
  const endIso = dayBoundsList.reduce((current, bounds) => bounds.endIso > current ? bounds.endIso : current, dayBoundsList[0].endIso);

  const [existingSchedulesResult, clientsResult] = await Promise.all([
    supabase
      .from('call_schedules')
      .select('id, customer_id, scheduled_for, status')
      .in('customer_id', uniqueCustomerIds)
      .in('status', ACTIVE_SCHEDULE_BLOCK_STATUSES)
      .gte('scheduled_for', startIso)
      .lte('scheduled_for', endIso),
    supabase
      .from('clients')
      .select('id, name')
      .in('id', uniqueCustomerIds)
  ]);

  if (existingSchedulesResult.error) throw existingSchedulesResult.error;
  if (clientsResult.error) throw clientsResult.error;

  const clientNames = new Map<string, string>(
    (clientsResult.data || []).map(client => [client.id, getSafeText(client.name, 'Cliente sem nome')])
  );

  const existingScheduleKeys = new Set(
    (existingSchedulesResult.data || []).map(schedule => `${schedule.customer_id}::${getLocalDayBounds(schedule.scheduled_for).dayKey}`)
  );

  for (const schedule of normalizedSchedules) {
    const dayKey = getLocalDayBounds(schedule.scheduledFor).dayKey;
    const conflictKey = `${schedule.customerId}::${dayKey}`;
    if (existingScheduleKeys.has(conflictKey)) {
      const clientName = clientNames.get(schedule.customerId) || 'este cliente';
      throw new Error(`Bloqueado: ${clientName} já possui um agendamento para esse dia.`);
    }
  }

  const communicationChecks = await Promise.all(
    uniqueCustomerIds.map(async customerId => ({
      customerId,
      details: await getRecentCommunicationDetails(customerId)
    }))
  );

  for (const check of communicationChecks) {
    if (!check.details.blocked) continue;
    const clientName = clientNames.get(check.customerId) || 'este cliente';
    throw new Error(
      `Bloqueado por anti-spam: ${clientName} já recebeu atendimento nos últimos ${check.details.blockDays} dia(s).`
    );
  }
};

const getSafeClientOrigin = (value?: unknown): Client['origin'] => {
  switch (getSafeText(value).toUpperCase()) {
    case 'GOOGLE_SEARCH':
      return 'GOOGLE_SEARCH';
    case 'CSV_IMPORT':
      return 'CSV_IMPORT';
    default:
      return 'MANUAL';
  }
};

const getSafeClientStatus = (value?: unknown): Client['status'] => {
  switch (getSafeText(value).toUpperCase()) {
    case 'LEAD':
      return 'LEAD';
    case 'INATIVO':
      return 'INATIVO';
    default:
      return 'CLIENT';
  }
};

const getSafeFunnelStatus = (value?: unknown): Client['funnel_status'] => {
  switch (getSafeText(value).toUpperCase()) {
    case 'CONTACT_ATTEMPT':
      return 'CONTACT_ATTEMPT';
    case 'CONTACT_MADE':
      return 'CONTACT_MADE';
    case 'QUALIFIED':
      return 'QUALIFIED';
    case 'PROPOSAL_SENT':
      return 'PROPOSAL_SENT';
    case 'PHYSICAL_VISIT':
      return 'PHYSICAL_VISIT';
    default:
      return 'NEW';
  }
};

const shouldRepairStructuredNeighborhood = (value?: string) =>
  !value || value.includes(',') || value.includes(' - ') || isLikelyInvalidStructuredNeighborhood(value);

const shouldRepairStructuredCity = (value?: string) =>
  !value || value.includes(',') || value.includes(' - ') || isLikelyInvalidStructuredCity(value);

const shouldRepairStructuredState = (value?: string) =>
  !value || value.trim().length !== 2;

const isMissingSchemaColumnError = (error: any, tableName: string, columnName: string) => {
  const message = String(error?.message || '');
  if (!message) return false;

  return message.includes(`'${columnName}'`)
    && message.includes(`'${tableName}'`)
    && (
      message.toLowerCase().includes('schema cache')
      || error?.code === 'PGRST204'
      || error?.code === '42703'
    );
};

const removeUpdatedAt = <T extends Record<string, any>>(payload: T): Omit<T, 'updated_at'> => {
  const { updated_at, ...rest } = payload;
  return rest;
};

const sortClientCandidates = (clients: any[]) => {
  return [...clients].sort((left, right) => {
    const leftCreatedAt = new Date(left.created_at || left.updated_at || 0).getTime();
    const rightCreatedAt = new Date(right.created_at || right.updated_at || 0).getTime();
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
};

const mergeUniqueClientCandidates = (...groups: any[][]) => {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const group of groups) {
    for (const client of group || []) {
      if (!client?.id || seen.has(client.id)) continue;
      seen.add(client.id);
      merged.push(client);
    }
  }

  return sortClientCandidates(merged);
};

const findExistingClientForUpsert = async (client: Partial<Client>, normalizedPhone: string) => {
  const normalizedSecondaryPhone = normalizePhone(client.phone_secondary || '');
  const structuredAddress = resolveStructuredAddressFields(client);
  const trimmedName = getTrimmedText(client.name);
  const trimmedStreet = getTrimmedText(structuredAddress.street);
  const normalizedNameKey = normalizeClientNameKey(trimmedName);

  let idMatches: any[] = [];
  let externalMatches: any[] = [];
  let primaryPhoneMatches: any[] = [];
  let secondaryPhoneMatches: any[] = [];
  let crossPhoneMatches: any[] = [];
  let secondaryCrossMatches: any[] = [];
  let nameStreetMatches: any[] = [];
  let normalizedNameMatches: any[] = [];

  if (client.id) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', client.id).neq('invalid', true).limit(5);
    if (error) throw error;
    idMatches = data || [];
  }

  if (client.external_id) {
    const { data, error } = await supabase.from('clients').select('*').eq('external_id', client.external_id).neq('invalid', true).limit(5);
    if (error) throw error;
    externalMatches = data || [];
  }

  if (normalizedPhone) {
    const { data, error } = await supabase.from('clients').select('*').eq('phone', normalizedPhone).neq('invalid', true).limit(10);
    if (error) throw error;
    primaryPhoneMatches = data || [];

    const { data: secondaryData, error: secondaryError } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_secondary', normalizedPhone)
      .neq('invalid', true)
      .limit(10);
    if (secondaryError) throw secondaryError;
    secondaryPhoneMatches = secondaryData || [];
  }

  if (normalizedSecondaryPhone) {
    const { data, error } = await supabase.from('clients').select('*').eq('phone', normalizedSecondaryPhone).neq('invalid', true).limit(10);
    if (error) throw error;
    crossPhoneMatches = data || [];

    const { data: secondaryData, error: secondaryError } = await supabase
      .from('clients')
      .select('*')
      .eq('phone_secondary', normalizedSecondaryPhone)
      .neq('invalid', true)
      .limit(10);
    if (secondaryError) throw secondaryError;
    secondaryCrossMatches = secondaryData || [];
  }

  if (trimmedName && trimmedStreet) {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .neq('invalid', true)
      .ilike('name', trimmedName)
      .ilike('street', trimmedStreet)
      .limit(10);
    if (error) throw error;
    nameStreetMatches = data || [];
  }

  if (normalizedNameKey) {
    const { data, error } = await supabase.from('clients').select('*').neq('invalid', true).limit(200);
    if (error) throw error;
    normalizedNameMatches = (data || []).filter(candidate => {
      if (normalizeClientNameKey(candidate.name) !== normalizedNameKey) return false;

      if (!normalizedPhone && !normalizedSecondaryPhone) {
        return true;
      }

      const candidatePhones = [candidate.phone, candidate.phone_secondary]
        .map(value => normalizePhone(String(value || '')))
        .filter(Boolean);

      return candidatePhones.some(
        candidatePhone => candidatePhone === normalizedPhone || candidatePhone === normalizedSecondaryPhone
      );
    });
  }

  const matches = mergeUniqueClientCandidates(
    idMatches,
    externalMatches,
    primaryPhoneMatches,
    secondaryPhoneMatches,
    crossPhoneMatches,
    secondaryCrossMatches,
    nameStreetMatches,
    normalizedNameMatches
  );

  return matches[0] || null;
};

const isUniqueViolationError = (error: any) => {
  return error?.code === '23505'
    || String(error?.message || '').toLowerCase().includes('duplicate key')
    || String(error?.message || '').toLowerCase().includes('unique constraint');
};

const runUpdateWithUpdatedAtFallback = async <TResult>(
  tableName: string,
  payload: Record<string, any>,
  updater: (safePayload: Record<string, any>) => Promise<TResult>
): Promise<TResult> => {
  let result: any = await updater(payload);

  if (result?.error && payload.updated_at !== undefined && isMissingSchemaColumnError(result.error, tableName, 'updated_at')) {
    result = await updater(removeUpdatedAt(payload));
  }

  return result;
};

const insertWhatsAppTaskRecord = async (payload: Record<string, any>) => {
  let result = await supabase.from('whatsapp_tasks').insert(payload);

  if (result.error && payload.proposito !== undefined && isMissingSchemaColumnError(result.error, 'whatsapp_tasks', 'proposito')) {
    const { proposito, ...safePayload } = payload;
    result = await supabase.from('whatsapp_tasks').insert(safePayload);
  }

  return result;
};

const insertTaskRecord = async (payload: Record<string, any>) => {
  let result = await supabase.from('tasks').insert(payload);

  if (result.error && payload.proposito !== undefined && isMissingSchemaColumnError(result.error, 'tasks', 'proposito')) {
    const { proposito, ...safePayload } = payload;
    result = await supabase.from('tasks').insert(safePayload);
  }

  return result;
};

const parseLocationFromGoogleAddress = (rawAddress?: string) => {
  const address = getTrimmedText(rawAddress);
  if (!address) {
    return { neighborhood: undefined, city: undefined, state: undefined };
  }
  const parsed = parseAddress(address);

  return {
    neighborhood: getTrimmedText(parsed.neighborhood),
    city: resolveKnownCity(getTrimmedText(parsed.city) || undefined) || getTrimmedText(parsed.city),
    state: getTrimmedText(parsed.state)?.toUpperCase()
  };
};

const resolveStructuredAddressFields = (
  primary?: Partial<Client> | null,
  fallback?: Partial<Client> | null
) => {
  const address = getTrimmedText(primary?.address) || getTrimmedText(fallback?.address) || '';
  const parsed = address ? parseAddress(address.replace(/\s*,?\s*Brasil$/i, '').trim()) : {};
  const googleParsed = parseLocationFromGoogleAddress(address);

  const primaryStreet = getTrimmedText(primary?.street);
  const fallbackStreet = getTrimmedText(fallback?.street);
  const primaryNeighborhood = getTrimmedText(primary?.neighborhood);
  const fallbackNeighborhood = getTrimmedText(fallback?.neighborhood);
  const primaryCity = resolveKnownCity(getTrimmedText(primary?.city) || undefined) || getTrimmedText(primary?.city);
  const fallbackCity = resolveKnownCity(getTrimmedText(fallback?.city) || undefined) || getTrimmedText(fallback?.city);
  const primaryState = getTrimmedText(primary?.state)?.toUpperCase();
  const fallbackState = getTrimmedText(fallback?.state)?.toUpperCase();
  const primaryZip = getTrimmedText(primary?.zip_code);
  const fallbackZip = getTrimmedText(fallback?.zip_code);

  const parsedStreet = getTrimmedText(parsed.street);
  const parsedNeighborhood = getTrimmedText(parsed.neighborhood) || googleParsed.neighborhood;
  const parsedCity = resolveKnownCity(getTrimmedText(parsed.city) || undefined) || getTrimmedText(parsed.city) || googleParsed.city;
  const parsedState = getTrimmedText(parsed.state)?.toUpperCase() || googleParsed.state;
  const parsedZip = getTrimmedText(parsed.zip_code);

  const neighborhoodCandidate = primaryNeighborhood || fallbackNeighborhood;
  const cityCandidate = primaryCity || fallbackCity;
  const stateCandidate = primaryState || fallbackState;
  const zipCandidate = primaryZip || fallbackZip;

  return {
    address,
    street: primaryStreet || fallbackStreet || parsedStreet,
    neighborhood: shouldRepairStructuredNeighborhood(neighborhoodCandidate)
      ? (parsedNeighborhood || neighborhoodCandidate)
      : neighborhoodCandidate,
    city: resolveKnownCity(
      shouldRepairStructuredCity(cityCandidate)
        ? (parsedCity || cityCandidate)
        : cityCandidate
    ) || (
      shouldRepairStructuredCity(cityCandidate)
        ? (parsedCity || cityCandidate)
        : cityCandidate
    ),
    state: shouldRepairStructuredState(stateCandidate)
      ? (parsedState || stateCandidate)
      : stateCandidate,
    zip_code: zipCandidate || parsedZip
  };
};

const mapCallTypeToDb = (type: string): string => {
  const clean = normalize(type).toUpperCase();
  if (clean.includes('PROSPEC')) return 'prospect';
  if (clean.includes('POS')) return 'pos-venda';
  if (clean.includes('COBRANCA')) return 'cobranca';
  if (clean.includes('SUPORTE')) return 'suporte';
  if (clean.includes('ACOMPANHA')) return 'acompanhamento';
  if (clean.includes('TENTATIVA')) return 'tentativa';
  if (clean.includes('VENDA')) return 'prospect';
  if (clean.includes('PROTOCOLO')) return 'suporte';
  if (clean.includes('REATIVACAO')) return 'pos-venda';
  return 'prospect';
};

const mapTaskTypeToDb = (type?: string): string | undefined => {
  if (!type) return undefined;
  return type === CallType.REATIVACAO ? 'POS_VENDA' : type;
};

const normalizeCallTypeToken = (value?: string | null) =>
  String(value || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const mapStoredCallTypeToApp = (value?: string | null): CallType => {
  switch (normalizeCallTypeToken(value)) {
    case 'POS_VENDA':
    case 'POSVENDA':
    case 'ACOMPANHAMENTO':
    case 'SUPORTE':
    case 'COBRANCA':
    case 'TENTATIVA':
      return CallType.POS_VENDA;
    case 'PROSPECCAO':
    case 'PROSPECT':
    case 'PROSPECTO':
      return CallType.PROSPECCAO;
    case 'VENDA':
      return CallType.VENDA;
    case 'CONFIRMACAO_PROTOCOLO':
      return CallType.CONFIRMACAO_PROTOCOLO;
    case 'REATIVACAO':
      return CallType.REATIVACAO;
    case 'WHATSAPP':
      return CallType.WHATSAPP;
    default:
      return (value as CallType) || CallType.POS_VENDA;
  }
};

const mapCallLogTypeToDb = (type?: string | null): string => {
  const normalized = normalizeCallTypeToken(type);

  switch (normalized) {
    case 'WHATSAPP':
      return 'WHATSAPP';
    case 'CONFIRMACAO_PROTOCOLO':
      return 'CONFIRMACAO_PROTOCOLO';
    case 'PROSPECCAO':
    case 'PROSPECT':
    case 'PROSPECTO':
      return 'PROSPECCAO';
    case 'VENDA':
      return 'VENDA';
    case 'REATIVACAO':
      return 'REATIVACAO';
    case 'POS_VENDA':
    case 'POSVENDA':
    case 'ACOMPANHAMENTO':
    case 'SUPORTE':
    case 'COBRANCA':
    case 'TENTATIVA':
      return 'POS_VENDA';
    default:
      return normalized || 'POS_VENDA';
  }
};

const expandCallTypeQueryValues = (callType?: CallType | 'ALL' | string) => {
  if (!callType) return ['ALL'];

  const raw = String(callType).trim();
  const normalized = normalizeCallTypeToken(raw);
  const values = new Set<string>([raw]);

  if (normalized) values.add(normalized);
  if (normalized === 'ALL') values.add('ALL');

  switch (normalized) {
    case 'POS_VENDA':
      values.add('PÓS-VENDA');
      values.add('PÓS_VENDA');
      break;
    case 'PROSPECCAO':
      values.add('PROSPECÇÃO');
      break;
    case 'CONFIRMACAO_PROTOCOLO':
      values.add('CONFIRMAÇÃO PROTOCOLO');
      break;
    case 'REATIVACAO':
      values.add('REATIVAÇÃO');
      break;
  }

  return Array.from(values);
};

const REPORT_METADATA_KEYS = new Set([
  'questionnaire_business_tags',
  'questionnaire_business_indices',
  'questionnaire_business_profile',
  'questionnaire_business_questions',
  'questionnaire_business_feeds',
  'target_product',
  'offer_product',
  'portfolio_scope',
  'campaign_mode',
  'offer_interest_level',
  'offer_blocker_reason',
  'campaign_name',
  'campanha_id',
  'campanha_indicada_id',
  'note'
]);

const isMeaningfulReportValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

const normalizeReportText = (value: unknown) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isPostSaleRemarketingCallType = (value?: string | null) => {
  switch (normalizeCallTypeToken(value)) {
    case 'POS_VENDA':
    case 'POSVENDA':
    case 'REATIVACAO':
    case 'VENDA':
    case 'ACOMPANHAMENTO':
    case 'SUPORTE':
    case 'COBRANCA':
    case 'TENTATIVA':
      return true;
    default:
      return false;
  }
};

const findQuestionByReportHints = (
  questions: Question[],
  callType: string | undefined,
  proposito: string | null | undefined,
  hints: string[]
) =>
  questions.find(question => {
    if (!questionMatchesContext(question, callType, proposito)) return false;
    const haystack = `${question.text} ${question.campo_resposta || ''} ${question.id}`.toLowerCase();
    return hints.some(hint => haystack.includes(hint.toLowerCase()));
  });

const normalizeUnifiedRating = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return null;
  if (value >= 0 && value <= 10) return Math.max(0, Math.min(5, Math.round(value / 2)));
  if (value >= 1 && value <= 5) return Math.round(value);
  return null;
};

const extractRatingFromValue = (value: unknown) => {
  if (!isMeaningfulReportValue(value)) return null;

  if (typeof value === 'number') {
    return normalizeUnifiedRating(value);
  }

  const text = String(value).trim();
  const numeric = Number(text.replace(',', '.'));
  if (!Number.isNaN(numeric)) {
    return normalizeUnifiedRating(numeric);
  }

  const normalized = normalizeReportText(text);
  if (normalized.includes('excelente') || normalized.includes('otimo')) return 5;
  if (normalized === 'bom' || normalized.includes('bom')) return 4;
  if (normalized.includes('regular')) return 3;
  if (normalized.includes('ruim')) return 2;
  if (normalized.includes('pessimo')) return 1;

  return null;
};

const hasResolvedQuestionnaireResponses = (
  responses: Record<string, any> = {},
  questions: Question[] = [],
  callType?: string,
  proposito?: string | null
) => {
  for (const question of questions) {
    if (!questionMatchesContext(question, callType, proposito)) continue;
    const value = resolveStoredResponseForQuestion(responses, question);
    if (isMeaningfulReportValue(value)) return true;
  }

  return Object.entries(responses).some(([key, value]) => {
    if (key.endsWith('_note')) return false;
    if (REPORT_METADATA_KEYS.has(key)) return false;
    return isMeaningfulReportValue(value);
  });
};

const extractUnifiedReportRating = (
  responses: Record<string, any> = {},
  questions: Question[] = [],
  callType?: string,
  proposito?: string | null
) => {
  const ratingQuestion = findQuestionByReportHints(
    questions,
    callType,
    proposito,
    ['nps', 'nota', 'avali', 'satisfa']
  );

  if (ratingQuestion) {
    const resolved = resolveStoredResponseForQuestion(responses, ratingQuestion);
    const rating = extractRatingFromValue(resolved);
    if (rating !== null) return rating;
  }

  for (const [key, value] of Object.entries(responses)) {
    if (key.endsWith('_note')) continue;
    const normalizedKey = normalizeReportText(key);
    if (!['nps', 'nota', 'avali', 'satisfa'].some(hint => normalizedKey.includes(hint))) continue;
    const rating = extractRatingFromValue(value);
    if (rating !== null) return rating;
  }

  return null;
};

const sanitizeOfferValue = (value?: unknown) => {
  if (!isMeaningfulReportValue(value)) return undefined;
  const text = String(value).trim();
  const normalized = normalizeReportText(text);
  if (!normalized || normalized === 'sim' || normalized === 'nao' || normalized === 'não') {
    return undefined;
  }
  return text;
};

const extractUnifiedReportOffer = (
  responses: Record<string, any> = {},
  questions: Question[] = [],
  callType?: string,
  proposito?: string | null
) => {
  const campaignInsights = extractCampaignInsightsFromResponses(responses, questions, callType, proposito);
  const candidates = [
    campaignInsights.enrichedResponses.upsell_offer,
    campaignInsights.enrichedResponses.offer_product,
    campaignInsights.enrichedResponses.target_product,
    campaignInsights.enrichedResponses.interest_product
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeOfferValue(candidate);
    if (sanitized) return sanitized;
  }

  return undefined;
};

const extractDelayDaysFromValue = (value: unknown) => {
  if (!isMeaningfulReportValue(value)) return undefined;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 ? Math.round(value) : undefined;
  }

  const text = String(value).trim();
  const numericMatch = text.match(/\d+/);
  if (!numericMatch) return undefined;

  const numeric = Number(numericMatch[0]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
};

const extractUnifiedReportDelayDays = (
  responses: Record<string, any> = {},
  questions: Question[] = [],
  callType?: string,
  proposito?: string | null
) => {
  const delayQuestion = findQuestionByReportHints(
    questions,
    callType,
    proposito,
    ['prazo_dias_atraso', 'atraso_entrega_dias', 'quantos dias', 'dias de atraso']
  );

  if (delayQuestion) {
    const resolved = resolveStoredResponseForQuestion(responses, delayQuestion);
    const fromQuestion = extractDelayDaysFromValue(resolved);
    if (fromQuestion !== undefined) return fromQuestion;
  }

  const explicitCandidates = [
    responses.prazo_dias_atraso,
    responses.atraso_entrega_dias,
    responses.dias_atraso,
    responses.delivery_delay_days
  ];

  for (const candidate of explicitCandidates) {
    const delayDays = extractDelayDaysFromValue(candidate);
    if (delayDays !== undefined) return delayDays;
  }

  for (const [key, value] of Object.entries(responses)) {
    const normalizedKey = normalizeReportText(key);
    if (!normalizedKey.includes('atras')) continue;
    if (!normalizedKey.includes('dia')) continue;

    const delayDays = extractDelayDaysFromValue(value);
    if (delayDays !== undefined) return delayDays;
  }

  return undefined;
};

const loadUnifiedReportDelayDays = async (
  clientIds: string[],
  operatorId?: string
): Promise<Map<string, number>> => {
  if (clientIds.length === 0) return new Map<string, number>();

  let callsQuery = supabase
    .from('call_logs')
    .select('client_id, operator_id, start_time, call_type, responses, proposito')
    .in('client_id', clientIds);
  let whatsappQuery = supabase
    .from('whatsapp_tasks')
    .select('client_id, assigned_to, type, status, created_at, completed_at, responses')
    .in('client_id', clientIds);

  if (operatorId) {
    callsQuery = callsQuery.eq('operator_id', operatorId);
    whatsappQuery = whatsappQuery.eq('assigned_to', operatorId);
  }

  const [questions, callsResult, whatsappResult] = await Promise.all([
    loadActiveQuestions(),
    callsQuery,
    whatsappQuery
  ]);

  if (callsResult.error) throw callsResult.error;
  if (whatsappResult.error) throw whatsappResult.error;

  const latestDelayByClient = new Map<string, { timestamp: number; delayDays: number }>();

  const registerDelay = (clientId?: string | null, timestamp?: string | null, delayDays?: number) => {
    if (!clientId || !delayDays || delayDays <= 0) return;

    const currentTimestamp = new Date(timestamp || 0).getTime();
    const previous = latestDelayByClient.get(clientId);

    if (!previous || currentTimestamp >= previous.timestamp) {
      latestDelayByClient.set(clientId, {
        timestamp: currentTimestamp,
        delayDays
      });
    }
  };

  for (const call of (callsResult.data || []).filter(call => isPostSaleRemarketingCallType(call.call_type))) {
    registerDelay(
      call.client_id,
      call.start_time,
      extractUnifiedReportDelayDays(call.responses || {}, questions, call.call_type, call.proposito)
    );
  }

  for (const task of (whatsappResult.data || []).filter(task => task.status === 'completed')) {
    registerDelay(
      task.client_id,
      task.completed_at || task.created_at,
      extractUnifiedReportDelayDays(task.responses || {}, questions, CallType.WHATSAPP)
    );
  }

  return new Map(Array.from(latestDelayByClient.entries()).map(([clientId, value]) => [clientId, value.delayDays]));
};

const buildUnifiedReportFallback = async (
  operatorId?: string,
  statusFilter?: string
): Promise<UnifiedReportRow[]> => {
  let callsQuery = supabase
    .from('call_logs')
    .select('id, client_id, operator_id, start_time, call_type, responses, proposito');
  let tasksQuery = supabase
    .from('tasks')
    .select('id, client_id, assigned_to, type, status, skip_reason, created_at');
  let whatsappQuery = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, assigned_to, type, status, skip_reason, created_at, completed_at, responses');
  let salesQuery = supabase
    .from('sales')
    .select('id, client_id, customer_id, operator_id, registered_at, status');

  if (operatorId) {
    callsQuery = callsQuery.eq('operator_id', operatorId);
    tasksQuery = tasksQuery.eq('assigned_to', operatorId);
    whatsappQuery = whatsappQuery.eq('assigned_to', operatorId);
    salesQuery = salesQuery.eq('operator_id', operatorId);
  }

  const loadFallbackClients = async () => {
    const rows: Array<{ id: string; name: string; phone: string; status: string }> = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      let query = supabase
        .from('clients')
        .select('id, name, phone, status')
        .order('name')
        .range(from, from + pageSize - 1);

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      rows.push(...(data || []));

      if (!data || data.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    return rows;
  };

  const [
    questions,
    clients,
    callsResult,
    tasksResult,
    whatsappResult,
    salesResult
  ] = await Promise.all([
    loadActiveQuestions(),
    loadFallbackClients(),
    callsQuery,
    tasksQuery,
    whatsappQuery,
    salesQuery
  ]);

  if (callsResult.error) throw callsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (whatsappResult.error) throw whatsappResult.error;
  if (salesResult.error) throw salesResult.error;

  const relevantCalls = (callsResult.data || []).filter(call => isPostSaleRemarketingCallType(call.call_type));
  const relevantTasks = (tasksResult.data || []).filter(task => isPostSaleRemarketingCallType(task.type));
  const whatsappTasks = whatsappResult.data || [];
  const validSales = (salesResult.data || []).filter(sale => sale.status !== 'CANCELADO');

  const clientMap = new Map(clients.map(client => [client.id, client]));
  const clientIds = new Set<string>();

  clients.forEach(client => {
    if (client.status !== 'LEAD') {
      clientIds.add(client.id);
    }
  });
  relevantCalls.forEach(call => {
    if (call.client_id) clientIds.add(call.client_id);
  });
  relevantTasks.forEach(task => {
    if (task.client_id) clientIds.add(task.client_id);
  });
  whatsappTasks.forEach(task => {
    if (task.client_id) clientIds.add(task.client_id);
  });
  validSales.forEach(sale => {
    const saleClientId = sale.client_id || sale.customer_id;
    if (saleClientId) clientIds.add(saleClientId);
  });

  const rows = Array.from(clientIds).map(clientId => {
    const client = clientMap.get(clientId);
    const clientCalls = relevantCalls.filter(call => call.client_id === clientId);
    const clientSkippedTasks = relevantTasks.filter(task => task.client_id === clientId && task.status === 'skipped');
    const clientWhatsapp = whatsappTasks.filter(task => task.client_id === clientId && (task.status === 'completed' || task.status === 'skipped'));
    const clientSales = validSales.filter(sale => (sale.client_id || sale.customer_id) === clientId);

    const events: Array<{
      timestamp?: string;
      outcome: string;
      responseStatus: 'Respondeu' | 'Sem Resposta';
      operatorId?: string;
      channel: string;
      rating?: number | null;
      upsellOffer?: string;
      skipReason?: string;
      delayDays?: number;
    }> = [];

    clientCalls.forEach(call => {
      events.push({
        timestamp: call.start_time,
        outcome: String(mapStoredCallTypeToApp(call.call_type) || 'Ligação'),
        responseStatus: hasResolvedQuestionnaireResponses(call.responses || {}, questions, call.call_type, call.proposito)
          ? 'Respondeu'
          : 'Sem Resposta',
        operatorId: call.operator_id,
        channel: 'Ligação',
        rating: extractUnifiedReportRating(call.responses || {}, questions, call.call_type, call.proposito),
        upsellOffer: extractUnifiedReportOffer(call.responses || {}, questions, call.call_type, call.proposito),
        delayDays: extractUnifiedReportDelayDays(call.responses || {}, questions, call.call_type, call.proposito)
      });
    });

    clientSkippedTasks.forEach(task => {
      events.push({
        timestamp: task.created_at,
        outcome: String(mapStoredCallTypeToApp(task.type) || 'Ligação'),
        responseStatus: 'Sem Resposta',
        operatorId: task.assigned_to,
        channel: 'Ligação',
        skipReason: task.skip_reason || undefined
      });
    });

    clientWhatsapp.forEach(task => {
      events.push({
        timestamp: task.completed_at || task.created_at,
        outcome: 'WhatsApp',
        responseStatus: task.status === 'completed' && hasResolvedQuestionnaireResponses(task.responses || {}, questions, CallType.WHATSAPP)
          ? 'Respondeu'
          : 'Sem Resposta',
        operatorId: task.assigned_to,
        channel: 'WhatsApp',
        rating: extractUnifiedReportRating(task.responses || {}, questions, CallType.WHATSAPP),
        upsellOffer: extractUnifiedReportOffer(task.responses || {}, questions, CallType.WHATSAPP),
        skipReason: task.status === 'skipped' ? task.skip_reason || undefined : undefined,
        delayDays: extractUnifiedReportDelayDays(task.responses || {}, questions, CallType.WHATSAPP)
      });
    });

    events.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

    const lastEvent = events[0];
    const lastRatedEvent = events.find(event => event.rating !== null && event.rating !== undefined);
    const lastOfferEvent = events.find(event => event.upsellOffer);
    const lastDelayEvent = events.find(event => event.delayDays !== undefined);
    const hasSale = clientSales.length > 0;

    return {
      clientId,
      clientName: client?.name || 'Cliente Desconhecido',
      clientPhone: client?.phone || '',
      clientStatus: client?.status || 'CLIENT',
      attemptsCount: events.length,
      lastContactAt: lastEvent?.timestamp,
      lastOutcome: lastEvent?.outcome,
      lastOperatorId: lastEvent?.operatorId,
      lastChannel: lastEvent?.channel,
      lastContactGenre: lastEvent?.channel,
      lastRating: lastRatedEvent?.rating ?? undefined,
      upsellOffer: lastOfferEvent?.upsellOffer,
      upsellStatus: lastOfferEvent?.upsellOffer ? (hasSale ? 'DONE' : 'OPEN') : undefined,
      responseStatus: events.length === 0 ? 'Não Contatado' : (lastEvent?.responseStatus || 'Sem Resposta'),
      conversionStatus: hasSale ? 'Gerou Venda' : 'Sem Venda',
      lastSkipReason: lastEvent?.responseStatus === 'Sem Resposta' ? lastEvent?.skipReason : undefined,
      lastDelayDays: lastDelayEvent?.delayDays
    } as UnifiedReportRow;
  });

  return rows.sort((a, b) => {
    const dateDiff = new Date(b.lastContactAt || 0).getTime() - new Date(a.lastContactAt || 0).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.clientName.localeCompare(b.clientName);
  });
};

const mapQuestionRecord = (q: any): Question => ({
  id: q.id,
  text: q.text,
  options: q.options || [],
  type: q.type === 'ALL' ? 'ALL' : mapStoredCallTypeToApp(q.type),
  order: q.order_index,
  stageId: q.stage_id,
  proposito: q.proposito,
  campo_resposta: q.campo_resposta,
  tipo_input: q.tipo_input,
  obrigatoria: q.obrigatoria,
  ativo: q.ativo
});

const loadActiveQuestions = async (): Promise<Question[]> => {
  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .eq('ativo', true)
    .order('order_index', { ascending: true });

  if (error) {
    console.error('Error loading active questions', error);
    return [];
  }

  return (data || []).map(mapQuestionRecord);
};

const normalizeClientTagValue = (value?: string) => {
  if (!value) return undefined;
  return normalize(value).toUpperCase().replace(/\s+/g, '_');
};

const NEGATIVE_TAG_MOTIVOS = new Set([
  'ATENDIMENTO_RUIM',
  'EXECUCAO_RUIM',
  'ATRASO',
  'PRODUTO_DEFEITO',
  'INSATISFEITO'
]);

const isNegativeTagSignal = (categoria?: string, motivo?: string) =>
  categoria === 'RECUPERACAO' ||
  categoria === 'CLIENTE_PERDIDO' ||
  NEGATIVE_TAG_MOTIVOS.has(motivo || '');

const normalizeResponseValue = (value: unknown) =>
  typeof value === 'string' ? normalize(value) : '';

const hasNegativeCallSignal = (responses?: Record<string, any>) => {
  if (!responses) return false;

  const entries = Object.entries(responses);
  const values = entries.map(([, value]) => normalizeResponseValue(value));
  const hasValue = (...candidates: string[]) => values.some(value => candidates.some(candidate => value.includes(normalize(candidate))));

  const numericDelay = Number(String(responses.prazo_dias_atraso || '').replace(/\D/g, ''));

  if (normalizeResponseValue(responses.motivo_insatisfacao_principal)) return true;
  if (normalizeResponseValue(responses.produto_problema_especifico)) return true;
  if (normalizeResponseValue(responses.reclamacao_instalacao_ocorrencia)) return true;
  if (hasValue('ruim', 'precisa melhorar', 'demorou pra responder', 'defeito', 'atraso', 'negociacao', 'garantia', 'venda incompleta')) return true;
  if (responses.produto_troca_necessaria === 'Sim') return true;
  if (responses.atraso_entrega === 'Sim') return true;
  if (responses.prejuizo_atraso === 'Sim') return true;
  if (numericDelay > 0) return true;
  return false;
};

const hasPositiveCallSignal = (responses?: Record<string, any>) => {
  if (!responses) return false;
  const positiveFields = [
    responses.protocolo_resolvido,
    responses.satisfacao_resolucao,
    responses.servico_concluido
  ].map(normalizeResponseValue);

  return positiveFields.some(value =>
    value === 'sim' ||
    value === 'bom' ||
    value === 'excelente' ||
    value === 'otimo'
  );
};

const enrichClientInsightsFromCallLogs = (callLogs: any[] = [], questions: Question[] = []) => {
  const derivedProfile: Partial<Client> = {};

  const normalizedLogs = callLogs.map(log => {
    const insights = extractClientInsightsFromResponses(
      log.responses || {},
      questions,
      log.call_type,
      log.proposito
    );

    if (!derivedProfile.email && insights.email) derivedProfile.email = insights.email;
    if (!derivedProfile.interest_product && insights.interestProduct) {
      derivedProfile.interest_product = insights.interestProduct;
    }
    if (!derivedProfile.buyer_name && insights.buyerName) derivedProfile.buyer_name = insights.buyerName;
    if (!derivedProfile.responsible_phone && insights.responsiblePhone) {
      derivedProfile.responsible_phone = insights.responsiblePhone;
    }

    return {
      ...log,
      responses: insights.enrichedResponses
    };
  });

  return {
    normalizedLogs,
    derivedProfile
  };
};

const buildDerivedClientTags = (
  client: any,
  callLogs: any[] = [],
  derivedProfile: Partial<Client> = {},
  questions: Question[] = []
) => {
  const nextTags = new Set<string>(Array.isArray(client?.tags) ? client.tags : []);

  if (client?.status === 'CLIENT') {
    nextTags.add('JA_CLIENTE');
  }

  const interestProduct = derivedProfile.interest_product || client?.interest_product;
  if (interestProduct) {
    const interestTag = normalizeClientTagValue(interestProduct);
    if (interestTag) nextTags.add(`INTERESSE_${interestTag}`);
  }

  const items = getClientEquipmentList(client);
  items
    .map((item: string) => normalizeClientTagValue(item))
    .filter(Boolean)
    .forEach((itemTag: string) => nextTags.add(`TEM_${itemTag}`));

  if (client?.satisfaction === 'low') {
    nextTags.add('CLIENTE_INSATISFEITO');
  }

  if (client?.email || derivedProfile.email) nextTags.add('CADASTRO_COM_EMAIL');
  if (client?.buyer_name || derivedProfile.buyer_name) nextTags.add('CADASTRO_COM_DECISOR');
  if (client?.responsible_phone || derivedProfile.responsible_phone) nextTags.add('CADASTRO_COM_WHATSAPP');
  if ((client?.email || derivedProfile.email) && (client?.buyer_name || derivedProfile.buyer_name) && (client?.responsible_phone || derivedProfile.responsible_phone)) {
    nextTags.add('CADASTRO_RICO');
  } else {
    nextTags.add('CADASTRO_INCOMPLETO');
  }

  const hasNegativeSignal = callLogs.some(log => hasNegativeCallSignal(log.responses));
  const hasPositiveSignal = callLogs.some(log => hasPositiveCallSignal(log.responses));

  if (hasNegativeSignal) nextTags.add('CLIENTE_INSATISFEITO');
  if (hasPositiveSignal) nextTags.add('CLIENTE_SATISFEITO');

  callLogs.forEach(log => {
    const business = buildQuestionnaireBusinessContext({
      responses: log.responses || {},
      questions,
      callType: log.call_type,
      proposito: log.proposito,
      clientContext: buildQuestionnaireClientContext({
        email: derivedProfile.email || client?.email,
        buyer_name: derivedProfile.buyer_name || client?.buyer_name,
        responsible_phone: derivedProfile.responsible_phone || client?.responsible_phone,
        status: client?.status
      } as any)
    });

    business.tags.forEach(tag => nextTags.add(tag));
  });

  return Array.from(nextTags);
};

const syncDerivedTagsForClient = async (clientId: string): Promise<boolean> => {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, tags, items, equipment_models, interest_product, status, satisfaction, email, buyer_name, responsible_phone')
    .eq('id', clientId)
    .maybeSingle();

  if (clientError || !client) {
    if (clientError) console.error('Error loading client for derived tag sync', clientError);
    return false;
  }

  const [questions, logsResult] = await Promise.all([
    loadActiveQuestions(),
    supabase
      .from('call_logs')
      .select('responses, call_type, start_time, proposito')
      .eq('client_id', clientId)
      .order('start_time', { ascending: false })
      .limit(50)
  ]);

  const { data: callLogs, error: logsError } = logsResult;

  if (logsError) {
    console.error('Error loading call logs for derived tag sync', logsError);
    return false;
  }

  const { normalizedLogs, derivedProfile } = enrichClientInsightsFromCallLogs(callLogs || [], questions);
  const nextTags = buildDerivedClientTags(client, normalizedLogs, derivedProfile, questions);
  const currentTags = Array.isArray(client.tags) ? client.tags : [];
  const sortedCurrent = [...currentTags].sort();
  const sortedNext = [...nextTags].sort();

  const payload: any = {};

  if (!client.email && derivedProfile.email) payload.email = derivedProfile.email;
  if (!client.interest_product && derivedProfile.interest_product) {
    payload.interest_product = derivedProfile.interest_product;
  }
  if (!client.buyer_name && derivedProfile.buyer_name) payload.buyer_name = derivedProfile.buyer_name;
  if (!client.responsible_phone && derivedProfile.responsible_phone) {
    payload.responsible_phone = derivedProfile.responsible_phone;
  }

  if (JSON.stringify(sortedCurrent) !== JSON.stringify(sortedNext)) {
    payload.tags = nextTags;
  }

  if (Object.keys(payload).length === 0) {
    return false;
  }

  const { error: updateError } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', clientId);

  if (updateError) {
    console.error('Error updating derived client tags', updateError);
    return false;
  }

  return true;
};

const extractCampaignContextFromFilters = (filters?: any) => {
  const safeFilters = filters || {};
  const normalizeContextValue = (value?: string | null) => {
    const normalized = String(value || '').trim();
    return normalized || undefined;
  };
  const targetProduct =
    normalizeContextValue(safeFilters.produtoAlvo) ||
    normalizeContextValue(safeFilters.targetProduct) ||
    (Array.isArray(safeFilters.equipamentos) && safeFilters.equipamentos.length === 1 ? safeFilters.equipamentos[0] : undefined);

  const offerProduct =
    normalizeContextValue(safeFilters.ofertaAlvo) ||
    normalizeContextValue(safeFilters.offerProduct) ||
    (Array.isArray(safeFilters.interesses) && safeFilters.interesses.length === 1 ? safeFilters.interesses[0] : undefined);

  return {
    targetProduct,
    offerProduct,
    portfolioScope: normalizeContextValue(safeFilters.escopoLinha) || normalizeContextValue(safeFilters.portfolioScope) || undefined,
    campaignMode: normalizeContextValue(safeFilters.campaignMode) || undefined
  };
};

const loadCampaignContextMap = async (campaignIds: string[]) => {
  const ids = Array.from(new Set(campaignIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, any>();

  const { data, error } = await supabase
    .from('campanhas')
    .select('id, nome, proposito_alvo, filters_usados')
    .in('id', ids);

  if (error) {
    console.error('Error loading campaign context map', error);
    return new Map<string, any>();
  }

  return new Map(
    (data || []).map((campaign: any) => [
      campaign.id,
      {
        campaignName: campaign.nome,
        proposito: campaign.proposito_alvo,
        ...extractCampaignContextFromFilters(campaign.filters_usados)
      }
    ])
  );
};

const buildHistoryBreakdown = (entries: Array<{ key?: string; label?: string }>) => {
  const totals = new Map<string, { key: string; label: string; total: number }>();

  for (const entry of entries) {
    if (!entry.key || !entry.label) continue;
    const current = totals.get(entry.key) || { key: entry.key, label: entry.label, total: 0 };
    current.total += 1;
    totals.set(entry.key, current);
  }

  return Array.from(totals.values()).sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
};

const buildClientHistorySummary = (calls: CallRecord[], protocols: Protocol[]): ClientHistorySummary => ({
  totalCalls: calls.length,
  totalProtocols: protocols.length,
  openProtocols: protocols.filter(proto => proto.status !== ProtocolStatus.FECHADO).length,
  callCountsByType: buildHistoryBreakdown(calls.map(call => ({ key: call.type, label: call.type }))),
  callCountsByPurpose: buildHistoryBreakdown(calls.map(call => ({ key: call.proposito, label: call.proposito }))),
  callCountsByTargetProduct: buildHistoryBreakdown(
    calls.map(call => ({
      key: call.targetProduct || call.offerProduct,
      label: call.targetProduct || call.offerProduct
    }))
  )
});

const INTERNAL_TASK_DONE_STATUSES = ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'];

const parseJsonValue = (value: any) => {
  if (!value) return null;
  if (typeof value === 'object') return value;

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Nao foi possivel converter JSON armazenado.', error);
    return null;
  }
};

const normalizeTaskInstanceStatus = (status?: string, dueAt?: string | null): TaskInstance['status'] => {
  const normalizedStatus = (status || 'PENDENTE') as TaskInstance['status'];
  if (
    normalizedStatus === 'PENDENTE'
    && dueAt
    && new Date(dueAt).getTime() < Date.now()
  ) {
    return 'ATRASADO';
  }

  return normalizedStatus;
};

const normalizeUserRole = (value?: unknown): UserRole => {
  const normalizedValue = getSafeText(value).toUpperCase();

  switch (normalizedValue) {
    case UserRole.ADMIN:
      return UserRole.ADMIN;
    case UserRole.SUPERVISOR:
    case 'MANAGER':
      return UserRole.SUPERVISOR;
    case UserRole.OPERATOR:
    case 'USER':
      return UserRole.OPERATOR;
    default:
      return UserRole.OPERATOR;
  }
};

const enrichProfilesWithTeamMetadata = async (profiles: any[] = []) => {
  const safeProfiles = profiles.filter(Boolean);
  const teamIds = Array.from(new Set(safeProfiles.map(profile => profile?.team_id).filter(Boolean)));

  if (teamIds.length === 0) {
    return safeProfiles;
  }

  const { data, error } = await supabase
    .from('operation_teams')
    .select('id, name')
    .in('id', teamIds);

  if (error) {
    return safeProfiles;
  }

  const teamsById = new Map((data || []).map((team: any) => [team.id, team]));

  return safeProfiles.map(profile => {
    const team = profile?.team_id ? teamsById.get(profile.team_id) : null;

    if (!team) {
      return profile;
    }

    return {
      ...profile,
      operation_teams: {
        ...(profile?.operation_teams && typeof profile.operation_teams === 'object' ? profile.operation_teams : {}),
        ...team
      }
    };
  });
};

const mapProfileToUser = (profile: any): User => ({
  id: getSafeText(profile?.id),
  name: getSafeText(profile?.username_display, 'Sem Nome'),
  username: getSafeText(profile?.username_slug || profile?.username),
  role: normalizeUserRole(
    profile?.role
    ?? profile?.user_role
    ?? profile?.app_metadata?.role
    ?? profile?.user_metadata?.role
  ),
  active: profile?.active ?? true,
  teamId: profile?.team_id || null,
  teamName: profile?.operation_teams?.name || null,
  sectorCode: profile?.sector_code || null
});

const mapOperationTeamRecord = (team: any): OperationTeam => ({
  id: team.id,
  name: team.name,
  sectorCode: team.sector_code,
  description: team.description,
  active: team.active ?? true,
  createdAt: team.created_at,
  updatedAt: team.updated_at
});

const mapTaskTemplateRecord = (template: any): TaskTemplate => ({
  id: template.id,
  title: template.title,
  description: template.description,
  category: template.category,
  taskScope: template.task_scope,
  recurrenceType: template.recurrence_type,
  recurrenceConfig: parseJsonValue(template.recurrence_config),
  isAccumulative: template.is_accumulative ?? false,
  generateOnlyIfPreviousClosed: template.generate_only_if_previous_closed ?? false,
  requiresApproval: template.requires_approval ?? false,
  requiresCommentOnCompletion: template.requires_comment_on_completion ?? false,
  defaultPriority: template.default_priority || 'MEDIUM',
  defaultDueTime: template.default_due_time,
  createdBy: template.created_by,
  isActive: template.is_active ?? true,
  assignMode: template.assign_mode || 'SPECIFIC',
  assignConfig: parseJsonValue(template.assign_config),
  createdAt: template.created_at,
  updatedAt: template.updated_at
});

const mapTaskListRecord = (list: any): TaskList => ({
  id: list.id,
  name: list.name,
  ownerUserId: list.owner_user_id,
  createdBy: list.created_by,
  active: list.active ?? true,
  createdAt: list.created_at,
  updatedAt: list.updated_at
});

const mapTaskInstanceRecord = (task: any): TaskInstance => {
  const metadata = parseJsonValue(task.metadata) || {};
  const listId = getSafeText(metadata.taskListId || metadata.list_id) || null;
  const listName = getSafeText(metadata.taskListName || metadata.list_name) || null;
  const reminderAt = getSafeText(metadata.reminderAt || metadata.reminder_date) || null;

  return {
    id: task.id,
    templateId: task.template_id,
    sourceType: task.source_type,
    sourceId: task.source_id,
    title: task.title,
    description: task.description,
    category: task.category,
    assignedTo: task.assigned_to,
    assignedBy: task.assigned_by,
    visibilityScope: task.visibility_scope || 'PRIVATE',
    priority: task.priority || 'MEDIUM',
    dueAt: task.due_at,
    startsAt: task.starts_at,
    completedAt: task.completed_at,
    status: normalizeTaskInstanceStatus(task.status, task.due_at),
    isRecurringInstance: task.is_recurring_instance ?? false,
    isAccumulated: task.is_accumulated ?? false,
    carryoverFrom: task.carryover_from,
    completionNote: task.completion_note,
    metadata,
    listId,
    listName,
    reminderAt,
    isImportant: Boolean(metadata.isImportant),
    inMyDay: Boolean(metadata.inMyDay),
    recurrenceKey: task.recurrence_key,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
    assignedUser: task.assigned_profile ? mapProfileToUser(task.assigned_profile) : null,
    assignedByUser: task.assigned_by_profile ? mapProfileToUser(task.assigned_by_profile) : null,
    template: task.task_templates ? mapTaskTemplateRecord(Array.isArray(task.task_templates) ? task.task_templates[0] : task.task_templates) : null
  };
};

const mapTaskActivityLogRecord = (row: any): TaskActivityLog => ({
  id: row.id,
  taskInstanceId: row.task_instance_id,
  action: row.action,
  actorId: row.actor_id,
  oldValue: parseJsonValue(row.old_value),
  newValue: parseJsonValue(row.new_value),
  note: row.note,
  createdAt: row.created_at,
  actorName: row.actor_profile?.username_display || null
});

const mapUserNotificationRecord = (row: any): UserNotification => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  body: row.body,
  relatedEntityType: row.related_entity_type,
  relatedEntityId: row.related_entity_id,
  isRead: row.is_read ?? false,
  createdAt: row.created_at
});

const isMissingSchemaResourceError = (error: any, resourceNames: string[] = []) => {
  if (!error) return false;

  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase();
  const errorCode = String(error?.code || '').toUpperCase();
  const normalizedResources = resourceNames.map(resource => resource.toLowerCase());
  const mentionsRequestedResource =
    normalizedResources.length === 0
    || normalizedResources.some(resource => message.includes(resource));

  if (!mentionsRequestedResource) return false;

  return (
    ['PGRST205', 'PGRST202', '42P01', '42883'].includes(errorCode)
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('could not find the function')
    || message.includes('does not exist')
  );
};

const listAssignableProfileRecords = async (includeInactive: boolean = true) => {
  try {
    const { data, error } = await supabase.rpc('list_assignable_profiles', {
      p_include_inactive: includeInactive
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    if (!isMissingSchemaResourceError(error, ['list_assignable_profiles'])) {
      console.warn('Nao foi possivel carregar perfis via RPC list_assignable_profiles, usando fallback direto.', error);
    }

    let query = supabase
      .from('profiles')
      .select('id, username_display, username_slug, role, active, team_id, sector_code')
      .order('username_display');

    if (!includeInactive) {
      query = query.eq('active', true);
    }

    const { data, error: fallbackError } = await query;
    if (fallbackError) throw fallbackError;
    return data || [];
  }
};

const loadProfileRecord = async (profileId: string, allowMissing: boolean = false) => {
  const response = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle();

  if (response.error) {
    if (allowMissing && isMissingSchemaResourceError(response.error, ['profiles'])) {
      return null;
    }
    throw response.error;
  }

  if (!response.data) {
    return null;
  }

  const [enrichedProfile] = await enrichProfilesWithTeamMetadata([response.data]);
  return enrichedProfile || response.data;
};

const getActiveManagerIds = async () => {
  const profiles = await listAssignableProfileRecords(false);
  return profiles
    .filter((profile: any) => [UserRole.ADMIN, UserRole.SUPERVISOR].includes(normalizeUserRole(profile?.role)))
    .map((profile: any) => profile.id)
    .filter(Boolean);
};

const createUserNotifications = async (notifications: Array<Partial<UserNotification>>) => {
  const payload = notifications
    .filter(notification => notification.userId && notification.title && notification.type)
    .map(notification => ({
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      body: notification.body || null,
      related_entity_type: notification.relatedEntityType || null,
      related_entity_id: notification.relatedEntityId || null,
      is_read: notification.isRead ?? false
    }))
    .filter((notification, index, currentPayload) => {
      const notificationKey = [
        notification.user_id,
        notification.type,
        notification.related_entity_type,
        notification.related_entity_id,
        notification.title,
        notification.body
      ].join('::');

      return currentPayload.findIndex(candidate => [
        candidate.user_id,
        candidate.type,
        candidate.related_entity_type,
        candidate.related_entity_id,
        candidate.title,
        candidate.body
      ].join('::') === notificationKey) === index;
    });

  if (payload.length === 0) return;

  const { error } = await supabase.from('user_notifications').insert(payload);
  if (error) {
    if (isMissingSchemaResourceError(error, ['user_notifications'])) return;
    throw error;
  }
};

const resolveTargetProfileIds = async (params: {
  assignMode: TaskTemplate['assignMode'];
  assignConfig?: Record<string, any> | null;
}) => {
  const { assignMode, assignConfig } = params;
  const profiles = await listAssignableProfileRecords(false);

  if (assignMode === 'SPECIFIC') {
    const userIds = [
      ...(Array.isArray(assignConfig?.userIds) ? assignConfig.userIds : []),
      assignConfig?.userId
    ].filter(Boolean);

    if (userIds.length === 0) return [];
    return profiles
      .filter((profile: any) => userIds.includes(profile.id))
      .map((profile: any) => profile.id)
      .filter(Boolean);
  }

  if (assignMode === 'ROLE') {
    const roles = Array.isArray(assignConfig?.roles) ? assignConfig.roles : [];
    if (roles.length === 0) return [];
    return profiles
      .filter((profile: any) => roles.includes(profile.role))
      .map((profile: any) => profile.id)
      .filter(Boolean);
  }

  if (assignMode === 'TEAM') {
    const teamIds = [
      ...(Array.isArray(assignConfig?.teamIds) ? assignConfig.teamIds : []),
      assignConfig?.teamId
    ].filter(Boolean);
    const sectorCodes = [
      ...(Array.isArray(assignConfig?.sectorCodes) ? assignConfig.sectorCodes : []),
      assignConfig?.sectorCode
    ].filter(Boolean);

    if (teamIds.length === 0 && sectorCodes.length === 0) return [];
    return profiles
      .filter((profile: any) =>
        teamIds.includes(profile.team_id)
        || sectorCodes.includes(profile.sector_code)
      )
      .map((profile: any) => profile.id)
      .filter(Boolean);
  }

  return profiles.map((profile: any) => profile.id).filter(Boolean);
};

const mapClientRecord = (record: any): Client => {
  const portfolioEntries = getClientPortfolioEntries(record);
  const portfolioMetadata = collectPortfolioMetadata(portfolioEntries);
  const equipmentModels = mergeUniquePortfolioValues(record?.equipment_models, record?.items, portfolioMetadata.equipment_models);
  const structuredAddress = resolveStructuredAddressFields(record);

  return {
    id: getSafeText(record.id),
    name: getSafeText(record.name, 'Sem Nome'),
    phone: getSafeText(record.phone),
    address: getSafeText(structuredAddress.address || record.address),
    items: equipmentModels,
    offers: normalizeInterestProductList(record.offers || []),
    invalid: record.invalid,
    acceptance: (record.acceptance as any) || 'medium',
    satisfaction: (record.satisfaction as any) || 'medium',
    origin: getSafeClientOrigin(record.origin),
    origin_detail: getTrimmedText(record.origin_detail),
    email: getTrimmedText(record.email),
    website: getTrimmedText(record.website),
    status: getSafeClientStatus(record.status),
    responsible_phone: getTrimmedText(record.responsible_phone),
    buyer_name: getTrimmedText(record.buyer_name),
    interest_product: normalizeInterestProduct(record.interest_product),
    preferred_channel: record.preferred_channel,
    funnel_status: getSafeFunnelStatus(record.funnel_status),
    external_id: getTrimmedText(record.external_id),
    phone_secondary: getTrimmedText(record.phone_secondary),
    street: getTrimmedText(structuredAddress.street),
    neighborhood: getTrimmedText(structuredAddress.neighborhood),
    city: getTrimmedText(structuredAddress.city),
    state: getTrimmedText(structuredAddress.state),
    zip_code: getTrimmedText(structuredAddress.zip_code),
    last_purchase_date: getTrimmedText(record.last_purchase_date),
    customer_profiles: mergeUniquePortfolioValues(record?.customer_profiles, portfolioMetadata.customer_profiles),
    product_categories: mergeUniquePortfolioValues(record?.product_categories, portfolioMetadata.product_categories),
    equipment_models: equipmentModels,
    portfolio_entries: portfolioEntries,
    tags: record.tags || [],
    campanha_atual_id: getTrimmedText(record.campanha_atual_id)
  };
};

const syncClientTagToClientProfile = async (tagId: string) => {
  const { data: tag, error: tagError } = await supabase
    .from('client_tags')
    .select('client_id, categoria, motivo')
    .eq('id', tagId)
    .maybeSingle();

  if (tagError || !tag?.client_id) {
    if (tagError) console.error('Error loading tag for client sync', tagError);
    return;
  }

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('tags')
    .eq('id', tag.client_id)
    .maybeSingle();

  if (clientError) {
    console.error('Error loading client tags for sync', clientError);
    return;
  }

  const currentTags = Array.isArray(client?.tags) ? client.tags : [];
  const nextTags = new Set<string>(currentTags);

  const categoria = normalizeClientTagValue(tag.categoria);
  const motivo = normalizeClientTagValue(tag.motivo);

  if (categoria) nextTags.add(categoria);
  if (motivo) nextTags.add(motivo);
  if (isNegativeTagSignal(tag.categoria, tag.motivo)) nextTags.add('CLIENTE_INSATISFEITO');
  if (tag.categoria === 'CONFIRMACAO' && tag.motivo === 'SATISFEITO') nextTags.add('CLIENTE_SATISFEITO');

  if (nextTags.size === currentTags.length) return;

  const { error: updateError } = await supabase
    .from('clients')
    .update({ tags: Array.from(nextTags) })
    .eq('id', tag.client_id);

  if (updateError) {
    console.error('Error syncing approved tag to client profile', updateError);
  }
};

const updateClientFunnelStatus = async (clientId: string, newStatus: 'CONTACT_ATTEMPT' | 'CONTACT_MADE') => {
  try {
    const { data: client } = await supabase.from('clients').select('status, funnel_status').eq('id', clientId).single();
    if (!client || client.status !== 'LEAD') return;

    const currentStage = client.funnel_status || 'NEW';
    // Priority: NEW < CONTACT_ATTEMPT < CONTACT_MADE < QUALIFIED ...
    // Only upgrade.
    const stages = ['NEW', 'CONTACT_ATTEMPT', 'CONTACT_MADE', 'QUALIFIED', 'PROPOSAL_SENT', 'PHYSICAL_VISIT'];
    const currentIdx = stages.indexOf(currentStage);
    const newIdx = stages.indexOf(newStatus);

    if (newIdx > currentIdx) {
      await supabase.from('clients').update({ funnel_status: newStatus }).eq('id', clientId);
    }
  } catch (e) {
    console.error("Error auto-updating funnel status", e);
  }
};

export const dataService = {


  // --- AUDIT LOGS ---
  logAudit: async (tableName: string, recordId: string, action: string, userId: string, changes?: any, reason?: string) => {
    // Note: Most auditing is done via DB triggers, but this is for manual/app-level logging if needed
    const { error } = await supabase.from('audit_logs').insert({
      table_name: tableName,
      record_id: recordId,
      action,
      user_id: userId,
      changes,
      reason
    });
    if (error) console.error("Error logging audit:", error);
  },

  // --- CALL SCHEDULES (Agendamentos) ---
  createScheduleRequest: async (schedule: Partial<CallSchedule>): Promise<void> => {
    await validateScheduleRequests([schedule]);
    const reason = schedule.scheduleReason || '';

    // Normalize call_type to match DB CHECK constraint
    // DB accepts: VENDA, POS_VENDA, PROSPECCAO, CONFIRMACAO_PROTOCOLO, WHATSAPP
    const CALL_TYPE_DB_MAP: Record<string, string> = {
      'VENDA': 'VENDA',
      'PÓS-VENDA': 'POS_VENDA',
      'PÓS_VENDA': 'POS_VENDA',
      'POS_VENDA': 'POS_VENDA',
      'PROSPECÇÃO': 'PROSPECCAO',
      'PROSPECCAO': 'PROSPECCAO',
      'CONFIRMAÇÃO PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
      'CONFIRMACAO_PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
      'REATIVAÇÃO': 'POS_VENDA',
      'REATIVACAO': 'POS_VENDA',
      'WHATSAPP': 'WHATSAPP'
    };
    const rawType = schedule.callType || 'VENDA';
    const dbCallType = CALL_TYPE_DB_MAP[rawType] || CALL_TYPE_DB_MAP[rawType.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '_')] || 'VENDA';
    console.log('🔍 [createScheduleRequest] rawType:', JSON.stringify(rawType), '→ dbCallType:', JSON.stringify(dbCallType));

    const { data, error } = await supabase.from('call_schedules').insert({
      customer_id: schedule.customerId || null,
      origin_call_id: schedule.originCallId || null,
      requested_by_operator_id: schedule.requestedByOperatorId,
      assigned_operator_id: schedule.assignedOperatorId,
      scheduled_for: schedule.scheduledFor,
      call_type: dbCallType,
      status: schedule.status || 'PENDENTE_APROVACAO',
      schedule_reason: reason,
      resolution_channel: schedule.resolutionChannel || 'telefone',
      skip_reason: schedule.skipReason || null,
      whatsapp_sent: schedule.whatsappSent ?? false,
      whatsapp_note: schedule.whatsappNote || null,
      has_repick: schedule.hasRepick ?? false
    }).select('id').single();
    if (error) throw error;

    const scheduleType = schedule.hasRepick || schedule.skipReason ? 'REPIQUE' : 'AGENDAMENTO';
    const managerIds = await getActiveManagerIds();
    await createUserNotifications([
      ...(schedule.assignedOperatorId ? [{
        userId: schedule.assignedOperatorId,
        type: `${scheduleType}_CREATED`,
        title: scheduleType === 'REPIQUE' ? 'Novo repique criado' : 'Novo agendamento criado',
        body: reason || 'Um item operacional foi atribuido para voce.',
        relatedEntityType: 'call_schedule',
        relatedEntityId: data?.id
      }] : []),
      ...managerIds.map(managerId => ({
        userId: managerId,
        type: `${scheduleType}_CREATED`,
        title: scheduleType === 'REPIQUE' ? 'Repique registrado' : 'Agendamento registrado',
        body: reason || 'Um item operacional entrou na agenda central.',
        relatedEntityType: 'call_schedule',
        relatedEntityId: data?.id
      }))
    ]);
  },

  bulkCreateScheduleRequest: async (schedules: Partial<CallSchedule>[]): Promise<void> => {
    await validateScheduleRequests(schedules);
    const CALL_TYPE_DB_MAP: Record<string, string> = {
      'VENDA': 'VENDA', 'PÓS-VENDA': 'POS_VENDA', 'PÓS_VENDA': 'POS_VENDA', 'POS_VENDA': 'POS_VENDA',
      'PROSPECÇÃO': 'PROSPECCAO', 'PROSPECCAO': 'PROSPECCAO',
      'CONFIRMAÇÃO PROTOCOLO': 'CONFIRMACAO_PROTOCOLO', 'CONFIRMACAO_PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
      'REATIVAÇÃO': 'POS_VENDA', 'REATIVACAO': 'POS_VENDA', 'WHATSAPP': 'WHATSAPP'
    };
    const mapType = (t: string) => {
      return CALL_TYPE_DB_MAP[t] || CALL_TYPE_DB_MAP[t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '_')] || 'VENDA';
    };
    const { data, error } = await supabase.from('call_schedules').insert(
      schedules.map(s => {
        const reason = s.scheduleReason || '';

        return {
          customer_id: s.customerId || null,
          origin_call_id: s.originCallId || null,
          requested_by_operator_id: s.requestedByOperatorId,
          assigned_operator_id: s.assignedOperatorId,
          scheduled_for: s.scheduledFor,
          call_type: mapType(s.callType || 'VENDA'),
          status: s.status || 'PENDENTE_APROVACAO',
          schedule_reason: reason,
          resolution_channel: s.resolutionChannel || 'telefone',
          skip_reason: s.skipReason || null,
          whatsapp_sent: s.whatsappSent ?? false,
          whatsapp_note: s.whatsappNote || null,
          has_repick: s.hasRepick ?? false
        };
      })
    ).select('id, assigned_operator_id, schedule_reason, has_repick, skip_reason');
    if (error) throw error;

    const managerIds = await getActiveManagerIds();
    const notifications: Array<Partial<UserNotification>> = [];

    (data || []).forEach((schedule: any) => {
      const scheduleType = schedule.has_repick || schedule.skip_reason ? 'REPIQUE' : 'AGENDAMENTO';

      if (schedule.assigned_operator_id) {
        notifications.push({
          userId: schedule.assigned_operator_id,
          type: `${scheduleType}_CREATED`,
          title: scheduleType === 'REPIQUE' ? 'Novo repique criado' : 'Novo agendamento criado',
          body: schedule.schedule_reason || 'Um novo item operacional foi atribuido para voce.',
          relatedEntityType: 'call_schedule',
          relatedEntityId: schedule.id
        });
      }

      managerIds.forEach(managerId => {
        notifications.push({
          userId: managerId,
          type: `${scheduleType}_CREATED`,
          title: scheduleType === 'REPIQUE' ? 'Repique registrado' : 'Agendamento registrado',
          body: schedule.schedule_reason || 'Um item operacional entrou na agenda central.',
          relatedEntityType: 'call_schedule',
          relatedEntityId: schedule.id
        });
      });
    });

    await createUserNotifications(notifications);
  },

  getSchedules: async (filters?: { status?: string, assignedTo?: string }): Promise<CallScheduleWithClient[]> => {
    let query = supabase.from('call_schedules').select('*, clients(name, phone)');

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.assignedTo) query = query.eq('assigned_operator_id', filters.assignedTo);

    const { data, error } = await query.order('scheduled_for', { ascending: true });
    if (error) throw error;

    return (data || []).map(s => ({
      id: s.id,
      customerId: s.customer_id,
      originCallId: s.origin_call_id,
      requestedByOperatorId: s.requested_by_operator_id,
      assignedOperatorId: s.assigned_operator_id,
      approvedByAdminId: s.approved_by_admin_id,
      scheduledFor: s.scheduled_for,
      callType: mapStoredCallTypeToApp(s.call_type),
      status: s.status as ScheduleStatus,
      scheduleReason: s.schedule_reason,
      approvalReason: s.approval_reason,
      resolutionChannel: s.resolution_channel,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : s.clients?.name,
      clientPhone: Array.isArray(s.clients) ? s.clients[0]?.phone : s.clients?.phone,

      // New fields mapping
      skipReason: s.skip_reason,
      whatsappSent: s.whatsapp_sent,
      whatsappNote: s.whatsapp_note,
      hasRepick: s.has_repick,
      rescheduledBy: s.rescheduled_by,
      rescheduledAt: s.rescheduled_at,
      rescheduleReason: s.reschedule_reason,
      deletedBy: s.deleted_by,
      deletedAt: s.deleted_at,
      deleteReason: s.delete_reason,
      queuedAt: s.queued_at,
      completedAt: s.completed_at
    }));
  },

  updateSchedule: async (id: string, updates: Partial<CallSchedule>, userId: string): Promise<void> => {
    const { data: existingSchedule } = await supabase
      .from('call_schedules')
      .select('id, assigned_operator_id, requested_by_operator_id, scheduled_for, schedule_reason, has_repick, skip_reason')
      .eq('id', id)
      .maybeSingle();

    // Explicitly map camelCase to snake_case only for fields we allow updating
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.approvedByAdminId) payload.approved_by_admin_id = updates.approvedByAdminId;
    if (updates.approvalReason) payload.approval_reason = updates.approvalReason;
    if (updates.scheduledFor) payload.scheduled_for = updates.scheduledFor;
    if (updates.assignedOperatorId) payload.assigned_operator_id = updates.assignedOperatorId;
    if (updates.callType) payload.call_type = mapTaskTypeToDb(updates.callType);
    if (updates.scheduleReason !== undefined) payload.schedule_reason = updates.scheduleReason;
    if (updates.skipReason !== undefined) payload.skip_reason = updates.skipReason;
    if (updates.whatsappSent !== undefined) payload.whatsapp_sent = updates.whatsappSent;
    if (updates.whatsappNote !== undefined) payload.whatsapp_note = updates.whatsappNote;
    if (updates.hasRepick !== undefined) payload.has_repick = updates.hasRepick;
    if (updates.resolutionChannel !== undefined) payload.resolution_channel = updates.resolutionChannel;

    payload.updated_at = new Date().toISOString();

    const { error } = await supabase.from('call_schedules').update(payload).eq('id', id);
    if (error) throw error;

    const recipientIds = Array.from(new Set([
      existingSchedule?.assigned_operator_id,
      existingSchedule?.requested_by_operator_id,
      updates.assignedOperatorId,
      ...(await getActiveManagerIds())
    ].filter(Boolean)));

    if (recipientIds.length > 0 && (updates.status || updates.scheduledFor || updates.assignedOperatorId)) {
      const scheduleType = existingSchedule?.has_repick || existingSchedule?.skip_reason ? 'REPIQUE' : 'AGENDAMENTO';
      let notificationType = `${scheduleType}_UPDATED`;
      let title = scheduleType === 'REPIQUE' ? 'Repique atualizado' : 'Agendamento atualizado';
      let body = updates.status
        ? `Status alterado para ${updates.status}.`
        : (updates.scheduledFor ? `Novo horario: ${new Date(updates.scheduledFor).toLocaleString('pt-BR')}.` : 'Item operacional atualizado.');

      if (updates.status === 'CONCLUIDO' && updates.approvedByAdminId) {
        notificationType = `${scheduleType}_APPROVED`;
        title = scheduleType === 'REPIQUE' ? 'Repique aprovado' : 'Agendamento aprovado';
        body = 'Item aprovado e enviado para a fila operacional.';
      } else if (updates.status === 'CANCELADO') {
        notificationType = `${scheduleType}_CANCELED`;
        title = scheduleType === 'REPIQUE' ? 'Repique cancelado' : 'Agendamento cancelado';
      } else if (updates.scheduledFor) {
        notificationType = `${scheduleType}_RESCHEDULED`;
        title = scheduleType === 'REPIQUE' ? 'Repique reagendado' : 'Agendamento reagendado';
      } else if (updates.assignedOperatorId && updates.assignedOperatorId !== existingSchedule?.assigned_operator_id) {
        notificationType = `${scheduleType}_REASSIGNED`;
        title = scheduleType === 'REPIQUE' ? 'Repique reatribuido' : 'Agendamento reatribuido';
        body = 'O responsavel pelo item foi atualizado.';
      }

      await createUserNotifications(recipientIds.map(recipientId => ({
        userId: recipientId,
        type: notificationType,
        title,
        body,
        relatedEntityType: 'call_schedule',
        relatedEntityId: id
      })));
    }
  },

  // --- MÓDULO DE VENDAS ---
  getSales: async (startDate?: string, endDate?: string): Promise<Sale[]> => {
    const rows: any[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      let query = supabase
        .from('sales')
        .select('*')
        .order('registered_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (startDate && endDate) {
        query = query
          .gte('registered_at', `${startDate}T00:00:00`)
          .lte('registered_at', `${endDate}T23:59:59`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows.map(s => ({
      id: s.id,
      saleNumber: s.sale_number,
      clientId: s.customer_id || s.client_id,
      clientName: s.client_name || s.customer_name || 'Cliente sem nome',
      address: s.address,
      category: s.category,
      channel: s.channel,
      operatorId: s.operator_id,
      status: s.status as SaleStatus,
      value: s.value || 0,
      registeredAt: s.registered_at,
      deliveredAt: s.delivered_at,
      externalSalesperson: s.external_salesperson,
      deliveryDelayReason: s.delivery_delay_reason,
      deliveryNote: s.delivery_note
    }));
  },

  saveSale: async (sale: Partial<Sale> & { externalSalesperson?: string }): Promise<void> => {
    const { error } = await supabase.from('sales').insert({
      sale_number: sale.saleNumber,
      customer_id: sale.clientId || null, // Convert empty string to null
      client_name: sale.clientName,
      address: sale.address,
      category: sale.category,
      channel: sale.channel,
      operator_id: sale.operatorId,
      value: sale.value || 0,
      status: SaleStatus.PENDENTE,
      registered_at: new Date().toISOString(),
      external_salesperson: sale.externalSalesperson
    });
    if (error) throw error;

    // AUTO-CONVERT LEAD OR INATIVO TO CLIENT
    if (sale.clientId) {
      await supabase.from('clients')
        .update({ status: 'CLIENT', funnel_status: 'QUALIFIED' })
        .eq('id', sale.clientId)
        .in('status', ['LEAD', 'INATIVO']);
    }
  },

  // ... (updateSaleStatus, checkSaleExists, deleteSale, updateSale remain similar)

  updateSaleStatus: async (saleId: string, status: SaleStatus, options?: { delayReason?: string; note?: string }): Promise<void> => {
    const updates: any = { status };
    if (status === SaleStatus.ENTREGUE) {
      updates.delivered_at = new Date().toISOString();
    }
    if (options?.delayReason !== undefined) updates.delivery_delay_reason = options.delayReason;
    if (options?.note !== undefined) updates.delivery_note = options.note;

    const { error } = await supabase.from('sales').update(updates).eq('id', saleId);
    if (error) throw error;
  },

  checkSaleExists: async (saleNumber: string): Promise<boolean> => {
    const { count, error } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('sale_number', saleNumber);
    if (error) {
      console.error("Error checking sale existence:", error);
      return false; // Fail open (allow saving) if check errors, or true to be safe? False lets them try.
    }
    return (count || 0) > 0;
  },

  deleteSale: async (saleId: string): Promise<void> => {
    const { error, count } = await supabase.from('sales').delete({ count: 'exact' }).eq('id', saleId);
    if (error) throw error;
    if (count === 0) {
      throw new Error("Nenhuma venda foi excluída. Verifique se o ID está correto ou se você tem permissão (RLS).");
    }
  },

  createVisit: async (visitData: any): Promise<void> => {
    // Stub for creating visit from Prospects view
    const { error } = await supabase.from('visits').insert(visitData);
    if (error) throw error;
  },

  updateSale: async (saleId: string, updates: Partial<Sale>): Promise<void> => {
    const payload: any = {};
    if (updates.clientName) payload.client_name = updates.clientName;
    if (updates.saleNumber) payload.sale_number = updates.saleNumber;
    if (updates.value) payload.value = updates.value;
    if (updates.category) payload.category = updates.category;
    if (updates.channel) payload.channel = updates.channel;
    if (updates.address) payload.address = updates.address;
    if (updates.operatorId) payload.operator_id = updates.operatorId;
    if (updates.clientId !== undefined) payload.customer_id = updates.clientId || null;
    if (updates.externalSalesperson !== undefined) payload.external_salesperson = updates.externalSalesperson?.trim() || null;
    if (updates.deliveryDelayReason !== undefined) payload.delivery_delay_reason = updates.deliveryDelayReason;
    if (updates.deliveryNote !== undefined) payload.delivery_note = updates.deliveryNote;

    const { error } = await supabase.from('sales').update(payload).eq('id', saleId);
    if (error) throw error;
  },

  // --- MÉTODOS EXISTENTES ---
  // ... (getResponseValue, getUsers, etc. remain unchanged until getRouteCandidates)

  // ... (skip to getRouteCandidates)


  // --- MÉTODOS EXISTENTES ---
  getResponseValue: (responses: any, question: Question) => {
    return resolveStoredResponseForQuestion(responses, question);
  },

  getSystemSetting: async (key: string): Promise<string> => {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) return '';
    return data?.value || '';
  },

  updateSystemSetting: async (key: string, value: string, description?: string): Promise<void> => {
    const { error } = await supabase.from('system_settings').upsert({
      key,
      value,
      description,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  },

  getCommunicationBlockDays: async (): Promise<number> => {
    return await getConfiguredCommunicationBlockDays();
  },

  getUsers: async (): Promise<User[]> => {
    try {
      const data = await listAssignableProfileRecords(true);
      const enrichedProfiles = await enrichProfilesWithTeamMetadata(data || []);
      return enrichedProfiles.map(mapProfileToUser).filter(user => Boolean(user.id));
    } catch (e) {
      console.error('Erro ao carregar usuarios atribuiveis.', e);
      return [];
    }
  },

  updateUser: async (userId: string, updates: Partial<User>): Promise<void> => {
    const payload: any = {};
    if (updates.role) payload.role = updates.role;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.name) payload.username_display = updates.name;
    if (updates.teamId !== undefined) payload.team_id = updates.teamId;
    if (updates.sectorCode !== undefined) payload.sector_code = updates.sectorCode;
    await supabase.from('profiles').update(payload).eq('id', userId);
  },

  createUser: async (user: Partial<User>): Promise<void> => {
    const email = getInternalEmail(user.username || '');
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password: user.password! });
    if (authError) throw authError;
    await supabase.from('profiles').insert({
      id: authData.user!.id,
      username_display: user.name,
      username_slug: slugify(user.username || ''),
      role: user.role,
      active: true,
      team_id: user.teamId || null,
      sector_code: user.sectorCode || null
    });
  },

  signIn: async (username: string, password: string): Promise<User> => {
    const email = getInternalEmail(username);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;
    const profile = await loadProfileRecord(authData.user!.id);
    return mapProfileToUser({
      ...(profile || {}),
      app_metadata: authData.user?.app_metadata,
      user_metadata: authData.user?.user_metadata
    });
  },

  getCurrentSignedUser: async (): Promise<User | null> => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    const sessionUser = sessionData.session?.user;
    if (!sessionUser) {
      return null;
    }

    const profile = await loadProfileRecord(sessionUser.id, true);
    if (!profile) return null;

    return mapProfileToUser({
      ...(profile || {}),
      app_metadata: sessionUser.app_metadata,
      user_metadata: sessionUser.user_metadata
    });
  },

  signOut: async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  getQuestions: async (
    callType?: CallType | 'ALL' | string,
    proposito?: string,
    context?: { clientContext?: any; campaignContext?: any; responses?: Record<string, any> }
  ): Promise<Question[]> => {
    try {
      const allQuestions = await loadActiveQuestions();
      return allQuestions.filter(question =>
        questionMatchesContext(question, callType, proposito, context)
      );
    } catch (e) { return []; }
  },

  saveQuestion: async (q: Partial<Question>): Promise<void> => {
    const payload = {
      text: q.text,
      options: q.options,
      type: q.type,
      order_index: q.order,
      stage_id: q.stageId,
      proposito: q.proposito || null,
      campo_resposta: q.campo_resposta || null,
      tipo_input: q.tipo_input || null,
      obrigatoria: q.obrigatoria ?? false,
      ativo: q.ativo ?? true
    };
    if (q.id) await supabase.from('questions').update(payload).eq('id', q.id);
    else await supabase.from('questions').insert(payload);
  },

  deleteQuestion: async (id: string): Promise<void> => {
    await supabase.from('questions').delete().eq('id', id);
  },

  getTasks: async (operatorId?: string): Promise<Task[]> => {
    await cleanupStaleVoiceQueueEntries({ operatorId });
    await cleanupInvalidVoiceQueueEntries({ operatorId });

    // 1. Fetch Legacy Tasks (standard queue)
    let tasksQuery = supabase.from('tasks').select('*, clients(*)').in('status', ['pending', 'skipped']);
    if (operatorId) {
      tasksQuery = tasksQuery.eq('assigned_to', operatorId);
    }
    const { data: tasksData, error: tasksError } = await tasksQuery.order('created_at', { ascending: true });
    if (tasksError) throw tasksError;
    const campaignContextMap = await loadCampaignContextMap((tasksData || []).map((task: any) => task.campanha_id).filter(Boolean));

    const legacyTasks: Task[] = (tasksData || [])
      .filter(t => t.client_id) // Only require a valid client_id, don't filter by join result
      .filter((t: any) => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        return clientObj?.invalid !== true;
      })
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        const campaignContext = campaignContextMap.get(t.campanha_id) || {};
        const campaignContextProposito = decodeLatin1(campaignContext.proposito);
        const campaignContextCampaignName = decodeLatin1(campaignContext.campaignName);
        const campaignContextTargetProduct = decodeLatin1(campaignContext.targetProduct);
        const campaignContextOfferProduct = decodeLatin1(campaignContext.offerProduct);
        const campaignContextPortfolioScope = decodeLatin1(campaignContext.portfolioScope);
        const campaignContextMode = decodeLatin1(campaignContext.campaignMode);
        const resolvedProposito = decodeLatin1(t.proposito) || campaignContextProposito;
        // Ensure that tasks dispatched with a specific call type (e.g., from Campaign Planner) retain it,
        // unless it's explicitly a reativation logic condition.
        // We will prefer the explicitly assigned task type, falling back to logic based on client status.
        const taskType = t.type ? mapStoredCallTypeToApp(t.type) : (clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : CallType.POS_VENDA);

        return {
          id: t.id,
          clientId: t.client_id,
          type: taskType,
          deadline: t.created_at,
          assignedTo: t.assigned_to,
          status: t.status as any,
          skipReason: t.skip_reason,
          clientName: clientObj?.name,
          clientPhone: clientObj?.phone,
          clients: clientObj || null, // Pass embedded client data for fallback
          approvalStatus: t.approval_status as any,
          originCallId: t.origin_call_id,
          scheduledFor: t.scheduled_for,
          scheduleReason: t.schedule_reason,
          proposito: resolvedProposito,
          campanha_id: t.campanha_id,
          campaignName: campaignContextCampaignName,
          targetProduct: campaignContextTargetProduct,
          offerProduct: campaignContextOfferProduct,
          portfolioScope: campaignContextPortfolioScope,
          campaignMode: campaignContextMode,
          createdAt: t.created_at,
          updatedAt: t.updated_at
        };
      });

    // 2. Fetch Approved Schedules
    let schedQuery = supabase.from('call_schedules')
      .select('*, clients(*)')
      .eq('status', 'APROVADO');

    if (operatorId) {
      schedQuery = schedQuery.eq('assigned_operator_id', operatorId);
    }
    const { data: schedData, error: schedError } = await schedQuery.order('scheduled_for', { ascending: true });
    if (schedError) throw schedError;

    const scheduledTasks: Task[] = (schedData || [])
      .filter((s: any) => {
        const clientObj = Array.isArray(s.clients) ? s.clients[0] : s.clients;
        return clientObj?.invalid !== true;
      })
      .map(s => {
        const clientObj = Array.isArray(s.clients) ? s.clients[0] : s.clients;
        return {
          id: s.id,
          clientId: s.customer_id || '', // Task expects string
          clientName: clientObj?.name || s.clients?.name || 'Cliente Agendado',
          clientPhone: clientObj?.phone || s.clients?.phone,
          clients: clientObj || null,
          type: clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : mapStoredCallTypeToApp(s.call_type),
          deadline: s.scheduled_for, // Use scheduled time as deadline/display time
          assignedTo: s.assigned_operator_id,
          status: 'pending', // Active in queue
          scheduledFor: s.scheduled_for,
          scheduleReason: s.schedule_reason,
          originCallId: s.origin_call_id,
          approvalStatus: 'APPROVED',
          createdAt: s.created_at,
          updatedAt: s.updated_at
        };
      });

    // 3. Merge and De-duplicate: Prioritize Schedules
    const combined = [...scheduledTasks, ...legacyTasks];
    const uniqueTasks: Task[] = [];
    const seenPendingKeys = new Set<string>();

    for (const task of combined) {
      if (task.status !== 'pending' || !task.clientId) {
        uniqueTasks.push(task);
        continue;
      }

      const dedupeKey = `${task.clientId}::${task.type || 'unknown'}`;
      if (!seenPendingKeys.has(dedupeKey)) {
        seenPendingKeys.add(dedupeKey);
        uniqueTasks.push(task);
      }
    }

    return uniqueTasks;
  },


  createTask: async (
    task: Partial<Task>,
    options?: { skipRecentCommunicationCheck?: boolean; reassignExistingTask?: boolean }
  ): Promise<{ created: boolean; existingTaskId?: string; reassigned?: boolean }> => {
    if (!task.clientId) throw new Error('Cliente obrigatorio para criar atendimento.');

    const dbType = mapTaskTypeToDb(task.type);
    const status = task.status || 'pending';
    const normalizedAssignedTo = normalizeUuidReference(task.assignedTo);
    const normalizedCampaignId = normalizeUuidReference(task.campanha_id);

    const syncExistingTask = async (existingTask: any) => {
      const shouldSyncAssignment = normalizedAssignedTo && (
        (options?.reassignExistingTask && existingTask.assigned_to !== normalizedAssignedTo) ||
        (!options?.reassignExistingTask && !existingTask.assigned_to)
      );
      const payload: Record<string, any> = {};

      if (shouldSyncAssignment) {
        payload.assigned_to = normalizedAssignedTo;
      }

      if (normalizedCampaignId && existingTask.campanha_id !== normalizedCampaignId) {
        payload.campanha_id = normalizedCampaignId;
      }

      if (task.proposito && existingTask.proposito !== task.proposito) {
        payload.proposito = task.proposito;
      }

      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await runUpdateWithUpdatedAtFallback(
          'tasks',
          { ...payload, updated_at: new Date().toISOString() },
          async (safePayload) => await supabase.from('tasks').update(safePayload).eq('id', existingTask.id)
        );
        if (updateError) throw updateError;
      }

      return { created: false, existingTaskId: existingTask.id, reassigned: Boolean(shouldSyncAssignment) };
    };

    if (status === 'pending') {
      await cleanupStaleVoiceQueueEntries({
        clientId: task.clientId,
        taskType: dbType
      });

      if (!options?.skipRecentCommunicationCheck) {
        const recentCommunication = await getRecentCommunicationDetails(task.clientId);
        if (recentCommunication.blocked) {
          return { created: false };
        }
      }

      const existingTask = await findOpenVoiceTask(task.clientId, dbType);
      if (existingTask) {
        return await syncExistingTask(existingTask);
      }
    }

    const { error } = await insertTaskRecord({
      client_id: task.clientId,
      type: dbType,
      assigned_to: normalizedAssignedTo,
      status,
      origin_call_id: task.originCallId || null,
      scheduled_for: task.scheduledFor,
      schedule_reason: task.scheduleReason,
      proposito: task.proposito,
      campanha_id: normalizedCampaignId
    });

    if (error) {
      if (status === 'pending' && isUniqueViolationError(error)) {
        const existingAfterConflict = await findOpenVoiceTask(task.clientId, dbType);
        if (existingAfterConflict) {
          return await syncExistingTask(existingAfterConflict);
        }
      }

      throw error;
    }

    return { created: true };
  },

  updateTask: async (taskId: string, updates: Partial<Task>): Promise<void> => {
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.skipReason !== undefined) payload.skip_reason = updates.skipReason;
    if (updates.scheduledFor !== undefined) payload.scheduled_for = updates.scheduledFor;
    if (updates.scheduleReason !== undefined) payload.schedule_reason = updates.scheduleReason;
    if (updates.deadline !== undefined) payload.deadline = updates.deadline;
    if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo;
    if (updates.type !== undefined) payload.type = mapTaskTypeToDb(updates.type);
    if (updates.approvalStatus !== undefined) payload.approval_status = updates.approvalStatus;
    if (updates.originCallId !== undefined) payload.origin_call_id = updates.originCallId;
    payload.updated_at = new Date().toISOString();
    
    // Attempt update on legacy tasks
    const { data: updatedTasks, error: tError } = await runUpdateWithUpdatedAtFallback(
      'tasks',
      payload,
      async (safePayload) => await supabase.from('tasks').update(safePayload).eq('id', taskId).select('id')
    );
    if (tError) throw tError;
    const count = updatedTasks?.length || 0;
    
    // If not found in tasks, try call_schedules
    if (count === 0) {
       const schedulePayload: any = {};
       if (updates.status === 'pending') schedulePayload.status = 'APROVADO';
       if (updates.status === 'completed') schedulePayload.status = 'CONCLUIDO';
       if (updates.status === 'skipped') schedulePayload.status = 'CANCELADO';
       if (updates.skipReason !== undefined) schedulePayload.skip_reason = updates.skipReason;
       if (updates.scheduledFor !== undefined) schedulePayload.scheduled_for = updates.scheduledFor;
       if (updates.scheduleReason !== undefined) schedulePayload.schedule_reason = updates.scheduleReason;
       if (updates.assignedTo !== undefined) schedulePayload.assigned_operator_id = updates.assignedTo;
       if (updates.type !== undefined) schedulePayload.call_type = mapTaskTypeToDb(updates.type);
       if (updates.originCallId !== undefined) schedulePayload.origin_call_id = updates.originCallId;
       schedulePayload.updated_at = new Date().toISOString();
       
       if (Object.keys(schedulePayload).length > 0) {
         const { error: schedError } = await runUpdateWithUpdatedAtFallback(
           'call_schedules',
           schedulePayload,
           async (safePayload) => await supabase.from('call_schedules').update(safePayload).eq('id', taskId)
         );
         if (schedError) throw schedError;
       }
    }

    // Trigger funnel update
    if (updates.status === 'skipped' || updates.status === 'completed') {
      const { data: task } = await supabase.from('tasks').select('client_id').eq('id', taskId).maybeSingle();
      const clientId = task?.client_id;
      
      // Fallback to call_schedules if not in tasks
      if (!clientId) {
        const { data: sched } = await supabase.from('call_schedules').select('customer_id').eq('id', taskId).maybeSingle();
        if (sched?.customer_id) {
          await updateClientFunnelStatus(sched.customer_id, updates.status === 'skipped' ? 'CONTACT_ATTEMPT' : 'CONTACT_MADE');
        }
      } else {
        await updateClientFunnelStatus(clientId, updates.status === 'skipped' ? 'CONTACT_ATTEMPT' : 'CONTACT_MADE');
      }
    }
  },

  updateTaskStatus: async (taskId: string, status: 'pending' | 'completed' | 'skipped'): Promise<{ error: any }> => {
    const payload = { status, updated_at: new Date().toISOString() };
    const result = await runUpdateWithUpdatedAtFallback(
      'tasks',
      payload,
      async (safePayload) => await supabase.from('tasks').update(safePayload).eq('id', taskId)
    );
    return { error: result?.error };
  },

  updateWhatsAppTaskStatus: async (taskId: string, status: 'pending' | 'started' | 'completed' | 'skipped'): Promise<{ error: any }> => {
    const payload = { status, updated_at: new Date().toISOString() };
    const result = await runUpdateWithUpdatedAtFallback(
      'whatsapp_tasks',
      payload,
      async (safePayload) => await supabase.from('whatsapp_tasks').update(safePayload).eq('id', taskId)
    );
    return { error: result?.error };
  },

  deleteTask: async (taskId: string): Promise<void> => {
    // Delete operator events first to prevent foreign key violation (if CASCADE is not configured in DB)
    const { error: evError } = await supabase.from('operator_events').delete().eq('task_id', taskId);
    if (evError) {
      console.error("Non-critical: could not delete operator_events (make sure DB has ON DELETE CASCADE):", evError);
    }
    
    // 1. Try deleting from tasks table
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', taskId);
    if (error) throw error;

    // 2. If no task was deleted, try deleting from call_schedules (it might be an approved schedule in the queue)
    if (count === 0) {
      const { error: schedError } = await supabase.from('call_schedules').delete().eq('id', taskId);
      if (schedError) throw schedError;
    }
  },

  deleteMultipleTasks: async (taskIds: string[]): Promise<void> => {
    if (!taskIds || taskIds.length === 0) return;
    const chunkSize = 50;
    
    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const chunk = taskIds.slice(i, i + chunkSize);
      
      // Delete events first
      const { error: evError } = await supabase.from('operator_events').delete().in('task_id', chunk);
      if (evError) {
        console.error("Non-critical: could not delete operator_events batch:", evError);
      }
      
      // Try to delete from tasks
      await supabase.from('tasks').delete().in('id', chunk);
      
      // Try to delete from call_schedules (in case they are scheduled tasks)
      await supabase.from('call_schedules').delete().in('id', chunk);
    }
  },

  backfillSkipReasons: async (): Promise<{ updatedVoice: number, updatedWA: number }> => {
    let updatedVoice = 0;
    let updatedWA = 0;

    // 1. Voice Tasks
    const { data: vTasks, error: vErr } = await supabase.from('tasks').select('id, skip_reason').eq('status', 'skipped');
    if (!vErr && vTasks) {
      for (const t of vTasks) {
        let rawReason = t.skip_reason || 'Sem Motivo';
        rawReason = rawReason.replace('[ANTES DA CHAMADA] ', '').replace('[APÓS INICIAR] ', '');
        
        const { data: events } = await supabase.from('operator_events').select('event_type').eq('task_id', t.id);
        const hasStarted = Array.isArray(events) && events.some(e => e.event_type === 'INICIAR_PROXIMO_ATENDIMENTO');
        const prefix = hasStarted ? '[APÓS INICIAR] ' : '[ANTES DA CHAMADA] ';
        
        const newReason = prefix + rawReason;
        if (newReason !== t.skip_reason) {
          await supabase.from('tasks').update({ skip_reason: newReason }).eq('id', t.id);
          updatedVoice++;
        }
      }
    }

    // 2. WhatsApp Tasks
    const { data: wTasks, error: wErr } = await supabase.from('whatsapp_tasks').select('id, skip_reason').eq('status', 'skipped');
    if (!wErr && wTasks) {
      for (const wt of wTasks) {
        let rawReason = wt.skip_reason || 'Sem Motivo';
        rawReason = rawReason.replace('[ANTES DA CHAMADA] ', '').replace('[APÓS INICIAR] ', '');
        
        const { data: events } = await supabase.from('operator_events').select('event_type').eq('task_id', wt.id);
        const hasStarted = Array.isArray(events) && events.some(e => e.event_type === 'INICIAR_PROXIMO_ATENDIMENTO');
        const prefix = hasStarted ? '[APÓS INICIAR] ' : '[ANTES DA CHAMADA] ';
        
        const newReason = prefix + rawReason;
        if (newReason !== wt.skip_reason) {
          await supabase.from('whatsapp_tasks').update({ skip_reason: newReason }).eq('id', wt.id);
          updatedWA++;
        }
      }
    }

    return { updatedVoice, updatedWA };
  },

  deleteTasksByOperator: async (operatorId: string): Promise<void> => {
    let hasMore = true;
    
    // Determine which tasks to delete
    while (hasMore) {
      // Fetch safe HTTP bounds of records (e.g. 50) to avoid Request-URI Too Long
      const { data, error } = await supabase
        .from('tasks')
        .select('id')
        .eq('assigned_to', operatorId)
        .eq('status', 'pending')
        .limit(50);

      if (error) throw error;
      
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }
      
      const chunkIds = data.map(t => t.id);
      
      // Clean up operator_events for strictly 50 tasks
      const { error: evError } = await supabase
        .from('operator_events')
        .delete()
        .in('task_id', chunkIds);
      if (evError) {
        console.error("Non-critical: could not delete operator_events by operator:", evError);
      }
      
      // Delete exactly the identical 50 tasks
      const { error: tError } = await supabase
        .from('tasks')
        .delete()
        .in('id', chunkIds);
      if (tError) throw tError;

      if (data.length < 50) {
        hasMore = false;
      }
    }

    // ALSO CLEAR SCHEDULINGS THAT ARE PENDING IN THE QUEUE
    let hasMoreSchedules = true;
    while(hasMoreSchedules) {
      const { data, error } = await supabase
        .from('call_schedules')
        .select('id')
        .eq('assigned_operator_id', operatorId)
        .in('status', ['APROVADO', 'PENDENTE_APROVACAO'])
        .limit(50);
        
      if (error) throw error;
      if (!data || data.length === 0) {
        hasMoreSchedules = false;
        break;
      }
      
      const chunkIds = data.map(s => s.id);
      
      const { error: delError } = await supabase
        .from('call_schedules')
        .delete()
        .in('id', chunkIds);
        
      if (delError) throw delError;
      
      if (data.length < 50) {
        hasMoreSchedules = false;
      }
    }
  },




  deleteDuplicateTasks: async (): Promise<number> => {
    let tasks: any[] = [];
    let hasMore = true;
    let fromIndex = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, client_id, assigned_to, type, status')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }) // make pagination stable
        .range(fromIndex, fromIndex + limit - 1);
        
      if (error || !data) break;
      tasks.push(...data);
      if (data.length < limit) {
        hasMore = false;
      } else {
        fromIndex += limit;
      }
    }

    if (tasks.length === 0) return 0;

    const seen = new Set();
    const toDelete = [];

    for (const task of tasks) {
      const key = `${task.client_id} -${task.assigned_to} -${task.type} `;
      if (seen.has(key)) {
        toDelete.push(task.id);
      } else {
        seen.add(key);
      }
    }

    if (toDelete.length > 0) {
      const chunkSize = 50; // Strict limit of 50
      for (let i = 0; i < toDelete.length; i += chunkSize) {
        const chunk = toDelete.slice(i, i + chunkSize);
        
        // Clean up operator_events first
        const { error: evError } = await supabase.from('operator_events').delete().in('task_id', chunk);
        if (evError) {
          console.error("Non-critical: could not delete duplicate operator events:", evError);
        }

        const { error: delError } = await supabase
          .from('tasks')
          .delete()
          .in('id', chunk);
        if (delError) throw delError;
      }
    }

    return toDelete.length;
  },

  getCalls: async (startDate?: string, endDate?: string): Promise<CallRecord[]> => {
    let query = supabase.from('call_logs').select('*, clients(name, phone)').order('start_time', { ascending: false });

    if (startDate && endDate) {
      query = query.gte('start_time', `${startDate}T00:00:00`).lte('start_time', `${endDate}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
      const campaignContextMap = await loadCampaignContextMap((data || []).map((call: any) => call.campanha_id).filter(Boolean));
    return (data || []).map(c => {
      const campaignInsights = extractCampaignInsightsFromResponses(c.responses || {});
      const context = campaignContextMap.get(c.campanha_id) || {};
      const callProposito = decodeLatin1(c.proposito) || decodeLatin1(context.proposito);
      const callCampaignName = decodeLatin1(context.campaignName);
      const callTargetProduct = decodeLatin1(context.targetProduct);
      const callOfferProduct = decodeLatin1(context.offerProduct);
      const callPortfolioScope = decodeLatin1(context.portfolioScope);
      const callCampaignMode = decodeLatin1(context.campaignMode);

      return {
        id: c.id,
        taskId: c.task_id,
        operatorId: c.operator_id,
        clientId: c.client_id,
      startTime: c.start_time,
      endTime: c.end_time,
      duration: c.duration,
      reportTime: c.report_time,
      responses: c.responses || {},
      type: mapStoredCallTypeToApp(c.call_type),
      protocolId: c.protocol_id,
      clientName: (c as any).clients?.name || 'Cliente Desconhecido',
      clientPhone: (c as any).clients?.phone || '',
        proposito: callProposito,
        campanha_id: c.campanha_id,
        campaignName: callCampaignName,
        targetProduct: c.responses?.target_product || callTargetProduct,
        offerProduct: c.responses?.offer_product || callOfferProduct,
        portfolioScope: c.responses?.portfolio_scope || campaignInsights.portfolioScope || callPortfolioScope,
        campaignMode: c.responses?.campaign_mode || callCampaignMode,
      offerInterestLevel: c.responses?.offer_interest_level || campaignInsights.offerInterestLevel,
      offerBlockerReason: c.responses?.offer_blocker_reason || campaignInsights.offerBlockerReason
    };
    });
  },

  checkRecentCall: async (clientId: string): Promise<boolean> => {
    const details = await getRecentCommunicationDetails(clientId);
    return details.blocked;
  },

  cleanupDuplicateWhatsAppQueueEntries: async (
    clientId?: string,
    operatorId?: string,
    taskType?: string
  ): Promise<number> => {
    return cleanupDuplicateWhatsAppQueueEntries({
      clientId,
      operatorId,
      taskType
    });
  },

  deleteDuplicateSchedules: async (): Promise<number> => {
    const { data, error } = await supabase
      .from('call_schedules')
      .select('id, customer_id, scheduled_for, status, created_at')
      .in('status', ACTIVE_SCHEDULE_BLOCK_STATUSES)
      .order('created_at', { ascending: true });

    if (error) throw error;
    if (!data || data.length === 0) return 0;

    const groupedSchedules = new Map<string, any[]>();
    for (const schedule of data) {
      const dayKey = getLocalDayBounds(schedule.scheduled_for).dayKey;
      const groupKey = `${schedule.customer_id}::${dayKey}`;
      const group = groupedSchedules.get(groupKey) || [];
      group.push(schedule);
      groupedSchedules.set(groupKey, group);
    }

    const duplicateIds: string[] = [];
    for (const group of groupedSchedules.values()) {
      if (group.length <= 1) continue;
      duplicateIds.push(...group.slice(1).map(schedule => schedule.id));
    }

    if (duplicateIds.length === 0) return 0;

    const chunkSize = 50;
    for (let index = 0; index < duplicateIds.length; index += chunkSize) {
      const chunk = duplicateIds.slice(index, index + chunkSize);
      const { error: deleteError } = await supabase
        .from('call_schedules')
        .delete()
        .in('id', chunk);

      if (deleteError) throw deleteError;
    }

    return duplicateIds.length;
  },

  saveCall: async (call: CallRecord): Promise<{ id: string, suggestedTags: ClientTag[] }> => {
    const clientSnapshot = await dataService.getClientById(call.clientId).catch(() => null);
    const questionnaireContext = {
      clientContext: buildQuestionnaireClientContext(clientSnapshot),
      campaignContext: {
        campaignName: call.campaignName,
        targetProduct: call.targetProduct,
        offerProduct: call.offerProduct,
        portfolioScope: call.portfolioScope,
        campaignMode: call.campaignMode
      }
    };
    const questions = await dataService.getQuestions(call.type as CallType, call.proposito, questionnaireContext);
    const { enrichedResponses, email, interestProduct, buyerName, responsiblePhone } = extractClientInsightsFromResponses(
      call.responses || {},
      questions,
      call.type,
      call.proposito,
      questionnaireContext
    );
    const campaignInsights = extractCampaignInsightsFromResponses(
      enrichedResponses,
      questions,
      call.type,
      call.proposito
    );
    const normalizedResponseInterestProduct = normalizeInterestProduct(campaignInsights.enrichedResponses.interest_product);
    const normalizedTargetProduct = normalizeInterestProduct(
      call.targetProduct || campaignInsights.enrichedResponses.target_product
    );
    const normalizedOfferProduct = normalizeInterestProduct(
      call.offerProduct || campaignInsights.enrichedResponses.offer_product
    );
    const businessContext = buildQuestionnaireBusinessContext({
      responses: campaignInsights.enrichedResponses,
      questions,
      callType: call.type,
      proposito: call.proposito,
      clientContext: questionnaireContext.clientContext
    });
    const enrichedCallResponses = {
      ...campaignInsights.enrichedResponses,
      interest_product: normalizedResponseInterestProduct || campaignInsights.enrichedResponses.interest_product,
      upsell_interesse_produto: normalizedResponseInterestProduct || campaignInsights.enrichedResponses.upsell_interesse_produto,
      target_product: normalizedTargetProduct || campaignInsights.enrichedResponses.target_product,
      offer_product: normalizedOfferProduct || campaignInsights.enrichedResponses.offer_product,
      portfolio_scope: call.portfolioScope || campaignInsights.portfolioScope || campaignInsights.enrichedResponses.portfolio_scope,
      campaign_mode: call.campaignMode,
      offer_interest_level: call.offerInterestLevel || campaignInsights.offerInterestLevel || campaignInsights.enrichedResponses.offer_interest_level,
      offer_blocker_reason: call.offerBlockerReason || campaignInsights.offerBlockerReason || campaignInsights.enrichedResponses.offer_blocker_reason,
      campaign_name: call.campaignName || campaignInsights.enrichedResponses.campaign_name,
      questionnaire_business_tags: businessContext.tags,
      questionnaire_business_indices: businessContext.indices,
      questionnaire_business_profile: businessContext.profile,
      questionnaire_business_questions: businessContext.questionSignals,
      questionnaire_business_feeds: businessContext.feeds
    };

    const { data: insertedCall, error } = await supabase.from('call_logs').insert({
      task_id: call.taskId,
      operator_id: call.operatorId,
      client_id: call.clientId,
      call_type: mapCallLogTypeToDb(call.type),
      responses: enrichedCallResponses,
      duration: call.duration,
      report_time: call.reportTime,
      start_time: call.startTime,
      end_time: call.endTime,
      protocol_id: call.protocolId,
      proposito: call.proposito,
      campanha_indicada_id: call.campanha_indicada_id,
      campanha_id: call.campanha_id
    }).select('id').single();
    
    if (error) throw error;

    const clientUpdates: any = { last_interaction: new Date().toISOString() };
    if (email) clientUpdates.email = email;
    if (interestProduct || businessContext.capturedData.interestProduct) {
      clientUpdates.interest_product = normalizeInterestProduct(
        interestProduct || businessContext.capturedData.interestProduct
      );
    }
    if (buyerName) clientUpdates.buyer_name = buyerName;
    if (responsiblePhone) clientUpdates.responsible_phone = responsiblePhone;

    await supabase.from('clients').update(clientUpdates).eq('id', call.clientId);
    await syncDerivedTagsForClient(call.clientId);

    // Dreon Skill v3: Tag Decision Engine Integration
    try {
      const callWithId = { ...call, id: insertedCall.id, responses: enrichedCallResponses };
      const decision = TagDecisionEngine.analyzeCall(callWithId, [], questions);
      
      if (decision.tagsToCreate && decision.tagsToCreate.length > 0) {
        const mappedTags = decision.tagsToCreate.map(t => ({
          ...t,
          client_id: call.clientId,
          call_record_id: insertedCall.id,
          campanha_id: call.campanha_id,
          criado_em: new Date().toISOString()
        }));
        await supabase.from('client_tags').insert(mappedTags);
        return { id: insertedCall.id, suggestedTags: mappedTags as ClientTag[] };
      }
      return { id: insertedCall.id, suggestedTags: [] };
    } catch (e) { 
      console.error("Tag engine failed", e);
      return { id: insertedCall.id, suggestedTags: [] };
    }
  },

  updateCall: async (id: string, updates: Partial<CallRecord>): Promise<void> => {
    const payload: any = {};
    if (updates.startTime) payload.start_time = updates.startTime;
    if (updates.endTime) payload.end_time = updates.endTime;
    if (updates.responses) payload.responses = updates.responses;
    if (updates.type) payload.call_type = mapCallLogTypeToDb(updates.type);

    const { error } = await supabase.from('call_logs').update(payload).eq('id', id);
    if (error) throw error;
  },

  deleteCall: async (id: string): Promise<void> => {
    const { error } = await supabase.from('call_logs').delete().eq('id', id);
    if (error) throw error;
  },

  // Dreon Skill v3: Tags & Interações
  getClientTags: async (clientId?: string): Promise<ClientTag[]> => {
    let query = supabase.from('client_tags').select('*');
    if (clientId) {
      query = query.eq('client_id', clientId);
    }
    const { data, error } = await query.order('criado_em', { ascending: false });
    if (error) {
      console.error('Error fetching client tags', error);
      return [];
    }
    return data || [];
  },

  saveClientTag: async (tag: Partial<ClientTag>): Promise<void> => {
    const payload = { ...tag, criado_em: new Date().toISOString() };
    const { error } = await supabase.from('client_tags').insert([payload]);
    if (error) throw error;
  },

  confirmTag: async (tagId: string, operatorId: string): Promise<void> => {
    const { error } = await supabase
      .from('client_tags')
      .update({
        status: 'CONFIRMADA_OPERADOR',
        confirmado_por: operatorId,
        confirmado_em: new Date().toISOString()
      })
      .eq('id', tagId);
    if (error) throw error;
    await syncClientTagToClientProfile(tagId);
  },

  approveTag: async (tagId: string, supervisorId: string): Promise<void> => {
    const { error } = await supabase
      .from('client_tags')
      .update({
        status: 'APROVADA_SUPERVISOR',
        aprovado_por: supervisorId,
        aprovado_em: new Date().toISOString()
      })
      .eq('id', tagId);
    if (error) throw error;
    await syncClientTagToClientProfile(tagId);
  },

  rebuildDerivedClientTags: async (): Promise<number> => {
    const { data: clients, error } = await supabase.from('clients').select('id');
    if (error) throw error;

    let updated = 0;
    for (const client of clients || []) {
      if (await syncDerivedTagsForClient(client.id)) {
        updated += 1;
      }
    }

    return updated;
  },

  rejectTag: async (tagId: string, operatorId: string, reason: string): Promise<void> => {
    const { error } = await supabase
      .from('client_tags')
      .update({
        status: 'REJEITADA',
        rejeitado_por: operatorId,
        motivo_rejeicao: reason
      })
      .eq('id', tagId);
    if (error) throw error;
  },

  getDetailedCallsToday: async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('call_logs')
      .select('*, clients(*), profiles:operator_id(*)')
      .gte('start_time', `${todayStr}T00:00:00`)
      .neq('call_type', 'WHATSAPP')
      .order('start_time', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getDetailedPendingTasks: async (operatorId?: string) => {
    const [{ data: allProfiles }, tasks, waTasks] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, username_display, username'),
      dataService.getTasks(operatorId),
      dataService.getWhatsAppTasks(operatorId)
    ]);

    const profileMap = new Map((allProfiles || []).map(p => [p.id, p]));
    const now = new Date();

    const voiceQueue = tasks
      .filter(t => t.status === 'pending')
      .filter(t => !!t.assignedTo)
      .filter(t => t.approvalStatus === 'APPROVED' || !t.approvalStatus)
      .filter(t => !t.scheduledFor || new Date(t.scheduledFor) <= now)
      .map(t => ({
        ...t,
        queueChannel: 'LIGACAO',
        clients: t.clients || { name: t.clientName || 'Prospecto', phone: t.clientPhone || '' },
        profiles: profileMap.get(t.assignedTo || '') || null,
        duration: 0,
        report_time: 0
      }));

    const whatsappQueue = waTasks
      .filter(t => t.status === 'pending')
      .filter(t => !!t.assignedTo)
      .map(t => ({
        ...t,
        deadline: t.createdAt,
        scheduledFor: undefined,
        queueChannel: 'WHATSAPP',
        clients: { name: t.clientName || 'Cliente Desconhecido', phone: t.clientPhone || '' },
        profiles: profileMap.get(t.assignedTo || '') || null,
        duration: 0,
        report_time: 0
      }));

    return [...voiceQueue, ...whatsappQueue].sort((a, b) => {
      const aTime = new Date(a.scheduledFor || a.deadline || a.createdAt || 0).getTime();
      const bTime = new Date(b.scheduledFor || b.deadline || b.createdAt || 0).getTime();
      return aTime - bTime;
    });
  },



  logOperatorEvent: async (operatorId: string, type: OperatorEventType, taskId?: string, note?: string) => {
    const { error } = await supabase.from('operator_events').insert({
      operator_id: operatorId,
      event_type: type,
      task_id: taskId,
      note: note
    });

    // If the task_id does not exist in the tasks table (e.g. it's a schedule ID), it will throw a FK violation (23503)
    if (error && error.code === '23503') {
      await supabase.from('operator_events').insert({
        operator_id: operatorId,
        event_type: type,
        task_id: null,
        note: note ? note + ` (Origem Ref: ${taskId})` : `Origem Ref: ${taskId}`
      });
    }
  },

  getOperatorEvents: async (startDate: string, endDate: string): Promise<OperatorEvent[]> => {
    const { data, error } = await supabase
      .from('operator_events')
      .select('*')
      .gte('timestamp', `${startDate}T00:00:00`)
      .lte('timestamp', `${endDate}T23:59:59`)
      .order('timestamp', { ascending: true });
    if (error) throw error;
    return (data || []).map(e => ({
      id: e.id,
      operatorId: e.operator_id,
      taskId: e.task_id,
      eventType: e.event_type as OperatorEventType,
      timestamp: e.timestamp,
      note: e.note
    }));
  },

  getClients: async (includeLeads: boolean = false): Promise<Client[]> => {
    let allData: any[] = [];
    let hasMore = true;
    let fromIndex = 0;
    const limit = 1000;

    while (hasMore) {
      let query = supabase
        .from('clients')
        .select('*')
        .neq('invalid', true)
        .order('name')
        .range(fromIndex, fromIndex + limit - 1);

      // Default: Return ONLY 'CLIENT' status.
      // If includeLeads is true, return ALL (for unified search).
      if (!includeLeads) {
        query = query.neq('status', 'LEAD');
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        allData.push(...data);
      }

      if (!data || data.length < limit) {
        hasMore = false;
      } else {
        fromIndex += limit;
      }
    }

    return allData.map(mapClientRecord);
  },

  getClientById: async (clientId: string): Promise<Client | null> => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).maybeSingle();
    if (error) throw error;
    return data ? mapClientRecord(data) : null;
  },

  getClientHistory: async (clientId: string): Promise<ClientHistoryData> => {
    try {
      // Fetch Call Logs
      const { data: callsData, error: callsError } = await supabase
        .from('call_logs')
        .select('*')
        .eq('client_id', clientId)
        .order('start_time', { ascending: false });

      if (callsError) throw callsError;

      // Fetch Protocols
      const { data: protocolsData, error: protocolsError } = await supabase
        .from('protocols')
        .select('*')
        .eq('client_id', clientId)
        .order('opened_at', { ascending: false });

      if (protocolsError) throw protocolsError;

      const campaignContextMap = await loadCampaignContextMap((callsData || []).map((call: any) => call.campanha_id).filter(Boolean));

      const mappedCalls: CallRecord[] = (callsData || []).map(c => {
        const campaignInsights = extractCampaignInsightsFromResponses(c.responses || {});
        const context = campaignContextMap.get(c.campanha_id) || {};
        const callProposito = decodeLatin1(c.proposito) || decodeLatin1(context.proposito);
        const callCampaignName = decodeLatin1(context.campaignName);
        const callTargetProduct = decodeLatin1(context.targetProduct);
        const callOfferProduct = decodeLatin1(context.offerProduct);
        const callPortfolioScope = decodeLatin1(context.portfolioScope);
        const callCampaignMode = decodeLatin1(context.campaignMode);

        return {
          id: c.id,
          taskId: c.task_id,
          operatorId: c.operator_id,
          clientId: c.client_id,
          startTime: c.start_time,
          endTime: c.end_time,
          duration: c.duration,
          reportTime: c.report_time,
          responses: c.responses || {},
          type: mapStoredCallTypeToApp(c.call_type),
          protocolId: c.protocol_id,
          proposito: callProposito,
          campanha_id: c.campanha_id,
          campaignName: callCampaignName,
          targetProduct: c.responses?.target_product || callTargetProduct,
          offerProduct: c.responses?.offer_product || callOfferProduct,
          portfolioScope: c.responses?.portfolio_scope || campaignInsights.portfolioScope || callPortfolioScope,
          campaignMode: c.responses?.campaign_mode || callCampaignMode,
          offerInterestLevel: c.responses?.offer_interest_level || campaignInsights.offerInterestLevel,
          offerBlockerReason: c.responses?.offer_blocker_reason || campaignInsights.offerBlockerReason
        };
      });

      const mappedProtocols: Protocol[] = (protocolsData || []).map(p => ({
        id: p.id,
        protocolNumber: p.protocol_number,
        clientId: p.client_id,
        openedByOperatorId: p.opened_by_operator_id,
        ownerOperatorId: p.owner_operator_id,
        origin: p.origin,
        departmentId: p.department_id,
        categoryId: p.category_id,
        title: p.title,
        description: p.description,
        priority: p.priority as any,
        status: p.status as ProtocolStatus,
        openedAt: p.opened_at,
        updatedAt: p.updated_at,
        closedAt: p.closed_at,
        firstResponseAt: p.first_response_at,
        lastActionAt: p.last_action_at,
        slaDueAt: p.sla_due_at,
        resolutionSummary: p.resolution_summary,
        rootCause: p.root_cause
      }));

      return {
        calls: mappedCalls,
        protocols: mappedProtocols,
        summary: buildClientHistorySummary(mappedCalls, mappedProtocols)
      };
    } catch (e) {
      console.error("Error getting client history:", e);
      return {
        calls: [],
        protocols: [],
        summary: buildClientHistorySummary([], [])
      };
    }
  },

  getProspects: async (): Promise<Client[]> => {
    let allData: any[] = [];
    let hasMore = true;
    let fromIndex = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'LEAD')
        .neq('invalid', true)
        .not('tags', 'cs', '{"JA_CLIENTE"}')
        .order('name')
        .range(fromIndex, fromIndex + limit - 1);
      if (error) throw error;

      if (data && data.length > 0) {
        allData.push(...data);
      }

      if (!data || data.length < limit) {
        hasMore = false;
      } else {
        fromIndex += limit;
      }
    }

    return allData.map(mapClientRecord).map(client => ({ ...client, status: 'LEAD' as const }));
  },

  findDuplicateClients: async (): Promise<any[]> => {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, phone, status, created_at')
      .neq('invalid', true)
      .order('created_at', { ascending: false });
    if (error || !clients) return [];

    const phoneMap = new Map<string, any[]>();
    for (const c of clients) {
      if (!c.phone) continue;
      const normalized = normalizePhone(c.phone);
      if (!phoneMap.has(normalized)) phoneMap.set(normalized, []);
      phoneMap.get(normalized)!.push(c);
    }

    const duplicates = [];
    for (const [phone, list] of phoneMap.entries()) {
      if (list.length > 1) {
        duplicates.push({ phone, count: list.length, clients: list });
      }
    }
    return duplicates;
  },

  batchUpdateInactiveClients: async (entries: { name: string; phone: string; lastPurchaseDate: string }[]): Promise<{ updated: number; notFound: string[] }> => {
    let updated = 0;
    const notFound: string[] = [];

    for (const entry of entries) {
      const phone = normalizePhone(entry.phone);
      if (!phone) { notFound.push(`${entry.name} (sem telefone)`); continue; }

      // Try exact phone match first
      let found: any = null;
      const { data: byPhone } = await supabase.from('clients').select('id, name').eq('phone', phone).neq('invalid', true).maybeSingle();
      if (byPhone) found = byPhone;

      // Fallback: match by name (case-insensitive)
      if (!found && entry.name) {
        const { data: byName } = await supabase.from('clients').select('id, name').neq('invalid', true).ilike('name', entry.name.trim()).maybeSingle();
        if (byName) found = byName;
      }

      if (!found) {
        notFound.push(`${entry.name} (${entry.phone})`);
        continue;
      }

      const { error } = await supabase
        .from('clients')
        .update({ last_purchase_date: entry.lastPurchaseDate, status: 'INATIVO' })
        .eq('id', found.id);

      if (error) {
        console.error(`Error updating ${found.name}:`, error);
        notFound.push(`${found.name} (erro: ${error.message})`);
      } else {
        updated++;
      }
    }

    return { updated, notFound };
  },

  cleanupBadClientRecords: async (): Promise<number> => {
    // Find and delete records with address fragments as names (created by a buggy CSV import)
    const { data: badRecords } = await supabase
      .from('clients')
      .select('id, name, phone')
      .eq('status', 'INATIVO');

    if (!badRecords) return 0;

    let cleaned = 0;
    for (const rec of badRecords) {
      const isBadName = rec.name?.startsWith('nº ') || rec.name?.match(/^\d{2}\/\d{2}\/\d{4}$/);
      const isBadPhone = rec.phone && rec.phone.replace(/\D/g, '').length <= 8;

      if (isBadName || isBadPhone) {
        const { error } = await supabase.from('clients').delete().eq('id', rec.id);
        if (!error) cleaned++;
      }
    }
    return cleaned;
  },

  dispatchLeadsToQueue: async (leadIds: string[], operatorId?: string, taskType: CallType = CallType.PROSPECCAO): Promise<void> => {
    if (!leadIds || leadIds.length === 0) return;

    const payloads = leadIds.map(id => ({
      client_id: id,
      type: taskType,
      assigned_to: operatorId || null,
      status: 'pending'
    }));

    const { error } = await supabase.from('tasks').insert(payloads);
    if (error) throw error;
  },


  upsertClient: async (
    client: Partial<Client>,
    options?: { replacePortfolio?: boolean }
  ): Promise<Client> => {
    const phone = normalizePhone(client.phone || '');
    if (!phone) throw new Error("Telefone obrigatório");

    const normalizedSecondaryPhone = normalizePhone(client.phone_secondary || '');
    let existing: any = null;

    if (client.id) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    // --- 3-step deduplication ---
    // Step 1: Match by external_id (if provided and already exists in the system)
    if (!existing && client.external_id) {
      const { data } = await supabase.from('clients').select('*').eq('external_id', client.external_id).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    // Step 2: Match by phone (normalized)
    if (!existing) {
      const { data } = await supabase.from('clients').select('*').eq('phone', phone).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    if (!existing) {
      const { data } = await supabase.from('clients').select('*').eq('phone_secondary', phone).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    if (!existing && normalizedSecondaryPhone) {
      const { data } = await supabase.from('clients').select('*').eq('phone', normalizedSecondaryPhone).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    if (!existing && normalizedSecondaryPhone) {
      const { data } = await supabase.from('clients').select('*').eq('phone_secondary', normalizedSecondaryPhone).neq('invalid', true).limit(1);
      if (data?.[0]) existing = data[0];
    }

    // Step 3: Match by name + street (fuzzy — ilike for name)
    if (!existing && client.name && resolveStructuredAddressFields(client).street) {
      const { data } = await supabase.from('clients')
        .select('*')
        .neq('invalid', true)
        .ilike('name', client.name)
        .ilike('street', resolveStructuredAddressFields(client).street || '')
        .limit(1);
      if (data?.[0]) existing = data[0];
    }

    if (!existing) {
      existing = await findExistingClientForUpsert(client, phone);
    }

    const structuredAddress = resolveStructuredAddressFields(client, existing);
    const catalogConfig = await PortfolioCatalogService.getCatalogConfig();
    const shouldReplacePortfolio = Boolean(options?.replacePortfolio && client.portfolio_entries !== undefined);
    const mergedPortfolioEntries = normalizePortfolioEntriesWithCatalog(
      shouldReplacePortfolio
        ? mergePortfolioEntries(client.portfolio_entries)
        : mergePortfolioEntries(existing?.portfolio_entries, client.portfolio_entries),
      catalogConfig
    );
    const portfolioMetadata = collectPortfolioMetadata(mergedPortfolioEntries);
    const equipmentModels = shouldReplacePortfolio
      ? mergeUniquePortfolioValues(
          client.equipment_models,
          client.items,
          portfolioMetadata.equipment_models
        )
      : mergeUniquePortfolioValues(
          existing?.equipment_models,
          existing?.items,
          client.equipment_models,
          client.items,
          portfolioMetadata.equipment_models
        );
    const customerProfiles = shouldReplacePortfolio
      ? mergeUniquePortfolioValues(
          client.customer_profiles,
          portfolioMetadata.customer_profiles
        )
      : mergeUniquePortfolioValues(
          existing?.customer_profiles,
          client.customer_profiles,
          portfolioMetadata.customer_profiles
        );
    const productCategories = shouldReplacePortfolio
      ? mergeUniquePortfolioValues(
          client.product_categories,
          portfolioMetadata.product_categories
        )
      : mergeUniquePortfolioValues(
          existing?.product_categories,
          client.product_categories,
          portfolioMetadata.product_categories
        );
    const normalizedOffers = normalizeInterestProductList([...(existing?.offers || []), ...(client.offers || [])]);
    const normalizedInterestProduct = normalizeInterestProduct(existing?.interest_product || client.interest_product);
    const mergedPhones = mergePhoneFields(
      existing?.phone || phone,
      existing?.phone_secondary || normalizedSecondaryPhone || client.phone_secondary || null
    );

    // Build payload: existing data takes priority, only fill empty fields
    const payload: any = {
      name: existing?.name || client.name || 'Sem Nome',
      phone: mergedPhones.phone,
      address: existing?.address || structuredAddress.address || '',
      items: equipmentModels,
      offers: normalizedOffers,
      last_interaction: existing?.last_interaction || new Date().toISOString(),
      origin: existing?.origin || client.origin || 'MANUAL',
      origin_detail: existing?.origin_detail || client.origin_detail || null,
      email: existing?.email || client.email,
      website: existing?.website || client.website,
      // Ensure INATIVO is respected from payload if passed, otherwise existing status is preserved.
      // If sale happens, saveSale will convert to CLIENT. Never downgrade CLIENT to LEAD.
      status: client.status === 'INATIVO' ? 'INATIVO' :
        (client.status === 'CLIENT' ? 'CLIENT' : (existing?.status === 'CLIENT' ? 'CLIENT' : (existing?.status || client.status || 'CLIENT'))),
      responsible_phone: existing?.responsible_phone || client.responsible_phone,
      buyer_name: existing?.buyer_name || client.buyer_name,
      interest_product: normalizedInterestProduct,
      preferred_channel: existing?.preferred_channel || client.preferred_channel,
      funnel_status: existing?.funnel_status || client.funnel_status || 'NEW',
      // Address & Phone fields — fill only if empty
      external_id: existing?.external_id || client.external_id,
      phone_secondary: mergedPhones.phone_secondary,
      street: structuredAddress.street || null,
      neighborhood: structuredAddress.neighborhood || null,
      city: structuredAddress.city || null,
      state: structuredAddress.state || null,
      zip_code: structuredAddress.zip_code || null,
      last_purchase_date: client.last_purchase_date || existing?.last_purchase_date,
      customer_profiles: customerProfiles,
      product_categories: productCategories,
      equipment_models: equipmentModels,
      portfolio_entries: mergedPortfolioEntries
    };

    if (existing) {
      // UPDATE existing record — never duplicate
      const { data, error } = await supabase.from('clients').update(payload).eq('id', existing.id).select().single();
      if (error) throw error;
      await syncDerivedTagsForClient(data.id);
      return mapClientRecord(data);
    } else {
      // INSERT new record
      const { data, error } = await supabase.from('clients').insert(payload).select().single();
      if (error && isUniqueViolationError(error)) {
        existing = await findExistingClientForUpsert(client, phone);
        if (existing) {
          const { data: recoveredData, error: recoveredError } = await supabase
            .from('clients')
            .update(payload)
            .eq('id', existing.id)
            .select()
            .single();
          if (recoveredError) throw recoveredError;
          await syncDerivedTagsForClient(recoveredData.id);
          return mapClientRecord(recoveredData);
        }
      }
      if (error) throw error;
      await syncDerivedTagsForClient(data.id);
      return mapClientRecord(data);
    }
  },

  saveClientProfile: async (clientId: string, updates: Partial<Client>): Promise<Client> => {
    const { data: existing, error: existingError } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw new Error('Cliente não encontrado');

    const nextPhone = normalizePhone(updates.phone || existing.phone || '');
    const nextSecondaryPhone = normalizePhone(updates.phone_secondary || existing.phone_secondary || '');
    if (!nextPhone) throw new Error('Telefone obrigatório');

    const structuredAddress = resolveStructuredAddressFields(updates, existing);
    const hasPortfolioUpdate = updates.portfolio_entries !== undefined;
    const catalogConfig = await PortfolioCatalogService.getCatalogConfig();
    const nextPortfolioEntries = normalizePortfolioEntriesWithCatalog(
      hasPortfolioUpdate
        ? mergePortfolioEntries(updates.portfolio_entries)
        : mergePortfolioEntries(existing.portfolio_entries),
      catalogConfig
    );
    const portfolioMetadata = collectPortfolioMetadata(nextPortfolioEntries);
    const equipmentModels = hasPortfolioUpdate
      ? mergeUniquePortfolioValues(
          updates.equipment_models,
          updates.items,
          portfolioMetadata.equipment_models
        )
      : mergeUniquePortfolioValues(
          existing.equipment_models,
          existing.items,
          updates.equipment_models,
          updates.items,
          portfolioMetadata.equipment_models
        );
    const customerProfiles = hasPortfolioUpdate
      ? mergeUniquePortfolioValues(
          updates.customer_profiles,
          portfolioMetadata.customer_profiles
        )
      : mergeUniquePortfolioValues(
          existing.customer_profiles,
          updates.customer_profiles,
          portfolioMetadata.customer_profiles
        );
    const productCategories = hasPortfolioUpdate
      ? mergeUniquePortfolioValues(
          updates.product_categories,
          portfolioMetadata.product_categories
        )
      : mergeUniquePortfolioValues(
          existing.product_categories,
          updates.product_categories,
          portfolioMetadata.product_categories
        );
    const normalizedOffers = normalizeInterestProductList(updates.offers ?? existing.offers ?? []);
    const normalizedInterestProduct = normalizeInterestProduct(
      updates.interest_product ?? existing.interest_product ?? undefined
    );
    const mergedPhones = mergePhoneFields(nextPhone, nextSecondaryPhone);

    const payload: any = {
      name: updates.name ?? existing.name ?? 'Sem Nome',
      phone: mergedPhones.phone,
      address: structuredAddress.address,
      items: equipmentModels,
      offers: normalizedOffers,
      last_interaction: existing.last_interaction || new Date().toISOString(),
      origin: updates.origin ?? existing.origin ?? 'MANUAL',
      origin_detail: updates.origin_detail ?? existing.origin_detail ?? null,
      email: updates.email ?? existing.email ?? null,
      website: updates.website ?? existing.website ?? null,
      status: updates.status === 'INATIVO'
        ? 'INATIVO'
        : (updates.status === 'CLIENT'
          ? 'CLIENT'
          : (existing.status === 'CLIENT' ? 'CLIENT' : (updates.status ?? existing.status ?? 'CLIENT'))),
      responsible_phone: updates.responsible_phone ?? existing.responsible_phone ?? null,
      buyer_name: updates.buyer_name ?? existing.buyer_name ?? null,
      interest_product: normalizedInterestProduct ?? null,
      preferred_channel: updates.preferred_channel ?? existing.preferred_channel ?? null,
      funnel_status: updates.funnel_status ?? existing.funnel_status ?? 'NEW',
      external_id: updates.external_id ?? existing.external_id ?? null,
      phone_secondary: mergedPhones.phone_secondary,
      street: structuredAddress.street || null,
      neighborhood: structuredAddress.neighborhood || null,
      city: structuredAddress.city || null,
      state: structuredAddress.state || null,
      zip_code: structuredAddress.zip_code || null,
      last_purchase_date: updates.last_purchase_date ?? existing.last_purchase_date ?? null,
      customer_profiles: customerProfiles,
      product_categories: productCategories,
      equipment_models: equipmentModels,
      portfolio_entries: nextPortfolioEntries
    };

    const { data, error } = await supabase.from('clients').update(payload).eq('id', clientId).select().single();
    if (error) throw error;

    await syncDerivedTagsForClient(data.id);
    return mapClientRecord(data);
  },

  updateClientFields: async (clientId: string, updates: Partial<Client>): Promise<void> => {
    if (
      updates.name !== undefined ||
      updates.phone !== undefined ||
      updates.address !== undefined ||
      updates.street !== undefined ||
      updates.neighborhood !== undefined ||
      updates.city !== undefined ||
      updates.state !== undefined ||
      updates.zip_code !== undefined ||
      updates.portfolio_entries !== undefined ||
      updates.customer_profiles !== undefined ||
      updates.product_categories !== undefined ||
      updates.equipment_models !== undefined
    ) {
      await dataService.saveClientProfile(clientId, updates);
      return;
    }

    const payload: any = { ...updates };
    if (updates.phone) payload.phone = normalizePhone(updates.phone);
    if (updates.offers !== undefined) payload.offers = normalizeInterestProductList(updates.offers);
    if (updates.interest_product !== undefined) {
      payload.interest_product = normalizeInterestProduct(updates.interest_product) ?? null;
    }

    const { error } = await supabase.from('clients').update(payload).eq('id', clientId);
    if (error) throw error;

    if (updates.items || updates.equipment_models || updates.interest_product || updates.satisfaction || updates.tags) {
      await syncDerivedTagsForClient(clientId);
    }
  },

  getInvalidClients: async (): Promise<Client[]> => {
    let allData: any[] = [];
    let hasMore = true;
    let fromIndex = 0;
    const limit = 1000;

    while (hasMore) {
      const { data, error } = await supabase.from('clients').select('*').eq('invalid', true).order('name').range(fromIndex, fromIndex + limit - 1);
      if (error) throw error;

      if (data && data.length > 0) {
        allData.push(...data);
      }

      if (!data || data.length < limit) {
        hasMore = false;
      } else {
        fromIndex += limit;
      }
    }

    return allData.map(record => ({
      ...mapClientRecord(record),
      invalid: record.invalid
    }));
  },

  // --- CLIENT MERGE (Deduplication) ---
  findDuplicatesByName: async (name: string): Promise<any[]> => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .neq('invalid', true)
      .ilike('name', `%${name}%`);
    if (error) throw error;
    return data || [];
  },

  mergeClients: async (keeperId: string, duplicateId: string): Promise<{ migratedCalls: number; migratedTasks: number; migratedSchedules: number }> => {
    const stats = { migratedCalls: 0, migratedTasks: 0, migratedSchedules: 0 };

    // 1. Merge items/offers arrays from duplicate into keeper
    const { data: keeper } = await supabase.from('clients').select('*').eq('id', keeperId).single();
    const { data: duplicate } = await supabase.from('clients').select('*').eq('id', duplicateId).single();
    if (!keeper || !duplicate) throw new Error('Client(s) not found');

    const mergedPortfolioEntries = mergePortfolioEntries(keeper.portfolio_entries, duplicate.portfolio_entries);
    const mergedMetadata = collectPortfolioMetadata(mergedPortfolioEntries);
    const mergedItems = mergeUniquePortfolioValues(
      keeper.items,
      keeper.equipment_models,
      duplicate.items,
      duplicate.equipment_models,
      mergedMetadata.equipment_models
    );
    const mergedOffers = normalizeInterestProductList([...(keeper.offers || []), ...(duplicate.offers || [])]);
    const candidatePhones = Array.from(
      new Set(
        [
          keeper.phone,
          keeper.phone_secondary,
          duplicate.phone,
          duplicate.phone_secondary,
          ...extractCandidatePhonesFromCombined(keeper.phone),
          ...extractCandidatePhonesFromCombined(keeper.phone_secondary),
          ...extractCandidatePhonesFromCombined(duplicate.phone),
          ...extractCandidatePhonesFromCombined(duplicate.phone_secondary)
        ]
          .map(value => normalizePhone(String(value || '')))
          .filter(isLikelyBrazilPhoneLength)
      )
    );
    const mergedPhones = mergePhoneFields(candidatePhones[0], candidatePhones[1] || null);

    const updatePayload: any = {
      name: keeper.name || duplicate.name,
      phone: mergedPhones.phone,
      items: mergedItems,
      offers: mergedOffers,
      customer_profiles: mergeUniquePortfolioValues(keeper.customer_profiles, duplicate.customer_profiles, mergedMetadata.customer_profiles),
      product_categories: mergeUniquePortfolioValues(keeper.product_categories, duplicate.product_categories, mergedMetadata.product_categories),
      equipment_models: mergedItems,
      portfolio_entries: mergedPortfolioEntries,
      // Merge address/phone fields only if keeper is missing them
      external_id: keeper.external_id || duplicate.external_id,
      phone_secondary: mergedPhones.phone_secondary,
      email: keeper.email || duplicate.email,
      website: keeper.website || duplicate.website,
      responsible_phone: keeper.responsible_phone || duplicate.responsible_phone,
      buyer_name: keeper.buyer_name || duplicate.buyer_name,
      preferred_channel: keeper.preferred_channel || duplicate.preferred_channel,
      interest_product: keeper.interest_product || duplicate.interest_product,
      last_purchase_date: keeper.last_purchase_date || duplicate.last_purchase_date,
      address: keeper.address || duplicate.address,
      street: keeper.street || duplicate.street,
      neighborhood: keeper.neighborhood || duplicate.neighborhood,
      city: keeper.city || duplicate.city,
      state: keeper.state || duplicate.state,
      zip_code: keeper.zip_code || duplicate.zip_code,
      tags: Array.from(new Set([...(keeper.tags || []), ...(duplicate.tags || [])]))
    };

    const { error: keeperUpdateError } = await supabase.from('clients').update(updatePayload).eq('id', keeperId);
    if (keeperUpdateError) throw keeperUpdateError;
    await syncDerivedTagsForClient(keeperId);

    // 2. Migrate call_logs
    const { data: calls, error: callsError } = await supabase.from('call_logs').select('id').eq('client_id', duplicateId);
    if (callsError) throw callsError;
    if (calls && calls.length > 0) {
      const { error } = await supabase.from('call_logs').update({ client_id: keeperId }).eq('client_id', duplicateId);
      if (error) throw error;
      stats.migratedCalls = calls.length;
    }

    // 3. Migrate tasks
    const { data: tasks, error: tasksError } = await supabase.from('tasks').select('id').eq('client_id', duplicateId);
    if (tasksError) throw tasksError;
    if (tasks && tasks.length > 0) {
      const { error } = await supabase.from('tasks').update({ client_id: keeperId }).eq('client_id', duplicateId);
      if (error) throw error;
      stats.migratedTasks = tasks.length;
    }

    // 4. Migrate call_schedules
    const { data: schedules, error: schedulesError } = await supabase.from('call_schedules').select('id').eq('customer_id', duplicateId);
    if (schedulesError) throw schedulesError;
    if (schedules && schedules.length > 0) {
      const { error } = await supabase.from('call_schedules').update({ customer_id: keeperId }).eq('customer_id', duplicateId);
      if (error) throw error;
      stats.migratedSchedules = schedules.length;
    }

    // 5. Migrate protocols
    const { data: protocols, error: protocolsError } = await supabase.from('protocols').select('id').eq('client_id', duplicateId);
    if (protocolsError) throw protocolsError;
    if (protocols && protocols.length > 0) {
      const { error } = await supabase.from('protocols').update({ client_id: keeperId }).eq('client_id', duplicateId);
      if (error) throw error;
    }

    // 6. Migrate whatsapp_tasks
    const { data: waTasks, error: waTasksError } = await supabase.from('whatsapp_tasks').select('id').eq('client_id', duplicateId);
    if (waTasksError) throw waTasksError;
    if (waTasks && waTasks.length > 0) {
      const { error } = await supabase.from('whatsapp_tasks').update({ client_id: keeperId }).eq('client_id', duplicateId);
      if (error) throw error;
    }

    // 7. Migrate related records that also point to the duplicate client
    const relatedUpdates = await Promise.all([
      supabase.from('client_tags').update({ client_id: keeperId }).eq('client_id', duplicateId),
      supabase.from('quotes').update({ client_id: keeperId }).eq('client_id', duplicateId),
      supabase.from('visits').update({ client_id: keeperId }).eq('client_id', duplicateId),
      supabase.from('sales').update({ client_id: keeperId }).eq('client_id', duplicateId),
      supabase.from('sales').update({ customer_id: keeperId }).eq('customer_id', duplicateId)
    ]);
    for (const result of relatedUpdates) {
      if (result.error) throw result.error;
    }

    // 8. Remove duplicates that may have converged in the queues after the reassignment
    const { data: pendingTasks, error: pendingTasksError } = await supabase
      .from('tasks')
      .select('id, assigned_to, type, status, created_at')
      .eq('client_id', keeperId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (pendingTasksError) throw pendingTasksError;
    const duplicateTaskIds = new Set<string>();
    const seenTaskKeys = new Set<string>();
    for (const task of pendingTasks || []) {
      const key = `${task.assigned_to || ''}::${task.type || ''}::${task.status || ''}`;
      if (seenTaskKeys.has(key)) duplicateTaskIds.add(task.id);
      else seenTaskKeys.add(key);
    }
    if (duplicateTaskIds.size > 0) {
      const { error } = await supabase.from('tasks').delete().in('id', Array.from(duplicateTaskIds));
      if (error) throw error;
    }

    const { data: pendingWhatsApp, error: pendingWhatsAppError } = await supabase
      .from('whatsapp_tasks')
      .select('id, assigned_to, type, source, source_id, status, created_at')
      .eq('client_id', keeperId)
      .in('status', ['pending', 'started'])
      .order('created_at', { ascending: true });
    if (pendingWhatsAppError) throw pendingWhatsAppError;
    const duplicateWhatsAppIds = new Set<string>();
    const seenWhatsAppKeys = new Set<string>();
    for (const task of pendingWhatsApp || []) {
      const key = `${task.assigned_to || ''}::${task.type || ''}::${task.source || ''}::${task.source_id || ''}::${task.status || ''}`;
      if (seenWhatsAppKeys.has(key)) duplicateWhatsAppIds.add(task.id);
      else seenWhatsAppKeys.add(key);
    }
    if (duplicateWhatsAppIds.size > 0) {
      const { error } = await supabase.from('whatsapp_tasks').delete().in('id', Array.from(duplicateWhatsAppIds));
      if (error) throw error;
    }

    // 9. Delete the duplicate. If the active RLS policy refuses the physical delete,
    // mark it invalid so it stops feeding campaigns and queues.
    const { count: deletedCount, error: deleteError } = await supabase
      .from('clients')
      .delete({ count: 'exact' })
      .eq('id', duplicateId);
    if (deleteError) throw deleteError;

    if ((deletedCount || 0) === 0) {
      const { error: invalidateError } = await supabase
        .from('clients')
        .update({
          invalid: true,
          campanha_atual_id: null
        })
        .eq('id', duplicateId);
      if (invalidateError) throw invalidateError;
    }

    return stats;
  },

  repairWhatsAppPhoneDuplicates: async (): Promise<{
    scannedClients: number;
    suspectClients: number;
    repairedClients: number;
    mergedClients: number;
    remappedWhatsAppTasks: number;
    repairs: Array<{
      malformedClientId: string;
      malformedName: string;
      keeperClientId: string;
      keeperName: string;
      malformedPhone: string;
      normalizedPhones: string[];
      migratedTasks: number;
    }>;
  }> => {
    const report = {
      scannedClients: 0,
      suspectClients: 0,
      repairedClients: 0,
      mergedClients: 0,
      remappedWhatsAppTasks: 0,
      repairs: [] as Array<{
        malformedClientId: string;
        malformedName: string;
        keeperClientId: string;
        keeperName: string;
        malformedPhone: string;
        normalizedPhones: string[];
        migratedTasks: number;
      }>
    };

    const [{ data: clients, error: clientsError }, { data: whatsappTasks, error: tasksError }] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, phone, phone_secondary, status, created_at, updated_at, tags, email, buyer_name, responsible_phone, portfolio_entries'),
      supabase
        .from('whatsapp_tasks')
        .select('id, client_id, status')
        .in('status', ['pending', 'started', 'completed', 'skipped'])
    ]);

    if (clientsError) throw clientsError;
    if (tasksError) throw tasksError;

    const clientList = clients || [];
    const waList = whatsappTasks || [];
    report.scannedClients = clientList.length;

    const clientsWithWhatsApp = new Set(waList.map(task => task.client_id).filter(Boolean));
    const phoneIndex = new Map<string, any[]>();

    for (const client of clientList) {
      [client.phone, client.phone_secondary]
        .map(value => normalizePhone(String(value || '')))
        .filter(isLikelyBrazilPhoneLength)
        .forEach(phone => {
          const group = phoneIndex.get(phone) || [];
          group.push(client);
          phoneIndex.set(phone, group);
        });
    }

    const suspectClients = sortClientCandidates(
      clientList.filter(client =>
        isLikelyCombinedPhone(client.phone) || isLikelyCombinedPhone(client.phone_secondary)
      )
    );
    report.suspectClients = suspectClients.length;

    const alreadyHandled = new Set<string>();

    for (const suspect of suspectClients) {
      if (alreadyHandled.has(suspect.id)) continue;

      const candidatePhones = Array.from(
        new Set([
          ...extractCandidatePhonesFromCombined(suspect.phone),
          ...extractCandidatePhonesFromCombined(suspect.phone_secondary)
        ])
      );

      if (candidatePhones.length === 0) continue;

      const matchingClients = mergeUniqueClientCandidates(
        ...candidatePhones.map(phone =>
          (phoneIndex.get(phone) || []).filter(candidate => candidate.id !== suspect.id)
        )
      ).filter(candidate => clientsWithWhatsApp.has(candidate.id) || scoreClientRecordForMerge(candidate) > 0);

      if (matchingClients.length === 0) continue;

      const keeper = [...matchingClients].sort((left, right) => {
        const scoreDiff = scoreClientRecordForMerge(right) - scoreClientRecordForMerge(left);
        if (scoreDiff !== 0) return scoreDiff;
        return sortClientCandidates([left, right])[0]?.id === left.id ? -1 : 1;
      })[0];

      if (!keeper?.id || keeper.id === suspect.id) continue;

      const { data: waTasksBefore, error: waTasksBeforeError } = await supabase
        .from('whatsapp_tasks')
        .select('id')
        .eq('client_id', suspect.id);
      if (waTasksBeforeError) throw waTasksBeforeError;

      const migratedTaskCount = (waTasksBefore || []).length;
      await dataService.mergeClients(keeper.id, suspect.id);

      report.repairedClients += 1;
      report.mergedClients += 1;
      report.remappedWhatsAppTasks += migratedTaskCount;
      report.repairs.push({
        malformedClientId: suspect.id,
        malformedName: getSafeText(suspect.name, 'Sem Nome'),
        keeperClientId: keeper.id,
        keeperName: getSafeText(keeper.name, 'Sem Nome'),
        malformedPhone: getSafeText(suspect.phone || suspect.phone_secondary),
        normalizedPhones: candidatePhones,
        migratedTasks: migratedTaskCount
      });

      alreadyHandled.add(suspect.id);
      alreadyHandled.add(keeper.id);
    }

    return report;
  },

  getProtocolConfig: () => ({
    departments: [
      { id: 'atendimento', name: 'Atendimento/Vendas' },
      { id: 'tecnico', name: 'Suporte Técnico' },
      { id: 'financeiro', name: 'Financeiro' },
      { id: 'logistica', name: 'Logística/Entrega' }
    ]
  }),

  getProtocols: async (): Promise<Protocol[]> => {
    const { data, error } = await supabase.from('protocols').select('*').order('opened_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(p => ({
      id: p.id,
      clientId: p.client_id,
      openedByOperatorId: p.opened_by_id,
      ownerOperatorId: p.owner_id,
      origin: p.origin || 'Atendimento',
      departmentId: p.department_id,
      categoryId: '',
      title: p.title || 'Sem Título',
      description: p.description || '',
      priority: (p.priority as any) || 'Média',
      status: (p.status as ProtocolStatus) || ProtocolStatus.ABERTO,
      openedAt: p.opened_at,
      updatedAt: p.updated_at,
      closedAt: p.closed_at,
      lastActionAt: p.updated_at,
      slaDueAt: p.opened_at,
      resolutionSummary: p.resolution_summary,
      protocolNumber: p.protocol_number
    }));
  },

  getProtocolEvents: async (protocolId: string): Promise<ProtocolEvent[]> => {
    const { data, error } = await supabase
      .from('protocol_events')
      .select('*')
      .eq('protocol_id', protocolId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(e => ({
      id: e.id,
      protocolId: e.protocol_id,
      eventType: e.event_type,
      oldValue: e.old_value,
      newValue: e.new_value,
      note: e.note,
      actorId: e.actor_id,
      createdAt: e.created_at
    }));
  },

  saveProtocol: async (p: Protocol, actorId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('protocols').insert({
        client_id: p.clientId,
        opened_by_id: p.openedByOperatorId,
        owner_id: p.ownerOperatorId,
        origin: p.origin || 'Manual',
        department_id: p.departmentId,
        title: p.title,
        description: p.description,
        priority: p.priority,
        status: p.status,
        opened_at: p.openedAt,
        updated_at: p.updatedAt,
        sla_due_at: p.slaDueAt
      }).select().single();

      if (error) {
        console.error("[dataService.saveProtocol] Insert Error:", error);
        throw error;
      }

      await supabase.from('protocol_events').insert({
        protocol_id: data.id,
        event_type: 'creation',
        note: 'Protocolo aberto manualmente',
        actor_id: actorId
      });

      const managerIds = await getActiveManagerIds();
      await createUserNotifications([
        ...(p.ownerOperatorId ? [{
          userId: p.ownerOperatorId,
          type: 'PROTOCOL_ASSIGNED',
          title: 'Novo protocolo atribuido',
          body: p.title,
          relatedEntityType: 'protocol',
          relatedEntityId: data.id
        }] : []),
        ...managerIds.map(managerId => ({
          userId: managerId,
          type: 'PROTOCOL_CREATED',
          title: 'Novo protocolo aberto',
          body: p.title,
          relatedEntityType: 'protocol',
          relatedEntityId: data.id
        }))
      ]);
      return true;
    } catch (err) {
      console.error("[dataService.saveProtocol] Fatal Error:", err);
      throw err;
    }
  },

  updateProtocol: async (protocolId: string, updates: Partial<Protocol>, actorId: string, note?: string): Promise<boolean> => {
    const { data: existingProtocol } = await supabase
      .from('protocols')
      .select('owner_id, title, status')
      .eq('id', protocolId)
      .maybeSingle();

    const payload: any = { updated_at: new Date().toISOString() };
    if (updates.status) payload.status = updates.status;
    if (updates.ownerOperatorId) payload.owner_id = updates.ownerOperatorId;
    if (updates.resolutionSummary) payload.resolution_summary = updates.resolutionSummary;
    if (updates.closedAt) payload.closed_at = updates.closedAt;
    const { error } = await supabase.from('protocols').update(payload).eq('id', protocolId);
    if (error) throw error;
    await supabase.from('protocol_events').insert({
      protocol_id: protocolId,
      event_type: updates.status ? 'status_change' : 'update',
      note: note || 'Atualização de protocolo',
      actor_id: actorId
    });

    const managerIds = await getActiveManagerIds();
    const recipientIds = Array.from(new Set([
      existingProtocol?.owner_id,
      updates.ownerOperatorId,
      ...managerIds
    ].filter(Boolean)));

    if (recipientIds.length > 0) {
      await createUserNotifications(recipientIds.map(recipientId => ({
        userId: recipientId,
        type: updates.ownerOperatorId && updates.ownerOperatorId !== existingProtocol?.owner_id ? 'PROTOCOL_REASSIGNED' : 'PROTOCOL_UPDATED',
        title: updates.ownerOperatorId && updates.ownerOperatorId !== existingProtocol?.owner_id ? 'Protocolo reatribuido' : 'Protocolo atualizado',
        body: updates.status ? `Status: ${updates.status}` : (existingProtocol?.title || 'Um protocolo foi atualizado.'),
        relatedEntityType: 'protocol',
        relatedEntityId: protocolId
      })));
    }
    return true;
  },

  calculateIDE: async (calls: CallRecord[]) => {
    if (!calls || calls.length === 0) return 0;
    const questions = await dataService.getQuestions();
    const recommendationQuestion = questions.find(q => normalize(q.text).includes('recomendaria'));
    if (!recommendationQuestion) return 0;
    let totalScore = 0;
    let totalResp = 0;
    calls.forEach(call => {
      const val = dataService.getResponseValue(call.responses, recommendationQuestion);
      if (val) {
        const score = SCORE_MAP[String(val)];
        if (score !== undefined) {
          totalScore += (score / 2) * 100;
          totalResp++;
        }
      }
    });
    return totalResp > 0 ? Math.round(totalScore / totalResp) : 0;
  },

  getStageAverages: async (calls: CallRecord[]) => {
    const questions = await dataService.getQuestions();
    const stages: Record<string, { total: number, count: number, color: string }> = {};
    calls.forEach(call => {
      questions.forEach(question => {
        if (!question.stageId) return;
        const val = dataService.getResponseValue(call.responses, question);
        if (val) {
          const config = STAGE_CONFIG[question.stageId as keyof typeof STAGE_CONFIG];
          if (!stages[config.label]) stages[config.label] = { total: 0, count: 0, color: config.color };
          const score = SCORE_MAP[String(val)];
          if (score !== undefined) {
            stages[config.label].total += (score / 2) * 100;
            stages[config.label].count++;
          }
        }
      });
    });
    return Object.entries(stages).map(([stage, data]) => ({ stage, percentage: data.count > 0 ? Math.round(data.total / data.count) : 0, color: data.color }));
  },

  getDetailedStats: async (calls: CallRecord[], protocols: Protocol[], tasks: Task[]) => {
    const questions = await dataService.getQuestions();
    const questionAnalysis = questions.map(q => {
      const responses = calls.map(c => dataService.getResponseValue(c.responses, q)).filter(r => r !== undefined);
      const distribution = q.options.map(opt => ({
        name: opt,
        value: responses.filter(r => normalize(String(r)) === normalize(String(opt))).length
      }));
      const posOpts = ['sim', 'otimo', 'atendeu', 'no prazo', 'alto', 'boa'];
      const posCount = responses.filter(r => posOpts.some(p => normalize(String(r)) === p)).length;
      return {
        id: q.id,
        text: q.text,
        order: q.order,
        distribution,
        responsesCount: responses.length,
        positivity: responses.length > 0 ? Math.round((posCount / responses.length) * 100) : 0
      };
    });
    const skips = tasks.filter(t => t.status === 'skipped');
    const skipStats = Array.from(new Set(skips.map(s => s.skipReason || 'Não informado'))).map(reason => ({
      name: reason,
      value: skips.filter(s => (s.skipReason || 'Não informado') === reason).length
    }));
    const protocolCategoryStats = dataService.getProtocolConfig().departments.map(dept => ({
      name: dept.name,
      id: dept.id,
      value: protocols.filter(p => p.departmentId === dept.id).length
    }));
    return { questionAnalysis, protocolCategoryStats, skipStats };
  },

  // --- VISITAS ---
  // --- QUOTES (ORÇAMENTOS) ---
  getQuotes: async (): Promise<Quote[]> => {
    const rows: Quote[] = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;

      const batch = data || [];
      rows.push(...batch);

      if (batch.length < pageSize) break;
      from += pageSize;
    }

    return rows.map(quote => ({
      ...quote,
      interest_product: normalizeInterestProduct(quote.interest_product)
    }));
  },

  findQuoteByNumber: async (quoteNumber: string): Promise<Quote | null> => {
    const normalizedQuoteNumber = normalizeQuoteNumber(quoteNumber);
    if (!normalizedQuoteNumber) return null;

    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_number', normalizedQuoteNumber)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
      ...data,
      interest_product: normalizeInterestProduct(data.interest_product)
    };
  },

  saveQuote: async (quote: Partial<Quote>): Promise<Quote> => {
    const normalizedInterestProduct = normalizeInterestProduct(quote.interest_product);
    const normalizedQuoteNumber = normalizeQuoteNumber(quote.quote_number);
    const payload = {
      ...quote,
      ...(normalizedQuoteNumber ? { quote_number: normalizedQuoteNumber } : {}),
      interest_product: normalizedInterestProduct
    };
    const { data, error } = await supabase.from('quotes').insert(payload).select().single();
    if (error) {
      if (normalizedQuoteNumber && (error.code === '23505' || error.message?.includes('quotes_quote_number_key'))) {
        try {
          (error as typeof error & { existingQuote?: Quote | null }).existingQuote = await dataService.findQuoteByNumber(normalizedQuoteNumber);
        } catch {
          // Preserve the original database error when lookup fails.
        }
      }

      throw error;
    }

    // Sync interest_product back to the client so it can be filtered in Campaign Planner
    if (normalizedInterestProduct && quote.client_id) {
       await supabase.from('clients').update({ interest_product: normalizedInterestProduct }).eq('id', quote.client_id);
    }

    return {
      ...data,
      interest_product: normalizeInterestProduct(data?.interest_product)
    };
  },

  updateQuote: async (id: string, updates: Partial<Quote>): Promise<Quote> => {
    const normalizedInterestProduct = updates.interest_product !== undefined
      ? normalizeInterestProduct(updates.interest_product)
      : undefined;
    const normalizedQuoteNumber = updates.quote_number !== undefined
      ? normalizeQuoteNumber(updates.quote_number)
      : undefined;
    const payload = {
      ...updates,
      ...(updates.quote_number !== undefined ? { quote_number: normalizedQuoteNumber } : {}),
      ...(updates.interest_product !== undefined ? { interest_product: normalizedInterestProduct } : {})
    };
    const { data, error } = await supabase.from('quotes').update(payload).eq('id', id).select().single();
    if (error) {
      if (normalizedQuoteNumber && (error.code === '23505' || error.message?.includes('quotes_quote_number_key'))) {
        try {
          (error as typeof error & { existingQuote?: Quote | null }).existingQuote = await dataService.findQuoteByNumber(normalizedQuoteNumber);
        } catch {
          // Preserve the original database error when lookup fails.
        }
      }

      throw error;
    }

    // Sync interest_product back to the client so it can be filtered in Campaign Planner
    if (normalizedInterestProduct && data?.client_id) {
       await supabase.from('clients').update({ interest_product: normalizedInterestProduct }).eq('id', data.client_id);
    }

    return {
      ...data,
      interest_product: normalizeInterestProduct(data?.interest_product)
    };
  },

  deleteQuote: async (id: string): Promise<void> => {
    const { error } = await supabase.from('quotes').delete().eq('id', id);
    if (error) throw error;
  },

  // --- VISITAS ---
  getVisits: async (): Promise<Visit[]> => {
    const { data, error } = await supabase
      .from('visits')
      .select('*')
      .order('order_index', { ascending: true })
      .order('scheduled_date', { ascending: true });

    if (error) throw error;

    return (data || []).map(v => ({
      id: v.id,
      clientId: v.client_id,
      clientName: v.client_name,
      address: v.address,
      phone: v.phone,
      salespersonId: v.salesperson_id,
      salespersonName: v.salesperson_name,
      scheduledDate: v.scheduled_date,
      status: v.status,
      outcome: v.outcome,
      createdAt: v.created_at,
      // New fields
      orderIndex: v.order_index,
      externalSalesperson: v.external_salesperson,
      isIndication: v.is_indication,
      realized: v.realized,
      originType: v.origin_type,
      originId: v.origin_id,
      contactPerson: v.contact_person,
      notes: v.notes
    }));
  },

  saveVisit: async (visit: Partial<Visit>): Promise<void> => {
    const { data, error } = await supabase.from('visits').insert({
      client_id: visit.clientId,
      client_name: visit.clientName,
      address: visit.address,
      phone: visit.phone,
      salesperson_id: visit.salespersonId,
      salesperson_name: visit.salespersonName,
      scheduled_date: visit.scheduledDate,
      status: visit.status || 'PENDING',
      outcome: visit.outcome,
      // New fields
      order_index: visit.orderIndex,
      external_salesperson: visit.externalSalesperson,
      is_indication: visit.isIndication,
      realized: visit.realized,
      origin_type: visit.originType,
      origin_id: visit.originId,
      contact_person: visit.contactPerson,
      notes: visit.notes
    }).select('id').single();
    if (error) throw error;

    const managerIds = await getActiveManagerIds();
    await createUserNotifications([
      ...(visit.salespersonId ? [{
        userId: visit.salespersonId,
        type: 'VISIT_CREATED',
        title: 'Nova visita no roteiro',
        body: visit.clientName || 'Um novo item entrou no roteiro.',
        relatedEntityType: 'visit',
        relatedEntityId: data?.id
      }] : []),
      ...managerIds.map(managerId => ({
        userId: managerId,
        type: 'VISIT_CREATED',
        title: 'Nova visita criada',
        body: visit.clientName || 'Um novo item entrou no roteiro.',
        relatedEntityType: 'visit',
        relatedEntityId: data?.id
      }))
    ]);
  },

  updateVisit: async (id: string, updates: Partial<Visit>): Promise<void> => {
    const { data: existingVisit } = await supabase
      .from('visits')
      .select('salesperson_id, client_name')
      .eq('id', id)
      .maybeSingle();

    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.outcome) payload.outcome = updates.outcome;
    if (updates.scheduledDate) payload.scheduled_date = updates.scheduledDate;
    if (updates.orderIndex !== undefined) payload.order_index = updates.orderIndex;
    if (updates.externalSalesperson) payload.external_salesperson = updates.externalSalesperson;
    if (updates.isIndication !== undefined) payload.is_indication = updates.isIndication;
    if (updates.realized !== undefined) payload.realized = updates.realized;
    if (updates.contactPerson) payload.contact_person = updates.contactPerson;
    if (updates.notes !== undefined) payload.notes = updates.notes;

    const { error } = await supabase.from('visits').update(payload).eq('id', id);
    if (error) throw error;

    // Automate funnel progression for Leads
    if (updates.realized === true || updates.status === 'COMPLETED') {
      const { data: visitData } = await supabase.from('visits').select('client_id').eq('id', id).single();
      if (visitData && visitData.client_id) {
        // Check if it's a LEAD, if so move to PHYSICAL_VISIT
        const { data: clientData } = await supabase.from('clients').select('status, funnel_status').eq('id', visitData.client_id).single();
        if (clientData && clientData.status === 'LEAD') {
          await supabase.from('clients').update({ funnel_status: 'PHYSICAL_VISIT' }).eq('id', visitData.client_id);
        }
      }
    }

    if (updates.status || updates.realized === true) {
      const managerIds = await getActiveManagerIds();
      await createUserNotifications([
        ...(existingVisit?.salesperson_id ? [{
          userId: existingVisit.salesperson_id,
          type: updates.status === 'COMPLETED' ? 'VISIT_COMPLETED' : 'VISIT_UPDATED',
          title: updates.status === 'COMPLETED' ? 'Visita concluida' : 'Visita atualizada',
          body: existingVisit.client_name || 'O roteiro recebeu uma atualizacao.',
          relatedEntityType: 'visit',
          relatedEntityId: id
        }] : []),
        ...managerIds.map(managerId => ({
          userId: managerId,
          type: updates.status === 'COMPLETED' ? 'VISIT_COMPLETED' : 'VISIT_UPDATED',
          title: updates.status === 'COMPLETED' ? 'Visita concluida' : 'Visita atualizada',
          body: existingVisit?.client_name || 'O roteiro recebeu uma atualizacao.',
          relatedEntityType: 'visit',
          relatedEntityId: id
        }))
      ]);
    }
  },

  // Busca candidatos para rotas (Calls e Tasks)
  getRouteCandidates: async (filters: { operatorId?: string; date?: string; type?: string }) => {
    let callsQuery = supabase.from('call_logs').select('*, clients!inner(*)');
    let waQuery = supabase.from('whatsapp_tasks').select('*, clients!inner(*)');

    if (filters.operatorId) {
      callsQuery = callsQuery.eq('operator_id', filters.operatorId);
      waQuery = waQuery.eq('assigned_to', filters.operatorId);
    }

    if (filters.date) {
      const start = `${filters.date}T00:00:00`;
      const end = `${filters.date}T23:59:59`;
      callsQuery = callsQuery.gte('start_time', start).lte('start_time', end);
      waQuery = waQuery.gte('created_at', start).lte('created_at', end);
    }

    let callsData: any[] = [];
    let waData: any[] = [];

    const promises = [];

    // Fetch CALLS if type is ALL or NOT WHATSAPP
    if (filters.type !== 'WHATSAPP') {
      if (filters.type && filters.type !== 'ALL') {
        callsQuery = callsQuery.ilike('call_type', `% ${filters.type}% `);
      }
      promises.push(callsQuery.then(({ data, error }) => {
        if (error) throw error;
        callsData = data || [];
      }));
    }

    // Fetch WHATSAPP if type is ALL or WHATSAPP
    if (!filters.type || filters.type === 'ALL' || filters.type === 'WHATSAPP') {
      promises.push(waQuery.then(({ data, error }) => {
        if (error) throw error;
        waData = data || [];
      }));
    }

    await Promise.all(promises);

    // Helper to find responsible person in responses
    const findContact = (responses: any) => {
      if (!responses) return undefined;
      const keys = Object.keys(responses);
      for (const k of keys) {
        const lowerK = k.toLowerCase();
        if (lowerK.includes('quem') || lowerK.includes('responsável') || lowerK.includes('responsavel') || lowerK.includes('contato')) {
          return responses[k];
        }
      }
      return undefined;
    };

    const getFullAddress = (client: any) => {
      if (!client) return '';
      if (client.address) return client.address;
      const parts = [client.street, client.neighborhood, client.city, client.state].filter(Boolean);
      return parts.join(', ');
    };

    const mappedCalls = callsData.map((c: any) => ({
      id: c.id,
      type: 'CALL',
      clientName: c.clients?.name || 'Cliente Desconhecido',
      clientId: c.client_id,
      address: getFullAddress(c.clients),
      phone: c.clients?.phone || '',
      date: c.start_time,
      description: `Ligação: ${c.call_type} `,
      operatorId: c.operator_id,
      contactPerson: findContact(c.responses)
    }));

    const mappedWa = waData.map((t: any) => ({
      id: t.id,
      type: 'WHATSAPP',
      clientName: t.clients?.name || 'Cliente Desconhecido',
      clientId: t.client_id,
      address: getFullAddress(t.clients),
      phone: t.clients?.phone || '',
      date: t.created_at,
      description: `WhatsApp: ${t.type || 'Mensagem'} `,
      operatorId: t.assigned_to,
      contactPerson: undefined
    }));

    // --- FETCH PROSPECTS FOR PHYSICAL VISIT ---
    let visitProspects: any[] = [];
    if (!filters.type || filters.type === 'ALL' || filters.type === 'VISIT') {
      // Only fetch if we are not filtering for something else strictly
      // REMOVED funnel_status check to include ALL leads as requested by user
      const { data: prospects } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'LEAD');

      visitProspects = (prospects || []).map(p => ({
        id: p.id, // Using Client ID as the ID for this "candidate"
        type: 'VISIT_PROSPECT', // New type
        clientName: p.name,
        clientId: p.id,
        address: p.address,
        phone: p.phone,
        date: p.created_at, // or last_interaction
        description: `Prospecto: ${p.funnel_status || 'Novo'} (${p.interest_product || 'Geral'})`,
        operatorId: null, // No specific operator assigned yet
        contactPerson: p.buyer_name || p.responsible_phone
      }));
    }

    return [...mappedCalls, ...mappedWa, ...visitProspects].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  },

  deleteVisit: async (id: string): Promise<void> => {
    const { error } = await supabase.from('visits').delete().eq('id', id);
    if (error) throw error;
  },

  // --- EXTERNAL SALESPEOPLE ---
  getExternalSalespeople: async (): Promise<any[]> => {
    const { data, error } = await supabase.from('external_salespeople').select('*').eq('active', true).order('name');
    if (error) throw error;
    return data || [];
  },

  addExternalSalesperson: async (name: string): Promise<void> => {
    const { error } = await supabase.from('external_salespeople').insert({ name });
    if (error) throw error;
  },

  removeExternalSalesperson: async (id: string): Promise<void> => {
    const { error } = await supabase.from('external_salespeople').update({ active: false }).eq('id', id);
    if (error) throw error;
  },

  // --- WHATSAPP MODULE ---
  createWhatsAppTask: async (
    task: Partial<WhatsAppTask>,
    options?: { skipRecentCommunicationCheck?: boolean; reassignExistingTask?: boolean }
  ): Promise<{ created: boolean; existingTaskId?: string; reassigned?: boolean }> => {
    if (!task.clientId) throw new Error('Cliente obrigatório para criar tarefa de WhatsApp.');

    const normalizedAssignedTo = normalizeUuidReference(task.assignedTo);
    const normalizedSourceId = normalizeUuidReference(task.sourceId);
    const syncExistingTask = async (existingQueueEntry: any) => {
      const shouldSyncAssignment = normalizedAssignedTo && (
        (options?.reassignExistingTask && existingQueueEntry.assigned_to !== normalizedAssignedTo) ||
        (!options?.reassignExistingTask && !existingQueueEntry.assigned_to)
      );
      const payload: Record<string, any> = {};

      if (shouldSyncAssignment) {
        payload.assigned_to = normalizedAssignedTo;
      }

      if (normalizedSourceId && existingQueueEntry.source_id !== normalizedSourceId) {
        payload.source_id = normalizedSourceId;
      }

      if (Object.keys(payload).length > 0) {
        const { error: updateError } = await supabase
          .from('whatsapp_tasks')
          .update(payload)
          .eq('id', existingQueueEntry.id);

        if (updateError) throw updateError;
      }

      return { created: false, existingTaskId: existingQueueEntry.id, reassigned: Boolean(shouldSyncAssignment) };
    };

    await cleanupDuplicateWhatsAppQueueEntries({
      clientId: task.clientId,
      taskType: task.type
    });

    if (!options?.skipRecentCommunicationCheck) {
      const recentCommunication = await getRecentCommunicationDetails(task.clientId);
      if (recentCommunication.blocked) {
        return { created: false };
      }
    }

    const existingQueueEntry = await findOpenWhatsAppTask(task.clientId, task.type);
    if (existingQueueEntry) {
      return await syncExistingTask(existingQueueEntry);
    }

    const { error } = await insertWhatsAppTaskRecord({
      client_id: task.clientId,
      assigned_to: normalizedAssignedTo,
      type: task.type,
      status: task.status || 'pending',
      source: task.source || 'manual',
      source_id: normalizedSourceId
    });
    if (error && isUniqueViolationError(error)) {
      const existingAfterConflict = await findOpenWhatsAppTask(task.clientId, task.type);
      if (existingAfterConflict) {
        return await syncExistingTask(existingAfterConflict);
      }
    }
    if (error) throw error;
    return { created: true };
  },

  getWhatsAppTasks: async (operatorId?: string, startDate?: string, endDate?: string): Promise<WhatsAppTask[]> => {
    if (!startDate && !endDate) {
      await cleanupDuplicateWhatsAppQueueEntries();
      await cleanupInvalidWhatsAppQueueEntries({ operatorId });
    }

    let query = supabase.from('whatsapp_tasks').select('*, clients(name, phone, invalid)');
    if (operatorId) {
      query = query.eq('assigned_to', operatorId);
    }

    if (startDate && endDate) {
      const start = `${startDate}T00:00:00`;
      const end = `${endDate}T23:59:59`;
      // Fetch if created, started, or completed in the range
      query = query.or(`and(created_at.gte.${start},created_at.lte.${end}),and(started_at.gte.${start},started_at.lte.${end}),and(completed_at.gte.${start},completed_at.lte.${end}),and(updated_at.gte.${start},updated_at.lte.${end})`);
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;

    return (data || [])
      .filter((t: any) => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        return clientObj?.invalid !== true;
      })
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        return {
          id: t.id,
          clientId: t.client_id,
          assignedTo: t.assigned_to,
          status: t.status,
          type: t.type,
          source: t.source,
          sourceId: t.source_id,
          skipReason: t.skip_reason,
          skipNote: t.skip_note,
          startedAt: t.started_at,
          completedAt: t.completed_at,
          responses: t.responses,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
          clientName: clientObj?.name || 'Cliente Desconhecido',
          clientPhone: clientObj?.phone || ''
        };
      });
  },

  startWhatsAppTask: async (id: string, operatorId: string): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').update({
      status: 'started',
      started_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;

    // Log Analytics
    await dataService.logOperatorEvent(operatorId, OperatorEventType.WHATSAPP_START, id);
  },

  skipWhatsAppTask: async (id: string, operatorId: string, reason: string, note?: string): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').update({
      status: 'skipped',
      skip_reason: reason,
      skip_note: note,
      completed_at: new Date().toISOString() // Considered "done" when skipped
    }).eq('id', id);
    if (error) throw error;

    // Log Analytics
    await dataService.logOperatorEvent(operatorId, OperatorEventType.WHATSAPP_SKIP, id, `${reason} - ${note || ''} `);
  },

  completeWhatsAppTask: async (id: string, operatorId: string, responses: any): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').update({
      status: 'completed',
      responses: responses,
      completed_at: new Date().toISOString()
    }).eq('id', id);
    if (error) throw error;

    // Log Analytics
    await dataService.logOperatorEvent(operatorId, OperatorEventType.WHATSAPP_COMPLETE, id);
  },

  moveCallToWhatsApp: async (taskId: string, operatorId: string): Promise<void> => {
    const { data: legacyTask, error: legacyTaskError } = await supabase
      .from('tasks')
      .select('id, client_id, assigned_to, type, proposito')
      .eq('id', taskId)
      .maybeSingle();
    if (legacyTaskError) throw legacyTaskError;

    let sourceTask = legacyTask;

    if (!sourceTask) {
      const { data: approvedSchedule, error: approvedScheduleError } = await supabase
        .from('call_schedules')
        .select('id, customer_id, assigned_operator_id, call_type, schedule_reason')
        .eq('id', taskId)
        .maybeSingle();
      if (approvedScheduleError) throw approvedScheduleError;

      if (!approvedSchedule) {
        throw new Error('Tarefa de ligacao nao encontrada.');
      }

      sourceTask = {
        id: approvedSchedule.id,
        client_id: approvedSchedule.customer_id,
        assigned_to: approvedSchedule.assigned_operator_id,
        type: approvedSchedule.call_type,
        proposito: approvedSchedule.schedule_reason
      };
    }

    const responsibleOperatorId = sourceTask.assigned_to || operatorId;

    await dataService.createWhatsAppTask({
      clientId: sourceTask.client_id,
      assignedTo: responsibleOperatorId,
      status: 'pending',
      type: sourceTask.type,
      source: 'call_skip_whatsapp',
      sourceId: taskId
    }, { skipRecentCommunicationCheck: true });

    await dataService.updateTask(taskId, {
      status: 'skipped',
      skipReason: 'moved_to_whatsapp'
    });

    await dataService.logOperatorEvent(operatorId, OperatorEventType.PULAR_ATENDIMENTO, taskId, 'Movido para WhatsApp');
  },

  moveWhatsAppToCall: async (taskId: string, operatorId: string): Promise<void> => {
    const { data: task, error: getError } = await supabase
      .from('whatsapp_tasks')
      .select('id, client_id, assigned_to, type, status')
      .eq('id', taskId)
      .maybeSingle();
    if (getError) throw getError;
    if (!task) throw new Error('Tarefa de WhatsApp nao encontrada.');
    if (task.status !== 'pending') {
      throw new Error('Somente tarefas pendentes do WhatsApp podem ser movidas para ligacao.');
    }

    const responsibleOperatorId = task.assigned_to || operatorId;

    const restoredTaskId = await restoreLatestBlockedVoiceTask({
      clientId: task.client_id,
      operatorId: responsibleOperatorId,
      taskType: task.type
    });

    if (!restoredTaskId) {
      await dataService.createTask({
        clientId: task.client_id,
        assignedTo: responsibleOperatorId,
        status: 'pending',
        type: task.type
      }, { skipRecentCommunicationCheck: true });
    }

    await dataService.updateWhatsAppTask(taskId, {
      status: 'skipped',
      skip_reason: 'moved_to_voice',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });

    await dataService.logOperatorEvent(operatorId, OperatorEventType.ADMIN_REAGENDAR, undefined, `Movido para Ligacao a partir da tarefa WhatsApp ${taskId}`);
  },

  deleteWhatsAppTask: async (taskId: string): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').delete().eq('id', taskId);
    if (error) throw error;
  },

  deleteMultipleWhatsAppTasks: async (taskIds: string[]): Promise<void> => {
    if (!taskIds || taskIds.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < taskIds.length; i += chunkSize) {
      const chunk = taskIds.slice(i, i + chunkSize);
      await supabase.from('whatsapp_tasks').delete().in('id', chunk);
    }
  },

  deleteWhatsAppTasksByOperator: async (operatorId: string): Promise<void> => {
    const { error } = await supabase
      .from('whatsapp_tasks')
      .delete()
      .eq('assigned_to', operatorId)
      .in('status', ['pending', 'started']);
    if (error) throw error;
  },






  // ... existing code ...

  updateWhatsAppTask: async (taskId: string, updates: any): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').update(updates).eq('id', taskId);
    if (error) throw error;

    if (updates.status === 'skipped') {
      const { data: task } = await supabase.from('whatsapp_tasks').select('client_id').eq('id', taskId).single();
      if (task?.client_id) await updateClientFunnelStatus(task.client_id, 'CONTACT_ATTEMPT');
    } else if (updates.status === 'completed' || updates.status === 'done') { // 'done' is used sometimes
      const { data: task } = await supabase.from('whatsapp_tasks').select('client_id').eq('id', taskId).single();
      if (task?.client_id) await updateClientFunnelStatus(task.client_id, 'CONTACT_MADE');
    }
  },

  getProductivityMetrics: async (startDate: string, endDate: string): Promise<ProductivityMetrics> => {
    const users = await dataService.getUsers();
    const operators = getTaskAssignableUsers(users);

    const [events, sales] = await Promise.all([
      dataService.getOperatorEvents(startDate, endDate),
      dataService.getSales() // getSales fetches all, might need date filter. update getSales?
    ]);

    // getSales doesn't support date filter in current implementation, it fetches all.
    // We should filter client-side or add filter to getSales. 
    // Given the current implementation of getSales (lines 130-149), it fetches all 1000 rows.
    // Better to do a direct query for sales here to avoid over-fetching and for correctness.

    const { data: rawSales, error: salesError } = await supabase
      .from('sales')
      .select('*')
      .gte('registered_at', startDate)
      .lte('registered_at', endDate);

    if (salesError) throw salesError;

    const isWhatsAppEvent = (e: any) => 
        e.eventType === OperatorEventType.WHATSAPP_COMPLETE || 
        e.eventType === OperatorEventType.WHATSAPP_START || 
        e.eventType === OperatorEventType.WHATSAPP_SKIP || 
        ((e.eventType === OperatorEventType.PULAR_ATENDIMENTO || e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO) && e.note?.toLowerCase().includes('whatsapp'));

    const totalCalls = events.filter(e => e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO && !e.note?.toLowerCase().includes('whatsapp')).length;
    const totalWhatsApp = events.filter(isWhatsAppEvent).length;
    const salesCount = rawSales?.length || 0;
    const conversionRate = totalCalls > 0 ? (salesCount / totalCalls) * 100 : 0;

    const operatorStats = operators.map(op => {
      const opEvents = events.filter(e => e.operatorId === op.id);
      const opSales = rawSales?.filter(s => s.operator_id === op.id) || [];

      const opCalls = opEvents.filter(e => e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO && !e.note?.toLowerCase().includes('whatsapp')).length;
      const opWhatsapp = opEvents.filter(isWhatsAppEvent).length;

      return {
        id: op.id,
        name: op.name,
        calls: opCalls,
        whatsapp: opWhatsapp,
        sales: opSales.length
      };
    }).sort((a, b) => b.sales - a.sales);

    return {
      totalCalls,
      totalWhatsApp,
      salesCount,
      conversionRate,
      operatorStats
    };
  },

  // --- PÓS-VENDA & REMARKETING ---
  listUnifiedReport: async (operatorId?: string, statusFilter?: string): Promise<UnifiedReportRow[]> => {
    let rpcArgs: any = {};
    if (operatorId) rpcArgs.p_operator_id = operatorId;
    if (statusFilter) rpcArgs.p_status_filter = statusFilter;

    try {
      const { data, error } = await supabase.rpc('get_unified_remarketing_report', rpcArgs);
      if (error) throw error;

      const rows = (data || []).map((row: any) => ({
        clientId: row.client_id,
        clientName: row.client_name,
        clientPhone: row.client_phone,
        clientStatus: row.client_status,
        attemptsCount: Number(row.attempts_count),
        lastContactAt: row.last_contact_at,
        lastOutcome: row.last_outcome,
        lastOperatorId: row.last_operator_id,
        lastChannel: row.last_channel,
        lastContactGenre: row.last_contact_genre,
        lastRating: row.last_rating,
        upsellOffer: row.upsell_offer,
        upsellStatus: row.upsell_status,
        responseStatus: row.response_status,
        conversionStatus: row.conversion_status,
        lastSkipReason: row.last_skip_reason,
        lastDelayDays: row.last_delay_days
      }));

      try {
        const delayDaysByClient = await loadUnifiedReportDelayDays(
          rows.map(row => row.clientId),
          operatorId
        );

        return rows.map(row => ({
          ...row,
          lastDelayDays: row.lastDelayDays ?? delayDaysByClient.get(row.clientId)
        }));
      } catch (delayError) {
        console.warn('Unable to enrich unified report with delay days.', delayError);
        return rows;
      }
    } catch (error) {
      console.warn('Unified remarketing RPC unavailable, using fallback aggregation.', error);
      try {
        return await buildUnifiedReportFallback(operatorId, statusFilter);
      } catch (fallbackError) {
        throw new Error(formatUnknownError(fallbackError));
      }
    }
  },

  getOperationTeams: async (): Promise<OperationTeam[]> => {
    const { data, error } = await supabase
      .from('operation_teams')
      .select('*')
      .order('name');

    if (error) {
      if (isMissingSchemaResourceError(error, ['operation_teams'])) return [];
      throw error;
    }
    return (data || []).map(mapOperationTeamRecord);
  },

  getTaskLists: async (ownerUserId: string): Promise<TaskList[]> => {
    try {
      const { data, error } = await supabase
        .from('task_lists')
        .select('*')
        .eq('owner_user_id', ownerUserId)
        .eq('active', true)
        .order('name');

      if (error) throw error;
      return (data || []).map(mapTaskListRecord);
    } catch (error) {
      if (isMissingSchemaResourceError(error, ['task_lists'])) return [];
      throw error;
    }
  },

  createTaskList: async (params: {
    name: string;
    ownerUserId: string;
    createdBy: string;
  }): Promise<TaskList> => {
    const { data, error } = await supabase
      .from('task_lists')
      .insert({
        name: params.name.trim(),
        owner_user_id: params.ownerUserId,
        created_by: params.createdBy,
        active: true
      })
      .select('*')
      .single();

    if (error) {
      if (isMissingSchemaResourceError(error, ['task_lists'])) {
        throw new Error('A estrutura de listas de tarefas ainda nao existe no banco. Rode a migration nova das task_lists.');
      }
      throw error;
    }

    return mapTaskListRecord(data);
  },

  archiveTaskList: async (taskListId: string): Promise<void> => {
    const { error } = await supabase
      .from('task_lists')
      .update({ active: false })
      .eq('id', taskListId);

    if (error) {
      if (isMissingSchemaResourceError(error, ['task_lists'])) {
        throw new Error('A estrutura de listas de tarefas ainda nao existe no banco. Rode a migration nova das task_lists.');
      }
      throw error;
    }
  },

  saveOperationTeam: async (team: Partial<OperationTeam>): Promise<OperationTeam> => {
    const payload = {
      name: team.name,
      sector_code: team.sectorCode || null,
      description: team.description || null,
      active: team.active ?? true
    };

    const query = team.id
      ? supabase.from('operation_teams').update(payload).eq('id', team.id).select('*').single()
      : supabase.from('operation_teams').insert(payload).select('*').single();

    const { data, error } = await query;
    if (error) throw error;
    return mapOperationTeamRecord(data);
  },

  getTaskTemplates: async (): Promise<TaskTemplate[]> => {
    const { data, error } = await supabase
      .from('task_templates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapTaskTemplateRecord);
  },

  saveTaskTemplate: async (template: Partial<TaskTemplate>): Promise<TaskTemplate> => {
    const payload = {
      title: template.title,
      description: template.description || null,
      category: template.category || 'GERAL',
      task_scope: template.taskScope || 'PESSOAL',
      recurrence_type: template.recurrenceType || 'NONE',
      recurrence_config: template.recurrenceConfig || null,
      is_accumulative: template.isAccumulative ?? false,
      generate_only_if_previous_closed: template.generateOnlyIfPreviousClosed ?? false,
      requires_approval: template.requiresApproval ?? false,
      requires_comment_on_completion: template.requiresCommentOnCompletion ?? false,
      default_priority: template.defaultPriority || 'MEDIUM',
      default_due_time: template.defaultDueTime || null,
      created_by: template.createdBy || null,
      is_active: template.isActive ?? true,
      assign_mode: template.assignMode || 'SPECIFIC',
      assign_config: template.assignConfig || null
    };

    const query = template.id
      ? supabase.from('task_templates').update(payload).eq('id', template.id).select('*').single()
      : supabase.from('task_templates').insert(payload).select('*').single();

    const { data, error } = await query;
    if (error) throw error;
    return mapTaskTemplateRecord(data);
  },

  syncTaskRecurringInstances: async (referenceDate?: string, horizonDays: number = 14): Promise<any> => {
    const { data, error } = await supabase.rpc('sync_task_recurring_instances', {
      p_reference: referenceDate || new Date().toISOString(),
      p_horizon_days: horizonDays
    });

    if (error) {
      if (isMissingSchemaResourceError(error, ['sync_task_recurring_instances'])) return null;
      throw error;
    }
    return data;
  },

  getTaskInstances: async (filters?: {
    assignedTo?: string;
    statuses?: TaskInstance['status'][];
    includeArchived?: boolean;
  }): Promise<TaskInstance[]> => {
    let query = supabase
      .from('task_instances')
      .select(`
        *,
        assigned_profile:assigned_to(*, operation_teams(name)),
        assigned_by_profile:assigned_by(*, operation_teams(name)),
        task_templates(*)
      `)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (filters?.assignedTo) {
      query = query.eq('assigned_to', filters.assignedTo);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
      query = query.in('status', filters.statuses);
    } else if (!filters?.includeArchived) {
      query = query.not('status', 'eq', 'ARQUIVADO');
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingSchemaResourceError(error, ['task_instances', 'task_templates', 'operation_teams'])) return [];
      throw error;
    }
    return (data || []).map(mapTaskInstanceRecord);
  },

  getTaskActivityLogs: async (taskInstanceId: string): Promise<TaskActivityLog[]> => {
    const { data, error } = await supabase
      .from('task_activity_logs')
      .select('*, actor_profile:actor_id(username_display)')
      .eq('task_instance_id', taskInstanceId)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingSchemaResourceError(error, ['task_activity_logs'])) return [];
      throw error;
    }
    return (data || []).map(mapTaskActivityLogRecord);
  },

  createTaskActivityLog: async (payload: Partial<TaskActivityLog>): Promise<void> => {
    const { error } = await supabase.from('task_activity_logs').insert({
      task_instance_id: payload.taskInstanceId,
      action: payload.action,
      actor_id: payload.actorId || null,
      old_value: payload.oldValue || null,
      new_value: payload.newValue || null,
      note: payload.note || null
    });

    if (error) {
      if (isMissingSchemaResourceError(error, ['task_activity_logs'])) return;
      throw error;
    }
  },

  createInternalTasks: async (params: {
    title: string;
    description?: string;
    category: string;
    priority?: TaskInstance['priority'];
    dueAt?: string | null;
    startsAt?: string | null;
    assignedBy: string;
    taskScope: TaskTemplate['taskScope'];
    assignMode: TaskTemplate['assignMode'];
    assignConfig?: Record<string, any> | null;
    assignedToIds?: string[];
    visibilityScope?: TaskInstance['visibilityScope'];
    metadata?: Record<string, any> | null;
    requiresApproval?: boolean;
    requiresCommentOnCompletion?: boolean;
    templateId?: string | null;
  }): Promise<TaskInstance[]> => {
    const resolvedAssignedIds = params.assignedToIds && params.assignedToIds.length > 0
      ? params.assignedToIds
      : await resolveTargetProfileIds({
        assignMode: params.assignMode,
        assignConfig: params.assignConfig
      });

    const visibilityScope = params.visibilityScope
      || (params.taskScope === 'PESSOAL'
        ? 'PRIVATE'
        : (params.assignMode === 'SPECIFIC'
          ? 'PRIVATE'
          : (params.assignMode === 'TEAM' ? 'TEAM' : 'SECTOR')));

    const rows = (resolvedAssignedIds.length > 0 ? resolvedAssignedIds : [null]).map(assignedTo => ({
      template_id: params.templateId || null,
      source_type: 'TASK_INTERNAL',
      source_id: null,
      title: params.title,
      description: params.description || null,
      category: params.category,
      assigned_to: assignedTo,
      assigned_by: params.assignedBy,
      visibility_scope: visibilityScope,
      priority: params.priority || 'MEDIUM',
      due_at: params.dueAt || null,
      starts_at: params.startsAt || params.dueAt || null,
      status: params.dueAt && new Date(params.dueAt).getTime() < Date.now() ? 'ATRASADO' : 'PENDENTE',
      is_recurring_instance: false,
      is_accumulated: false,
      metadata: {
        ...(params.metadata || {}),
        requiresApproval: params.requiresApproval ?? false,
        requiresCommentOnCompletion: params.requiresCommentOnCompletion ?? false,
        taskScope: params.taskScope,
        assignMode: params.assignMode
      }
    }));

    const { data, error } = await supabase
      .from('task_instances')
      .insert(rows)
      .select(`
        *,
        assigned_profile:assigned_to(*, operation_teams(name)),
        assigned_by_profile:assigned_by(*, operation_teams(name)),
        task_templates(*)
      `);

    if (error) throw error;

    const createdTasks = (data || []).map(mapTaskInstanceRecord);

    await Promise.all(createdTasks.map(task => dataService.createTaskActivityLog({
      taskInstanceId: task.id,
      action: 'CREATED',
      actorId: params.assignedBy,
      newValue: {
        assignedTo: task.assignedTo,
        dueAt: task.dueAt,
        priority: task.priority
      },
      note: 'Tarefa interna criada.'
    })));

    const notifications: Array<Partial<UserNotification>> = [];
    const creatorId = params.assignedBy;
    const createdForOtherUsers = createdTasks.some(task => task.assignedTo && task.assignedTo !== creatorId);
    const createdForMultipleRecipients = new Set(createdTasks.map(task => task.assignedTo).filter(Boolean)).size > 1;

    createdTasks.forEach(task => {
      if (task.assignedTo && task.assignedTo !== creatorId) {
        notifications.push({
          userId: task.assignedTo,
          type: 'TASK_ASSIGNED',
          title: 'Nova tarefa atribuida',
          body: task.title,
          relatedEntityType: 'task_instance',
          relatedEntityId: task.id
        });
      }
    });

    if (creatorId && (createdForOtherUsers || createdForMultipleRecipients)) {
      notifications.push({
        userId: creatorId,
        type: 'TASK_CREATED',
        title: 'Tarefa criada e enviada',
        body: params.title,
        relatedEntityType: 'task_instance',
        relatedEntityId: createdTasks[0]?.id
      });
    }

    await createUserNotifications(notifications);

    return createdTasks;
  },

  updateTaskInstance: async (
    taskInstanceId: string,
    updates: Partial<TaskInstance>,
    actorId: string,
    note?: string
  ): Promise<TaskInstance> => {
    const { data: existing, error: existingError } = await supabase
      .from('task_instances')
      .select('*')
      .eq('id', taskInstanceId)
      .single();

    if (existingError) throw existingError;

    const payload: Record<string, any> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.category !== undefined) payload.category = updates.category;
    if (updates.assignedTo !== undefined) payload.assigned_to = updates.assignedTo;
    if (updates.assignedBy !== undefined) payload.assigned_by = updates.assignedBy;
    if (updates.visibilityScope !== undefined) payload.visibility_scope = updates.visibilityScope;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.dueAt !== undefined) payload.due_at = updates.dueAt;
    if (updates.startsAt !== undefined) payload.starts_at = updates.startsAt;
    if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt;
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.completionNote !== undefined) payload.completion_note = updates.completionNote;
    if (updates.metadata !== undefined) payload.metadata = updates.metadata;

    if (updates.dueAt !== undefined && updates.status === undefined) {
      const baseStatus = normalizeTaskInstanceStatus(existing.status, existing.due_at);
      if (baseStatus === 'PENDENTE' || baseStatus === 'ATRASADO') {
        payload.status = updates.dueAt && new Date(updates.dueAt).getTime() < Date.now()
          ? 'ATRASADO'
          : 'PENDENTE';
      }
    }

    const { data, error } = await supabase
      .from('task_instances')
      .update(payload)
      .eq('id', taskInstanceId)
      .select(`
        *,
        assigned_profile:assigned_to(*, operation_teams(name)),
        assigned_by_profile:assigned_by(*, operation_teams(name)),
        task_templates(*)
      `)
      .single();

    if (error) throw error;

    const updatedTask = mapTaskInstanceRecord(data);

    await dataService.createTaskActivityLog({
      taskInstanceId,
      action: 'UPDATED',
      actorId,
      oldValue: existing,
      newValue: payload,
      note: note || 'Tarefa atualizada.'
    });

    if (updates.assignedTo && updates.assignedTo !== existing.assigned_to) {
      await createUserNotifications([{
        userId: updates.assignedTo,
        type: 'TASK_REASSIGNED',
        title: 'Voce recebeu uma tarefa',
        body: updatedTask.title,
        relatedEntityType: 'task_instance',
        relatedEntityId: taskInstanceId
      }]);
    }

    return updatedTask;
  },

  startTaskInstance: async (taskInstanceId: string, actorId: string): Promise<TaskInstance> => (
    dataService.updateTaskInstance(taskInstanceId, { status: 'EM_ANDAMENTO' }, actorId, 'Tarefa iniciada.')
  ),

  completeTaskInstance: async (
    taskInstanceId: string,
    actorId: string,
    completionNote?: string
  ): Promise<TaskInstance> => {
    const { data: existing, error } = await supabase
      .from('task_instances')
      .select('*, task_templates(*)')
      .eq('id', taskInstanceId)
      .single();

    if (error) throw error;

    const metadata = parseJsonValue(existing.metadata) || {};
    const template = existing.task_templates ? mapTaskTemplateRecord(existing.task_templates) : null;
    const requiresComment = metadata.requiresCommentOnCompletion || template?.requiresCommentOnCompletion;
    const requiresApproval = metadata.requiresApproval || template?.requiresApproval;

    if (requiresComment && !completionNote?.trim()) {
      throw new Error('Esta tarefa exige comentario na conclusao.');
    }

    const nextStatus: TaskInstance['status'] = requiresApproval ? 'AGUARDANDO' : 'CONCLUIDO';
    const completedTask = await dataService.updateTaskInstance(taskInstanceId, {
      status: nextStatus,
      completedAt: new Date().toISOString(),
      completionNote: completionNote || null
    }, actorId, requiresApproval ? 'Tarefa concluida e enviada para aprovacao.' : 'Tarefa concluida.');

    const managerIds = await getActiveManagerIds();
    const notifications: Array<Partial<UserNotification>> = [];

    if (completedTask.assignedTo) {
      notifications.push({
        userId: completedTask.assignedTo,
        type: 'TASK_COMPLETED',
        title: requiresApproval ? 'Tarefa enviada para aprovacao' : 'Tarefa concluida',
        body: completedTask.title,
        relatedEntityType: 'task_instance',
        relatedEntityId: completedTask.id
      });
    }

    managerIds
      .filter(managerId => managerId !== actorId)
      .forEach(managerId => {
        notifications.push({
          userId: managerId,
          type: 'TASK_COMPLETED',
          title: 'Uma tarefa foi concluida',
          body: completedTask.title,
          relatedEntityType: 'task_instance',
          relatedEntityId: completedTask.id
        });
      });

    await createUserNotifications(notifications);

    return completedTask;
  },

  approveTaskInstance: async (taskInstanceId: string, actorId: string, note?: string): Promise<TaskInstance> => {
    const task = await dataService.updateTaskInstance(taskInstanceId, {
      status: 'CONCLUIDO',
      completedAt: new Date().toISOString()
    }, actorId, note || 'Conclusao aprovada.');

    if (task.assignedTo) {
      await createUserNotifications([{
        userId: task.assignedTo,
        type: 'TASK_APPROVED',
        title: 'Conclusao aprovada',
        body: task.title,
        relatedEntityType: 'task_instance',
        relatedEntityId: task.id
      }]);
    }

    return task;
  },

  cancelTaskInstance: async (taskInstanceId: string, actorId: string, note?: string): Promise<TaskInstance> => (
    dataService.updateTaskInstance(taskInstanceId, { status: 'CANCELADO' }, actorId, note || 'Tarefa cancelada.')
  ),

  duplicateTaskInstance: async (taskInstanceId: string, actorId: string): Promise<TaskInstance[]> => {
    const { data, error } = await supabase
      .from('task_instances')
      .select('*')
      .eq('id', taskInstanceId)
      .single();

    if (error) throw error;

    return dataService.createInternalTasks({
      title: data.title,
      description: data.description,
      category: data.category,
      priority: data.priority,
      dueAt: data.due_at,
      startsAt: data.starts_at,
      assignedBy: actorId,
      taskScope: (parseJsonValue(data.metadata)?.taskScope || 'PESSOAL') as TaskTemplate['taskScope'],
      assignMode: 'SPECIFIC',
      assignedToIds: data.assigned_to ? [data.assigned_to] : [],
      visibilityScope: data.visibility_scope,
      metadata: parseJsonValue(data.metadata)
    });
  },

  getOperationalQueueEntries: async (): Promise<Task[]> => {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(*)')
      .in('status', ['pending', 'skipped'])
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map((task: any) => {
      const clientObj = Array.isArray(task.clients) ? task.clients[0] : task.clients;
      return {
        id: task.id,
        clientId: task.client_id,
        type: task.type ? mapStoredCallTypeToApp(task.type) : CallType.POS_VENDA,
        deadline: task.deadline || task.created_at,
        assignedTo: task.assigned_to,
        status: task.status,
        skipReason: task.skip_reason,
        scheduledFor: task.scheduled_for,
        scheduleReason: task.schedule_reason,
        approvalStatus: task.approval_status,
        originCallId: task.origin_call_id,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        clientName: clientObj?.name,
        clientPhone: clientObj?.phone,
        clients: clientObj || null
      };
    });
  },

  getUserNotifications: async (userId: string, unreadOnly: boolean = false): Promise<UserNotification[]> => {
    let query = supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    const { data, error } = await query;
    if (error) {
      if (isMissingSchemaResourceError(error, ['user_notifications'])) return [];
      throw error;
    }
    return (data || []).map(mapUserNotificationRecord);
  },

  markUserNotificationsRead: async (userId: string, notificationIds?: string[]): Promise<void> => {
    let query = supabase
      .from('user_notifications')
      .update({ is_read: true })
      .eq('user_id', userId);

    if (notificationIds && notificationIds.length > 0) {
      query = query.in('id', notificationIds);
    } else {
      query = query.eq('is_read', false);
    }

    const { error } = await query;
    if (error) {
      if (isMissingSchemaResourceError(error, ['user_notifications'])) return;
      throw error;
    }
  },

  createUserNotifications: async (notifications: Array<Partial<UserNotification>>): Promise<void> => {
    await createUserNotifications(notifications);
  },

  bulkCreateTasks: async (tasks: any[]): Promise<void> => {
    for (const task of tasks) {
      await dataService.createTask(task);
    }
  },

  bulkUpdateUpsell: async (prospectIds: string[], offer: string, notes: string, operatorId: string): Promise<void> => {
    const now = new Date().toISOString();
    const payload = prospectIds.map(id => ({
      operator_id: operatorId,
      client_id: id,
      call_type: mapCallLogTypeToDb(CallType.POS_VENDA),
      responses: { upsell_offer: offer, note: notes, is_bulk_upsell: true },
      duration: 0,
      report_time: 0,
      start_time: now,
      end_time: now
    }));
    const { error } = await supabase.from('call_logs').insert(payload);
    if (error) throw error;
  },

  getProspectHistory: async (prospectId: string): Promise<{ calls: CallRecord[], tasks: Task[] }> => {
    const [callsRes, tasksRes] = await Promise.all([
      supabase.from('call_logs').select('*').eq('client_id', prospectId).order('start_time', { ascending: false }),
      supabase.from('tasks').select('*').eq('client_id', prospectId).order('created_at', { ascending: false })
    ]);

    return {
      calls: (callsRes.data || []).map((c: any) => ({
        id: c.id,
        taskId: c.task_id,
        operatorId: c.operator_id,
        clientId: c.client_id,
        startTime: c.start_time,
        endTime: c.end_time,
        duration: c.duration,
        reportTime: c.report_time,
        responses: c.responses || {},
        type: mapStoredCallTypeToApp(c.call_type),
        protocolId: c.protocol_id
      })),
      tasks: (tasksRes.data || []).map((t: any) => ({
        id: t.id,
        clientId: t.client_id,
        type: t.type,
        assignedTo: t.assigned_to,
        status: t.status,
        scheduledFor: t.scheduled_for,
        deadline: t.deadline,
        scheduleReason: t.schedule_reason,
        skipReason: t.skip_reason,
        approvalStatus: t.approval_status,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }))
    };
  }
};

// Expose for admin console operations (merge duplicates, etc.)
(window as any).__dataService = dataService;
