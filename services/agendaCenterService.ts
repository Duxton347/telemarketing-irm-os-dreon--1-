import { dataService } from './dataService';
import {
  AgendaCentralItem,
  AgendaCentralSummary,
  CallScheduleWithClient,
  Protocol,
  ProtocolStatus,
  Task,
  TaskInstance,
  User,
  UserRole,
  Visit
} from '../types';

const ACTIVE_SCHEDULE_STATUSES = ['PENDENTE_APROVACAO', 'APROVADO', 'REPROGRAMADO'];
const ACTIVE_INTERNAL_STATUSES = ['PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO', 'ATRASADO'];
const INTERNAL_TASK_DONE_STATUSES = ['CONCLUIDO', 'CANCELADO', 'ARQUIVADO'];
const VISIBLE_INTERNAL_TASK_STATUSES = [...ACTIVE_INTERNAL_STATUSES, 'CONCLUIDO'];

const isManager = (user: User) => (
  user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR
);

const isToday = (value?: string | null) => {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();

  return (
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  );
};

const isOverdue = (value?: string | null, status?: string) => {
  if (!value) return false;
  if (status === 'CONCLUIDO' || status === 'CANCELADO') return false;
  return new Date(value).getTime() < Date.now();
};

const mapProtocolPriority = (priority?: string): AgendaCentralItem['priority'] => {
  if (priority === 'Alta') return 'HIGH';
  if (priority === 'Baixa') return 'LOW';
  return 'MEDIUM';
};

const mapProtocolStatus = (status: ProtocolStatus): AgendaCentralItem['status'] => {
  switch (status) {
    case ProtocolStatus.EM_ANDAMENTO:
    case ProtocolStatus.REABERTO:
      return 'EM_ANDAMENTO';
    case ProtocolStatus.AGUARDANDO_CLIENTE:
    case ProtocolStatus.AGUARDANDO_SETOR:
    case ProtocolStatus.RESOLVIDO_PENDENTE:
      return 'AGUARDANDO';
    case ProtocolStatus.FECHADO:
      return 'CONCLUIDO';
    default:
      return 'PENDENTE';
  }
};

const mapVisitStatus = (visit: Visit): AgendaCentralItem['status'] => {
  if (visit.status === 'COMPLETED') return 'CONCLUIDO';
  if (visit.status === 'CANCELED') return 'CANCELADO';
  return isOverdue(visit.scheduledDate, visit.status) ? 'ATRASADO' : 'PENDENTE';
};

const mapScheduleStatus = (schedule: CallScheduleWithClient): AgendaCentralItem['status'] => {
  if (schedule.status === 'PENDENTE_APROVACAO') return 'AGUARDANDO';
  if (schedule.status === 'CANCELADO' || schedule.status === 'REJEITADO') return 'CANCELADO';
  if (schedule.status === 'CONCLUIDO') return 'CONCLUIDO';
  return isOverdue(schedule.scheduledFor, schedule.status) ? 'ATRASADO' : 'PENDENTE';
};

const inferScheduleSourceType = (schedule: CallScheduleWithClient): AgendaCentralItem['sourceType'] => (
  schedule.hasRepick || Boolean(schedule.skipReason) || /repique/i.test(schedule.scheduleReason || '')
    ? 'REPIQUE'
    : 'AGENDAMENTO'
);

const inferTaskSourceType = (task: Task, linkedSchedule?: CallScheduleWithClient): AgendaCentralItem['sourceType'] => {
  if (linkedSchedule) return inferScheduleSourceType(linkedSchedule);
  if (/repique/i.test(task.scheduleReason || '')) return 'REPIQUE';
  return 'AGENDAMENTO';
};

const cleanRepickReason = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    const normalized = candidate
      .split('|')[0]
      .replace(/^repique:\s*/i, '')
      .replace(/^motivo:\s*/i, '')
      .replace(/^\[[^\]]+\]\s*/g, '')
      .replace(/^pulo com whatsapp\s*(\([^)]*\))?\s*-\s*motivo:\s*/i, '')
      .replace(/^registrado via pulo de atendimento:\s*/i, '')
      .trim();

    if (normalized) {
      return normalized;
    }
  }

  return undefined;
};

const canSeeInternalTask = (task: TaskInstance, user: User) => {
  if (isManager(user)) return true;
  if (task.assignedTo === user.id) return true;
  if (task.assignedTo) return false;
  if (task.visibilityScope === 'TEAM' && user.teamId && task.assignedUser?.teamId === user.teamId) return true;
  if (task.visibilityScope === 'SECTOR' && user.sectorCode && task.assignedUser?.sectorCode === user.sectorCode) return true;
  return false;
};

const buildInternalTaskItem = (task: TaskInstance, user: User): AgendaCentralItem => {
  const taskScope = (task.metadata?.taskScope || task.template?.taskScope || (task.visibilityScope === 'PRIVATE' ? 'PESSOAL' : 'SETOR')) as 'PESSOAL' | 'SETOR';
  const assignedByAnotherUser = Boolean(task.assignedTo && task.assignedBy && task.assignedBy !== task.assignedTo);
  const sourceType = assignedByAnotherUser
    ? 'DEMANDA_SETOR'
    : (taskScope === 'PESSOAL' ? 'TAREFA_PESSOAL' : 'DEMANDA_SETOR');
  const overdue = isOverdue(task.dueAt, task.status);
  const mine = task.assignedTo === user.id;
  const isAwaitingApproval = task.status === 'AGUARDANDO';

  return {
    id: `internal:${task.id}`,
    sourceType,
    sourceId: task.id,
    title: task.title,
    subtitle: task.template?.title || task.category,
    description: task.description || task.completionNote || undefined,
    responsibleId: task.assignedTo || undefined,
    responsibleName: task.assignedUser?.name || undefined,
    dueAt: task.dueAt || undefined,
    startsAt: task.startsAt || undefined,
    priority: task.priority,
    status: task.status === 'ARQUIVADO' ? 'CANCELADO' : task.status,
    category: task.category,
    metadata: {
      original: task,
      requiresApproval: task.template?.requiresApproval || task.metadata?.requiresApproval || false,
      requiresCommentOnCompletion: task.template?.requiresCommentOnCompletion || task.metadata?.requiresCommentOnCompletion || false
    },
    isMine: mine,
    isOverdue: overdue,
    isDueToday: isToday(task.dueAt),
    actionContext: {
      canOpen: true,
      canComplete: !INTERNAL_TASK_DONE_STATUSES.includes(task.status),
      canReschedule: mine || isManager(user),
      canApprove: isManager(user) && isAwaitingApproval,
      canReassign: isManager(user)
    }
  };
};

const buildScheduleItem = (
  schedule: CallScheduleWithClient,
  user: User,
  relatedOperator?: User
): AgendaCentralItem => {
  const sourceType = inferScheduleSourceType(schedule);
  const description = sourceType === 'REPIQUE'
    ? cleanRepickReason(schedule.scheduleReason, schedule.whatsappNote, schedule.skipReason)
    : (schedule.scheduleReason || schedule.whatsappNote || schedule.skipReason || undefined);

  return {
    id: `schedule:${schedule.id}`,
    sourceType,
    sourceId: schedule.id,
    title: schedule.clientName || 'Cliente nao identificado',
    subtitle: schedule.callType,
    description,
    responsibleId: schedule.assignedOperatorId,
    responsibleName: relatedOperator?.name,
    clientId: schedule.customerId || undefined,
    clientName: schedule.clientName || undefined,
    dueAt: schedule.scheduledFor,
    startsAt: schedule.scheduledFor,
    priority: isOverdue(schedule.scheduledFor, schedule.status) ? 'CRITICAL' : 'MEDIUM',
    status: mapScheduleStatus(schedule),
    category: sourceType === 'REPIQUE' ? 'Repiques' : 'Agendamentos',
    metadata: {
      original: schedule
    },
    isMine: schedule.assignedOperatorId === user.id,
    isOverdue: isOverdue(schedule.scheduledFor, schedule.status),
    isDueToday: isToday(schedule.scheduledFor),
    actionContext: {
      canOpen: true,
      canComplete: false,
      canReschedule: true,
      canApprove: isManager(user) && schedule.status === 'PENDENTE_APROVACAO',
      canReassign: isManager(user)
    }
  };
};

const buildQueueTaskItem = (
  task: Task,
  user: User,
  relatedOperator?: User,
  linkedSchedule?: CallScheduleWithClient
): AgendaCentralItem => {
  const sourceType = inferTaskSourceType(task, linkedSchedule);
  const description = sourceType === 'REPIQUE'
    ? cleanRepickReason(
      linkedSchedule?.scheduleReason,
      task.scheduleReason,
      linkedSchedule?.whatsappNote,
      linkedSchedule?.skipReason,
      task.skipReason
    )
    : (task.scheduleReason || linkedSchedule?.scheduleReason || undefined);

  return {
    id: `queue:${task.id}`,
    sourceType,
    sourceId: task.id,
    title: task.clientName || task.clientId,
    subtitle: 'Na fila de atendimento',
    description,
    responsibleId: task.assignedTo,
    responsibleName: relatedOperator?.name,
    clientId: task.clientId,
    clientName: task.clientName,
    dueAt: task.scheduledFor || task.deadline,
    startsAt: task.scheduledFor || undefined,
    priority: isOverdue(task.scheduledFor || task.deadline, task.status) ? 'HIGH' : 'MEDIUM',
    status: task.status === 'skipped'
      ? 'CANCELADO'
      : (isOverdue(task.scheduledFor || task.deadline, task.status) ? 'ATRASADO' : 'PENDENTE'),
    category: sourceType === 'REPIQUE' ? 'Repiques' : 'Agendamentos',
    deepLink: '/queue',
    metadata: {
      original: task,
      schedule: linkedSchedule || null
    },
    isMine: task.assignedTo === user.id,
    isOverdue: isOverdue(task.scheduledFor || task.deadline, task.status),
    isDueToday: isToday(task.scheduledFor || task.deadline),
    actionContext: {
      canOpen: true,
      canComplete: false,
      canReschedule: false,
      canApprove: false,
      canReassign: false
    }
  };
};

const buildProtocolItem = (protocol: Protocol, user: User, relatedClient?: { name?: string; phone?: string }, relatedOwner?: User): AgendaCentralItem => ({
  id: `protocol:${protocol.id}`,
  sourceType: 'PROTOCOLO',
  sourceId: protocol.id,
  title: relatedClient?.name || protocol.title,
  subtitle: protocol.title,
  description: protocol.description,
  responsibleId: protocol.ownerOperatorId,
  responsibleName: relatedOwner?.name,
  clientId: protocol.clientId,
  clientName: relatedClient?.name,
  dueAt: protocol.slaDueAt,
  startsAt: protocol.openedAt,
  priority: mapProtocolPriority(protocol.priority),
  status: mapProtocolStatus(protocol.status),
  category: 'Protocolos',
  deepLink: `/protocols?protocolId=${protocol.id}`,
  metadata: {
    original: protocol,
    protocolStatus: protocol.status,
    timeOpenHours: Math.max(Math.round((Date.now() - new Date(protocol.openedAt).getTime()) / 3600000), 0)
  },
  isMine: protocol.ownerOperatorId === user.id,
  isOverdue: isOverdue(protocol.slaDueAt, protocol.status),
  isDueToday: isToday(protocol.slaDueAt),
  actionContext: {
    canOpen: true,
    canComplete: false,
    canReschedule: false,
    canApprove: false,
    canReassign: isManager(user)
  }
});

const buildVisitItem = (visit: Visit, user: User): AgendaCentralItem => ({
  id: `visit:${visit.id}`,
  sourceType: 'VISITA',
  sourceId: visit.id,
  title: visit.clientName,
  subtitle: visit.address,
  description: visit.notes || visit.outcome || undefined,
  responsibleId: visit.salespersonId,
  responsibleName: visit.salespersonName,
  clientId: visit.clientId,
  clientName: visit.clientName,
  dueAt: visit.scheduledDate,
  startsAt: visit.scheduledDate,
  priority: isOverdue(visit.scheduledDate, visit.status) ? 'HIGH' : 'MEDIUM',
  status: mapVisitStatus(visit),
  category: 'Roteiro/Visitas',
  deepLink: `/routes?tab=${visit.status === 'COMPLETED' ? 'HISTORY' : 'EXECUTION'}&visitId=${visit.id}&action=${visit.status === 'COMPLETED' ? 'open' : 'finalize'}`,
  metadata: {
    original: visit
  },
  isMine: visit.salespersonId === user.id,
  isOverdue: isOverdue(visit.scheduledDate, visit.status),
  isDueToday: isToday(visit.scheduledDate),
  actionContext: {
    canOpen: true,
    canComplete: visit.status === 'PENDING',
    canReschedule: visit.status === 'PENDING',
    canApprove: false,
    canReassign: isManager(user)
  }
});

const buildSummary = (items: AgendaCentralItem[]): AgendaCentralSummary => ({
  totalToday: items.filter(item => item.isDueToday).length,
  repiques: items.filter(item => item.sourceType === 'REPIQUE').length,
  protocolos: items.filter(item => item.sourceType === 'PROTOCOLO').length,
  roteiro: items.filter(item => item.sourceType === 'VISITA' || item.sourceType === 'ROTEIRO').length,
  tarefasSetor: items.filter(item => item.sourceType === 'DEMANDA_SETOR').length,
  minhasTarefas: items.filter(item => item.isMine).length,
  atrasados: items.filter(item => item.isOverdue).length
});

export const agendaCenterService = {
  getAgendaCenterData: async (user: User) => {
    await dataService.syncTaskRecurringInstances();

    const [schedules, protocols, visits, taskInstances, users, clients, queueTasks] = await Promise.all([
      dataService.getSchedules(),
      dataService.getProtocols(),
      dataService.getVisits(),
      dataService.getTaskInstances({
        includeArchived: false,
        assignedTo: isManager(user) ? undefined : user.id
      }),
      dataService.getUsers(),
      dataService.getClients(true),
      dataService.getOperationalQueueEntries()
    ]);

    const userMap = new Map(users.map(profile => [profile.id, profile]));
    const clientMap = new Map(clients.map(client => [client.id, client]));
    const scheduleMap = new Map(schedules.map(schedule => [schedule.id, schedule]));
    const managerView = isManager(user);

    const visibleSchedules = schedules.filter(schedule =>
      ACTIVE_SCHEDULE_STATUSES.includes(schedule.status)
      && (managerView || schedule.assignedOperatorId === user.id || schedule.requestedByOperatorId === user.id)
    );

    const visibleProtocols = protocols.filter(protocol =>
      managerView || protocol.ownerOperatorId === user.id || protocol.openedByOperatorId === user.id
    );

    const visibleVisits = visits.filter(visit =>
      managerView || visit.salespersonId === user.id
    );

    const visibleInternalTasks = taskInstances.filter(task =>
      VISIBLE_INTERNAL_TASK_STATUSES.includes(task.status) && canSeeInternalTask(task, user)
    );

    const visibleQueueTasks = queueTasks.filter(task =>
      (task.originCallId || task.scheduledFor)
      && (managerView || task.assignedTo === user.id)
      && task.status !== 'completed'
    );

    const items: AgendaCentralItem[] = [
      ...visibleSchedules.map(schedule => buildScheduleItem(
        schedule,
        user,
        userMap.get(schedule.assignedOperatorId)
      )),
      ...visibleProtocols.map(protocol => buildProtocolItem(
        protocol,
        user,
        clientMap.get(protocol.clientId),
        userMap.get(protocol.ownerOperatorId)
      )),
      ...visibleVisits.map(visit => buildVisitItem(visit, user)),
      ...visibleInternalTasks.map(task => buildInternalTaskItem(task, user)),
      ...visibleQueueTasks.map(task => buildQueueTaskItem(
        task,
        user,
        userMap.get(task.assignedTo),
        task.originCallId ? scheduleMap.get(task.originCallId) : undefined
      ))
    ];

    items.sort((left, right) => {
      const leftRank = Number(Boolean(left.isMine)) * 4 + Number(Boolean(left.isOverdue)) * 8 + Number(Boolean(left.isDueToday)) * 2;
      const rightRank = Number(Boolean(right.isMine)) * 4 + Number(Boolean(right.isOverdue)) * 8 + Number(Boolean(right.isDueToday)) * 2;

      if (leftRank !== rightRank) return rightRank - leftRank;

      const leftTime = new Date(left.dueAt || left.startsAt || 0).getTime();
      const rightTime = new Date(right.dueAt || right.startsAt || 0).getTime();
      return leftTime - rightTime;
    });

    return {
      items,
      summary: buildSummary(items),
      protocolSummary: {
        total: visibleProtocols.length,
        open: visibleProtocols.filter(protocol => protocol.status === ProtocolStatus.ABERTO).length,
        inProgress: visibleProtocols.filter(protocol => protocol.status === ProtocolStatus.EM_ANDAMENTO).length,
        resolvedPending: visibleProtocols.filter(protocol => protocol.status === ProtocolStatus.RESOLVIDO_PENDENTE).length
      }
    };
  }
};
