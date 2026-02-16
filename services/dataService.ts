
import { supabase, normalizePhone, getInternalEmail, slugify } from '../lib/supabase';
import {
  User, Client, Task, CallRecord, Protocol, Question,
  UserRole, CallType, ProtocolStatus, ProtocolEvent,
  OperatorEventType, OperatorEvent, Sale, SaleStatus, Visit,
  CallSchedule, CallScheduleWithClient, ScheduleStatus, WhatsAppTask, ProductivityMetrics
} from '../types';
import { SCORE_MAP, STAGE_CONFIG } from '../constants';

const normalize = (str: string) =>
  str ? str.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, "") : "";

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
      call_type: schedule.callType,
      status: schedule.status || 'PENDENTE_APROVACAO',
      schedule_reason: schedule.scheduleReason,
      resolution_channel: schedule.resolutionChannel || 'telefone',

      // New fields
      skip_reason: schedule.skipReason,
      whatsapp_sent: schedule.whatsappSent,
      whatsapp_note: schedule.whatsappNote,
      has_repick: schedule.hasRepick
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
        call_type: s.callType,
        status: s.status || 'PENDENTE_APROVACAO',
        schedule_reason: s.scheduleReason,
        resolution_channel: s.resolutionChannel || 'telefone',
        skip_reason: s.skipReason,
        whatsapp_sent: s.whatsappSent,
        whatsapp_note: s.whatsappNote,
        has_repick: s.hasRepick
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
      clientName: s.clients?.name,
      clientPhone: s.clients?.phone,

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
  getSales: async (): Promise<Sale[]> => {
    const { data, error } = await supabase.from('sales').select('*').order('registered_at', { ascending: false });
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
      externalSalesperson: s.external_salesperson
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
  },

  // ... (updateSaleStatus, checkSaleExists, deleteSale, updateSale remain similar)

  updateSaleStatus: async (saleId: string, status: SaleStatus): Promise<void> => {
    const updates: any = { status };
    if (status === SaleStatus.ENTREGUE) {
      updates.delivered_at = new Date().toISOString();
    }
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
    const legacyKey = `pv${question.order}`;
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
      .filter(t => t.clients) // Filter ghost tasks
      .map(t => ({
        id: t.id,
        clientId: t.client_id,
        type: t.type as CallType,
        deadline: t.created_at,
        assignedTo: t.assigned_to,
        status: t.status as any,
        skipReason: t.skip_reason,
        clientName: t.clients?.name,
        approvalStatus: t.approval_status as any,
        scheduledFor: t.scheduled_for,
        scheduleReason: t.schedule_reason
      }));

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
      clientName: s.clients?.name || 'Cliente Agendado',
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
  },

  deleteTask: async (taskId: string): Promise<void> => {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
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
      const key = `${task.client_id}-${task.assigned_to}-${task.type}`;
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

  getCalls: async (): Promise<CallRecord[]> => {
    const { data, error } = await supabase.from('call_logs').select('*').order('start_time', { ascending: false });
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
    const { data, error } = await supabase
      .from('tasks')
      .select('*, clients(*), profiles:assigned_to(*)')
      .eq('status', 'pending')
      // Only show tasks that are APPROVED (or null which we treat as approved legacy) 
      // We use .or to handle both 'APPROVED' and null if column was added recently
      .or('approval_status.eq.APPROVED,approval_status.is.null')
      .order('created_at', { ascending: true });
    if (error) throw error;
    // Filter out tasks where client relationship is missing (Ghost Tasks)
    const validTasks = (data || []).filter(t => t.clients);
    return validTasks.map(t => ({ ...t, duration: 0 }));
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

  getClients: async (): Promise<Client[]> => {
    const { data, error } = await supabase.from('clients').select('*').order('name');
    if (error) throw error;
    return (data || []).map(c => ({
      id: c.id,
      name: c.name || 'Sem Nome',
      phone: c.phone || '',
      address: c.address || '',
      items: c.items || [],
      offers: c.offers || [],
      acceptance: (c.acceptance as any) || 'medium',
      satisfaction: (c.satisfaction as any) || 'medium'
    }));
  },

  upsertClient: async (client: Partial<Client>): Promise<Client> => {
    const phone = normalizePhone(client.phone || '');
    if (!phone) throw new Error("Telefone obrigatório");

    const { data: existing } = await supabase.from('clients').select('*').eq('phone', phone).maybeSingle();

    const payload: any = {
      name: client.name,
      phone,
      address: client.address || existing?.address || '',
      items: Array.from(new Set([...(existing?.items || []), ...(client.items || [])])),
      offers: Array.from(new Set([...(existing?.offers || []), ...(client.offers || [])])),
      last_interaction: existing?.last_interaction || new Date().toISOString()
    };

    const { data, error } = await supabase.from('clients').upsert(payload, { onConflict: 'phone' }).select().single();
    if (error) throw error;
    return data;
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
      contactPerson: v.contact_person
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
      contact_person: visit.contactPerson
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

    const { error } = await supabase.from('visits').update(payload).eq('id', id);
    if (error) throw error;
  },

  // Busca candidatos para rotas (Calls e Tasks)
  getRouteCandidates: async (filters: { operatorId?: string; date?: string; type?: string }) => {
    let callsQuery = supabase.from('call_logs').select('*, clients!inner(*)');
    // let tasksQuery = supabase.from('tasks').select('*, clients!inner(*)').eq('status', 'pending');

    if (filters.operatorId) {
      callsQuery = callsQuery.eq('operator_id', filters.operatorId);
      // tasksQuery = tasksQuery.eq('assigned_to', filters.operatorId); // Tasks might stay pending
    }

    if (filters.date) {
      // Filter calls by date (start_time)
      const start = `${filters.date}T00:00:00`;
      const end = `${filters.date}T23:59:59`;
      callsQuery = callsQuery.gte('start_time', start).lte('start_time', end);

      // Tasks logic could be different (scheduled_for), but simplifying for now or adding if needed
    }

    if (filters.type) {
      callsQuery = callsQuery.ilike('call_type', `%${filters.type}%`);
    }

    const { data: calls, error: callsError } = await callsQuery;
    if (callsError) throw callsError;

    // Helper to find responsible person in responses
    const findContact = (responses: any) => {
      if (!responses) return undefined;
      // Look for keys containing "quem", "responsavel", "falar com"
      const keys = Object.keys(responses);
      for (const k of keys) {
        const lowerK = k.toLowerCase();
        if (lowerK.includes('quem') || lowerK.includes('responsável') || lowerK.includes('responsavel') || lowerK.includes('contato')) {
          return responses[k];
        }
      }
      return undefined;
    };

    return (calls || []).map((c: any) => ({
      id: c.id,
      type: 'CALL',
      clientName: c.clients?.name || 'Cliente Desconhecido',
      clientId: c.client_id,
      address: c.clients?.address || '',
      phone: c.clients?.phone || '',
      date: c.start_time,
      description: `Ligação: ${c.call_type}`,
      operatorId: c.operator_id,
      contactPerson: findContact(c.responses)
    }));
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

  getWhatsAppTasks: async (operatorId?: string): Promise<WhatsAppTask[]> => {
    let query = supabase.from('whatsapp_tasks').select('*, clients(name, phone)');
    if (operatorId) {
      query = query.eq('assigned_to', operatorId);
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
    await dataService.logOperatorEvent(operatorId, OperatorEventType.WHATSAPP_SKIP, id, `${reason} - ${note || ''}`);
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

  updateWhatsAppTask: async (taskId: string, updates: any): Promise<void> => {
    const { error } = await supabase.from('whatsapp_tasks').update(updates).eq('id', taskId);
    if (error) throw error;
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
  }
};
