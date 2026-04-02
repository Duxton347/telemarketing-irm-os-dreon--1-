import type { TaskAssignMode, TaskInstance, TaskInstanceStatus, User, UserRole } from '../types';

type TaskLike = Pick<TaskInstance, 'assignedTo' | 'assignedBy' | 'visibilityScope' | 'status' | 'metadata' | 'template' | 'assignedUser' | 'templateId' | 'sourceType' | 'title' | 'description' | 'category' | 'dueAt' | 'createdAt' | 'updatedAt'>;

const DONE_STATUSES = new Set<TaskInstanceStatus>(['CONCLUIDO', 'CANCELADO', 'ARQUIVADO']);

const normalizeStringArray = (values: unknown[]): string[] => Array.from(new Set(
  values
    .map(value => String(value || '').trim())
    .filter(Boolean)
));

const normalizeAssignConfig = (assignConfig?: Record<string, any> | null) => {
  const parsedAssignConfig = (assignConfig && typeof assignConfig === 'object') ? assignConfig : {};
  const normalized: Record<string, any> = {};
  const userIds = normalizeStringArray([
    ...(Array.isArray(parsedAssignConfig.userIds) ? parsedAssignConfig.userIds : []),
    ...(Array.isArray(parsedAssignConfig.user_ids) ? parsedAssignConfig.user_ids : []),
    parsedAssignConfig.userId,
    parsedAssignConfig.user_id
  ]);
  const roles = normalizeStringArray(Array.isArray(parsedAssignConfig.roles) ? parsedAssignConfig.roles : []);
  const teamIds = normalizeStringArray([
    ...(Array.isArray(parsedAssignConfig.teamIds) ? parsedAssignConfig.teamIds : []),
    ...(Array.isArray(parsedAssignConfig.team_ids) ? parsedAssignConfig.team_ids : []),
    parsedAssignConfig.teamId,
    parsedAssignConfig.team_id
  ]);
  const sectorCodes = normalizeStringArray([
    ...(Array.isArray(parsedAssignConfig.sectorCodes) ? parsedAssignConfig.sectorCodes : []),
    ...(Array.isArray(parsedAssignConfig.sector_codes) ? parsedAssignConfig.sector_codes : []),
    parsedAssignConfig.sectorCode,
    parsedAssignConfig.sector_code
  ]);

  if (userIds.length > 0) normalized.userIds = userIds;
  if (roles.length > 0) normalized.roles = roles;
  if (teamIds.length > 0) normalized.teamIds = teamIds;
  if (sectorCodes.length > 0) normalized.sectorCodes = sectorCodes;

  return Object.keys(normalized).length > 0 ? normalized : null;
};

const stableStringify = (value: any): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${key}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value ?? null);
};

const toLocalDateKey = (value?: string | null) => {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isManagerUser = (user: Pick<User, 'role'>) => (
  user.role === 'ADMIN' || user.role === 'SUPERVISOR'
);

export const isTaskDoneStatus = (status?: TaskInstance['status'] | null) => (
  DONE_STATUSES.has((status || 'PENDENTE') as TaskInstanceStatus)
);

export const getTaskAssignMode = (task: Pick<TaskLike, 'metadata' | 'template'>): TaskAssignMode => (
  (task.metadata?.assignMode || task.metadata?.assign_mode || task.template?.assignMode || 'SPECIFIC') as TaskAssignMode
);

export const getTaskAssignConfig = (task: Pick<TaskLike, 'metadata' | 'template'>) => (
  normalizeAssignConfig(
    task.metadata?.assignConfig
    || task.metadata?.assign_config
    || task.template?.assignConfig
    || null
  )
);

export const getTaskScopeLabel = (task: Pick<TaskLike, 'assignedTo' | 'assignedBy' | 'visibilityScope' | 'metadata' | 'template'>) => (
  (task.metadata?.taskScope
    || task.metadata?.task_scope
    || task.template?.taskScope
    || ((task.assignedTo && task.assignedBy && task.assignedTo !== task.assignedBy) ? 'SETOR' : (task.visibilityScope === 'PRIVATE' ? 'PESSOAL' : 'SETOR'))) as 'PESSOAL' | 'SETOR'
);

export const userMatchesSharedAssignment = (
  assignMode: TaskAssignMode,
  assignConfig: Record<string, any> | null,
  user: Pick<User, 'id' | 'role' | 'teamId' | 'sectorCode'>
) => {
  if (assignMode === 'ALL') return true;

  if (assignMode === 'ROLE') {
    return Boolean(assignConfig?.roles?.includes(user.role));
  }

  if (assignMode === 'TEAM') {
    if (user.teamId && assignConfig?.teamIds?.includes(user.teamId)) return true;
    if (user.sectorCode && assignConfig?.sectorCodes?.includes(user.sectorCode)) return true;
    return false;
  }

  if (assignMode === 'SPECIFIC') {
    return Boolean(assignConfig?.userIds?.includes(user.id));
  }

  return false;
};

export const canUserSeeTaskInstance = (
  task: TaskLike,
  user: Pick<User, 'id' | 'role' | 'teamId' | 'sectorCode'>
) => {
  const assignMode = getTaskAssignMode(task);
  const assignConfig = getTaskAssignConfig(task);
  const taskScopeLabel = getTaskScopeLabel(task);
  const taskIsDone = isTaskDoneStatus(task.status);
  const sharedMatch = !task.assignedTo && assignMode !== 'SPECIFIC' && userMatchesSharedAssignment(assignMode, assignConfig, user);

  if (task.assignedTo === user.id) return true;
  if (task.assignedBy === user.id) return true;
  if (sharedMatch) return true;

  if (isManagerUser(user)) {
    const isAnotherUsersPersonalTask =
      taskScopeLabel === 'PESSOAL'
      && task.visibilityScope === 'PRIVATE'
      && task.assignedTo !== user.id
      && task.assignedBy !== user.id;

    if (isAnotherUsersPersonalTask) {
      return taskIsDone;
    }

    return true;
  }

  if (task.assignedTo && task.assignedTo !== user.id) return false;

  if (task.visibilityScope === 'TEAM' && user.teamId) {
    if (task.assignedUser?.teamId === user.teamId) return true;
    return assignMode === 'TEAM' && userMatchesSharedAssignment(assignMode, assignConfig, user);
  }

  if (task.visibilityScope === 'SECTOR' && user.sectorCode) {
    if (task.assignedUser?.sectorCode === user.sectorCode) return true;
    return assignMode !== 'SPECIFIC' && userMatchesSharedAssignment(assignMode, assignConfig, user);
  }

  return false;
};

const sharedTaskPreferenceScore = (task: TaskLike, currentUserId?: string) => (
  Number(!isTaskDoneStatus(task.status)) * 20
  + Number(task.assignedTo === currentUserId) * 8
  + Number(!task.assignedTo) * 4
  + Number(task.status === 'EM_ANDAMENTO') * 2
  + Number(task.status === 'AGUARDANDO')
);

export const getSharedTaskGroupKey = (task: TaskLike) => {
  if (getTaskAssignMode(task) === 'SPECIFIC') return null;

  const metadata = task.metadata || {};
  const recurrenceDate = String(
    metadata.reference_date
    || metadata.referenceDate
    || (task.templateId ? toLocalDateKey(task.dueAt || null) : '')
    || ''
  ).trim();
  const listId = String(metadata.taskListId || metadata.list_id || '').trim();

  return stableStringify({
    templateId: task.templateId || null,
    sourceType: task.sourceType,
    title: task.title,
    description: task.description || '',
    category: task.category,
    dueDate: toLocalDateKey(task.dueAt || null),
    listId,
    assignedBy: task.assignedBy || null,
    assignMode: getTaskAssignMode(task),
    assignConfig: getTaskAssignConfig(task),
    recurrenceDate,
    taskScope: getTaskScopeLabel(task),
    visibilityScope: task.visibilityScope
  });
};

export const collapseSharedTaskCollection = <T extends TaskLike>(tasks: T[], currentUserId?: string): T[] => {
  const collapsed: T[] = [];
  const indexByKey = new Map<string, number>();

  tasks.forEach(task => {
    const groupKey = getSharedTaskGroupKey(task);

    if (!groupKey) {
      collapsed.push(task);
      return;
    }

    const existingIndex = indexByKey.get(groupKey);
    if (existingIndex === undefined) {
      indexByKey.set(groupKey, collapsed.length);
      collapsed.push(task);
      return;
    }

    const currentTask = collapsed[existingIndex];
    const nextTask = sharedTaskPreferenceScore(task, currentUserId) > sharedTaskPreferenceScore(currentTask, currentUserId)
      ? task
      : currentTask;

    collapsed[existingIndex] = nextTask;
  });

  return collapsed;
};
