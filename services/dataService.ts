import { supabase, normalizePhone, getInternalEmail, slugify } from '../lib/supabase';
import {
  Task, Client, Question, User, CallRecord,
  UserRole, CallType, ProtocolStatus, ProtocolEvent,
  OperatorEventType, OperatorEvent, Sale, SaleStatus, Visit,
  CallSchedule, CallScheduleWithClient, ScheduleStatus, WhatsAppTask, ProductivityMetrics,
  UnifiedReportRow, Protocol
} from '../types';
import { SCORE_MAP, STAGE_CONFIG } from '../constants';

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
  return 'prospect';
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
    const { error } = await supabase.from('call_schedules').insert({
      customer_id: schedule.customerId || null,
      origin_call_id: schedule.originCallId || null,
      requested_by_operator_id: schedule.requestedByOperatorId,
      assigned_operator_id: schedule.assignedOperatorId,
      scheduled_for: schedule.scheduledFor,
      call_type: schedule.callType, // Direct mapping to match Enum
      status: schedule.status || 'PENDENTE_APROVACAO',
      schedule_reason: schedule.scheduleReason,
      resolution_channel: schedule.resolutionChannel || 'telefone',

      // New fields with defaults
      skip_reason: schedule.skipReason || null,
      whatsapp_sent: schedule.whatsappSent ?? false,
      whatsapp_note: schedule.whatsappNote || null,
      has_repick: schedule.hasRepick ?? false
    });
    if (error) throw error;
  },

  bulkCreateScheduleRequest: async (schedules: Partial<CallSchedule>[]): Promise<void> => {
    const { error } = await supabase.from('call_schedules').insert(
      schedules.map(s => ({
        customer_id: s.customerId || null,
        origin_call_id: s.originCallId || null,
        requested_by_operator_id: s.requestedByOperatorId,
        assigned_operator_id: s.assignedOperatorId,
        scheduled_for: s.scheduledFor,
        call_type: s.callType, // Direct mapping
        status: s.status || 'PENDENTE_APROVACAO',
        schedule_reason: s.scheduleReason,
        resolution_channel: s.resolutionChannel || 'telefone',
        skip_reason: s.skipReason || null,
        whatsapp_sent: s.whatsappSent ?? false,
        whatsapp_note: s.whatsappNote || null,
        has_repick: s.hasRepick ?? false
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
      callType: s.call_type as CallType,
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

    // AUTO-CONVERT LEAD TO CLIENT
    if (sale.clientId) {
      await supabase.from('clients')
        .update({ status: 'CLIENT', funnel_status: 'QUALIFIED' })
        .eq('id', sale.clientId)
        .eq('status', 'LEAD');
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
    if (!responses) return undefined;
    if (responses[question.id] !== undefined) return responses[question.id];
    const questionTextNorm = normalize(question.text);
    const keys = Object.keys(responses);
    for (const key of keys) {
      if (normalize(key) === questionTextNorm) return responses[key];
    }
    const legacyKey = `pv${question.order} `;
    if (responses[legacyKey] !== undefined) return responses[legacyKey];
    return undefined;
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

  getQuestions: async (): Promise<Question[]> => {
    try {
      const { data, error } = await supabase.from('questions').select('*').order('order_index', { ascending: true });
      if (error) throw error;
      return (data || []).map(q => ({
        id: q.id,
        text: q.text,
        options: q.options || [],
        type: q.type as any,
        order: q.order_index,
        stageId: q.stage_id
      }));
    } catch (e) { return []; }
  },

  saveQuestion: async (q: Partial<Question>): Promise<void> => {
    const payload = { text: q.text, options: q.options, type: q.type, order_index: q.order, stage_id: q.stageId };
    if (q.id) await supabase.from('questions').update(payload).eq('id', q.id);
    else await supabase.from('questions').insert(payload);
  },

  deleteQuestion: async (id: string): Promise<void> => {
    await supabase.from('questions').delete().eq('id', id);
  },

  getTasks: async (operatorId?: string): Promise<Task[]> => {
    // 1. Fetch Legacy Tasks (standard queue)
    let tasksQuery = supabase.from('tasks').select('*, clients(*), profiles:assigned_to(*)').in('status', ['pending', 'skipped']);
    if (operatorId) {
      tasksQuery = tasksQuery.eq('assigned_to', operatorId);
    }
    const { data: tasksData, error: tasksError } = await tasksQuery.order('created_at', { ascending: true });
    if (tasksError) throw tasksError;

    const legacyTasks: Task[] = (tasksData || [])
      .filter(t => t.client_id) // Only require a valid client_id, don't filter by join result
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        return {
          id: t.id,
          clientId: t.client_id,
          type: t.type as CallType,
          deadline: t.created_at,
          assignedTo: t.assigned_to,
          status: t.status as any,
          skipReason: t.skip_reason,
          clientName: clientObj?.name,
          clientPhone: clientObj?.phone,
          clients: clientObj || null, // Pass embedded client data for fallback
          approvalStatus: t.approval_status as any,
          scheduledFor: t.scheduled_for,
          scheduleReason: t.schedule_reason
        };
      });

    // 2. Fetch Approved Schedules (where scheduled_for <= NOW)
    let schedQuery = supabase.from('call_schedules')
      .select('*, clients(name, phone)')
      .eq('status', 'APROVADO')
      .lte('scheduled_for', new Date().toISOString());

    if (operatorId) {
      schedQuery = schedQuery.eq('assigned_operator_id', operatorId);
    }
    const { data: schedData, error: schedError } = await schedQuery.order('scheduled_for', { ascending: true });
    if (schedError) throw schedError;

    const scheduledTasks: Task[] = (schedData || []).map(s => ({
      id: s.id,
      clientId: s.customer_id || '', // Task expects string
      clientName: Array.isArray(s.clients) ? s.clients[0]?.name : s.clients?.name || 'Cliente Agendado',
      clientPhone: Array.isArray(s.clients) ? s.clients[0]?.phone : s.clients?.phone,
      clients: s.clients, // Pass full client object just in case
      type: s.call_type as CallType,
      deadline: s.scheduled_for, // Use scheduled time as deadline/display time
      assignedTo: s.assigned_operator_id,
      status: 'pending', // Active in queue
      scheduleReason: s.schedule_reason,
      // Map fields to preserve context
      originCallId: s.origin_call_id,
      approvalStatus: 'APPROVED'
    }));

    // 3. Merge: Prioritize Schedules
    return [...scheduledTasks, ...legacyTasks];
  },


  createTask: async (task: Partial<Task>): Promise<void> => {
    await supabase.from('tasks').insert({
      client_id: task.clientId,
      type: task.type,
      assigned_to: task.assignedTo,
      status: task.status || 'pending',
      scheduled_for: task.scheduledFor,
      schedule_reason: task.scheduleReason
    });
  },

  updateTask: async (taskId: string, updates: Partial<Task>): Promise<void> => {
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.skipReason) payload.skip_reason = updates.skipReason;
    if (updates.scheduledFor) payload.scheduled_for = updates.scheduledFor;
    if (updates.scheduleReason) payload.schedule_reason = updates.scheduleReason;
    if (updates.deadline) payload.deadline = updates.deadline;
    const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
    if (error) throw error;

    // Trigger funnel update
    if (updates.status === 'skipped') {
      const { data: task } = await supabase.from('tasks').select('client_id').eq('id', taskId).single();
      if (task?.client_id) await updateClientFunnelStatus(task.client_id, 'CONTACT_ATTEMPT');
    } else if (updates.status === 'completed') {
      const { data: task } = await supabase.from('tasks').select('client_id').eq('id', taskId).single();
      if (task?.client_id) await updateClientFunnelStatus(task.client_id, 'CONTACT_MADE');
    }
  },

  deleteTask: async (taskId: string): Promise<void> => {
    // 1. Try deleting from tasks table
    const { error, count } = await supabase.from('tasks').delete({ count: 'exact' }).eq('id', taskId);
    if (error) throw error;

    // 2. If no task was deleted, try deleting from call_schedules (it might be an approved schedule in the queue)
    if (count === 0) {
      const { error: schedError } = await supabase.from('call_schedules').delete().eq('id', taskId);
      if (schedError) throw schedError;
    }
  },


  deleteTasksByOperator: async (operatorId: string): Promise<void> => {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('assigned_to', operatorId)
      .in('status', ['pending', 'skipped']);
    if (error) throw error;
  },




  deleteDuplicateTasks: async (): Promise<number> => {
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('id, client_id, assigned_to, type, status')
      .eq('status', 'pending');

    if (error || !tasks) return 0;

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
      const { error: delError } = await supabase
        .from('tasks')
        .delete()
        .in('id', toDelete);
      if (delError) throw delError;
    }

    return toDelete.length;
  },

  getCalls: async (startDate?: string, endDate?: string): Promise<CallRecord[]> => {
    let query = supabase.from('call_logs').select('*').order('start_time', { ascending: false });

    if (startDate && endDate) {
      query = query.gte('start_time', `${startDate}T00:00:00`).lte('start_time', `${endDate}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      taskId: c.task_id,
      operatorId: c.operator_id,
      clientId: c.client_id,
      startTime: c.start_time,
      endTime: c.end_time,
      duration: c.duration,
      reportTime: c.report_time,
      responses: c.responses || {},
      type: (c.call_type as CallType) || CallType.POS_VENDA,
      protocolId: c.protocol_id
    }));
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

  saveCall: async (call: CallRecord): Promise<void> => {
    await supabase.from('call_logs').insert({
      task_id: call.taskId,
      operator_id: call.operatorId,
      client_id: call.clientId,
      call_type: call.type,
      responses: call.responses,
      duration: call.duration,
      report_time: call.reportTime,
      start_time: call.startTime,
      end_time: call.endTime,
      protocol_id: call.protocolId
    });

    await supabase.from('clients').update({ last_interaction: new Date().toISOString() }).eq('id', call.clientId);
  },

  updateCall: async (id: string, updates: Partial<CallRecord>): Promise<void> => {
    const payload: any = {};
    if (updates.startTime) payload.start_time = updates.startTime;
    if (updates.endTime) payload.end_time = updates.endTime;
    if (updates.responses) payload.responses = updates.responses;
    if (updates.type) payload.call_type = updates.type;

    const { error } = await supabase.from('call_logs').update(payload).eq('id', id);
    if (error) throw error;
  },

  deleteCall: async (id: string): Promise<void> => {
    const { error } = await supabase.from('call_logs').delete().eq('id', id);
    if (error) throw error;
  },

  getDetailedCallsToday: async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('call_logs')
      .select('*, clients(*), profiles:operator_id(*)')
      .gte('start_time', `${todayStr}T00:00:00`)
      .order('start_time', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  getDetailedPendingTasks: async () => {
    // 1. Fetch Legacy Tasks
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*, clients(*), profiles:assigned_to(*)')
      .eq('status', 'pending')
      // Removed strict approval_status check
      .order('created_at', { ascending: true });

    if (error) throw error;

    // 2. Fetch Approved Schedules
    const { data: schedData, error: schedError } = await supabase
      .from('call_schedules')
      .select('*, clients(*), profiles:assigned_operator_id(*)') // Join profiles for operator name
      .eq('status', 'APROVADO')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true });

    if (schedError) throw schedError;

    // 3. Map Schedules to Task-like structure for the modal
    const mappedSchedules = (schedData || []).map(s => {
      const clientObj = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      const profileObj = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      return {
        id: s.id,
        clientId: s.customer_id,
        type: s.call_type,
        deadline: s.scheduled_for,
        assignedTo: s.assigned_operator_id,
        status: 'pending',
        clients: clientObj,
        profiles: profileObj,
        clientName: clientObj?.name,
        clientPhone: clientObj?.phone,
        duration: 0
      };
    });

    const validLegacyTasks = (tasks || [])
      .filter(t => t.client_id) // Only require a valid client_id
      .filter(t => !t.scheduled_for || new Date(t.scheduled_for) <= new Date())
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        const profileObj = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles;
        return {
          ...t,
          clients: clientObj || { name: 'Prospecto', phone: '' },
          profiles: profileObj,
          duration: 0
        };
      });

    return [...mappedSchedules, ...validLegacyTasks];
  },



  logOperatorEvent: async (operatorId: string, type: OperatorEventType, taskId?: string, note?: string) => {
    await supabase.from('operator_events').insert({
      operator_id: operatorId,
      event_type: type,
      task_id: taskId,
      note: note
    });
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
    let query = supabase.from('clients').select('*').order('name');

    // Default: Return ONLY 'CLIENT' status. 
    // If includeLeads is true, return ALL (for unified search).
    if (!includeLeads) {
      query = query.neq('status', 'LEAD');
      // Note: We use neq 'LEAD' to include 'CLIENT' and nulls (legacy) as valid clients.
      // Or better: .or('status.eq.CLIENT,status.is.null') but Supabase syntax is tricky.
      // Let's assume default is CLIENT if null, but explicit check is safer.
      // Actually, existing rows have null status. We added default 'CLIENT'.
      // So .neq('status', 'LEAD') is robust.
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      name: c.name || 'Sem Nome',
      phone: c.phone || '',
      address: c.address || '',
      items: c.items || [],
      offers: c.offers || [],
      acceptance: (c.acceptance as any) || 'medium',
      satisfaction: (c.satisfaction as any) || 'medium',
      // New Fields
      origin: c.origin,
      email: c.email,
      website: c.website,
      status: c.status || 'CLIENT',
      responsible_phone: c.responsible_phone,
      buyer_name: c.buyer_name,
      interest_product: c.interest_product,
      preferred_channel: c.preferred_channel,
      funnel_status: c.funnel_status
    }));
  },

  getClientHistory: async (clientId: string): Promise<{ calls: CallRecord[], protocols: Protocol[] }> => {
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

      return {
        calls: (callsData || []).map(c => ({
          id: c.id,
          taskId: c.task_id,
          operatorId: c.operator_id,
          clientId: c.client_id,
          startTime: c.start_time,
          endTime: c.end_time,
          duration: c.duration,
          reportTime: c.report_time,
          responses: c.responses || {},
          type: (c.call_type as CallType) || CallType.POS_VENDA,
          protocolId: c.protocol_id
        })),
        protocols: (protocolsData || []).map(p => ({
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
        }))
      };
    } catch (e) {
      console.error("Error getting client history:", e);
      return { calls: [], protocols: [] };
    }
  },

  getProspects: async (): Promise<Client[]> => {
    const { data, error } = await supabase.from('clients').select('*').eq('status', 'LEAD').order('name');
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      name: c.name || 'Prospecto Sem Nome',
      phone: c.phone || '',
      address: c.address || '',
      items: c.items || [],
      offers: c.offers || [],
      acceptance: (c.acceptance as any) || 'medium',
      satisfaction: (c.satisfaction as any) || 'medium',
      origin: c.origin,
      email: c.email,
      website: c.website,
      status: 'LEAD',
      responsible_phone: c.responsible_phone,
      buyer_name: c.buyer_name,
      interest_product: c.interest_product,
      preferred_channel: c.preferred_channel,
      funnel_status: c.funnel_status
    }));
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

    const { data: existing } = await supabase.from('clients').select('*').eq('phone', phone).maybeSingle();

    const payload: any = {
      name: client.name || existing?.name || 'Sem Nome',
      phone,
      address: client.address || existing?.address || '',
      items: Array.from(new Set([...(existing?.items || []), ...(client.items || [])])),
      offers: Array.from(new Set([...(existing?.offers || []), ...(client.offers || [])])),
      last_interaction: existing?.last_interaction || new Date().toISOString(),
      // New Fields mappings
      origin: client.origin || existing?.origin || 'MANUAL',
      email: client.email || existing?.email,
      website: client.website || existing?.website,
      status: client.status || existing?.status || 'CLIENT', // Default to CLIENT unless specified
      responsible_phone: client.responsible_phone || existing?.responsible_phone,
      buyer_name: client.buyer_name || existing?.buyer_name,
      interest_product: client.interest_product || existing?.interest_product,
      preferred_channel: client.preferred_channel || existing?.preferred_channel,
      funnel_status: client.funnel_status || existing?.funnel_status || 'NEW'
    };

    const { data, error } = await supabase.from('clients').upsert(payload, { onConflict: 'phone' }).select().single();
    if (error) throw error;
    return data;
  },

  updateClientFields: async (clientId: string, updates: Partial<Client>): Promise<void> => {
    const { error } = await supabase.from('clients').update(updates).eq('id', clientId);
    if (error) throw error;
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

    const mappedCalls = callsData.map((c: any) => ({
      id: c.id,
      type: 'CALL',
      clientName: c.clients?.name || 'Cliente Desconhecido',
      clientId: c.client_id,
      address: c.clients?.address || '',
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
      address: t.clients?.address || '',
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
      const { data: prospects } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'LEAD')
        .eq('funnel_status', 'PHYSICAL_VISIT');

      visitProspects = (prospects || []).map(p => ({
        id: p.id, // Using Client ID as the ID for this "candidate"
        type: 'VISIT_PROSPECT', // New type
        clientName: p.name,
        clientId: p.id,
        address: p.address,
        phone: p.phone,
        date: p.created_at, // or last_interaction
        description: `Prospecto: Visita Física(${p.interest_product || 'Geral'})`,
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
      // For WhatsApp, we use created_at for general volume, but metrics might use started_at/completed_at
      query = query.gte('created_at', `${startDate}T00:00:00`).lte('created_at', `${endDate}T23:59:59`);
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

    const totalCalls = events.filter(e => e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO).length;
    const totalWhatsApp = events.filter(e => e.eventType === OperatorEventType.WHATSAPP_COMPLETE).length;
    const salesCount = rawSales?.length || 0;
    const conversionRate = totalCalls > 0 ? (salesCount / totalCalls) * 100 : 0;

    const operatorStats = operators.map(op => {
      const opEvents = events.filter(e => e.operatorId === op.id);
      const opSales = rawSales?.filter(s => s.operator_id === op.id) || [];

      const opCalls = opEvents.filter(e => e.eventType === OperatorEventType.FINALIZAR_ATENDIMENTO).length;
      const opWhatsapp = opEvents.filter(e => e.eventType === OperatorEventType.WHATSAPP_COMPLETE).length;

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
      conversionStatus: row.conversion_status
    }));
  },

  bulkCreateTasks: async (tasks: any[]): Promise<void> => {
    const { error } = await supabase.from('tasks').insert(
      tasks.map(t => ({
        client_id: t.clientId,
        type: t.type,
        assigned_to: t.assignedTo,
        status: t.status || 'pending',
        scheduled_for: t.scheduledFor,
        schedule_reason: t.scheduleReason
      }))
    );
    if (error) throw error;
  },

  bulkUpdateUpsell: async (prospectIds: string[], offer: string, notes: string, operatorId: string): Promise<void> => {
    const now = new Date().toISOString();
    const payload = prospectIds.map(id => ({
      operator_id: operatorId,
      client_id: id,
      call_type: CallType.POS_VENDA,
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
        type: (c.call_type as CallType) || CallType.POS_VENDA,
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
