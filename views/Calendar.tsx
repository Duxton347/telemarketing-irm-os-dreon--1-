import React from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Inbox,
  ListChecks,
  Loader2,
  Sparkles,
  Star,
  Target,
  UserCircle2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { publishAgendaRefresh, subscribeAgendaRefresh } from '../utils/agendaEvents';
import {
  TaskInstance,
  TaskList,
  TaskPriority,
  TaskRecurrenceType,
  User as AppUser,
  UserRole
} from '../types';
import { getTaskAssignableUsers } from '../utils/taskAssignment';
import { QuickAddTask } from '../components/tasks/QuickAddTask';
import { TaskDetailsDrawer } from '../components/tasks/TaskDetailsDrawer';
import { TaskFiltersBar } from '../components/tasks/TaskFiltersBar';
import { TasksHeader } from '../components/tasks/TasksHeader';
import { TasksList } from '../components/tasks/TasksList';
import { TasksSidebar } from '../components/tasks/TasksSidebar';
import type {
  QuickTaskFormState,
  TaskFilterMode,
  TaskManagerTask,
  TaskManagerViewKey,
  TaskSidebarItem,
  TaskSortMode
} from '../components/tasks/types';

type CalendarProps = {
  user: AppUser;
};

const ACTIVE_VIEW_STORAGE_PREFIX = 'dreon:tasks:active-view:';

const SMART_VIEW_CONFIG: Record<Exclude<TaskManagerViewKey, `custom:${string}` | 'personal' | 'team' | 'created-by-me'>, {
  title: string;
  subtitle: string;
  icon: typeof Inbox;
  emptyTitle: string;
  emptyDescription: string;
}> = {
  all: {
    title: 'Todas',
    subtitle: 'Tudo o que ainda esta em andamento, sem excesso de painel ou formulario.',
    icon: Inbox,
    emptyTitle: 'Nada por aqui',
    emptyDescription: 'Quando novas tarefas chegarem, elas vao aparecer nesta lista.'
  },
  'my-day': {
    title: 'Meu dia',
    subtitle: 'Use esse marcador para separar o que precisa de foco imediato.',
    icon: Sparkles,
    emptyTitle: 'Seu dia esta livre',
    emptyDescription: 'Marque tarefas em Meu dia para montar um foco rapido sem alterar os prazos.'
  },
  important: {
    title: 'Importantes',
    subtitle: 'Tudo o que foi marcado com estrela para nao se perder no meio do fluxo.',
    icon: Star,
    emptyTitle: 'Nenhuma prioridade marcada',
    emptyDescription: 'Marque uma tarefa como importante para ela aparecer aqui.'
  },
  planned: {
    title: 'Planejado',
    subtitle: 'Somente tarefas que tem prazo definido entram nessa visao.',
    icon: CalendarDays,
    emptyTitle: 'Nenhum prazo definido',
    emptyDescription: 'Defina uma data em qualquer tarefa e ela passa a aparecer nesta lista.'
  },
  'assigned-to-me': {
    title: 'Atribuidas a mim',
    subtitle: 'Demandas enviadas por outras pessoas diretamente para voce.',
    icon: UserCircle2,
    emptyTitle: 'Nada atribuido a voce',
    emptyDescription: 'As tarefas que outros gestores ou usuarios enviarem para voce vao aparecer aqui.'
  },
  completed: {
    title: 'Concluidas',
    subtitle: 'Historico das entregas que ja foram fechadas.',
    icon: CheckCircle2,
    emptyTitle: 'Nenhuma tarefa concluida',
    emptyDescription: 'Quando uma tarefa for concluida, ela fica guardada aqui.'
  }
};

const SOURCE_VIEW_CONFIG: Record<'personal' | 'team' | 'created-by-me', {
  title: string;
  subtitle: string;
  icon: typeof Target;
  emptyTitle: string;
  emptyDescription: string;
  label: string;
}> = {
  personal: {
    title: 'Minhas tarefas',
    subtitle: 'Tudo o que nasceu para voce executar, com ou sem prazo.',
    icon: Target,
    emptyTitle: 'Nenhuma tarefa pessoal',
    emptyDescription: 'Crie tarefas simples aqui mesmo e acompanhe tudo em uma lista limpa.',
    label: 'Minhas tarefas'
  },
  team: {
    title: 'Demandas do setor',
    subtitle: 'Pedidos compartilhados entre a equipe, sem misturar com agenda operacional.',
    icon: ListChecks,
    emptyTitle: 'Sem demandas de equipe',
    emptyDescription: 'Quando surgirem demandas coletivas, elas ficam centralizadas aqui.',
    label: 'Demandas do setor'
  },
  'created-by-me': {
    title: 'Atribuidas',
    subtitle: 'O que voce delegou para outras pessoas e ainda esta em acompanhamento.',
    icon: AlertCircle,
    emptyTitle: 'Voce ainda nao atribuiu tarefas',
    emptyDescription: 'Quando voce delegar algo para outra pessoa, acompanhe por esta lista.',
    label: 'Atribuidas'
  }
};

const DEFAULT_PRIORITY: TaskPriority = 'LOW';
const DEFAULT_RECURRENCE: TaskRecurrenceType = 'NONE';

const readStoredActiveView = (userId: string): TaskManagerViewKey | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${userId}`);
    if (!stored) return null;
    return stored as TaskManagerViewKey;
  } catch {
    return null;
  }
};

const storeActiveView = (userId: string, view: TaskManagerViewKey) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(`${ACTIVE_VIEW_STORAGE_PREFIX}${userId}`, view);
  } catch {
    // Ignora falha de persistencia local.
  }
};

const isManagerUser = (user: AppUser) => (
  user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR
);

const isCompletedStatus = (status: TaskInstance['status']) => status === 'CONCLUIDO';
const isDeletedStatus = (status: TaskInstance['status']) => status === 'CANCELADO' || status === 'ARQUIVADO';

const canUserSeeTask = (task: TaskInstance, user: AppUser) => {
  if (isManagerUser(user)) return true;
  if (task.assignedTo === user.id) return true;
  if (task.assignedBy === user.id) return true;
  if (task.assignedTo && task.assignedTo !== user.id) return false;
  if (task.visibilityScope === 'TEAM' && user.teamId && task.assignedUser?.teamId === user.teamId) return true;
  if (task.visibilityScope === 'SECTOR' && user.sectorCode && task.assignedUser?.sectorCode === user.sectorCode) return true;
  return false;
};

const buildQuickTaskDefaults = (activeView: TaskManagerViewKey, canAssignOthers: boolean): QuickTaskFormState => ({
  title: '',
  description: '',
  ownership: canAssignOthers
    ? (activeView === 'team' ? 'TEAM' : (activeView === 'created-by-me' ? 'ASSIGNED' : 'PERSONAL'))
    : 'PERSONAL',
  listId: activeView.startsWith('custom:') ? activeView.replace('custom:', '') : '',
  dueDate: activeView === 'planned' ? new Date().toISOString().slice(0, 10) : '',
  dueTime: '',
  reminderDate: '',
  reminderTime: '',
  recurrenceType: DEFAULT_RECURRENCE,
  weeklyDays: ['MON'],
  assignedUserId: '',
  priority: DEFAULT_PRIORITY,
  inMyDay: activeView === 'my-day',
  isImportant: activeView === 'important'
});

const toLocalTime = (value?: string | null) => (value ? new Date(value).toISOString().slice(11, 16) : '');

const buildDateTimeIso = (date: string, time: string, fallbackTime: string): string | null => {
  if (!date) return null;
  return new Date(`${date}T${time || fallbackTime}:00`).toISOString();
};

const getTaskAssignMode = (task: Pick<TaskInstance, 'metadata' | 'template'>) => (
  (task.metadata?.assignMode || task.template?.assignMode || 'SPECIFIC') as 'SPECIFIC' | 'ALL' | 'ROLE' | 'TEAM'
);

const buildTaskManagerTask = (
  task: TaskInstance,
  currentUser: AppUser,
  taskListsMap: Map<string, TaskList>
): TaskManagerTask => {
  const metadata = task.metadata || {};
  const list = task.listId ? taskListsMap.get(task.listId) || null : null;
  const assignMode = getTaskAssignMode(task);
  const taskScopeLabel = (metadata.taskScope
    || task.template?.taskScope
    || ((task.assignedTo && task.assignedBy && task.assignedTo !== task.assignedBy) ? 'SETOR' : (task.visibilityScope === 'PRIVATE' ? 'PESSOAL' : 'SETOR'))) as 'PESSOAL' | 'SETOR';
  const wasAssignedByOtherUser = Boolean(task.assignedTo === currentUser.id && task.assignedBy && task.assignedBy !== currentUser.id);
  const wasAssignedByCurrentUser = Boolean(task.assignedBy === currentUser.id && task.assignedTo && task.assignedTo !== currentUser.id);
  const isCompleted = isCompletedStatus(task.status);
  const isDeleted = isDeletedStatus(task.status);
  const isOverdue = Boolean(!isCompleted && !isDeleted && task.dueAt && new Date(task.dueAt).getTime() < Date.now());
  const isSpecificDelegation = assignMode === 'SPECIFIC' && Boolean(task.assignedTo && task.assignedBy && task.assignedTo !== task.assignedBy);
  const fallbackListLabel = taskScopeLabel === 'SETOR'
    ? (isSpecificDelegation
      ? (wasAssignedByCurrentUser ? 'Atribuidas' : 'Atribuidas a mim')
      : 'Demandas do setor')
    : 'Minhas tarefas';

  return {
    ...task,
    list,
    listLabel: list?.name || task.listName || fallbackListLabel,
    taskScopeLabel,
    isCompleted,
    isDeleted,
    isOverdue,
    isPlanned: Boolean(task.dueAt),
    wasAssignedByOtherUser,
    wasAssignedByCurrentUser,
    canEdit: isManagerUser(currentUser) || task.assignedTo === currentUser.id || task.assignedBy === currentUser.id,
    canAssign: isManagerUser(currentUser),
    canComplete: !isCompleted && !isDeleted,
    requiresCommentOnCompletion: Boolean(task.metadata?.requiresCommentOnCompletion || task.template?.requiresCommentOnCompletion),
    recurrenceType: (task.metadata?.recurrenceType || task.template?.recurrenceType || 'NONE') as TaskRecurrenceType,
    recurrenceWeekdays: Array.isArray(task.metadata?.recurrenceWeekdays)
      ? task.metadata?.recurrenceWeekdays
      : (Array.isArray(task.template?.recurrenceConfig?.weekdays) ? task.template?.recurrenceConfig?.weekdays : []),
    explicitTime: Boolean(task.metadata?.explicitDueTime || (task.dueAt && toLocalTime(task.dueAt) !== '00:00'))
  };
};

const filterTasksByView = (
  tasks: TaskManagerTask[],
  activeView: TaskManagerViewKey,
  user: AppUser
) => {
  if (activeView.startsWith('custom:')) {
    const customId = activeView.replace('custom:', '');
    return tasks.filter(task => task.listId === customId);
  }

  switch (activeView) {
    case 'all':
      return tasks;
    case 'my-day':
      return tasks.filter(task => task.inMyDay);
    case 'important':
      return tasks.filter(task => task.isImportant);
    case 'planned':
      return tasks.filter(task => task.isPlanned);
    case 'assigned-to-me':
      return tasks.filter(task =>
        task.assignedTo === user.id
        && task.wasAssignedByOtherUser
        && getTaskAssignMode(task) === 'SPECIFIC'
      );
    case 'completed':
      return tasks.filter(task => task.isCompleted);
    case 'personal':
      return tasks.filter(task => task.taskScopeLabel === 'PESSOAL' && !task.wasAssignedByOtherUser);
    case 'team':
      return tasks.filter(task => task.taskScopeLabel === 'SETOR' && getTaskAssignMode(task) !== 'SPECIFIC');
    case 'created-by-me':
      return tasks.filter(task => task.wasAssignedByCurrentUser && getTaskAssignMode(task) === 'SPECIFIC');
    default:
      return tasks;
  }
};

const sortTasks = (tasks: TaskManagerTask[], sortMode: TaskSortMode) => {
  const items = [...tasks];

  items.sort((left, right) => {
    if (sortMode === 'created') {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    if (sortMode === 'due') {
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }

    const smartScore = (task: TaskManagerTask) => (
      Number(task.isOverdue) * 16
      + Number(task.isImportant) * 8
      + Number(task.inMyDay) * 4
      + Number(task.wasAssignedByOtherUser) * 2
      + Number(task.priority === 'CRITICAL') * 8
      + Number(task.priority === 'HIGH') * 4
      + Number(task.priority === 'MEDIUM') * 2
    );

    const leftScore = smartScore(left);
    const rightScore = smartScore(right);
    if (leftScore !== rightScore) return rightScore - leftScore;

    if (left.dueAt || right.dueAt) {
      const leftDue = left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const rightDue = right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (leftDue !== rightDue) return leftDue - rightDue;
    }

    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });

  return items;
};

const Calendar: React.FC<CalendarProps> = ({ user }) => {
  const initialView = React.useMemo(() => readStoredActiveView(user.id) || 'all', [user.id]);
  const [loading, setLoading] = React.useState(true);
  const [savingTask, setSavingTask] = React.useState(false);
  const [quickSubmitting, setQuickSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeView, setActiveView] = React.useState<TaskManagerViewKey>(initialView);
  const [tasks, setTasks] = React.useState<TaskInstance[]>([]);
  const [taskLists, setTaskLists] = React.useState<TaskList[]>([]);
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [searchValue, setSearchValue] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchValue);
  const [filterMode, setFilterMode] = React.useState<TaskFilterMode>('active');
  const [sortMode, setSortMode] = React.useState<TaskSortMode>('smart');
  const [assigneeFilter, setAssigneeFilter] = React.useState('all');
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
  const [quickAddExpanded, setQuickAddExpanded] = React.useState(false);
  const [quickTaskForm, setQuickTaskForm] = React.useState<QuickTaskFormState>(() => buildQuickTaskDefaults(initialView, isManagerUser(user)));
  const taskListsMap = React.useMemo(() => new Map(taskLists.map(list => [list.id, list])), [taskLists]);
  const canAssignOthers = isManagerUser(user);
  const assignableUsers = React.useMemo(
    () => getTaskAssignableUsers(users.filter(candidate => candidate.id !== user.id || canAssignOthers)),
    [users, user.id, canAssignOthers]
  );

  const loadData = React.useCallback(async (preserveTaskId?: string | null) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [loadedTasks, loadedLists, loadedUsers] = await Promise.all([
        dataService.getTaskInstances({ includeArchived: false }),
        dataService.getTaskLists(user.id),
        dataService.getUsers()
      ]);

      setTasks(loadedTasks);
      setTaskLists(loadedLists);
      setUsers(loadedUsers);
      setSelectedTaskId(current => {
        const targetId = preserveTaskId ?? current;
        if (!targetId) return null;
        return loadedTasks.some(task => task.id === targetId) ? targetId : null;
      });
    } catch (error: any) {
      console.error('Erro ao carregar tarefas.', error);
      setErrorMessage(error?.message || 'Nao foi possivel carregar as tarefas agora.');
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  React.useEffect(() => {
    let cancelled = false;

    const syncAndLoad = async () => {
      try {
        await dataService.syncTaskRecurringInstances();
      } catch (error) {
        console.error('Nao foi possivel sincronizar recorrencias.', error);
      }

      if (!cancelled) {
        await loadData();
      }
    };

    void syncAndLoad();

    const unsubscribe = subscribeAgendaRefresh(payload => {
      if (payload.source === 'tasks-manager' || payload.source === 'tasks-list-delete') {
        return;
      }

      if (!payload.entity || payload.entity === 'task_instance' || payload.entity === 'task_list') {
        void loadData(selectedTaskId);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadData, selectedTaskId]);

  React.useEffect(() => {
    storeActiveView(user.id, activeView);
    setQuickTaskForm(buildQuickTaskDefaults(activeView, canAssignOthers));
    setQuickAddExpanded(false);
    setSearchValue('');
    setFilterMode(activeView === 'completed' ? 'all' : 'active');
    setAssigneeFilter('all');
  }, [activeView, canAssignOthers, user.id]);

  React.useEffect(() => {
    if (activeView.startsWith('custom:')) {
      const customId = activeView.replace('custom:', '');
      if (!taskLists.some(list => list.id === customId)) {
        setActiveView('all');
      }
    }
  }, [activeView, taskLists]);

  const visibleTasks = React.useMemo(
    () => tasks.filter(task => canUserSeeTask(task, user)).map(task => buildTaskManagerTask(task, user, taskListsMap)),
    [tasks, taskListsMap, user]
  );

  const sidebarItems = React.useMemo<TaskSidebarItem[]>(() => {
    const smartIds: Array<Exclude<TaskManagerViewKey, `custom:${string}` | 'personal' | 'team' | 'created-by-me'>> = [
      'all',
      'my-day',
      'important',
      'planned',
      'assigned-to-me',
      'completed'
    ];

    const smartItems = smartIds.map(viewId => ({
      id: viewId,
      label: SMART_VIEW_CONFIG[viewId].title,
      count: filterTasksByView(visibleTasks, viewId, user).filter(task => viewId === 'completed' ? task.isCompleted : !task.isCompleted).length,
      icon: SMART_VIEW_CONFIG[viewId].icon,
      kind: 'smart' as const
    }));

    const sourceIds: Array<'personal' | 'team' | 'created-by-me'> = ['personal', 'team', 'created-by-me'];
    const sourceItems = sourceIds
      .filter(viewId => viewId !== 'created-by-me' || canAssignOthers)
      .map(viewId => ({
        id: viewId,
        label: SOURCE_VIEW_CONFIG[viewId].label,
        count: filterTasksByView(visibleTasks, viewId, user).filter(task => !task.isCompleted).length,
        icon: SOURCE_VIEW_CONFIG[viewId].icon,
        kind: 'source' as const
      }));

    const customItems = taskLists.map(list => ({
      id: `custom:${list.id}` as TaskManagerViewKey,
      label: list.name,
      count: visibleTasks.filter(task => task.listId === list.id && !task.isCompleted).length,
      icon: ListChecks,
      kind: 'custom' as const,
      list
    }));

    return [...smartItems, ...sourceItems, ...customItems];
  }, [visibleTasks, taskLists, user, canAssignOthers]);

  const baseViewTasks = React.useMemo(
    () => filterTasksByView(visibleTasks.filter(task => !task.isDeleted), activeView, user),
    [visibleTasks, activeView, user]
  );

  const filteredTasks = React.useMemo(() => {
    let items = [...baseViewTasks];

    if (activeView === 'completed') {
      items = items.filter(task => task.isCompleted);
    } else if (filterMode === 'active') {
      items = items.filter(task => !task.isCompleted);
    }

    if (assigneeFilter !== 'all') {
      items = items.filter(task => task.assignedTo === assigneeFilter);
    }

    const normalizedSearch = deferredSearch.trim().toLowerCase();
    if (normalizedSearch) {
      items = items.filter(task =>
        task.title.toLowerCase().includes(normalizedSearch)
        || (task.description || '').toLowerCase().includes(normalizedSearch)
        || (task.assignedUser?.name || '').toLowerCase().includes(normalizedSearch)
        || (task.listLabel || '').toLowerCase().includes(normalizedSearch)
        || (task.category || '').toLowerCase().includes(normalizedSearch)
      );
    }

    return sortTasks(items, sortMode);
  }, [baseViewTasks, activeView, assigneeFilter, deferredSearch, filterMode, sortMode]);

  const selectedTask = React.useMemo(
    () => visibleTasks.find(task => task.id === selectedTaskId) || null,
    [selectedTaskId, visibleTasks]
  );

  const activeViewMeta = React.useMemo(() => {
    if (activeView.startsWith('custom:')) {
      const customId = activeView.replace('custom:', '');
      const list = taskLists.find(candidate => candidate.id === customId);

      return {
        title: list?.name || 'Lista personalizada',
        subtitle: 'Uma lista customizada para agrupar tarefas sem virar formulario.',
        emptyTitle: 'Esta lista esta vazia',
        emptyDescription: 'Adicione tarefas simples e mantenha tudo agrupado no mesmo lugar.'
      };
    }

    if (activeView in SMART_VIEW_CONFIG) {
      const meta = SMART_VIEW_CONFIG[activeView as keyof typeof SMART_VIEW_CONFIG];
      return {
        title: meta.title,
        subtitle: meta.subtitle,
        emptyTitle: meta.emptyTitle,
        emptyDescription: meta.emptyDescription
      };
    }

    const meta = SOURCE_VIEW_CONFIG[activeView as keyof typeof SOURCE_VIEW_CONFIG];
    return {
      title: meta.title,
      subtitle: meta.subtitle,
      emptyTitle: meta.emptyTitle,
      emptyDescription: meta.emptyDescription
    };
  }, [activeView, taskLists]);

  const pendingCount = React.useMemo(
    () => filteredTasks.filter(task => !task.isCompleted).length,
    [filteredTasks]
  );

  const currentListLabel = React.useMemo(() => {
    if (activeView.startsWith('custom:')) {
      return taskLists.find(list => list.id === activeView.replace('custom:', ''))?.name || 'Lista personalizada';
    }

    if (activeView in SMART_VIEW_CONFIG) {
      return SMART_VIEW_CONFIG[activeView as keyof typeof SMART_VIEW_CONFIG].title;
    }

    return SOURCE_VIEW_CONFIG[activeView as keyof typeof SOURCE_VIEW_CONFIG].label;
  }, [activeView, taskLists]);

  const updateQuickTaskForm = <K extends keyof QuickTaskFormState>(field: K, value: QuickTaskFormState[K]) => {
    setQuickTaskForm(current => ({ ...current, [field]: value }));
  };

  const refreshAfterMutation = async (preserveTaskId?: string | null) => {
    await loadData(preserveTaskId);
    publishAgendaRefresh({ source: 'tasks-manager', entity: 'task_instance', entityId: preserveTaskId || undefined });
  };

  const handleCreateList = async (name: string) => {
    try {
      const createdList = await dataService.createTaskList({
        name,
        ownerUserId: user.id,
        createdBy: user.id
      });
      await loadData();
      setActiveView(`custom:${createdList.id}`);
    } catch (error: any) {
      console.error('Erro ao criar lista.', error);
      alert(error?.message || 'Nao foi possivel criar a lista agora.');
    }
  };

  const handleDeleteList = async (viewId: TaskManagerViewKey) => {
    if (!viewId.startsWith('custom:')) return;

    const listId = viewId.replace('custom:', '');
    const list = taskLists.find(candidate => candidate.id === listId);
    if (!list) return;

    const confirmed = window.confirm(`Excluir a lista "${list.name}"? As tarefas continuam existindo, mas saem dessa lista.`);
    if (!confirmed) return;

    try {
      const linkedTasks = visibleTasks.filter(task => task.listId === listId);

      await dataService.archiveTaskList(listId);

      await Promise.allSettled(linkedTasks.map(task => {
        const nextMetadata = {
          ...(task.metadata || {})
        };
        delete nextMetadata.taskListId;
        delete nextMetadata.taskListName;

        return dataService.updateTaskInstance(task.id, {
          metadata: nextMetadata,
          listId: null,
          listName: null
        }, user.id, 'Lista removida da tarefa.');
      }));

      await loadData();
      if (activeView === viewId) {
        setActiveView('all');
      }
      publishAgendaRefresh({ source: 'tasks-list-delete', entity: 'task_list', entityId: listId });
    } catch (error: any) {
      console.error('Erro ao excluir lista.', error);
      alert(error?.message || 'Nao foi possivel excluir a lista agora.');
    }
  };

  const handleQuickTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!quickTaskForm.title.trim()) return;

    if (quickTaskForm.ownership === 'ASSIGNED' && !quickTaskForm.assignedUserId) {
      alert('Selecione o responsavel da tarefa.');
      return;
    }

    if (quickTaskForm.recurrenceType === 'WEEKLY' && quickTaskForm.weeklyDays.length === 0) {
      alert('Escolha pelo menos um dia da semana para a recorrencia.');
      return;
    }

    setQuickSubmitting(true);
    try {
      const selectedList = taskLists.find(list => list.id === quickTaskForm.listId) || null;
      const dueAt = buildDateTimeIso(quickTaskForm.dueDate, quickTaskForm.dueTime, '23:59');
      const reminderAt = buildDateTimeIso(quickTaskForm.reminderDate, quickTaskForm.reminderTime, '09:00');
      const metadata = {
        taskListId: selectedList?.id || null,
        taskListName: selectedList?.name || null,
        reminderAt,
        isImportant: quickTaskForm.isImportant,
        inMyDay: quickTaskForm.inMyDay,
        recurrenceType: quickTaskForm.recurrenceType,
        recurrenceWeekdays: quickTaskForm.weeklyDays,
        explicitDueTime: Boolean(quickTaskForm.dueDate && quickTaskForm.dueTime)
      };
      const category = selectedList?.name
        || (quickTaskForm.ownership === 'TEAM'
          ? 'Demandas do setor'
          : (quickTaskForm.ownership === 'ASSIGNED' ? 'Atribuidas' : 'Minhas tarefas'));

      if (quickTaskForm.recurrenceType !== 'NONE') {
        await dataService.saveTaskTemplate({
          title: quickTaskForm.title.trim(),
          description: quickTaskForm.description.trim() || null,
          category,
          taskScope: quickTaskForm.ownership === 'PERSONAL' ? 'PESSOAL' : 'SETOR',
          recurrenceType: quickTaskForm.recurrenceType,
          recurrenceConfig: {
            start_date: quickTaskForm.dueDate || new Date().toISOString().slice(0, 10),
            weekdays: quickTaskForm.recurrenceType === 'WEEKLY' ? quickTaskForm.weeklyDays : undefined,
            day_of_month: quickTaskForm.recurrenceType === 'MONTHLY' && quickTaskForm.dueDate
              ? Number(quickTaskForm.dueDate.slice(-2))
              : undefined,
            reminderAt,
            taskListId: selectedList?.id || null,
            taskListName: selectedList?.name || null,
            inMyDay: quickTaskForm.inMyDay,
            isImportant: quickTaskForm.isImportant,
            explicitDueTime: Boolean(quickTaskForm.dueDate && quickTaskForm.dueTime)
          },
          defaultPriority: quickTaskForm.priority,
          defaultDueTime: quickTaskForm.dueTime || null,
          createdBy: user.id,
          isActive: true,
          assignMode: quickTaskForm.ownership === 'TEAM' ? 'ALL' : 'SPECIFIC',
          assignConfig: quickTaskForm.ownership === 'ASSIGNED'
            ? { userIds: [quickTaskForm.assignedUserId] }
            : quickTaskForm.ownership === 'TEAM'
              ? {}
              : { userIds: [user.id] }
        });
        await dataService.syncTaskRecurringInstances();
      } else {
        await dataService.createInternalTasks({
          title: quickTaskForm.title.trim(),
          description: quickTaskForm.description.trim() || undefined,
          category,
          priority: quickTaskForm.priority,
          dueAt,
          startsAt: dueAt,
          assignedBy: user.id,
          taskScope: quickTaskForm.ownership === 'PERSONAL' ? 'PESSOAL' : 'SETOR',
          assignMode: quickTaskForm.ownership === 'TEAM' ? 'ALL' : 'SPECIFIC',
          assignedToIds: quickTaskForm.ownership === 'ASSIGNED'
            ? [quickTaskForm.assignedUserId]
            : quickTaskForm.ownership === 'PERSONAL'
              ? [user.id]
              : undefined,
          metadata
        });
      }

      setQuickTaskForm(buildQuickTaskDefaults(activeView, canAssignOthers));
      setQuickAddExpanded(false);
      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao criar tarefa.', error);
      alert(error?.message || 'Nao foi possivel criar a tarefa agora.');
    } finally {
      setQuickSubmitting(false);
    }
  };

  const handleToggleTaskCompletion = async (task: TaskManagerTask) => {
    try {
      if (task.isCompleted) {
        await dataService.updateTaskInstance(task.id, {
          status: task.dueAt && new Date(task.dueAt).getTime() < Date.now() ? 'ATRASADO' : 'PENDENTE',
          completedAt: null
        }, user.id, 'Tarefa reaberta.');
      } else {
        const completionNote = task.requiresCommentOnCompletion
          ? window.prompt('Essa tarefa exige um comentario de conclusao. Escreva um resumo curto:')
          : undefined;

        if (task.requiresCommentOnCompletion && !completionNote?.trim()) {
          return;
        }

        await dataService.completeTaskInstance(task.id, user.id, completionNote || undefined);
      }

      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao alterar conclusao da tarefa.', error);
      alert(error?.message || 'Nao foi possivel atualizar essa tarefa agora.');
    }
  };

  const handleToggleImportant = async (task: TaskManagerTask) => {
    try {
      await dataService.updateTaskInstance(task.id, {
        metadata: {
          ...(task.metadata || {}),
          isImportant: !task.isImportant
        }
      }, user.id, 'Importancia da tarefa atualizada.');
      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao atualizar importancia.', error);
      alert(error?.message || 'Nao foi possivel atualizar a importancia agora.');
    }
  };

  const handleToggleMyDay = async (task: TaskManagerTask) => {
    try {
      await dataService.updateTaskInstance(task.id, {
        metadata: {
          ...(task.metadata || {}),
          inMyDay: !task.inMyDay
        }
      }, user.id, 'Marcador Meu dia atualizado.');
      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao atualizar Meu dia.', error);
      alert(error?.message || 'Nao foi possivel atualizar Meu dia agora.');
    }
  };

  const handleDuplicateTask = async (task: TaskManagerTask) => {
    try {
      await dataService.duplicateTaskInstance(task.id, user.id);
      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao duplicar tarefa.', error);
      alert(error?.message || 'Nao foi possivel duplicar a tarefa agora.');
    }
  };

  const handleDeleteTask = async (task: TaskManagerTask) => {
    const confirmed = window.confirm(`Excluir a tarefa "${task.title}"?`);
    if (!confirmed) return;

    try {
      await dataService.cancelTaskInstance(task.id, user.id, 'Tarefa removida pela interface de tarefas.');
      await refreshAfterMutation();
    } catch (error: any) {
      console.error('Erro ao excluir tarefa.', error);
      alert(error?.message || 'Nao foi possivel excluir a tarefa agora.');
    }
  };

  const handleSaveTaskDetails = async (
    task: TaskManagerTask,
    draft: {
      title: string;
      description: string;
      listId: string;
      assignedUserId: string;
      priority: TaskPriority;
      dueDate: string;
      dueTime: string;
      reminderDate: string;
      reminderTime: string;
      recurrenceType: TaskRecurrenceType;
      weeklyDays: string[];
      isImportant: boolean;
      inMyDay: boolean;
    }
  ) => {
    setSavingTask(true);
    try {
      const selectedList = taskLists.find(list => list.id === draft.listId) || null;
      const dueAt = buildDateTimeIso(draft.dueDate, draft.dueTime, '23:59');
      const reminderAt = buildDateTimeIso(draft.reminderDate, draft.reminderTime, '09:00');

      await dataService.updateTaskInstance(task.id, {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        category: selectedList?.name || task.category,
        priority: draft.priority,
        dueAt,
        assignedTo: canAssignOthers ? (draft.assignedUserId || null) : task.assignedTo,
        metadata: {
          ...(task.metadata || {}),
          taskListId: selectedList?.id || null,
          taskListName: selectedList?.name || null,
          reminderAt,
          isImportant: draft.isImportant,
          inMyDay: draft.inMyDay,
          recurrenceType: draft.recurrenceType,
          recurrenceWeekdays: draft.weeklyDays,
          explicitDueTime: Boolean(draft.dueDate && draft.dueTime)
        }
      }, user.id, 'Tarefa atualizada pelo gerenciador.');

      await refreshAfterMutation(task.id);
    } catch (error: any) {
      console.error('Erro ao salvar tarefa.', error);
      alert(error?.message || 'Nao foi possivel salvar as alteracoes agora.');
    } finally {
      setSavingTask(false);
    }
  };

  return (
    <div className="pb-10">
      <div className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_44px_-38px_rgba(15,23,42,0.35)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,_rgba(241,245,249,0.95),_transparent_44%),radial-gradient(circle_at_top_right,_rgba(236,253,245,0.7),_transparent_30%)]" />

        <div className={`relative grid min-h-[calc(100vh-10rem)] grid-cols-1 ${selectedTask ? 'xl:grid-cols-[248px_minmax(0,1fr)_360px]' : 'xl:grid-cols-[248px_minmax(0,1fr)]'}`}>
          <TasksSidebar
            items={sidebarItems}
            activeView={activeView}
            onSelect={setActiveView}
            onCreateList={handleCreateList}
            onDeleteList={handleDeleteList}
          />

          <main className="min-w-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.72)_0%,rgba(255,255,255,1)_180px)]">
            <div className="mx-auto flex h-full max-w-6xl flex-col gap-4 px-4 py-4 xl:px-6 xl:py-5">
              <TasksHeader
                title={activeViewMeta.title}
                subtitle={activeViewMeta.subtitle}
                pendingCount={pendingCount}
                searchValue={searchValue}
                onSearchChange={setSearchValue}
              />

              {activeView !== 'completed' ? (
                <QuickAddTask
                  form={quickTaskForm}
                  expanded={quickAddExpanded}
                  submitting={quickSubmitting}
                  currentListLabel={currentListLabel}
                  availableLists={taskLists}
                  assignableUsers={assignableUsers}
                  canAssignOthers={canAssignOthers}
                  onExpandChange={setQuickAddExpanded}
                  onChange={updateQuickTaskForm}
                  onToggleWeekday={weekday => {
                    setQuickTaskForm(current => ({
                      ...current,
                      weeklyDays: current.weeklyDays.includes(weekday)
                        ? current.weeklyDays.filter(currentDay => currentDay !== weekday)
                        : [...current.weeklyDays, weekday]
                    }));
                  }}
                  onSubmit={handleQuickTaskSubmit}
                />
              ) : null}

              <TaskFiltersBar
                filterMode={filterMode}
                onFilterModeChange={setFilterMode}
                sortMode={sortMode}
                onSortModeChange={setSortMode}
                assigneeFilter={assigneeFilter}
                onAssigneeFilterChange={setAssigneeFilter}
                users={assignableUsers}
                showAssigneeFilter={canAssignOthers && activeView !== 'assigned-to-me'}
                lockToAll={activeView === 'completed'}
              />

              <div className="min-h-[260px] flex-1">
                {loading ? (
                  <div className="flex h-full min-h-[260px] items-center justify-center rounded-[32px] border border-slate-200 bg-slate-50">
                    <div className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/50">
                      <Loader2 size={18} className="animate-spin" />
                      Carregando tarefas...
                    </div>
                  </div>
                ) : errorMessage ? (
                  <div className="rounded-[32px] border border-red-200 bg-red-50 px-6 py-10 text-center">
                    <AlertCircle size={30} className="mx-auto text-red-500" />
                    <h3 className="mt-4 text-xl font-black tracking-tight text-red-700">Nao foi possivel carregar</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm text-red-600">{errorMessage}</p>
                    <button
                      onClick={() => void loadData(selectedTaskId)}
                      className="mt-5 rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-100"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : (
                  <TasksList
                    tasks={filteredTasks}
                    selectedTaskId={selectedTaskId}
                    emptyTitle={activeViewMeta.emptyTitle}
                    emptyDescription={activeViewMeta.emptyDescription}
                    onSelect={setSelectedTaskId}
                    onToggleComplete={handleToggleTaskCompletion}
                    onToggleImportant={handleToggleImportant}
                    onToggleMyDay={handleToggleMyDay}
                    onDuplicate={handleDuplicateTask}
                    onDelete={handleDeleteTask}
                  />
                )}
              </div>
            </div>
          </main>

          {selectedTask ? (
            <TaskDetailsDrawer
              task={selectedTask}
              open={Boolean(selectedTask)}
              canAssignOthers={canAssignOthers}
              availableLists={taskLists}
              assignableUsers={assignableUsers}
              saving={savingTask}
              onClose={() => setSelectedTaskId(null)}
              onSave={handleSaveTaskDetails}
              onToggleComplete={handleToggleTaskCompletion}
              onDelete={handleDeleteTask}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
