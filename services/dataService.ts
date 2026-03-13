import { supabase, normalizePhone, getInternalEmail, slugify } from '../lib/supabase';
import {
  Task, Client, Question, User, CallRecord,
  UserRole, CallType, ProtocolStatus, ProtocolEvent,
  OperatorEventType, OperatorEvent, Sale, SaleStatus, Visit,
  CallSchedule, CallScheduleWithClient, ScheduleStatus, WhatsAppTask, ProductivityMetrics,
  UnifiedReportRow, Protocol, ClientTag, TagStatus
} from '../types';
import { TagDecisionEngine } from './tagDecisionEngine';
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
  if (clean.includes('REATIVACAO')) return 'pos-venda';
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
    if (!responses) return undefined;
    
    // 1. Try DB mapped field (Dreon Skill v3 logic)
    if (question.campo_resposta && responses[question.campo_resposta] !== undefined) {
      return responses[question.campo_resposta];
    }

    // 2. Try exact UUID id
    if (responses[question.id] !== undefined) return responses[question.id];
    
    // 3. Try exact question text normalized
    const questionTextNorm = normalize(question.text);
    const keys = Object.keys(responses);
    for (const key of keys) {
      if (normalize(key) === questionTextNorm) return responses[key];
    }
    
    // 4. Try legacy PV format
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

  getQuestions: async (callType?: CallType | 'ALL', proposito?: string): Promise<Question[]> => {
    try {
      let query = supabase.from('questions')
        .select('*')
        .eq('ativo', true)
        .order('order_index', { ascending: true });
        
      if (callType) {
        query = query.in('type', [callType, 'ALL']);
      }
      
      if (proposito) {
        // Get questions specifically for this purpose OR global/generic ones (where proposito is null)
        query = query.or(`proposito.eq.${proposito},proposito.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(q => ({
        id: q.id,
        text: q.text,
        options: q.options || [],
        type: q.type as any,
        order: q.order_index,
        stageId: q.stage_id,
        proposito: q.proposito,
        campo_resposta: q.campo_resposta,
        tipo_input: q.tipo_input,
        obrigatoria: q.obrigatoria,
        ativo: q.ativo
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
          type: clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : (t.type as CallType),
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
          createdAt: t.created_at,
          updatedAt: t.updated_at
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

    const scheduledTasks: Task[] = (schedData || []).map(s => {
      const clientObj = Array.isArray(s.clients) ? s.clients[0] : s.clients;
      return {
        id: s.id,
        clientId: s.customer_id || '', // Task expects string
        clientName: clientObj?.name || s.clients?.name || 'Cliente Agendado',
        clientPhone: clientObj?.phone || s.clients?.phone,
        clients: s.clients, // Pass full client object just in case
        type: clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : (s.call_type as CallType),
        deadline: s.scheduled_for, // Use scheduled time as deadline/display time
        assignedTo: s.assigned_operator_id,
        status: 'pending', // Active in queue
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
    const seenClients = new Set<string>();

    for (const task of combined) {
      if (!task.clientId) {
        uniqueTasks.push(task);
        continue;
      }
      if (!seenClients.has(task.clientId)) {
        seenClients.add(task.clientId);
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
      schedule_reason: task.scheduleReason
    });
    if (error) throw error;
  },

  updateTask: async (taskId: string, updates: Partial<Task>): Promise<void> => {
    const payload: any = {};
    if (updates.status) payload.status = updates.status;
    if (updates.skipReason) payload.skip_reason = updates.skipReason;
    if (updates.scheduledFor) payload.scheduled_for = updates.scheduledFor;
    if (updates.scheduleReason) payload.schedule_reason = updates.scheduleReason;
    if (updates.deadline) payload.deadline = updates.deadline;
    
    // Attempt update on legacy tasks
    const { data: updatedTasks, error: tError } = await supabase.from('tasks').update(payload).eq('id', taskId).select('id');
    const count = updatedTasks?.length || 0;
    
    // If not found in tasks, try call_schedules
    if (!tError && (count === 0)) {
       const schedulePayload: any = {};
       if (updates.status === 'completed') schedulePayload.status = 'CONCLUIDO';
       if (updates.status === 'skipped') schedulePayload.status = 'CANCELADO'; // or handled via skip logic
       if (updates.skipReason) schedulePayload.skip_reason = updates.skipReason;
       
       if (Object.keys(schedulePayload).length > 0) {
         await supabase.from('call_schedules').update(schedulePayload).eq('id', taskId);
       }
    }

    // Trigger funnel update
    if (updates.status === 'skipped' || updates.status === 'completed') {
      const { data: task } = await supabase.from('tasks').select('client_id').eq('id', taskId).single();
      const clientId = task?.client_id;
      
      // Fallback to call_schedules if not in tasks
      if (!clientId) {
        const { data: sched } = await supabase.from('call_schedules').select('customer_id').eq('id', taskId).single();
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
    // Delete operator events first to prevent foreign key violation
    await supabase.from('operator_events').delete().eq('task_id', taskId);
    
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
      await supabase.from('operator_events').delete().in('task_id', chunk);
      
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
      if (evError) throw evError;
      
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
        await supabase.from('operator_events').delete().in('task_id', chunk);

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
      protocolId: c.protocol_id,
      clientName: (c as any).clients?.name || 'Cliente Desconhecido',
      clientPhone: (c as any).clients?.phone || ''
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

  saveCall: async (call: CallRecord): Promise<{ id: string, suggestedTags: ClientTag[] }> => {
    const { data: insertedCall, error } = await supabase.from('call_logs').insert({
      task_id: call.taskId,
      operator_id: call.operatorId,
      client_id: call.clientId,
      call_type: call.type,
      responses: call.responses,
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
    if (call.responses?.email_cliente) {
      clientUpdates.email = call.responses.email_cliente;
    }
    if (call.responses?.upsell_interesse_produto) {
      clientUpdates.interest_product = call.responses.upsell_interesse_produto;
    }

    await supabase.from('clients').update(clientUpdates).eq('id', call.clientId);

    // Dreon Skill v3: Tag Decision Engine Integration
    try {
      const callWithId = { ...call, id: insertedCall.id };
      const decision = TagDecisionEngine.analyzeCall(callWithId, []);
      
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
    if (updates.type) payload.call_type = updates.type;

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
    // 1. Fetch tasks WITHOUT profiles join (avoids FK ambiguity errors)
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*, clients(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) console.error('getDetailedPendingTasks tasks error:', error);

    // 1b. Fetch profiles separately for operator name lookup
    const { data: allProfiles } = await supabase
      .from('profiles')
      .select('id, username_display, username');
    const profileMap = new Map((allProfiles || []).map(p => [p.id, p]));

    // 2. Fetch Approved Schedules (also without profiles join)
    let mappedSchedules: any[] = [];
    try {
      const { data: schedData, error: schedError } = await supabase
        .from('call_schedules')
        .select('*, clients(*)')
        .eq('status', 'APROVADO')
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });

      if (!schedError && schedData) {
        mappedSchedules = schedData.map(s => {
          const clientObj = Array.isArray(s.clients) ? s.clients[0] : s.clients;
          return {
            id: s.id,
            clientId: s.customer_id,
            type: clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : s.call_type,
            deadline: s.scheduled_for,
            assignedTo: s.assigned_operator_id,
            status: 'pending',
            clients: clientObj,
            profiles: profileMap.get(s.assigned_operator_id) || null,
            clientName: clientObj?.name,
            clientPhone: clientObj?.phone,
            duration: 0
          };
        });
      }
    } catch (e) {
      console.error('getDetailedPendingTasks schedules error:', e);
    }

    const validLegacyTasks = (tasks || [])
      .filter(t => t.client_id)
      .filter(t => !t.scheduled_for || new Date(t.scheduled_for) <= new Date())
      .map(t => {
        const clientObj = Array.isArray(t.clients) ? t.clients[0] : t.clients;
        return {
          ...t,
          type: clientObj?.status === 'INATIVO' ? CallType.REATIVACAO : t.type,
          clients: clientObj || { name: 'Prospecto', phone: '' },
          profiles: profileMap.get(t.assigned_to) || null,
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
      funnel_status: c.funnel_status,
      // Address & Multi-Phone
      external_id: c.external_id,
      phone_secondary: c.phone_secondary,
      street: c.street,
      neighborhood: c.neighborhood,
      city: c.city,
      state: c.state,
      zip_code: c.zip_code,
      last_purchase_date: c.last_purchase_date
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
    const { data, error } = await supabase.from('clients').select('*').eq('status', 'LEAD').not('tags', 'cs', '{"JA_CLIENTE"}').order('name');
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
      funnel_status: c.funnel_status,
      external_id: c.external_id,
      phone_secondary: c.phone_secondary,
      street: c.street,
      neighborhood: c.neighborhood,
      city: c.city,
      state: c.state,
      zip_code: c.zip_code
    }));
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

    // --- 3-step deduplication ---
    // Step 1: Match by external_id (if provided and already exists in the system)
    if (client.external_id) {
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

    // Build payload: existing data takes priority, only fill empty fields
    const payload: any = {
      name: existing?.name || client.name || 'Sem Nome',
      phone: existing?.phone || phone,
      address: existing?.address || client.address || '',
      items: Array.from(new Set([...(existing?.items || []), ...(client.items || [])])),
      offers: Array.from(new Set([...(existing?.offers || []), ...(client.offers || [])])),
      last_interaction: existing?.last_interaction || new Date().toISOString(),
      origin: existing?.origin || client.origin || 'MANUAL',
      email: existing?.email || client.email,
      website: existing?.website || client.website,
      // Ensure INATIVO is respected from payload if passed, otherwise existing status is preserved.
      // If sale happens, saveSale will convert to CLIENT. Never downgrade CLIENT to LEAD.
      status: client.status === 'INATIVO' ? 'INATIVO' :
        (existing?.status === 'CLIENT' ? 'CLIENT' : (existing?.status || client.status || 'CLIENT')),
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
      last_purchase_date: client.last_purchase_date || existing?.last_purchase_date
    };

    if (existing) {
      // UPDATE existing record — never duplicate
      const { data, error } = await supabase.from('clients').update(payload).eq('id', existing.id).select().single();
      if (error) throw error;
      return data;
    } else {
      // INSERT new record
      const { data, error } = await supabase.from('clients').insert(payload).select().single();
      if (error) throw error;
      return data;
    }
  },

  updateClientFields: async (clientId: string, updates: Partial<Client>): Promise<void> => {
    const { error } = await supabase.from('clients').update(updates).eq('id', clientId);
    if (error) throw error;
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

    const mergedItems = Array.from(new Set([...(keeper.items || []), ...(duplicate.items || [])]));
    const mergedOffers = Array.from(new Set([...(keeper.offers || []), ...(duplicate.offers || [])]));

    const updatePayload: any = {
      items: mergedItems,
      offers: mergedOffers,
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

// Expose for admin console operations (merge duplicates, etc.)
(window as any).__dataService = dataService;
