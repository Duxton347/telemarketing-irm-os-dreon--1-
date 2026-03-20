import { supabase, normalizePhone, getInternalEmail, slugify } from '../lib/supabase';
import {
  Task, Client, Question, User, CallRecord,
  UserRole, CallType, ProtocolStatus, ProtocolEvent,
  OperatorEventType, OperatorEvent, Sale, SaleStatus, Visit,
  CallSchedule, CallScheduleWithClient, ScheduleStatus, WhatsAppTask, ProductivityMetrics,
  UnifiedReportRow, Protocol, ClientTag, TagStatus, Quote, ClientHistoryData, ClientHistorySummary
} from '../types';
import { TagDecisionEngine } from './tagDecisionEngine';
import { SCORE_MAP, STAGE_CONFIG } from '../constants';
import { extractCampaignInsightsFromResponses, extractClientInsightsFromResponses, questionMatchesContext, resolveStoredResponseForQuestion } from '../utils/questionnaireInsights';
import {
  collectPortfolioMetadata,
  getClientEquipmentList,
  getClientPortfolioEntries,
  mergePortfolioEntries,
  mergeUniquePortfolioValues
} from '../utils/clientPortfolio';

const normalize = (str: string) =>
  str ? str.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";

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
  'target_product',
  'offer_product',
  'portfolio_scope',
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

const buildUnifiedReportFallback = async (
  operatorId?: string,
  statusFilter?: string
): Promise<UnifiedReportRow[]> => {
  let clientsQuery = supabase.from('clients').select('id, name, phone, status');
  let callsQuery = supabase
    .from('call_logs')
    .select('id, client_id, operator_id, start_time, call_type, responses, proposito');
  let tasksQuery = supabase
    .from('tasks')
    .select('id, client_id, assigned_to, type, status, skip_reason, updated_at, created_at');
  let whatsappQuery = supabase
    .from('whatsapp_tasks')
    .select('id, client_id, assigned_to, type, status, skip_reason, created_at, completed_at, responses');
  let salesQuery = supabase
    .from('sales')
    .select('id, client_id, operator_id, registered_at, status');

  if (statusFilter) {
    clientsQuery = clientsQuery.eq('status', statusFilter);
  }

  if (operatorId) {
    callsQuery = callsQuery.eq('operator_id', operatorId);
    tasksQuery = tasksQuery.eq('assigned_to', operatorId);
    whatsappQuery = whatsappQuery.eq('assigned_to', operatorId);
    salesQuery = salesQuery.eq('operator_id', operatorId);
  }

  const [
    questions,
    clientsResult,
    callsResult,
    tasksResult,
    whatsappResult,
    salesResult
  ] = await Promise.all([
    loadActiveQuestions(),
    clientsQuery,
    callsQuery,
    tasksQuery,
    whatsappQuery,
    salesQuery
  ]);

  if (clientsResult.error) throw clientsResult.error;
  if (callsResult.error) throw callsResult.error;
  if (tasksResult.error) throw tasksResult.error;
  if (whatsappResult.error) throw whatsappResult.error;
  if (salesResult.error) throw salesResult.error;

  const clients = clientsResult.data || [];
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
    if (sale.client_id) clientIds.add(sale.client_id);
  });

  const rows = Array.from(clientIds).map(clientId => {
    const client = clientMap.get(clientId);
    const clientCalls = relevantCalls.filter(call => call.client_id === clientId);
    const clientSkippedTasks = relevantTasks.filter(task => task.client_id === clientId && task.status === 'skipped');
    const clientWhatsapp = whatsappTasks.filter(task => task.client_id === clientId && (task.status === 'completed' || task.status === 'skipped'));
    const clientSales = validSales.filter(sale => sale.client_id === clientId);

    const events: Array<{
      timestamp?: string;
      outcome: string;
      responseStatus: 'Respondeu' | 'Sem Resposta';
      operatorId?: string;
      channel: string;
      rating?: number | null;
      upsellOffer?: string;
      skipReason?: string;
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
        upsellOffer: extractUnifiedReportOffer(call.responses || {}, questions, call.call_type, call.proposito)
      });
    });

    clientSkippedTasks.forEach(task => {
      events.push({
        timestamp: task.updated_at || task.created_at,
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
        skipReason: task.status === 'skipped' ? task.skip_reason || undefined : undefined
      });
    });

    events.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());

    const lastEvent = events[0];
    const lastRatedEvent = events.find(event => event.rating !== null && event.rating !== undefined);
    const lastOfferEvent = events.find(event => event.upsellOffer);
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
      lastSkipReason: lastEvent?.responseStatus === 'Sem Resposta' ? lastEvent?.skipReason : undefined
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

const buildDerivedClientTags = (client: any, callLogs: any[] = [], derivedProfile: Partial<Client> = {}) => {
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

  const hasNegativeSignal = callLogs.some(log => hasNegativeCallSignal(log.responses));
  const hasPositiveSignal = callLogs.some(log => hasPositiveCallSignal(log.responses));

  if (hasNegativeSignal) nextTags.add('CLIENTE_INSATISFEITO');
  if (hasPositiveSignal) nextTags.add('CLIENTE_SATISFEITO');

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
  const nextTags = buildDerivedClientTags(client, normalizedLogs, derivedProfile);
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
  const targetProduct =
    safeFilters.produtoAlvo ||
    safeFilters.targetProduct ||
    (Array.isArray(safeFilters.equipamentos) && safeFilters.equipamentos.length === 1 ? safeFilters.equipamentos[0] : undefined);

  const offerProduct =
    safeFilters.ofertaAlvo ||
    safeFilters.offerProduct ||
    (Array.isArray(safeFilters.interesses) && safeFilters.interesses.length === 1 ? safeFilters.interesses[0] : undefined);

  return {
    targetProduct,
    offerProduct,
    portfolioScope: safeFilters.escopoLinha || safeFilters.portfolioScope || undefined
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

const mapClientRecord = (record: any): Client => {
  const portfolioEntries = getClientPortfolioEntries(record);
  const portfolioMetadata = collectPortfolioMetadata(portfolioEntries);
  const equipmentModels = mergeUniquePortfolioValues(record?.equipment_models, record?.items, portfolioMetadata.equipment_models);

  return {
    id: record.id,
    name: record.name || 'Sem Nome',
    phone: record.phone || '',
    address: record.address || '',
    items: equipmentModels,
    offers: record.offers || [],
    invalid: record.invalid,
    acceptance: (record.acceptance as any) || 'medium',
    satisfaction: (record.satisfaction as any) || 'medium',
    origin: record.origin,
    email: record.email,
    website: record.website,
    status: record.status || 'CLIENT',
    responsible_phone: record.responsible_phone,
    buyer_name: record.buyer_name,
    interest_product: record.interest_product,
    preferred_channel: record.preferred_channel,
    funnel_status: record.funnel_status,
    external_id: record.external_id,
    phone_secondary: record.phone_secondary,
    street: record.street,
    neighborhood: record.neighborhood,
    city: record.city,
    state: record.state,
    zip_code: record.zip_code,
    last_purchase_date: record.last_purchase_date,
    customer_profiles: mergeUniquePortfolioValues(record?.customer_profiles, portfolioMetadata.customer_profiles),
    product_categories: mergeUniquePortfolioValues(record?.product_categories, portfolioMetadata.product_categories),
    equipment_models: equipmentModels,
    portfolio_entries: portfolioEntries,
    tags: record.tags || [],
    campanha_atual_id: record.campanha_atual_id
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
    // Build schedule_reason including any skip/whatsapp metadata
    let reason = schedule.scheduleReason || '';
    if (schedule.skipReason) reason += ` | Motivo: ${schedule.skipReason}`;
    if (schedule.whatsappSent) reason += ' | WhatsApp: Sim';
    if (schedule.hasRepick) reason += ' | Repique';

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

    const { error } = await supabase.from('call_schedules').insert({
      customer_id: schedule.customerId || null,
      origin_call_id: schedule.originCallId || null,
      requested_by_operator_id: schedule.requestedByOperatorId,
      assigned_operator_id: schedule.assignedOperatorId,
      scheduled_for: schedule.scheduledFor,
      call_type: dbCallType,
      status: schedule.status || 'PENDENTE_APROVACAO',
      schedule_reason: reason,
      resolution_channel: schedule.resolutionChannel || 'telefone'
    });
    if (error) throw error;
  },

  bulkCreateScheduleRequest: async (schedules: Partial<CallSchedule>[]): Promise<void> => {
    const CALL_TYPE_DB_MAP: Record<string, string> = {
      'VENDA': 'VENDA', 'PÓS-VENDA': 'POS_VENDA', 'PÓS_VENDA': 'POS_VENDA', 'POS_VENDA': 'POS_VENDA',
      'PROSPECÇÃO': 'PROSPECCAO', 'PROSPECCAO': 'PROSPECCAO',
      'CONFIRMAÇÃO PROTOCOLO': 'CONFIRMACAO_PROTOCOLO', 'CONFIRMACAO_PROTOCOLO': 'CONFIRMACAO_PROTOCOLO',
      'REATIVAÇÃO': 'POS_VENDA', 'REATIVACAO': 'POS_VENDA', 'WHATSAPP': 'WHATSAPP'
    };
    const mapType = (t: string) => {
      return CALL_TYPE_DB_MAP[t] || CALL_TYPE_DB_MAP[t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, '_')] || 'VENDA';
    };
    const { error } = await supabase.from('call_schedules').insert(
      schedules.map(s => ({
        customer_id: s.customerId || null,
        origin_call_id: s.originCallId || null,
        requested_by_operator_id: s.requestedByOperatorId,
        assigned_operator_id: s.assignedOperatorId,
        scheduled_for: s.scheduledFor,
        call_type: mapType(s.callType || 'VENDA'),
        status: s.status || 'PENDENTE_APROVACAO',
        schedule_reason: s.scheduleReason,
        resolution_channel: s.resolutionChannel || 'telefone'
      }))
    );
    if (error) throw error;
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
    // Explicitly map camelCase to snake_case only for fields we allow updating
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.approvedByAdminId) payload.approved_by_admin_id = updates.approvedByAdminId;
    if (updates.approvalReason) payload.approval_reason = updates.approvalReason;
    if (updates.scheduledFor) payload.scheduled_for = updates.scheduledFor;
    if (updates.assignedOperatorId) payload.assigned_operator_id = updates.assignedOperatorId;

    payload.updated_at = new Date().toISOString();

    const { error } = await supabase.from('call_schedules').update(payload).eq('id', id);
    if (error) throw error;
  },

  // --- MÓDULO DE VENDAS ---
  getSales: async (startDate?: string, endDate?: string): Promise<Sale[]> => {
    let query = supabase.from('sales').select('*').order('registered_at', { ascending: false });

    if (startDate && endDate) {
      query = query.gte('registered_at', `${startDate}T00:00:00`).lte('registered_at', `${endDate}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(s => ({
      id: s.id,
      saleNumber: s.sale_number,
      clientId: s.customer_id,
      clientName: s.client_name,
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

  getUsers: async (): Promise<User[]> => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').order('username_display');
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        name: p.username_display || 'Sem Nome',
        username: p.username_slug || '',
        role: (p.role as UserRole) || UserRole.OPERATOR,
        active: p.active ?? true
      }));
    } catch (e) { return []; }
  },

  updateUser: async (userId: string, updates: Partial<User>): Promise<void> => {
    const payload: any = {};
    if (updates.role) payload.role = updates.role;
    if (updates.active !== undefined) payload.active = updates.active;
    if (updates.name) payload.username_display = updates.name;
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
      active: true
    });
  },

  signIn: async (username: string, password: string): Promise<User> => {
    const email = getInternalEmail(username);
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) throw authError;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', authData.user!.id).single();
    return {
      id: profile.id,
      name: profile.username_display,
      username: profile.username_slug,
      role: profile.role as UserRole,
      active: profile.active
    };
  },

  getQuestions: async (callType?: CallType | 'ALL', proposito?: string): Promise<Question[]> => {
    try {
      let query = supabase.from('questions')
        .select('*')
        .eq('ativo', true)
        .order('order_index', { ascending: true });
        
      if (callType) {
        query = query.in('type', expandCallTypeQueryValues(callType));
      }
      
      if (proposito) {
        // Get questions specifically for this purpose OR global/generic ones (where proposito is null)
        query = query.or(`proposito.eq.${proposito},proposito.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(mapQuestionRecord);
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
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        const campaignContext = campaignContextMap.get(t.campanha_id) || {};
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
          scheduledFor: t.scheduled_for,
          scheduleReason: t.schedule_reason,
          proposito: t.proposito || campaignContext.proposito,
          campanha_id: t.campanha_id,
          campaignName: campaignContext.campaignName,
          targetProduct: campaignContext.targetProduct,
          offerProduct: campaignContext.offerProduct,
          portfolioScope: campaignContext.portfolioScope,
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

    const scheduledTasks: Task[] = (schedData || []).map(s => {
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

      const dedupeKey = `${task.clientId}::${task.assignedTo || 'unassigned'}::${task.type || 'unknown'}`;
      if (!seenPendingKeys.has(dedupeKey)) {
        seenPendingKeys.add(dedupeKey);
        uniqueTasks.push(task);
      }
    }

    return uniqueTasks;
  },


  createTask: async (task: Partial<Task>): Promise<void> => {
    // Save to DB using the mapped type to avoid check constraint errors if REATIVACAO is missing
    const dbType = task.type === CallType.REATIVACAO ? 'POS_VENDA' : task.type;
    const { error } = await supabase.from('tasks').insert({
      client_id: task.clientId,
      type: dbType,
      assigned_to: task.assignedTo,
      status: task.status || 'pending',
      scheduled_for: task.scheduledFor,
      schedule_reason: task.scheduleReason,
      proposito: task.proposito,
      campanha_id: task.campanha_id
    });
    if (error) throw error;
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
    payload.updated_at = new Date().toISOString();
    
    // Attempt update on legacy tasks
    const { data: updatedTasks, error: tError } = await supabase.from('tasks').update(payload).eq('id', taskId).select('id');
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
       schedulePayload.updated_at = new Date().toISOString();
       
       if (Object.keys(schedulePayload).length > 0) {
         const { error: schedError } = await supabase.from('call_schedules').update(schedulePayload).eq('id', taskId);
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
    return await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
  },

  updateWhatsAppTaskStatus: async (taskId: string, status: 'pending' | 'started' | 'completed' | 'skipped'): Promise<{ error: any }> => {
    return await supabase.from('whatsapp_tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
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
      proposito: c.proposito || campaignContextMap.get(c.campanha_id)?.proposito,
      campanha_id: c.campanha_id,
      campaignName: campaignContextMap.get(c.campanha_id)?.campaignName,
      targetProduct: c.responses?.target_product || campaignContextMap.get(c.campanha_id)?.targetProduct,
      offerProduct: c.responses?.offer_product || campaignContextMap.get(c.campanha_id)?.offerProduct,
      portfolioScope: c.responses?.portfolio_scope || campaignInsights.portfolioScope || campaignContextMap.get(c.campanha_id)?.portfolioScope,
      offerInterestLevel: c.responses?.offer_interest_level || campaignInsights.offerInterestLevel,
      offerBlockerReason: c.responses?.offer_blocker_reason || campaignInsights.offerBlockerReason
    };
    });
  },

  checkRecentCall: async (clientId: string): Promise<boolean> => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data, error } = await supabase
      .from('call_logs')
      .select('id')
      .eq('client_id', clientId)
      .gte('start_time', threeDaysAgo.toISOString())
      .limit(1);

    if (error) return false;
    return data && data.length > 0;
  },

  saveCall: async (call: CallRecord): Promise<{ id: string, suggestedTags: ClientTag[] }> => {
    const questions = await dataService.getQuestions(call.type as CallType, call.proposito);
    const { enrichedResponses, email, interestProduct, buyerName, responsiblePhone } = extractClientInsightsFromResponses(
      call.responses || {},
      questions,
      call.type,
      call.proposito
    );
    const campaignInsights = extractCampaignInsightsFromResponses(
      enrichedResponses,
      questions,
      call.type,
      call.proposito
    );
    const enrichedCallResponses = {
      ...campaignInsights.enrichedResponses,
      target_product: call.targetProduct || campaignInsights.enrichedResponses.target_product,
      offer_product: call.offerProduct || campaignInsights.enrichedResponses.offer_product,
      portfolio_scope: call.portfolioScope || campaignInsights.portfolioScope || campaignInsights.enrichedResponses.portfolio_scope,
      offer_interest_level: call.offerInterestLevel || campaignInsights.offerInterestLevel || campaignInsights.enrichedResponses.offer_interest_level,
      offer_blocker_reason: call.offerBlockerReason || campaignInsights.offerBlockerReason || campaignInsights.enrichedResponses.offer_blocker_reason,
      campaign_name: call.campaignName || campaignInsights.enrichedResponses.campaign_name
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
    if (interestProduct) clientUpdates.interest_product = interestProduct;
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

  getDetailedPendingTasks: async () => {
    const tasks = await dataService.getTasks();
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, username_display, username');
    const profileMap = new Map((allProfiles || []).map(p => [p.id, p]));
    const now = new Date();

    return tasks
      .filter(t => t.status === 'pending')
      .filter(t => !!t.assignedTo)
      .filter(t => t.approvalStatus === 'APPROVED' || !t.approvalStatus)
      .filter(t => !t.scheduledFor || new Date(t.scheduledFor) <= now)
      .map(t => ({
        ...t,
        clients: t.clients || { name: t.clientName || 'Prospecto', phone: t.clientPhone || '' },
        profiles: profileMap.get(t.assignedTo || '') || null,
        duration: 0
      }));
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
      let query = supabase.from('clients').select('*').order('name').range(fromIndex, fromIndex + limit - 1);

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
          proposito: c.proposito || campaignContextMap.get(c.campanha_id)?.proposito,
          campanha_id: c.campanha_id,
          campaignName: campaignContextMap.get(c.campanha_id)?.campaignName,
          targetProduct: c.responses?.target_product || campaignContextMap.get(c.campanha_id)?.targetProduct,
          offerProduct: c.responses?.offer_product || campaignContextMap.get(c.campanha_id)?.offerProduct,
          portfolioScope: c.responses?.portfolio_scope || campaignInsights.portfolioScope || campaignContextMap.get(c.campanha_id)?.portfolioScope,
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
      const { data, error } = await supabase.from('clients').select('*').eq('status', 'LEAD').not('tags', 'cs', '{"JA_CLIENTE"}').order('name').range(fromIndex, fromIndex + limit - 1);
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
    const { data: clients, error } = await supabase.from('clients').select('id, name, phone, status, created_at').order('created_at', { ascending: false });
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
      const { data: byPhone } = await supabase.from('clients').select('id, name').eq('phone', phone).maybeSingle();
      if (byPhone) found = byPhone;

      // Fallback: match by name (case-insensitive)
      if (!found && entry.name) {
        const { data: byName } = await supabase.from('clients').select('id, name').ilike('name', entry.name.trim()).maybeSingle();
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


  upsertClient: async (client: Partial<Client>): Promise<Client> => {
    const phone = normalizePhone(client.phone || '');
    if (!phone) throw new Error("Telefone obrigatório");

    let existing: any = null;

    if (client.id) {
      const { data } = await supabase.from('clients').select('*').eq('id', client.id).maybeSingle();
      if (data) existing = data;
    }

    // --- 3-step deduplication ---
    // Step 1: Match by external_id (if provided and already exists in the system)
    if (!existing && client.external_id) {
      const { data } = await supabase.from('clients').select('*').eq('external_id', client.external_id).maybeSingle();
      if (data) existing = data;
    }

    // Step 2: Match by phone (normalized)
    if (!existing) {
      const { data } = await supabase.from('clients').select('*').eq('phone', phone).maybeSingle();
      if (data) existing = data;
    }

    // Step 3: Match by name + street (fuzzy — ilike for name)
    if (!existing && client.name && client.street) {
      const { data } = await supabase.from('clients')
        .select('*')
        .ilike('name', client.name)
        .ilike('street', client.street)
        .maybeSingle();
      if (data) existing = data;
    }

    const mergedPortfolioEntries = mergePortfolioEntries(existing?.portfolio_entries, client.portfolio_entries);
    const portfolioMetadata = collectPortfolioMetadata(mergedPortfolioEntries);
    const equipmentModels = mergeUniquePortfolioValues(
      existing?.equipment_models,
      existing?.items,
      client.equipment_models,
      client.items,
      portfolioMetadata.equipment_models
    );
    const customerProfiles = mergeUniquePortfolioValues(
      existing?.customer_profiles,
      client.customer_profiles,
      portfolioMetadata.customer_profiles
    );
    const productCategories = mergeUniquePortfolioValues(
      existing?.product_categories,
      client.product_categories,
      portfolioMetadata.product_categories
    );

    // Build payload: existing data takes priority, only fill empty fields
    const payload: any = {
      name: existing?.name || client.name || 'Sem Nome',
      phone,
      address: existing?.address || client.address || '',
      items: equipmentModels,
      offers: Array.from(new Set([...(existing?.offers || []), ...(client.offers || [])])),
      last_interaction: existing?.last_interaction || new Date().toISOString(),
      origin: existing?.origin || client.origin || 'MANUAL',
      email: existing?.email || client.email,
      website: existing?.website || client.website,
      // Ensure INATIVO is respected from payload if passed, otherwise existing status is preserved.
      // If sale happens, saveSale will convert to CLIENT. Never downgrade CLIENT to LEAD.
      status: client.status === 'INATIVO' ? 'INATIVO' :
        (client.status === 'CLIENT' ? 'CLIENT' : (existing?.status === 'CLIENT' ? 'CLIENT' : (existing?.status || client.status || 'CLIENT'))),
      responsible_phone: existing?.responsible_phone || client.responsible_phone,
      buyer_name: existing?.buyer_name || client.buyer_name,
      interest_product: existing?.interest_product || client.interest_product,
      preferred_channel: existing?.preferred_channel || client.preferred_channel,
      funnel_status: existing?.funnel_status || client.funnel_status || 'NEW',
      // Address & Phone fields — fill only if empty
      external_id: existing?.external_id || client.external_id,
      phone_secondary: existing?.phone_secondary || client.phone_secondary,
      street: existing?.street || client.street,
      neighborhood: existing?.neighborhood || client.neighborhood,
      city: existing?.city || client.city,
      state: existing?.state || client.state,
      zip_code: existing?.zip_code || client.zip_code,
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
    if (!nextPhone) throw new Error('Telefone obrigatório');

    const nextPortfolioEntries = mergePortfolioEntries(updates.portfolio_entries);
    const portfolioMetadata = collectPortfolioMetadata(nextPortfolioEntries);
    const equipmentModels = mergeUniquePortfolioValues(updates.equipment_models, updates.items, portfolioMetadata.equipment_models);
    const customerProfiles = mergeUniquePortfolioValues(updates.customer_profiles, portfolioMetadata.customer_profiles);
    const productCategories = mergeUniquePortfolioValues(updates.product_categories, portfolioMetadata.product_categories);

    const payload: any = {
      name: updates.name ?? existing.name ?? 'Sem Nome',
      phone: nextPhone,
      address: updates.address ?? existing.address ?? '',
      items: equipmentModels,
      offers: updates.offers ?? existing.offers ?? [],
      last_interaction: existing.last_interaction || new Date().toISOString(),
      origin: updates.origin ?? existing.origin ?? 'MANUAL',
      email: updates.email ?? existing.email ?? null,
      website: updates.website ?? existing.website ?? null,
      status: updates.status === 'INATIVO'
        ? 'INATIVO'
        : (updates.status === 'CLIENT'
          ? 'CLIENT'
          : (existing.status === 'CLIENT' ? 'CLIENT' : (updates.status ?? existing.status ?? 'CLIENT'))),
      responsible_phone: updates.responsible_phone ?? existing.responsible_phone ?? null,
      buyer_name: updates.buyer_name ?? existing.buyer_name ?? null,
      interest_product: updates.interest_product ?? existing.interest_product ?? null,
      preferred_channel: updates.preferred_channel ?? existing.preferred_channel ?? null,
      funnel_status: updates.funnel_status ?? existing.funnel_status ?? 'NEW',
      external_id: updates.external_id ?? existing.external_id ?? null,
      phone_secondary: updates.phone_secondary ?? existing.phone_secondary ?? null,
      street: updates.street ?? existing.street ?? null,
      neighborhood: updates.neighborhood ?? existing.neighborhood ?? null,
      city: updates.city ?? existing.city ?? null,
      state: updates.state ?? existing.state ?? null,
      zip_code: updates.zip_code ?? existing.zip_code ?? null,
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
    const { data, error } = await supabase.from('clients').select('*').ilike('name', `%${name}%`);
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
    const mergedOffers = Array.from(new Set([...(keeper.offers || []), ...(duplicate.offers || [])]));

    const updatePayload: any = {
      items: mergedItems,
      offers: mergedOffers,
      customer_profiles: mergeUniquePortfolioValues(keeper.customer_profiles, duplicate.customer_profiles, mergedMetadata.customer_profiles),
      product_categories: mergeUniquePortfolioValues(keeper.product_categories, duplicate.product_categories, mergedMetadata.product_categories),
      equipment_models: mergedItems,
      portfolio_entries: mergedPortfolioEntries,
      // Merge address/phone fields only if keeper is missing them
      external_id: keeper.external_id || duplicate.external_id,
      phone_secondary: keeper.phone_secondary || duplicate.phone_secondary,
      street: keeper.street || duplicate.street,
      neighborhood: keeper.neighborhood || duplicate.neighborhood,
      city: keeper.city || duplicate.city,
      state: keeper.state || duplicate.state,
      zip_code: keeper.zip_code || duplicate.zip_code
    };

    await supabase.from('clients').update(updatePayload).eq('id', keeperId);
    await syncDerivedTagsForClient(keeperId);

    // 2. Migrate calls
    const { data: calls } = await supabase.from('calls').select('id').eq('client_id', duplicateId);
    if (calls && calls.length > 0) {
      await supabase.from('calls').update({ client_id: keeperId }).eq('client_id', duplicateId);
      stats.migratedCalls = calls.length;
    }

    // 3. Migrate tasks
    const { data: tasks } = await supabase.from('tasks').select('id').eq('client_id', duplicateId);
    if (tasks && tasks.length > 0) {
      await supabase.from('tasks').update({ client_id: keeperId }).eq('client_id', duplicateId);
      stats.migratedTasks = tasks.length;
    }

    // 4. Migrate call_schedules
    const { data: schedules } = await supabase.from('call_schedules').select('id').eq('customer_id', duplicateId);
    if (schedules && schedules.length > 0) {
      await supabase.from('call_schedules').update({ customer_id: keeperId }).eq('customer_id', duplicateId);
      stats.migratedSchedules = schedules.length;
    }

    // 5. Migrate protocols
    const { data: protocols } = await supabase.from('protocols').select('id').eq('client_id', duplicateId);
    if (protocols && protocols.length > 0) {
      await supabase.from('protocols').update({ client_id: keeperId }).eq('client_id', duplicateId);
    }

    // 6. Migrate whatsapp_tasks
    const { data: waTasks } = await supabase.from('whatsapp_tasks').select('id').eq('client_id', duplicateId);
    if (waTasks && waTasks.length > 0) {
      await supabase.from('whatsapp_tasks').update({ client_id: keeperId }).eq('client_id', duplicateId);
    }

    // 7. Delete the duplicate
    await supabase.from('clients').delete().eq('id', duplicateId);

    return stats;
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
      return true;
    } catch (err) {
      console.error("[dataService.saveProtocol] Fatal Error:", err);
      throw err;
    }
  },

  updateProtocol: async (protocolId: string, updates: Partial<Protocol>, actorId: string, note?: string): Promise<boolean> => {
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
    const { data, error } = await supabase.from('quotes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  saveQuote: async (quote: Partial<Quote>): Promise<Quote> => {
    const { data, error } = await supabase.from('quotes').insert(quote).select().single();
    if (error) throw error;

    // Sync interest_product back to the client so it can be filtered in Campaign Planner
    if (quote.interest_product && quote.client_id) {
       await supabase.from('clients').update({ interest_product: quote.interest_product }).eq('id', quote.client_id);
    }

    return data;
  },

  updateQuote: async (id: string, updates: Partial<Quote>): Promise<Quote> => {
    const { data, error } = await supabase.from('quotes').update(updates).eq('id', id).select().single();
    if (error) throw error;

    // Sync interest_product back to the client so it can be filtered in Campaign Planner
    if (updates.interest_product && data?.client_id) {
       await supabase.from('clients').update({ interest_product: updates.interest_product }).eq('id', data.client_id);
    }

    return data;
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
    const { error } = await supabase.from('visits').insert({
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
    });
    if (error) throw error;
  },

  updateVisit: async (id: string, updates: Partial<Visit>): Promise<void> => {
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
  createWhatsAppTask: async (task: Partial<WhatsAppTask>): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').insert({
      client_id: task.clientId,
      assigned_to: task.assignedTo,
      type: task.type,
      status: task.status || 'pending',
      source: task.source || 'manual',
    });
    if (error) throw error;
  },

  getWhatsAppTasks: async (operatorId?: string, startDate?: string, endDate?: string): Promise<WhatsAppTask[]> => {
    let query = supabase.from('whatsapp_tasks').select('*, clients(name, phone)');
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

    return (data || []).map(t => ({
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
      clientName: t.clients?.name || 'Cliente Desconhecido',
      clientPhone: t.clients?.phone || ''
    }));
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
    // 1. Get original task to copy details
    const { data: task, error: getError } = await supabase.from('tasks').select('*').eq('id', taskId).single();
    if (getError) throw getError;

    // 2. Create WhatsApp Task
    const { error: createError } = await supabase.from('whatsapp_tasks').insert({
      client_id: task.client_id,
      assigned_to: operatorId, // Keep operator or reassign? Requirement says "integrated", usually same operator handling
      status: 'pending',
      type: task.type,
      source: 'call_skip_whatsapp',
      source_id: taskId
    });
    if (createError) throw createError;

    // 3. Skip original Task
    // We use a specific skip reason to indicate it moved to WhatsApp, this helps in Reports to not count as "Lost"
    const { error: skipError } = await supabase.from('tasks').update({
      status: 'skipped',
      skip_reason: 'moved_to_whatsapp'
    }).eq('id', taskId);
    if (skipError) throw skipError;

    // Log event
    await dataService.logOperatorEvent(operatorId, OperatorEventType.PULAR_ATENDIMENTO, taskId, 'Movido para WhatsApp');
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
    const operators = users.filter(u => u.role === UserRole.OPERATOR || u.role === UserRole.SUPERVISOR);

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

      return (data || []).map((row: any) => ({
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
        lastSkipReason: row.last_skip_reason
      }));
    } catch (error) {
      console.warn('Unified remarketing RPC unavailable, using fallback aggregation.', error);
      return buildUnifiedReportFallback(operatorId, statusFilter);
    }
  },

  bulkCreateTasks: async (tasks: any[]): Promise<void> => {
    const { error } = await supabase.from('tasks').insert(
      tasks.map(t => ({
        client_id: t.clientId,
        type: t.type,
        assigned_to: t.assignedTo,
        status: t.status || 'pending',
        scheduled_for: t.scheduledFor,
        schedule_reason: t.scheduleReason,
        proposito: t.proposito,
        campanha_id: t.campanha_id
      }))
    );
    if (error) throw error;
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
