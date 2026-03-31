import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  AlertTriangle,
  Clock,
  ExternalLink,
  GripVertical,
  Layers3,
  Loader2,
  MapPin,
  Play,
  Plus,
  RotateCcw,
  User,
  Users,
  X
} from 'lucide-react';
import { ManualScheduleModal } from '../components/ManualScheduleModal';
import { InternalTaskModal } from '../components/InternalTaskModal';
import { agendaCenterService } from '../services/agendaCenterService';
import { dataService } from '../services/dataService';
import { publishAgendaRefresh, subscribeAgendaRefresh } from '../utils/agendaEvents';
import { buildScheduledForValue } from '../utils/scheduleDateTime';
import {
  AgendaCentralItem,
  CallScheduleWithClient,
  CallType,
  OperationTeam,
  TaskList,
  TaskInstance,
  TaskPriority,
  TaskRecurrenceType,
  User as AppUser,
  UserRole
} from '../types';
import { getTaskAssignableUsers } from '../utils/taskAssignment';

type CalendarProps = {
  user: AppUser;
};

type AgendaSectionConfig = {
  key: string;
  title: string;
  hint: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClass: string;
  countClass: string;
  emptyMessage: string;
  items: AgendaCentralItem[];
  taskSection?: boolean;
  taskListId?: string | null;
};

type QuickTaskListKey = 'MINHAS' | 'ATRIBUIDAS' | 'SETOR' | 'CUSTOM';
type TaskSectionFilterState = {
  search: string;
  category: string;
  responsibleId: string;
};

const DEFAULT_TASK_FILTERS: TaskSectionFilterState = {
  search: '',
  category: 'ALL',
  responsibleId: 'ALL'
};
const DEFAULT_TASK_TIME = '09:00';
const WEEKDAY_OPTIONS = [
  { key: 'MON', label: 'Seg' },
  { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' },
  { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' },
  { key: 'SAT', label: 'Sab' },
  { key: 'SUN', label: 'Dom' }
] as const;

const getCalendarSectionOrderStorageKey = (userId: string) => `dreon:calendar:section-order:${userId}`;

const readStoredSectionOrder = (userId: string) => {
  if (typeof window === 'undefined') return [] as string[];

  try {
    const storedValue = window.localStorage.getItem(getCalendarSectionOrderStorageKey(userId));
    if (!storedValue) return [];

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const writeStoredSectionOrder = (userId: string, sectionKeys: string[]) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      getCalendarSectionOrderStorageKey(userId),
      JSON.stringify(sectionKeys)
    );
  } catch {
    // Ignora falhas de persistencia local para nao interromper a Agenda.
  }
};

const STATUS_STYLES: Record<AgendaCentralItem['status'], string> = {
  PENDENTE: 'bg-slate-100 text-slate-600',
  EM_ANDAMENTO: 'bg-blue-100 text-blue-700',
  AGUARDANDO: 'bg-amber-100 text-amber-700',
  CONCLUIDO: 'bg-emerald-100 text-emerald-700',
  ATRASADO: 'bg-red-100 text-red-700',
  CANCELADO: 'bg-slate-200 text-slate-500'
};

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-blue-50 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700'
};

const TYPE_STYLES: Record<AgendaCentralItem['sourceType'], string> = {
  REPIQUE: 'bg-orange-100 text-orange-700',
  AGENDAMENTO: 'bg-amber-100 text-amber-700',
  PROTOCOLO: 'bg-blue-100 text-blue-700',
  ROTEIRO: 'bg-sky-100 text-sky-700',
  VISITA: 'bg-sky-100 text-sky-700',
  DEMANDA_SETOR: 'bg-violet-100 text-violet-700',
  TAREFA_PESSOAL: 'bg-emerald-100 text-emerald-700'
};

const getSourceLabel = (sourceType: AgendaCentralItem['sourceType']) => {
  switch (sourceType) {
    case 'REPIQUE':
      return 'Repique';
    case 'AGENDAMENTO':
      return 'Agendamento';
    case 'PROTOCOLO':
      return 'Protocolo';
    case 'ROTEIRO':
    case 'VISITA':
      return 'Visita';
    case 'DEMANDA_SETOR':
      return 'Setor';
    case 'TAREFA_PESSOAL':
      return 'Pessoal';
    default:
      return sourceType;
  }
};

const getPriorityLabel = (priority: TaskPriority) => {
  switch (priority) {
    case 'LOW':
      return 'Baixa';
    case 'MEDIUM':
      return 'Media';
    case 'HIGH':
      return 'Alta';
    case 'CRITICAL':
      return 'Critica';
    default:
      return priority;
  }
};

const getStatusLabel = (status: AgendaCentralItem['status']) => {
  switch (status) {
    case 'PENDENTE':
      return 'Pendente';
    case 'EM_ANDAMENTO':
      return 'Em andamento';
    case 'AGUARDANDO':
      return 'Aguardando';
    case 'CONCLUIDO':
      return 'Concluido';
    case 'ATRASADO':
      return 'Atrasado';
    case 'CANCELADO':
      return 'Cancelado';
    default:
      return status;
  }
};

const toDateInputValue = (value?: string) => {
  if (!value) return new Date().toISOString().split('T')[0];
  return new Date(value).toISOString().slice(0, 10);
};

const toTimeInputValue = (value?: string) => {
  if (!value) return '09:00';
  return new Date(value).toISOString().slice(11, 16);
};

const formatDateTime = (value?: string) => {
  if (!value) return 'Sem prazo definido';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
};

const formatOpenDuration = (value?: string) => {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  const hours = Math.max(Math.floor(diff / 3600000), 0);
  if (hours >= 24) {
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  }
  return `${hours}h`;
};

const isManager = (user: AppUser) => (
  user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR
);

const getCreatedAtFromItem = (item: AgendaCentralItem) => {
  const original = item.metadata?.original;
  return original?.createdAt || original?.openedAt || original?.updatedAt || null;
};

const isNewAgendaItem = (item: AgendaCentralItem) => {
  const createdAt = getCreatedAtFromItem(item);
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() <= 1000 * 60 * 30;
};

const isInternalTaskItem = (item: AgendaCentralItem) => (
  item.sourceType === 'DEMANDA_SETOR' || item.sourceType === 'TAREFA_PESSOAL'
);

const isCompletedInternalTask = (item: AgendaCentralItem) => (
  isInternalTaskItem(item) && item.status === 'CONCLUIDO'
);

const getInternalTaskCompletedAt = (item: AgendaCentralItem) => {
  const original = item.metadata?.original as TaskInstance | undefined;
  return original?.completedAt;
};

const isAccumulatedItem = (item: AgendaCentralItem) => {
  if (!['DEMANDA_SETOR', 'TAREFA_PESSOAL'].includes(item.sourceType)) return false;
  const original = item.metadata?.original as TaskInstance | undefined;
  return Boolean(original?.isAccumulated);
};

const isTaskSection = (section?: AgendaSectionConfig | null) => Boolean(section?.taskSection);

const mapSectionToQuickTaskList = (sectionKey: string): QuickTaskListKey => {
  if (sectionKey.startsWith('custom-list:')) return 'CUSTOM';
  if (sectionKey === 'atribuidas') return 'ATRIBUIDAS';
  if (sectionKey === 'demandas') return 'SETOR';
  return 'MINHAS';
};

const getQuickTaskListLabel = (listKey: QuickTaskListKey) => {
  switch (listKey) {
    case 'ATRIBUIDAS':
      return 'Atribuir para operador';
    case 'SETOR':
      return 'Demandas do setor';
    case 'CUSTOM':
      return 'Lista personalizada';
    case 'MINHAS':
    default:
      return 'Minhas tarefas';
  }
};

const getWeekdayCodeFromDateKey = (dateKey: string) => {
  const weekday = new Date(`${dateKey}T12:00:00`).getDay();
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][weekday] || 'MON';
};

const getTaskListLabelFromItem = (item: AgendaCentralItem, taskLists: TaskList[]) => {
  const matchingCustomList = taskLists.find(list => list.name === item.category);
  if (matchingCustomList && item.sourceType === 'TAREFA_PESSOAL') {
    return matchingCustomList.name;
  }

  if (item.sourceType === 'TAREFA_PESSOAL') return 'Minhas tarefas';
  if (item.isMine) return 'Atribuidas a mim';
  return 'Demandas do setor';
};

const getLocalDateKey = (value?: string | Date | null) => {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayDateKey = () => getLocalDateKey(new Date());

const getAgendaItemDateKey = (item: AgendaCentralItem) => {
  const completedAt = isCompletedInternalTask(item) ? getInternalTaskCompletedAt(item) : undefined;
  return getLocalDateKey(
    completedAt
    || item.dueAt
    || item.startsAt
    || item.metadata?.original?.scheduledDate
    || item.metadata?.original?.openedAt
    || item.metadata?.original?.createdAt
  );
};

const formatSelectedDateLabel = (dateKey: string) => {
  if (!dateKey) return 'Sem data';

  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(`${dateKey}T12:00:00`));
};

const buildMonthGrid = (baseDate: Date) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  return Array(firstDayOfMonth)
    .fill(null)
    .concat(
      Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1))
    );
};

const buildScheduleLabel = (schedule: CallScheduleWithClient) => (
  schedule.hasRepick || schedule.skipReason || /repique/i.test(schedule.scheduleReason || '')
    ? 'Repique'
    : 'Agendamento'
);

const ModalShell: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-sm">
    <div className="w-full max-w-xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
      <div className="flex items-start justify-between bg-slate-900 px-7 py-6 text-white">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Agenda Central</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight">{title}</h3>
          {subtitle && <p className="mt-2 text-sm text-slate-300">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X size={22} />
        </button>
      </div>
      <div className="p-7">{children}</div>
    </div>
  </div>
);

const Calendar: React.FC<CalendarProps> = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [items, setItems] = React.useState<AgendaCentralItem[]>([]);
  const [summary, setSummary] = React.useState({
    totalToday: 0,
    repiques: 0,
    protocolos: 0,
    roteiro: 0,
    tarefasSetor: 0,
    minhasTarefas: 0,
    atrasados: 0
  });
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [teams, setTeams] = React.useState<OperationTeam[]>([]);
  const [taskLists, setTaskLists] = React.useState<TaskList[]>([]);
  const [calendarDate, setCalendarDate] = React.useState(() => new Date());
  const [selectedDate, setSelectedDate] = React.useState(() => getTodayDateKey());
  const [lastRefreshAt, setLastRefreshAt] = React.useState<string | null>(null);
  const [sectionOrder, setSectionOrder] = React.useState<string[]>(() => readStoredSectionOrder(user.id));
  const [activeSectionKey, setActiveSectionKey] = React.useState<string>(
    isManager(user) ? 'demandas' : 'atribuidas'
  );
  const [collapsedSections, setCollapsedSections] = React.useState<Record<string, boolean>>({
    atribuidas: false,
    repiques: false,
    agendamentos: false,
    protocolos: false,
    roteiro: false,
    demandas: false,
    minhas: false,
    pendencias: false,
    semData: false
  });

  const [isManualScheduleModalOpen, setIsManualScheduleModalOpen] = React.useState(false);
  const [isInternalTaskModalOpen, setIsInternalTaskModalOpen] = React.useState(false);
  const [internalTaskSelfOnly, setInternalTaskSelfOnly] = React.useState(false);
  const [selectedInternalTask, setSelectedInternalTask] = React.useState<TaskInstance | null>(null);
  const [taskSectionFilters, setTaskSectionFilters] = React.useState<Record<string, TaskSectionFilterState>>({
    atribuidas: { ...DEFAULT_TASK_FILTERS },
    demandas: { ...DEFAULT_TASK_FILTERS },
    minhas: { ...DEFAULT_TASK_FILTERS }
  });
  const [quickTaskForm, setQuickTaskForm] = React.useState({
    title: '',
    listKey: (isManager(user) ? 'ATRIBUIDAS' : 'MINHAS') as QuickTaskListKey,
    dueDate: getTodayDateKey(),
    dueTime: DEFAULT_TASK_TIME,
    recurrenceType: 'NONE' as TaskRecurrenceType,
    weeklyDays: [getWeekdayCodeFromDateKey(getTodayDateKey())],
    assignedUserId: user.id,
    taskListId: ''
  });
  const [isTaskListModalOpen, setIsTaskListModalOpen] = React.useState(false);
  const [taskListName, setTaskListName] = React.useState('');
  const [deleteTaskListTarget, setDeleteTaskListTarget] = React.useState<TaskList | null>(null);

  const [approveTarget, setApproveTarget] = React.useState<CallScheduleWithClient | null>(null);
  const [approveForm, setApproveForm] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    time: '09:00',
    operatorId: user.id,
    type: CallType.POS_VENDA
  });

  const [rescheduleTarget, setRescheduleTarget] = React.useState<AgendaCentralItem | null>(null);
  const [rescheduleForm, setRescheduleForm] = React.useState({
    date: new Date().toISOString().slice(0, 10),
    time: '09:00',
    operatorId: user.id,
    note: ''
  });

  const [completionTarget, setCompletionTarget] = React.useState<TaskInstance | null>(null);
  const [completionNote, setCompletionNote] = React.useState('');
  const [expandedCompletedSections, setExpandedCompletedSections] = React.useState<Record<string, boolean>>({});
  const [draggedSectionKey, setDraggedSectionKey] = React.useState<string | null>(null);
  const [dragOverSectionKey, setDragOverSectionKey] = React.useState<string | null>(null);

  const [reassignTarget, setReassignTarget] = React.useState<TaskInstance | null>(null);
  const [reassignUserId, setReassignUserId] = React.useState('');

  const assignableUsers = React.useMemo(
    () => getTaskAssignableUsers(users),
    [users]
  );
  const refreshTimerRef = React.useRef<number | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [agendaData, userList, teamList, taskListData] = await Promise.all([
        agendaCenterService.getAgendaCenterData(user),
        dataService.getUsers(),
        dataService.getOperationTeams(),
        dataService.getTaskLists(user.id)
      ]);

      const visibleAgendaItems = agendaData.items.filter(item => {
        if (item.sourceType === 'PROTOCOLO') return false;
        if (item.sourceType === 'AGENDAMENTO') return false;
        if (item.sourceType === 'VISITA' || item.sourceType === 'ROTEIRO') return false;
        if (item.sourceType === 'REPIQUE' && !isManager(user)) return false;
        return true;
      });
      const todayDateKey = getTodayDateKey();

      setItems(visibleAgendaItems);
      setSummary({
        totalToday: visibleAgendaItems.filter(item => getAgendaItemDateKey(item) === todayDateKey).length,
        repiques: visibleAgendaItems.filter(item => item.sourceType === 'REPIQUE').length,
        protocolos: 0,
        roteiro: visibleAgendaItems.filter(item => item.sourceType === 'VISITA' || item.sourceType === 'ROTEIRO').length,
        tarefasSetor: visibleAgendaItems.filter(item => item.sourceType === 'DEMANDA_SETOR').length,
        minhasTarefas: visibleAgendaItems.filter(item => item.isMine).length,
        atrasados: visibleAgendaItems.filter(item => item.isOverdue).length
      });
      setUsers(userList);
      setTeams(teamList);
      setTaskLists(taskListData);
      setLastRefreshAt(new Date().toISOString());
    } catch (error) {
      console.error('Erro ao carregar Agenda Central.', error);
      alert('Nao foi possivel carregar a Agenda Central.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  React.useEffect(() => (
    subscribeAgendaRefresh(() => {
      if (typeof window === 'undefined') {
        loadData();
        return;
      }

      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        loadData();
        refreshTimerRef.current = null;
      }, 350);
    })
  ), [loadData]);

  React.useEffect(() => () => {
    if (typeof window !== 'undefined' && refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

  const selectedItems = React.useMemo(
    () => items.filter(item => getAgendaItemDateKey(item) === selectedDate),
    [items, selectedDate]
  );

  const customTaskListNameSet = React.useMemo(
    () => new Set(taskLists.map(list => list.name)),
    [taskLists]
  );

  const undatedItems = React.useMemo(
    () => items.filter(item => isInternalTaskItem(item) && !getAgendaItemDateKey(item)),
    [items]
  );

  const taskSectionItems = React.useMemo(
    () => items.filter(item => {
      if (!isInternalTaskItem(item)) return false;

      const itemDateKey = getAgendaItemDateKey(item);
      if (!itemDateKey) return false;
      if (itemDateKey === selectedDate) return true;

      return item.isOverdue && !['CONCLUIDO', 'CANCELADO'].includes(item.status);
    }),
    [items, selectedDate]
  );

  const sections = React.useMemo<AgendaSectionConfig[]>(() => {
    const customListSections = taskLists.map<AgendaSectionConfig>(taskList => ({
      key: `custom-list:${taskList.id}`,
      title: taskList.name,
      hint: 'Lista personalizada para tarefas especificas.',
      icon: Layers3,
      accentClass: 'text-emerald-600 bg-emerald-100',
      countClass: 'bg-emerald-100 text-emerald-700',
      emptyMessage: 'Nenhuma tarefa nessa lista para a data selecionada.',
      items: taskSectionItems.filter(item => item.sourceType === 'TAREFA_PESSOAL' && item.category === taskList.name),
      taskSection: true,
      taskListId: taskList.id
    }));

    const atribuidas = taskSectionItems.filter(item => (
      item.sourceType === 'DEMANDA_SETOR'
      && Boolean(item.responsibleId)
      && (isManager(user) || item.isMine)
    ));
    const repiques = isManager(user)
      ? selectedItems.filter(item => item.sourceType === 'REPIQUE')
      : [];
    const demandas = taskSectionItems.filter(item => item.sourceType === 'DEMANDA_SETOR');
    const minhas = taskSectionItems.filter(item => item.sourceType === 'TAREFA_PESSOAL' && !customTaskListNameSet.has(item.category));

    const baseSections: AgendaSectionConfig[] = [
      {
        key: 'atribuidas',
        title: 'Atribuidas a mim',
        hint: isManager(user)
          ? 'Demandas individuais com responsavel definido.'
          : 'Tudo o que o gestor direcionou para voce aparece aqui.',
        icon: User,
        accentClass: 'text-slate-700 bg-slate-100',
        countClass: 'bg-slate-100 text-slate-700',
        emptyMessage: isManager(user)
          ? 'Nenhuma tarefa atribuida individualmente nesta data.'
          : 'Nenhuma tarefa atribuida para voce nesta data.',
        items: atribuidas,
        taskSection: true
      },
      ...(isManager(user) ? [{
        key: 'repiques',
        title: 'Repiques',
        hint: 'Fluxos de retorno e itens que nasceram da fila.',
        icon: RotateCcw,
        accentClass: 'text-orange-600 bg-orange-100',
        countClass: 'bg-orange-100 text-orange-700',
        emptyMessage: 'Nenhum repique para a data selecionada.',
        items: repiques
      }] : []),
      {
        key: 'demandas',
        title: 'Demandas do Setor',
        hint: 'Tarefas internas compartilhadas com o time.',
        icon: Users,
        accentClass: 'text-violet-600 bg-violet-100',
        countClass: 'bg-violet-100 text-violet-700',
        emptyMessage: 'Nenhuma demanda do setor para este dia.',
        items: demandas,
        taskSection: true
      },
      {
        key: 'minhas',
        title: 'Minhas Tarefas',
        hint: 'Tarefas pessoais do dia e atrasadas ficam reunidas aqui.',
        icon: User,
        accentClass: 'text-emerald-600 bg-emerald-100',
        countClass: 'bg-emerald-100 text-emerald-700',
        emptyMessage: 'Nenhuma tarefa pessoal programada para esta data.',
        items: minhas,
        taskSection: true
      },
      ...customListSections
    ];

    if (undatedItems.length > 0) {
      baseSections.push({
        key: 'semData',
        title: 'Sem Data Definida',
        hint: 'Itens internos sem prazo marcado continuam visiveis por aqui.',
        icon: Layers3,
        accentClass: 'text-slate-600 bg-slate-100',
        countClass: 'bg-slate-100 text-slate-700',
        emptyMessage: 'Nenhum item sem data definida.',
        items: undatedItems
      });
    }

    return baseSections;
  }, [customTaskListNameSet, isManager, selectedItems, taskLists, taskSectionItems, undatedItems, user]);

  React.useEffect(() => {
    setSectionOrder(readStoredSectionOrder(user.id));
  }, [user.id]);

  React.useEffect(() => {
    const visibleSectionKeys = sections.map(section => section.key);

    setSectionOrder(currentOrder => {
      const baseOrder = currentOrder.length > 0 ? currentOrder : readStoredSectionOrder(user.id);
      const normalizedOrder = baseOrder.filter(sectionKey => visibleSectionKeys.includes(sectionKey));

      visibleSectionKeys.forEach(sectionKey => {
        if (!normalizedOrder.includes(sectionKey)) {
          normalizedOrder.push(sectionKey);
        }
      });

      const changed = normalizedOrder.length !== currentOrder.length
        || normalizedOrder.some((sectionKey, index) => sectionKey !== currentOrder[index]);

      if (changed) {
        writeStoredSectionOrder(user.id, normalizedOrder);
        return normalizedOrder;
      }

      return currentOrder;
    });
  }, [sections, user.id]);

  const orderedSections = React.useMemo(() => {
    if (sectionOrder.length === 0) return sections;

    const sectionMap = new Map(sections.map(section => [section.key, section]));
    const ordered = sectionOrder
      .map(sectionKey => sectionMap.get(sectionKey))
      .filter((section): section is AgendaSectionConfig => Boolean(section));

    sections.forEach(section => {
      if (!sectionOrder.includes(section.key)) {
        ordered.push(section);
      }
    });

    return ordered;
  }, [sectionOrder, sections]);

  const selectedDaySummary = React.useMemo(() => ({
    total: selectedItems.length,
    repiques: selectedItems.filter(item => item.sourceType === 'REPIQUE').length,
    atribuidas: taskSectionItems.filter(item => item.sourceType === 'DEMANDA_SETOR' && item.isMine).length,
    tarefas: taskSectionItems.filter(item => ['DEMANDA_SETOR', 'TAREFA_PESSOAL'].includes(item.sourceType)).length,
    minhas: taskSectionItems.filter(item => item.isMine).length
  }), [selectedItems, taskSectionItems]);

  const highlightedItems = React.useMemo(
    () => selectedItems.filter(item => item.isMine || item.isOverdue || item.isDueToday).slice(0, 4),
    [selectedItems]
  );

  const dayInsights = React.useMemo(() => {
    const insightMap = new Map<string, {
      total: number;
      repiques: number;
      visitas: number;
      tarefas: number;
      overdue: number;
      mine: number;
    }>();

    items.forEach(item => {
      const dateKey = getAgendaItemDateKey(item);
      if (!dateKey) return;

      const current = insightMap.get(dateKey) || {
        total: 0,
        repiques: 0,
        visitas: 0,
        tarefas: 0,
        overdue: 0,
        mine: 0
      };

      current.total += 1;
      if (item.sourceType === 'REPIQUE' || item.sourceType === 'AGENDAMENTO') current.repiques += 1;
      if (item.sourceType === 'VISITA' || item.sourceType === 'ROTEIRO') current.visitas += 1;
      if (['DEMANDA_SETOR', 'TAREFA_PESSOAL'].includes(item.sourceType)) current.tarefas += 1;
      if (item.isOverdue) current.overdue += 1;
      if (item.isMine) current.mine += 1;

      insightMap.set(dateKey, current);
    });

    return insightMap;
  }, [items]);

  const monthDays = React.useMemo(
    () => buildMonthGrid(calendarDate),
    [calendarDate]
  );

  const selectedDateLabel = React.useMemo(
    () => formatSelectedDateLabel(selectedDate),
    [selectedDate]
  );

  const todayKey = getTodayDateKey();

  const activeSection = React.useMemo(
    () => orderedSections.find(section => section.key === activeSectionKey) || orderedSections[0] || null,
    [activeSectionKey, orderedSections]
  );

  React.useEffect(() => {
    if (orderedSections.length === 0) return;
    if (orderedSections.some(section => section.key === activeSectionKey)) return;

    const fallbackKey = orderedSections.some(section => section.key === (isManager(user) ? 'demandas' : 'atribuidas'))
      ? (isManager(user) ? 'demandas' : 'atribuidas')
      : orderedSections[0].key;

    setActiveSectionKey(fallbackKey);
  }, [activeSectionKey, orderedSections, user]);

  const previousMonth = () => {
    setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarDate(current => new Date(current.getFullYear(), current.getMonth() + 1, 1));
  };

  const handleRefresh = async () => {
    await loadData();
  };

  const persistSectionOrder = React.useCallback((nextOrder: string[]) => {
    setSectionOrder(nextOrder);
    writeStoredSectionOrder(user.id, nextOrder);
  }, [user.id]);

  const handleSectionDragStart = React.useCallback((event: React.DragEvent<HTMLDivElement>, sectionKey: string) => {
    setDraggedSectionKey(sectionKey);
    setDragOverSectionKey(sectionKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', sectionKey);
  }, []);

  const handleSectionDragOver = React.useCallback((event: React.DragEvent<HTMLDivElement>, sectionKey: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';

    if (draggedSectionKey && draggedSectionKey !== sectionKey) {
      setDragOverSectionKey(sectionKey);
    }
  }, [draggedSectionKey]);

  const handleSectionDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>, targetSectionKey: string) => {
    event.preventDefault();

    const draggedKey = draggedSectionKey || event.dataTransfer.getData('text/plain');
    if (!draggedKey || draggedKey === targetSectionKey) {
      setDraggedSectionKey(null);
      setDragOverSectionKey(null);
      return;
    }

    const currentOrder = orderedSections.map(section => section.key);
    const sourceIndex = currentOrder.indexOf(draggedKey);
    const targetIndex = currentOrder.indexOf(targetSectionKey);

    if (sourceIndex === -1 || targetIndex === -1) {
      setDraggedSectionKey(null);
      setDragOverSectionKey(null);
      return;
    }

    const nextOrder = [...currentOrder];
    const [movedSection] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, movedSection);
    persistSectionOrder(nextOrder);
    setDraggedSectionKey(null);
    setDragOverSectionKey(null);
  }, [draggedSectionKey, orderedSections, persistSectionOrder]);

  const handleSectionDragEnd = React.useCallback(() => {
    setDraggedSectionKey(null);
    setDragOverSectionKey(null);
  }, []);

  const openInternalTaskModal = (task: TaskInstance | null, selfOnly: boolean) => {
    setSelectedInternalTask(task);
    setInternalTaskSelfOnly(selfOnly);
    setIsInternalTaskModalOpen(true);
  };

  const openApproveModal = (schedule: CallScheduleWithClient) => {
    setApproveTarget(schedule);
    setApproveForm({
      date: toDateInputValue(schedule.scheduledFor),
      time: toTimeInputValue(schedule.scheduledFor),
      operatorId: schedule.assignedOperatorId || user.id,
      type: schedule.callType === CallType.WHATSAPP ? CallType.POS_VENDA : schedule.callType
    });
  };

  const openRescheduleModal = (item: AgendaCentralItem) => {
    const baseDate = item.dueAt || item.startsAt || new Date().toISOString();
    setRescheduleTarget(item);
    setRescheduleForm({
      date: toDateInputValue(baseDate),
      time: toTimeInputValue(baseDate),
      operatorId: item.responsibleId || user.id,
      note: ''
    });
  };

  const handleOpenItem = (item: AgendaCentralItem) => {
    if (['DEMANDA_SETOR', 'TAREFA_PESSOAL'].includes(item.sourceType)) {
      const task = item.metadata?.original as TaskInstance | undefined;
      if (task) {
        const personalTask = item.sourceType === 'TAREFA_PESSOAL' || task.visibilityScope === 'PRIVATE';
        openInternalTaskModal(task, personalTask && !isManager(user));
      }
      return;
    }

    if (item.sourceType === 'REPIQUE' || item.sourceType === 'AGENDAMENTO') {
      const original = item.metadata?.original as CallScheduleWithClient | undefined;
      if (original && original.status === 'PENDENTE_APROVACAO' && isManager(user)) {
        openApproveModal(original);
        return;
      }

      if (item.deepLink) {
        navigate(item.deepLink);
        return;
      }

      openRescheduleModal(item);
      return;
    }

    if (item.deepLink) {
      navigate(item.deepLink);
    }
  };

  const handleApproveSchedule = async () => {
    if (!approveTarget || !approveForm.date || !approveForm.operatorId) return;

    setProcessing(true);
    try {
      if (!approveTarget.customerId) {
        throw new Error('Este item nao possui cliente vinculado para gerar a fila.');
      }

      const scheduleKind = buildScheduleLabel(approveTarget);
      const scheduledFor = new Date(buildScheduledForValue(approveForm.date, approveForm.time)).toISOString();
      const operatorName = assignableUsers.find(candidate => candidate.id === approveForm.operatorId)?.name || 'Operador';

      await dataService.updateSchedule(approveTarget.id, {
        status: 'CONCLUIDO',
        scheduledFor,
        assignedOperatorId: approveForm.operatorId,
        callType: approveForm.type,
        approvedByAdminId: user.id,
        approvalReason: `${scheduleKind} aprovado na Agenda Central.`
      }, user.id);

      const queueResult = await dataService.createTask({
        clientId: approveTarget.customerId,
        type: approveForm.type,
        assignedTo: approveForm.operatorId,
        status: 'pending',
        scheduledFor,
        originCallId: approveTarget.id,
        scheduleReason: `${scheduleKind} aprovado: ${approveTarget.scheduleReason || approveTarget.skipReason || 'Agenda Central'}`
      }, { skipRecentCommunicationCheck: true });

      await dataService.logOperatorEvent(
        user.id,
        'ADMIN_APROVAR' as any,
        undefined,
        `${scheduleKind} aprovado para ${approveTarget.clientName || 'cliente'} -> ${operatorName}`
      );

      publishAgendaRefresh({
        source: 'calendar-approve',
        entity: 'call_schedule',
        entityId: approveTarget.id
      });

      await loadData();
      setApproveTarget(null);

      if (!queueResult.created && queueResult.existingTaskId) {
        alert(`${scheduleKind} aprovado, mas a fila ja possuia um atendimento aberto para este cliente.`);
      } else {
        alert(`${scheduleKind} aprovado e enviado para a fila operacional.`);
      }
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel aprovar o item.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget || !rescheduleForm.date) return;

    setProcessing(true);
    try {
      const scheduledFor = new Date(buildScheduledForValue(rescheduleForm.date, rescheduleForm.time)).toISOString();

      if (rescheduleTarget.id.startsWith('schedule:')) {
        const schedule = rescheduleTarget.metadata?.original as CallScheduleWithClient | undefined;
        if (!schedule) throw new Error('Agenda original nao encontrada.');

        await dataService.updateSchedule(schedule.id, {
          scheduledFor,
          assignedOperatorId: rescheduleForm.operatorId || schedule.assignedOperatorId,
          scheduleReason: rescheduleForm.note
            ? `${schedule.scheduleReason || ''} | Agenda Central: ${rescheduleForm.note}`.trim()
            : schedule.scheduleReason
        }, user.id);

        await dataService.logOperatorEvent(
          user.id,
          'ADMIN_REAGENDAR' as any,
          undefined,
          `Reagendou ${buildScheduleLabel(schedule).toLowerCase()} de ${schedule.clientName || 'cliente'}`
        );
      } else if (rescheduleTarget.id.startsWith('queue:')) {
        const queueTask = rescheduleTarget.metadata?.original;
        if (!queueTask?.id) throw new Error('Item da fila nao encontrado.');

        await dataService.updateTask(queueTask.id, {
          scheduledFor,
          assignedTo: rescheduleForm.operatorId || queueTask.assignedTo
        });
      } else if (rescheduleTarget.id.startsWith('internal:')) {
        const internalTask = rescheduleTarget.metadata?.original as TaskInstance | undefined;
        if (!internalTask?.id) throw new Error('Tarefa interna nao encontrada.');

        await dataService.updateTaskInstance(
          internalTask.id,
          {
            dueAt: scheduledFor,
            startsAt: scheduledFor
          },
          user.id,
          rescheduleForm.note
            ? `Reagendada via Agenda Central. ${rescheduleForm.note}`
            : 'Reagendada via Agenda Central.'
        );
      } else {
        throw new Error('Este item deve ser reagendado pela sua tela de origem.');
      }

      publishAgendaRefresh({
        source: 'calendar-reschedule',
        entityId: rescheduleTarget.sourceId,
        entity: rescheduleTarget.sourceType
      });

      setRescheduleTarget(null);
      await loadData();
      alert('Item reagendado com sucesso.');
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel reagendar.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelSchedule = async (item: AgendaCentralItem) => {
    const schedule = item.metadata?.original as CallScheduleWithClient | undefined;
    if (!schedule) return;
    if (!window.confirm('Deseja cancelar este item da agenda?')) return;

    setProcessing(true);
    try {
      await dataService.updateSchedule(schedule.id, { status: 'CANCELADO' }, user.id);
      publishAgendaRefresh({
        source: 'calendar-cancel',
        entity: 'call_schedule',
        entityId: schedule.id
      });
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel cancelar o item.');
    } finally {
      setProcessing(false);
    }
  };

  const handleStartTask = async (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;

    setProcessing(true);
    try {
      await dataService.startTaskInstance(task.id, user.id);
      publishAgendaRefresh({
        source: 'calendar-start-task',
        entity: 'task_instance',
        entityId: task.id
      });
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel iniciar a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const openCompleteTaskModal = (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;
    setCompletionTarget(task);
    setCompletionNote('');
  };

  const handleCompleteTask = async () => {
    if (!completionTarget?.id) return;

    setProcessing(true);
    try {
      await dataService.completeTaskInstance(completionTarget.id, user.id, completionNote.trim() || undefined);
      publishAgendaRefresh({
        source: 'calendar-complete-task',
        entity: 'task_instance',
        entityId: completionTarget.id
      });
      setCompletionTarget(null);
      setCompletionNote('');
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel concluir a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveTask = async (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;

    setProcessing(true);
    try {
      await dataService.approveTaskInstance(task.id, user.id, 'Conclusao aprovada via Agenda Central.');
      publishAgendaRefresh({
        source: 'calendar-approve-task',
        entity: 'task_instance',
        entityId: task.id
      });
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel aprovar a conclusao.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDuplicateTask = async (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;

    setProcessing(true);
    try {
      await dataService.duplicateTaskInstance(task.id, user.id);
      publishAgendaRefresh({
        source: 'calendar-duplicate-task',
        entity: 'task_instance',
        entityId: task.id
      });
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel duplicar a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelTask = async (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;
    if (!window.confirm('Deseja cancelar esta tarefa interna?')) return;

    setProcessing(true);
    try {
      await dataService.cancelTaskInstance(task.id, user.id, 'Cancelada via Agenda Central.');
      publishAgendaRefresh({
        source: 'calendar-cancel-task',
        entity: 'task_instance',
        entityId: task.id
      });
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel cancelar a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const openReassignTaskModal = (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id) return;

    setReassignTarget(task);
    setReassignUserId(task.assignedTo || '');
  };

  const handleReassignTask = async () => {
    if (!reassignTarget?.id || !reassignUserId) return;

    setProcessing(true);
    try {
      await dataService.updateTaskInstance(
        reassignTarget.id,
        { assignedTo: reassignUserId },
        user.id,
        'Reatribuida via Agenda Central.'
      );
      publishAgendaRefresh({
        source: 'calendar-reassign-task',
        entity: 'task_instance',
        entityId: reassignTarget.id
      });
      setReassignTarget(null);
      setReassignUserId('');
      await loadData();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel reatribuir a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const handleNotifyTask = async (item: AgendaCentralItem) => {
    const task = item.metadata?.original as TaskInstance | undefined;
    if (!task?.id || !task.assignedTo) {
      alert('Essa tarefa ainda nao possui um responsavel definido para receber aviso.');
      return;
    }

    setProcessing(true);
    try {
      await dataService.createUserNotifications([{
        userId: task.assignedTo,
        type: 'TASK_REMINDER',
        title: 'Aviso sobre tarefa pendente',
        body: task.title,
        relatedEntityType: 'task_instance',
        relatedEntityId: task.id
      }]);

      publishAgendaRefresh({
        source: 'calendar-notify-task',
        entity: 'task_instance',
        entityId: task.id
      });

      alert('Aviso enviado com sucesso.');
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel disparar o aviso.');
    } finally {
      setProcessing(false);
    }
  };

  const toggleSection = (sectionKey: string) => {
    setCollapsedSections(current => ({
      ...current,
      [sectionKey]: !current[sectionKey]
    }));
  };

  const updateTaskSectionFilter = (
    sectionKey: string,
    field: 'search' | 'category' | 'responsibleId',
    value: string
  ) => {
    setTaskSectionFilters(current => ({
      ...current,
      [sectionKey]: {
        ...(current[sectionKey] || DEFAULT_TASK_FILTERS),
        [field]: value
      }
    }));
  };

  const getFilteredTaskSectionItems = (
    section: AgendaSectionConfig,
    statusGroup: 'pending' | 'completed'
  ) => {
    if (!isTaskSection(section)) return [];

    const filters = taskSectionFilters[section.key] || DEFAULT_TASK_FILTERS;
    const searchTerm = filters.search.trim().toLowerCase();

    return section.items.filter(item => {
      if (!isInternalTaskItem(item)) return false;

      if (statusGroup === 'completed') {
        if (item.status !== 'CONCLUIDO') return false;
        if (!isManager(user) && !item.isMine) return false;
      } else if (item.status === 'CONCLUIDO' || item.status === 'CANCELADO') {
        return false;
      }

      if (filters.category !== 'ALL' && item.category !== filters.category) {
        return false;
      }

      if (isManager(user) && filters.responsibleId !== 'ALL' && item.responsibleId !== filters.responsibleId) {
        return false;
      }

      if (searchTerm) {
        const haystack = [
          item.title,
          item.subtitle,
          item.description,
          item.clientName,
          item.responsibleName,
          item.category
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  };

  const getSectionBadges = (section: AgendaSectionConfig) => {
    const badges: Array<{ label: string; className: string }> = [];
    const overdueCount = section.items.filter(item => item.isOverdue).length;
    const mineCount = section.items.filter(item => item.isMine).length;

    if (section.key === 'pendencias') {
      const accumulatedCount = section.items.filter(item => isAccumulatedItem(item)).length;
      if (accumulatedCount > 0) {
        badges.push({ label: `Acumuladas ${accumulatedCount}`, className: 'bg-rose-100 text-rose-700' });
      }
    }

    if (isTaskSection(section)) {
      const pendingCount = section.items.filter(item => isInternalTaskItem(item) && item.status !== 'CONCLUIDO' && item.status !== 'CANCELADO').length;

      if (pendingCount > 0) badges.push({ label: `Pendentes ${pendingCount}`, className: 'bg-slate-100 text-slate-700' });
    }

    if (mineCount > 0) badges.push({ label: `Minhas ${mineCount}`, className: 'bg-slate-100 text-slate-600' });
    if (overdueCount > 0) badges.push({ label: `Atrasadas ${overdueCount}`, className: 'bg-red-100 text-red-700' });

    return badges.slice(0, 4);
  };

  const renderCollapsedPreview = (section: AgendaSectionConfig) => {
    const previewItems = section.items.slice(0, 2);
    const hiddenCount = Math.max(section.items.length - previewItems.length, 0);
    const badges = getSectionBadges(section);

    return (
      <div className="border-t border-slate-100 px-6 py-4">
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map(badge => (
              <span
                key={`${section.key}-${badge.label}`}
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${badge.className}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        <div className={`grid gap-3 ${previewItems.length > 1 ? 'mt-4 xl:grid-cols-2' : 'mt-4'}`}>
          {previewItems.map(item => (
            <button
              key={`${section.key}-preview-${item.id}`}
              onClick={() => handleOpenItem(item)}
              className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-left transition-colors hover:border-orange-200 hover:bg-orange-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{item.title}</p>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{item.subtitle || item.category}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[item.status]}`}>
                {getStatusLabel(item.status)}
              </span>
            </button>
          ))}
        </div>

        {hiddenCount > 0 && (
          <p className="mt-3 text-[11px] font-black uppercase tracking-widest text-slate-400">
            +{hiddenCount} item(ns) no detalhamento completo
          </p>
        )}
      </div>
    );
  };

  const renderActions = (item: AgendaCentralItem) => {
    const actions: React.ReactNode[] = [];
    const keyPrefix = item.id;

    if (isInternalTaskItem(item)) {
      if (item.status !== 'CONCLUIDO' && item.status !== 'CANCELADO' && item.actionContext?.canComplete) {
        actions.push(
          <button
            key={`${keyPrefix}-complete`}
            onClick={() => openCompleteTaskModal(item)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-transparent transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
            title="Concluir tarefa"
          >
            <span className="h-4 w-4 rounded-full border border-current" />
          </button>
        );
      }

      if (item.status !== 'CONCLUIDO' && item.status !== 'CANCELADO') {
        actions.push(
          <button
            key={`${keyPrefix}-reschedule-task`}
            onClick={() => openRescheduleModal(item)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <Clock size={13} />
            Reagendar
          </button>
        );

        actions.push(
          <button
            key={`${keyPrefix}-notify-task`}
            onClick={() => handleNotifyTask(item)}
            className="inline-flex items-center gap-2 rounded-xl border border-orange-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-orange-600 transition-colors hover:bg-orange-50"
          >
            <Bell size={13} />
            Avisar
          </button>
        );
      }

      if (item.actionContext?.canApprove) {
        actions.push(
          <button
            key={`${keyPrefix}-approve-task`}
            onClick={() => handleApproveTask(item)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-slate-800"
          >
            <CheckCircle2 size={13} />
            Aprovar
          </button>
        );
      }

      return actions;
    }

    actions.push(
      <button
        key={`${keyPrefix}-open`}
        onClick={() => handleOpenItem(item)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
      >
        <ExternalLink size={13} />
        Abrir
      </button>
    );

    if (item.id.startsWith('schedule:')) {
      const schedule = item.metadata?.original as CallScheduleWithClient | undefined;
      if (item.actionContext?.canApprove && schedule) {
        actions.push(
          <button
            key={`${keyPrefix}-approve-schedule`}
            onClick={() => openApproveModal(schedule)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-orange-600"
          >
            <CheckCircle2 size={13} />
            Aprovar
          </button>
        );
      }

      if (item.actionContext?.canReschedule) {
        actions.push(
          <button
            key={`${keyPrefix}-reschedule-schedule`}
            onClick={() => openRescheduleModal(item)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <Clock size={13} />
            Reagendar
          </button>
        );
      }

      if (isManager(user)) {
        actions.push(
          <button
            key={`${keyPrefix}-cancel-schedule`}
            onClick={() => handleCancelSchedule(item)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50"
          >
            <X size={13} />
            Cancelar
          </button>
        );
      }
    }

    if (item.sourceType === 'VISITA' && item.status !== 'CONCLUIDO') {
      actions.push(
        <button
          key={`${keyPrefix}-visit-complete`}
          onClick={() => navigate(item.deepLink || '/routes')}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-sky-500"
        >
          <CheckCircle2 size={13} />
          Concluir
        </button>
      );
    }

    return actions;
  };

  const renderAgendaCard = (item: AgendaCentralItem, sectionKey: string) => {
    const originalTask = item.metadata?.original as TaskInstance | undefined;
    const requiresApproval = Boolean(item.metadata?.requiresApproval);
    const requiresComment = Boolean(item.metadata?.requiresCommentOnCompletion);
    const isRepickItem = item.sourceType === 'REPIQUE';
    const completedAt = isCompletedInternalTask(item) ? getInternalTaskCompletedAt(item) : undefined;
    const displayDate = completedAt || item.dueAt || item.startsAt;
    const displayDateLabel = completedAt
      ? 'Concluida em'
      : item.isOverdue
        ? 'Atrasado'
        : item.isDueToday
          ? 'Hoje'
          : 'Horario';

    if (isInternalTaskItem(item)) {
      const canComplete = item.status !== 'CONCLUIDO' && item.status !== 'CANCELADO' && item.actionContext?.canComplete;

      return (
        <article
          key={`${sectionKey}-${item.id}`}
          className={`rounded-[26px] border px-5 py-4 transition-all ${
            item.status === 'CONCLUIDO'
              ? 'border-emerald-200 bg-emerald-50/30'
              : item.isOverdue
                ? 'border-red-200 bg-red-50/30'
                : 'border-slate-200 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className="pt-0.5">
              {canComplete ? (
                <button
                  onClick={() => openCompleteTaskModal(item)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-transparent transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
                  title="Concluir tarefa"
                >
                  <span className="h-4 w-4 rounded-full border border-current" />
                </button>
              ) : (
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${
                  item.status === 'CONCLUIDO'
                    ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}>
                  <Check size={17} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {item.isOverdue && item.status !== 'CONCLUIDO' && (
                    <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                      Atrasado
                    </span>
                  )}

                  <h3 className={`mt-2 text-base font-black leading-tight ${item.status === 'CONCLUIDO' ? 'text-slate-600 line-through' : 'text-slate-900'}`}>
                    {item.title}
                  </h3>

                  {item.description && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {item.description}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                    <span>Lista: <span className="font-black text-slate-700">{getTaskListLabelFromItem(item, taskLists)}</span></span>
                    <span>Prioridade: <span className="font-black text-slate-700">{getPriorityLabel(item.priority)}</span></span>
                    <span>{displayDateLabel}: <span className="font-black text-slate-700">{formatDateTime(displayDate)}</span></span>
                    {item.responsibleName && (
                      <span>Responsavel: <span className="font-black text-slate-700">{item.responsibleName}</span></span>
                    )}
                    {requiresApproval && item.status !== 'CONCLUIDO' && (
                      <span className="text-amber-700">Exige aprovacao</span>
                    )}
                    {requiresComment && item.status !== 'CONCLUIDO' && (
                      <span className="text-slate-600">Pede comentario</span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {renderActions(item).slice(canComplete ? 1 : 0)}
                </div>
              </div>
            </div>
          </div>
        </article>
      );
    }

    return (
      <article
        key={`${sectionKey}-${item.id}`}
        className={`rounded-[26px] border p-5 transition-all ${
          item.isOverdue
            ? 'border-red-200 bg-red-50/40'
            : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${TYPE_STYLES[item.sourceType]}`}>
                {getSourceLabel(item.sourceType)}
              </span>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${STATUS_STYLES[item.status]}`}>
                {getStatusLabel(item.status)}
              </span>
            </div>

            <div className="mt-3">
              <h3 className="text-base font-black leading-tight text-slate-900">{item.title}</h3>
              {item.subtitle && (
                <p className="mt-1 text-sm font-semibold text-slate-600">{item.subtitle}</p>
              )}
            </div>
          </div>

          <div className="rounded-[20px] bg-slate-100 px-4 py-3 text-left xl:min-w-[160px] xl:text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {displayDateLabel}
            </p>
            <p className="mt-2 text-sm font-black text-slate-800">{formatDateTime(displayDate)}</p>
          </div>
        </div>

        {item.description && item.sourceType !== 'PROTOCOLO' && (
          <div className={`mt-3 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isRepickItem ? 'bg-orange-50 text-orange-800' : 'bg-slate-50 text-slate-600'
          }`}>
            {item.description}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
          <span>Responsavel: <span className="font-black text-slate-700">{item.responsibleName || 'Nao atribuido'}</span></span>
          <span>Cliente: <span className="font-black text-slate-700">{item.clientName || item.category}</span></span>
          {!isRepickItem && (
            <span>
              {item.sourceType === 'PROTOCOLO'
                ? <>SLA: <span className="font-black text-slate-700">{formatOpenDuration(item.startsAt)} aberto</span></>
                : <>Categoria: <span className="font-black text-slate-700">{item.category}</span></>}
            </span>
          )}
          {!isRepickItem && (
            <span>
              {item.sourceType === 'VISITA'
                ? <>Ordem: <span className="font-black text-slate-700">{item.metadata?.original?.orderIndex || '-'}</span></>
                : requiresApproval
                  ? 'Exige aprovacao'
                  : requiresComment
                    ? 'Pede comentario ao concluir'
                    : item.id.startsWith('queue:')
                      ? 'Ja esta na fila'
                      : 'Fluxo normal'}
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {renderActions(item)}
        </div>

        {originalTask?.template?.title && (
          <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
            Template base: <span className="font-black text-slate-700">{originalTask.template.title}</span>
          </div>
        )}
      </article>
    );
  };

  const renderTaskSectionContent = (section: AgendaSectionConfig) => {
    if (!isTaskSection(section)) return null;

    const sectionKey = section.key;
    const filters = taskSectionFilters[sectionKey] || DEFAULT_TASK_FILTERS;
    const pendingItems = getFilteredTaskSectionItems(section, 'pending');
    const completedItems = getFilteredTaskSectionItems(section, 'completed');
    const completedExpanded = Boolean(expandedCompletedSections[sectionKey]);
    const categories = Array.from(new Set(section.items.map(item => item.category).filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const responsibleOptions = Array.from(
      new Map(
        section.items
          .filter(item => item.responsibleId)
          .map(item => [item.responsibleId, { id: item.responsibleId as string, name: item.responsibleName || 'Nao atribuido' }])
      ).values()
    );

    const renderTaskGroup = (
      title: string,
      items: AgendaCentralItem[],
      emptyMessage: string,
      accentClass: string,
      statusKey: 'pending' | 'completed'
    ) => (
      <div className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{section.title}</p>
            <h4 className={`mt-1 text-lg font-black ${accentClass}`}>{title}</h4>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${statusKey === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-900 text-white'}`}>
            {items.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {items.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm font-semibold text-slate-400">
              {emptyMessage}
            </div>
          ) : (
            items.map(item => renderAgendaCard(item, `${section.key}-${statusKey}`))
          )}
        </div>
      </div>
    );

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.5fr)_220px_220px]">
          <input
            value={filters.search}
            onChange={event => updateTaskSectionFilter(sectionKey, 'search', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-400"
            placeholder="Buscar tarefa, cliente, responsavel ou descricao"
          />
          <select
            value={filters.category}
            onChange={event => updateTaskSectionFilter(sectionKey, 'category', event.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-400"
          >
            <option value="ALL">Todas as categorias</option>
            {categories.map(category => (
              <option key={`${section.key}-${category}`} value={category}>{category}</option>
            ))}
          </select>
          {isManager(user) ? (
            <select
              value={filters.responsibleId}
              onChange={event => updateTaskSectionFilter(sectionKey, 'responsibleId', event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-400"
            >
              <option value="ALL">Todos os responsaveis</option>
              {responsibleOptions.map(option => (
                <option key={`${section.key}-${option.id}`} value={option.id}>{option.name}</option>
              ))}
            </select>
          ) : (
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
              Data filtrada pelo calendario
            </div>
          )}
        </div>

        {renderTaskGroup(
          'Pendentes',
          pendingItems,
          'Nenhuma tarefa pendente com esses filtros.',
          'text-slate-900',
          'pending'
        )}
        <div className="rounded-[24px] border border-slate-200 bg-white">
          <button
            onClick={() => setExpandedCompletedSections(current => ({
              ...current,
              [sectionKey]: !current[sectionKey]
            }))}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Subpasta</p>
              <h4 className="mt-1 text-base font-black text-emerald-700">Concluidas</h4>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                {completedItems.length}
              </span>
              <span className="rounded-full bg-slate-100 p-2 text-slate-500">
                {completedExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </span>
            </div>
          </button>

          {completedExpanded && (
            <div className="border-t border-slate-100 px-5 pb-5 pt-4">
              {renderTaskGroup(
                'Concluidas',
                completedItems,
                isManager(user)
                  ? 'Nenhuma tarefa concluida encontrada com esses filtros.'
                  : 'Nenhuma tarefa sua concluida encontrada com esses filtros.',
                'text-emerald-700',
                'completed'
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleSelectSection = (sectionKey: string) => {
    setActiveSectionKey(sectionKey);

    const targetSection = sections.find(section => section.key === sectionKey);
    if (isTaskSection(targetSection)) {
      setQuickTaskForm(current => ({
        ...current,
        listKey: !isManager(user)
          ? (targetSection?.taskListId ? 'CUSTOM' : 'MINHAS')
          : mapSectionToQuickTaskList(sectionKey),
        dueDate: selectedDate,
        dueTime: DEFAULT_TASK_TIME,
        weeklyDays: [getWeekdayCodeFromDateKey(selectedDate)],
        taskListId: targetSection?.taskListId || ''
      }));
    }
  };

  const handleQuickTaskSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!quickTaskForm.title.trim()) {
      alert('Escreva a tarefa antes de salvar.');
      return;
    }

    if (quickTaskForm.listKey === 'ATRIBUIDAS' && !quickTaskForm.assignedUserId) {
      alert('Selecione o operador que vai receber a tarefa.');
      return;
    }

    if (!isManager(user) && quickTaskForm.listKey !== 'MINHAS') {
      if (quickTaskForm.listKey !== 'CUSTOM') {
        alert('Somente gestores podem criar tarefas para outros operadores ou para o setor.');
        return;
      }
    }

    if (quickTaskForm.listKey === 'CUSTOM' && !quickTaskForm.taskListId) {
      alert('Selecione uma lista personalizada para salvar a tarefa.');
      return;
    }

    setProcessing(true);
    try {
      const selectedTaskList = taskLists.find(list => list.id === quickTaskForm.taskListId) || null;
      const dueAt = quickTaskForm.dueDate
        ? new Date(buildScheduledForValue(quickTaskForm.dueDate, quickTaskForm.dueTime || DEFAULT_TASK_TIME)).toISOString()
        : null;

      const listMeta = quickTaskForm.listKey === 'MINHAS'
        ? {
          category: 'PESSOAL',
          taskScope: 'PESSOAL' as const,
          assignMode: 'SPECIFIC' as const,
          assignConfig: { userIds: [user.id] },
          assignedToIds: [user.id]
        }
        : quickTaskForm.listKey === 'ATRIBUIDAS'
          ? {
            category: 'ATRIBUIDA',
            taskScope: 'SETOR' as const,
            assignMode: 'SPECIFIC' as const,
            assignConfig: { userIds: [quickTaskForm.assignedUserId] },
            assignedToIds: [quickTaskForm.assignedUserId]
          }
          : quickTaskForm.listKey === 'CUSTOM'
            ? {
              category: selectedTaskList?.name || 'Lista personalizada',
              taskScope: 'PESSOAL' as const,
              assignMode: 'SPECIFIC' as const,
              assignConfig: { userIds: [user.id] },
              assignedToIds: [user.id]
            }
          : {
            category: 'SETOR',
            taskScope: 'SETOR' as const,
            assignMode: 'ROLE' as const,
            assignConfig: { roles: [UserRole.OPERATOR] },
            assignedToIds: undefined
          };

      if (quickTaskForm.recurrenceType !== 'NONE') {
        await dataService.saveTaskTemplate({
          title: quickTaskForm.title.trim(),
          category: listMeta.category,
          taskScope: listMeta.taskScope,
          recurrenceType: quickTaskForm.recurrenceType,
          recurrenceConfig: {
            start_date: quickTaskForm.dueDate,
            weekdays: quickTaskForm.recurrenceType === 'WEEKLY' ? quickTaskForm.weeklyDays : undefined,
            day_of_month: quickTaskForm.recurrenceType === 'MONTHLY' ? Number(quickTaskForm.dueDate.slice(-2)) : undefined
          },
          defaultPriority: 'MEDIUM',
          defaultDueTime: quickTaskForm.dueTime,
          createdBy: user.id,
          isActive: true,
          assignMode: listMeta.assignMode,
          assignConfig: listMeta.assignConfig
        });
        await dataService.syncTaskRecurringInstances();
      } else {
        await dataService.createInternalTasks({
          title: quickTaskForm.title.trim(),
          category: listMeta.category,
          priority: 'MEDIUM',
          dueAt,
          startsAt: dueAt,
          assignedBy: user.id,
          taskScope: listMeta.taskScope,
          assignMode: listMeta.assignMode,
          assignConfig: listMeta.assignConfig,
          assignedToIds: listMeta.assignedToIds
        });
      }

      publishAgendaRefresh({
        source: 'calendar-quick-task',
        entity: 'task_instance'
      });
      await loadData();
      setQuickTaskForm(current => ({
        ...current,
        title: '',
        dueDate: selectedDate,
        dueTime: DEFAULT_TASK_TIME,
        recurrenceType: 'NONE',
        weeklyDays: [getWeekdayCodeFromDateKey(selectedDate)],
        assignedUserId: user.id,
        taskListId: current.listKey === 'CUSTOM' ? current.taskListId : ''
      }));
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel salvar a tarefa.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateTaskList = async () => {
    if (!taskListName.trim()) {
      alert('Informe o nome da nova lista.');
      return;
    }

    setProcessing(true);
    try {
      const createdList = await dataService.createTaskList({
        name: taskListName.trim(),
        ownerUserId: user.id,
        createdBy: user.id
      });

      setTaskLists(current => [...current, createdList].sort((left, right) => left.name.localeCompare(right.name)));
      setTaskListName('');
      setIsTaskListModalOpen(false);
      setActiveSectionKey(`custom-list:${createdList.id}`);
      setQuickTaskForm(current => ({
        ...current,
        listKey: 'CUSTOM',
        taskListId: createdList.id
      }));
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel criar a lista.');
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTaskList = async () => {
    if (!deleteTaskListTarget?.id) return;

    setProcessing(true);
    try {
      await dataService.archiveTaskList(deleteTaskListTarget.id);
      setTaskLists(current => current.filter(list => list.id !== deleteTaskListTarget.id));
      setDeleteTaskListTarget(null);
      setActiveSectionKey('minhas');
      setQuickTaskForm(current => ({
        ...current,
        listKey: 'MINHAS',
        taskListId: ''
      }));
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel excluir a lista.');
    } finally {
      setProcessing(false);
    }
  };

  const renderQuickTaskComposer = () => {
    const canCreateHere = isManager(user) || quickTaskForm.listKey === 'MINHAS' || quickTaskForm.listKey === 'CUSTOM';
    const customTaskListOptions = taskLists.filter(list => list.active);

    return (
      <form onSubmit={handleQuickTaskSubmit} className="rounded-[30px] border border-slate-200 bg-slate-50/80 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-[24px] bg-white px-4 py-3">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 text-slate-400">
              <Check size={16} />
            </div>
            <input
              value={quickTaskForm.title}
              onChange={event => setQuickTaskForm(current => ({ ...current, title: event.target.value }))}
              className="min-w-0 flex-1 bg-transparent text-base font-semibold text-slate-800 outline-none placeholder:text-slate-400"
              placeholder="Adicionar tarefa de forma rapida e objetiva"
            />
            <button
              type="submit"
              disabled={processing || !canCreateHere}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
            >
              {processing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Salvar
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[220px_160px_150px_200px]">
            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              <Layers3 size={16} className="text-slate-400" />
              <select
                value={quickTaskForm.listKey}
                onChange={event => {
                  const nextListKey = event.target.value as QuickTaskListKey;
                  setQuickTaskForm(current => ({
                    ...current,
                    listKey: nextListKey,
                    taskListId: nextListKey === 'CUSTOM' ? (current.taskListId || customTaskListOptions[0]?.id || '') : '',
                    weeklyDays: current.recurrenceType === 'WEEKLY'
                      ? current.weeklyDays
                      : [getWeekdayCodeFromDateKey(current.dueDate)]
                  }));
                }}
                className="w-full bg-transparent font-semibold text-slate-700 outline-none"
              >
                <option value="MINHAS">{getQuickTaskListLabel('MINHAS')}</option>
                {isManager(user) && <option value="ATRIBUIDAS">{getQuickTaskListLabel('ATRIBUIDAS')}</option>}
                {isManager(user) && <option value="SETOR">{getQuickTaskListLabel('SETOR')}</option>}
                {customTaskListOptions.length > 0 && <option value="CUSTOM">{getQuickTaskListLabel('CUSTOM')}</option>}
              </select>
            </label>

            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              <CalendarIcon size={16} className="text-slate-400" />
              <input
                type="date"
                value={quickTaskForm.dueDate}
                onChange={event => setQuickTaskForm(current => ({
                  ...current,
                  dueDate: event.target.value,
                  weeklyDays: current.recurrenceType === 'WEEKLY' && current.weeklyDays.length === 0
                    ? [getWeekdayCodeFromDateKey(event.target.value)]
                    : current.weeklyDays
                }))}
                className="w-full bg-transparent font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              <Clock size={16} className="text-slate-400" />
              <input
                type="time"
                value={quickTaskForm.dueTime}
                onChange={event => setQuickTaskForm(current => ({ ...current, dueTime: event.target.value }))}
                className="w-full bg-transparent font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
              <RotateCcw size={16} className="text-slate-400" />
              <select
                value={quickTaskForm.recurrenceType}
                onChange={event => {
                  const nextRecurrence = event.target.value as TaskRecurrenceType;
                  setQuickTaskForm(current => ({
                    ...current,
                    recurrenceType: nextRecurrence,
                    weeklyDays: nextRecurrence === 'WEEKLY'
                      ? (current.weeklyDays.length > 0 ? current.weeklyDays : [getWeekdayCodeFromDateKey(current.dueDate)])
                      : current.weeklyDays
                  }));
                }}
                className="w-full bg-transparent font-semibold text-slate-700 outline-none"
              >
                <option value="NONE">Sem recorrencia</option>
                <option value="DAILY">Diaria</option>
                <option value="WEEKDAYS">Dias uteis</option>
                <option value="WEEKLY">Semanal</option>
                <option value="MONTHLY">Mensal</option>
              </select>
            </label>
          </div>

          {quickTaskForm.recurrenceType === 'WEEKLY' && (
            <div className="rounded-2xl bg-white px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Dia da semana</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(option => {
                  const selected = quickTaskForm.weeklyDays.includes(option.key);
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setQuickTaskForm(current => {
                        const hasDay = current.weeklyDays.includes(option.key);
                        const nextDays = hasDay
                          ? current.weeklyDays.filter(day => day !== option.key)
                          : [...current.weeklyDays, option.key];

                        return {
                          ...current,
                          weeklyDays: nextDays.length > 0 ? nextDays : [option.key]
                        };
                      })}
                      className={`rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                        selected ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {quickTaskForm.listKey === 'CUSTOM' && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                <Layers3 size={16} className="text-slate-400" />
                <select
                  value={quickTaskForm.taskListId}
                  onChange={event => setQuickTaskForm(current => ({ ...current, taskListId: event.target.value }))}
                  className="w-full bg-transparent font-semibold text-slate-700 outline-none"
                >
                  <option value="">Selecionar lista</option>
                  {customTaskListOptions.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setIsTaskListModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50"
              >
                <Plus size={14} />
                Nova lista
              </button>
            </div>
          )}

          {quickTaskForm.listKey === 'CUSTOM' && quickTaskForm.taskListId && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const selectedList = customTaskListOptions.find(list => list.id === quickTaskForm.taskListId);
                  if (selectedList) setDeleteTaskListTarget(selectedList);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-red-600 transition-colors hover:bg-red-50"
              >
                <X size={14} />
                Excluir lista
              </button>
            </div>
          )}

          {isManager(user) && quickTaskForm.listKey === 'ATRIBUIDAS' && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
              <label className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-600">
                <User size={16} className="text-slate-400" />
                <select
                  value={quickTaskForm.assignedUserId}
                  onChange={event => setQuickTaskForm(current => ({ ...current, assignedUserId: event.target.value }))}
                  className="w-full bg-transparent font-semibold text-slate-700 outline-none"
                >
                  <option value="">Selecionar usuario</option>
                  {assignableUsers.map(operator => (
                    <option key={operator.id} value={operator.id}>{operator.name}</option>
                  ))}
                </select>
              </label>
              <div className="rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-slate-500">
                Tarefa individual atribuida a um usuario especifico.
              </div>
            </div>
          )}

          {isManager(user) && quickTaskForm.listKey === 'SETOR' && (
            <div className="rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-slate-500">
              Esta opcao cria a mesma demanda para todos os operadores ativos. Para regras mais especificas por time ou setor, use o botao <span className="font-black text-slate-700">Nova demanda</span>.
            </div>
          )}

          {!isManager(user) && quickTaskForm.listKey !== 'MINHAS' && (
            <div className="rounded-2xl bg-white px-4 py-3 text-xs font-semibold text-slate-500">
              Esse espaco recebe o que foi atribuido pelo gestor. Operadores criam tarefas rapidas apenas na lista pessoal.
            </div>
          )}
        </div>
      </form>
    );
  };

  const renderActiveSectionContent = () => {
    if (!activeSection) {
      return (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <CalendarIcon size={34} className="mx-auto text-slate-300" />
          <p className="mt-4 text-sm font-semibold text-slate-500">Selecione uma lista para comecar.</p>
        </div>
      );
    }

    if (isTaskSection(activeSection)) {
      return renderTaskSectionContent(activeSection);
    }

    if (activeSection.items.length === 0) {
      return (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center">
          <CalendarIcon size={34} className="mx-auto text-slate-300" />
          <h3 className="mt-4 text-xl font-black tracking-tight text-slate-700">{activeSection.title}</h3>
          <p className="mt-2 text-sm font-semibold text-slate-500">{activeSection.emptyMessage}</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {activeSection.items.map(item => renderAgendaCard(item, activeSection.key))}
      </div>
    );
  };

  return (
    <div className="pb-10">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
            <div className="bg-slate-900 px-6 py-6 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">Agenda</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">Central do dia</h1>
              <p className="mt-2 text-sm text-slate-300">
                {isManager(user)
                  ? 'Selecione a data e acompanhe tarefas, repiques e visitas no painel ao lado.'
                  : 'Selecione a data e acompanhe tarefas e visitas no painel ao lado.'}
              </p>
            </div>

            <div className="space-y-6 p-6">
              <div className="grid gap-3">
                <button
                  onClick={() => openInternalTaskModal(null, true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-emerald-400"
                >
                  <Plus size={15} />
                  Minha tarefa
                </button>
                {isManager(user) && (
                  <button
                    onClick={() => openInternalTaskModal(null, false)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500"
                  >
                    <Users size={15} />
                    Nova demanda
                  </button>
                )}
                <button
                  onClick={() => setIsManualScheduleModalOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-orange-400"
                >
                  <CalendarIcon size={15} />
                  Novo agendamento
                </button>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <button
                    onClick={previousMonth}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-orange-600"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-700">
                    {calendarDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                  </p>
                  <button
                    onClick={nextMonth}
                    className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-orange-600"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1">
                  {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((dayLabel, index) => (
                    <div key={`weekday-${index}-${dayLabel}`} className="flex h-8 items-center justify-center text-[10px] font-black text-slate-300">
                      {dayLabel}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {monthDays.map((day, index) => {
                    if (!day) {
                      return <div key={`empty-${index}`} className="h-12" />;
                    }

                    const dayKey = getLocalDateKey(day);
                    const insight = dayInsights.get(dayKey);
                    const isSelected = dayKey === selectedDate;
                    const isToday = dayKey === todayKey;

                    return (
                      <button
                        key={dayKey}
                        onClick={() => {
                          setSelectedDate(dayKey);
                          setCalendarDate(new Date(day.getFullYear(), day.getMonth(), 1));
                        }}
                        className={`relative h-14 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'border-orange-500 bg-orange-500 text-white shadow-lg shadow-orange-200'
                            : insight?.overdue
                              ? 'border-red-200 bg-red-50/40 text-slate-700 hover:border-red-300'
                              : 'border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-slate-100'
                        } ${isToday && !isSelected ? 'ring-2 ring-orange-100' : ''}`}
                      >
                        <div className="flex h-full flex-col justify-between px-2 py-2">
                          <div className="flex items-start justify-between">
                            <span className="text-xs font-black">{day.getDate()}</span>
                            {insight?.total ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                              }`}>
                                {insight.total}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1">
                            {insight?.repiques ? <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-orange-500'}`} /> : null}
                            {insight?.visitas ? <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/70' : 'bg-sky-500'}`} /> : null}
                            {insight?.tarefas ? <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/60' : 'bg-emerald-500'}`} /> : null}
                            {insight?.mine ? <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white/50' : 'bg-slate-900'}`} /> : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Data selecionada</p>
                <h2 className="mt-2 text-lg font-black capitalize tracking-tight text-slate-900">{selectedDateLabel}</h2>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Itens</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{selectedDaySummary.total}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minhas</p>
                    <p className="mt-2 text-xl font-black text-orange-700">{selectedDaySummary.minhas}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {isManager(user) ? 'Repiques' : 'Atribuidas'}
                    </p>
                    <p className={`mt-2 text-xl font-black ${isManager(user) ? 'text-orange-700' : 'text-slate-900'}`}>
                      {isManager(user) ? selectedDaySummary.repiques : selectedDaySummary.atribuidas}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tarefas</p>
                    <p className="mt-2 text-xl font-black text-emerald-600">{selectedDaySummary.tarefas}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      const today = new Date();
                      setCalendarDate(new Date(today.getFullYear(), today.getMonth(), 1));
                      setSelectedDate(todayKey);
                    }}
                    className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={handleRefresh}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    Atualizar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hoje</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{summary.totalToday}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Atrasados</p>
                  <p className="mt-2 text-lg font-black text-red-600">{summary.atrasados}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minhas</p>
                  <p className="mt-2 text-lg font-black text-orange-700">{summary.minhasTarefas}</p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <div className="overflow-hidden rounded-[32px] border border-slate-100 bg-white shadow-sm">
            <div className="grid grid-cols-1 2xl:grid-cols-[290px_minmax(0,1fr)]">
              <aside className="border-b border-slate-100 bg-slate-50/80 p-5 2xl:border-b-0 2xl:border-r">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Listas do dia</p>
                  <h2 className="mt-2 text-2xl font-black capitalize tracking-tight text-slate-900">{selectedDateLabel}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {isManager(user)
                      ? 'Escolha um topico e trabalhe em uma lista por vez.'
                      : 'Escolha uma lista e execute o que foi direcionado para voce.'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-400">
                    Arraste as listas para reorganizar do seu jeito.
                  </p>
                  <button
                    onClick={() => setIsTaskListModalOpen(true)}
                    className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    <Plus size={14} />
                    Nova lista
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Itens</p>
                    <p className="mt-2 text-xl font-black text-slate-900">{selectedDaySummary.total}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Minhas</p>
                    <p className="mt-2 text-xl font-black text-orange-700">{selectedDaySummary.minhas}</p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      {isManager(user) ? 'Repiques' : 'Atribuidas'}
                    </p>
                    <p className={`mt-2 text-xl font-black ${isManager(user) ? 'text-orange-700' : 'text-slate-900'}`}>
                      {isManager(user) ? selectedDaySummary.repiques : selectedDaySummary.atribuidas}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tarefas</p>
                    <p className="mt-2 text-xl font-black text-emerald-700">{selectedDaySummary.tarefas}</p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  {orderedSections.map(section => {
                    const Icon = section.icon;
                    const active = activeSection?.key === section.key;
                    const pendingCount = section.items.filter(item => isInternalTaskItem(item) && item.status !== 'CONCLUIDO' && item.status !== 'CANCELADO').length;
                    return (
                      <div
                        key={section.key}
                        draggable
                        onDragStart={event => handleSectionDragStart(event, section.key)}
                        onDragOver={event => handleSectionDragOver(event, section.key)}
                        onDrop={event => handleSectionDrop(event, section.key)}
                        onDragEnd={handleSectionDragEnd}
                        className={`rounded-[26px] transition-all ${
                          draggedSectionKey === section.key
                            ? 'opacity-70'
                            : ''
                        } ${
                          dragOverSectionKey === section.key && draggedSectionKey !== section.key
                            ? 'bg-orange-50 ring-2 ring-orange-200 ring-offset-2 ring-offset-slate-50'
                            : ''
                        }`}
                      >
                        <button
                          onClick={() => handleSelectSection(section.key)}
                          className={`flex w-full items-center justify-between gap-3 rounded-[24px] border px-4 py-4 text-left transition-all ${
                            active
                              ? 'border-slate-900 bg-white shadow-sm'
                              : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className={`rounded-2xl p-3 ${active ? section.accentClass : 'bg-white text-slate-500'}`}>
                              <Icon size={16} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900">{section.title}</p>
                              <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                {isTaskSection(section)
                                  ? `${pendingCount} pendentes`
                                  : section.hint}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${active ? section.countClass : 'bg-white text-slate-600'}`}>
                              {section.items.length}
                            </span>
                            <span className="rounded-full bg-white p-2 text-slate-400">
                              <GripVertical size={14} />
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0 p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Area util</p>
                    <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
                      {activeSection?.title || 'Central do dia'}
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm text-slate-500">
                      {activeSection?.hint || 'Selecione uma lista para visualizar o conteudo do dia.'}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-500">
                    Atualizado em{' '}
                    <span className="font-black text-slate-700">
                      {lastRefreshAt ? formatDateTime(lastRefreshAt) : '-'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                  <span className="rounded-full bg-slate-100 px-3 py-2 text-slate-600">Selecionado {selectedDateLabel}</span>
                  {activeSection ? getSectionBadges(activeSection).map(badge => (
                    <span
                      key={`${activeSection.key}-${badge.label}`}
                      className={`rounded-full px-3 py-2 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  )) : null}
                </div>

                {activeSection && isTaskSection(activeSection) && (isManager(user) || activeSection.key === 'minhas' || activeSection.taskListId) && (
                  <div className="mt-5">
                    {renderQuickTaskComposer()}
                  </div>
                )}

                {activeSection && isTaskSection(activeSection) && !isManager(user) && activeSection.key !== 'minhas' && !activeSection.taskListId && (
                  <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-500">
                    Essa lista mostra o que foi direcionado para voce. Para criar algo rapido seu, use a lista <span className="font-black text-slate-700">Minhas tarefas</span>.
                  </div>
                )}

                <div className="mt-6">
                  {loading ? (
                    <div className="rounded-[32px] border border-slate-100 bg-slate-50 px-6 py-20 text-center">
                      <Loader2 size={34} className="mx-auto animate-spin text-orange-500" />
                      <p className="mt-4 text-sm font-black uppercase tracking-[0.22em] text-slate-400">Carregando agenda</p>
                    </div>
                  ) : (
                    renderActiveSectionContent()
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isTaskListModalOpen && (
        <ModalShell
          title="Nova lista de tarefas"
          subtitle="Crie uma lista personalizada para agrupar tarefas unicas de uma atividade especifica."
          onClose={() => {
            setIsTaskListModalOpen(false);
            setTaskListName('');
          }}
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nome da lista</label>
              <input
                value={taskListName}
                onChange={event => setTaskListName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                placeholder="Ex: Fechamento mensal, conferencia tecnica, follow-up premium"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
              As tarefas dessa lista ficam organizadas no painel lateral como uma lista propria, sem misturar com as listas padrao.
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setIsTaskListModalOpen(false);
                  setTaskListName('');
                }}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateTaskList}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar lista
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {deleteTaskListTarget && (
        <ModalShell
          title="Excluir lista"
          subtitle={deleteTaskListTarget.name}
          onClose={() => setDeleteTaskListTarget(null)}
        >
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
              A lista sera removida da lateral. As tarefas que ja existem nela continuam no sistema e voltam para o fluxo geral de tarefas pessoais.
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteTaskListTarget(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteTaskList}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Excluir
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {isManualScheduleModalOpen && (
        <ManualScheduleModal
          onClose={() => setIsManualScheduleModalOpen(false)}
          onSuccess={async () => {
            publishAgendaRefresh({ source: 'calendar-manual-schedule', entity: 'call_schedule' });
            await loadData();
          }}
          user={user}
        />
      )}

      {isInternalTaskModalOpen && (
        <InternalTaskModal
          user={user}
          users={users}
          teams={teams}
          task={selectedInternalTask}
          selfOnly={internalTaskSelfOnly}
          onClose={() => {
            setIsInternalTaskModalOpen(false);
            setSelectedInternalTask(null);
            setInternalTaskSelfOnly(false);
          }}
          onSuccess={async () => {
            publishAgendaRefresh({ source: 'calendar-internal-task', entity: 'task_instance' });
            await loadData();
          }}
        />
      )}

      {approveTarget && (
        <ModalShell
          title={`Aprovar ${buildScheduleLabel(approveTarget)}`}
          subtitle={approveTarget.clientName || approveTarget.scheduleReason || 'Item da agenda'}
          onClose={() => setApproveTarget(null)}
        >
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <p className="font-black text-slate-800">{approveTarget.clientName || 'Cliente nao identificado'}</p>
              <p className="mt-2">{approveTarget.skipReason || approveTarget.scheduleReason || 'Sem contexto adicional.'}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Data</label>
                <input
                  type="date"
                  value={approveForm.date}
                  onChange={event => setApproveForm(current => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Horario (opcional)</label>
                <input
                  type="time"
                  value={approveForm.time}
                  onChange={event => setApproveForm(current => ({ ...current, time: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de chamada</label>
              <select
                value={approveForm.type}
                onChange={event => setApproveForm(current => ({ ...current, type: event.target.value as CallType }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
              >
                {Object.values(CallType)
                  .filter(type => type !== CallType.WHATSAPP)
                  .map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Atribuir para</label>
              <select
                value={approveForm.operatorId}
                onChange={event => setApproveForm(current => ({ ...current, operatorId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
              >
                {assignableUsers.map(operator => (
                  <option key={operator.id} value={operator.id}>{operator.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => setApproveTarget(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleApproveSchedule}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-orange-400 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Aprovar e enviar
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {rescheduleTarget && (
        <ModalShell
          title="Reagendar item"
          subtitle={rescheduleTarget.title}
          onClose={() => setRescheduleTarget(null)}
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nova data</label>
                <input
                  type="date"
                  value={rescheduleForm.date}
                  onChange={event => setRescheduleForm(current => ({ ...current, date: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Novo horario (opcional)</label>
                <input
                  type="time"
                  value={rescheduleForm.time}
                  onChange={event => setRescheduleForm(current => ({ ...current, time: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                />
              </div>
            </div>

            {isManager(user) && ['schedule:', 'queue:'].some(prefix => rescheduleTarget.id.startsWith(prefix)) && (
              <div>
                <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Operador</label>
                <select
                  value={rescheduleForm.operatorId}
                  onChange={event => setRescheduleForm(current => ({ ...current, operatorId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
                >
                  {assignableUsers.map(operator => (
                    <option key={operator.id} value={operator.id}>{operator.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Observacao</label>
              <textarea
                value={rescheduleForm.note}
                onChange={event => setRescheduleForm(current => ({ ...current, note: event.target.value }))}
                className="h-28 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none focus:border-orange-400"
                placeholder="Justificativa, orientacao operacional ou nota interna."
              />
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => setRescheduleTarget(null)}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReschedule}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                Confirmar
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {completionTarget && (
        <ModalShell
          title="Concluir tarefa"
          subtitle={completionTarget.title}
          onClose={() => {
            setCompletionTarget(null);
            setCompletionNote('');
          }}
        >
          <div className="space-y-5">
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600">
              {completionTarget.metadata?.requiresCommentOnCompletion || completionTarget.template?.requiresCommentOnCompletion
                ? 'Esta tarefa exige um comentario de conclusao.'
                : 'Voce pode registrar um breve comentario opcional antes de concluir.'}
            </div>

            <textarea
              value={completionNote}
              onChange={event => setCompletionNote(event.target.value)}
              className="h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-700 outline-none focus:border-orange-400"
              placeholder="Descreva a entrega, bloqueio resolvido ou contexto final."
            />

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setCompletionTarget(null);
                  setCompletionNote('');
                }}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCompleteTask}
                disabled={processing}
                className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Confirmar conclusao
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {reassignTarget && (
        <ModalShell
          title="Reatribuir tarefa"
          subtitle={reassignTarget.title}
          onClose={() => {
            setReassignTarget(null);
            setReassignUserId('');
          }}
        >
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Novo responsavel</label>
              <select
                value={reassignUserId}
                onChange={event => setReassignUserId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-700 outline-none focus:border-orange-400"
              >
                <option value="">Selecione um operador</option>
                {assignableUsers.map(operator => (
                  <option key={operator.id} value={operator.id}>{operator.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setReassignTarget(null);
                  setReassignUserId('');
                }}
                className="rounded-2xl border border-slate-200 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleReassignTask}
                disabled={processing || !reassignUserId}
                className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {processing ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
                Salvar atribuicao
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default Calendar;
