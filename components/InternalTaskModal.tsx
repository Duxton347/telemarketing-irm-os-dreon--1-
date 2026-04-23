import React from 'react';
import { CalendarDays, ClipboardList, Loader2, Save, UserCircle2, Users, X } from 'lucide-react';
import { dataService } from '../services/dataService';
import { OperationTeam, TaskActivityLog, TaskInstance, TaskPriority, TaskRecurrenceType, TaskTemplate, User, UserRole } from '../types';
import { getTaskAssignableUsers } from '../utils/taskAssignment';

type InternalTaskModalProps = {
  user: User;
  users: User[];
  teams: OperationTeam[];
  task?: TaskInstance | null;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  selfOnly?: boolean;
};

const WEEKDAY_OPTIONS = [
  { key: 'MON', label: 'Seg' },
  { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' },
  { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' }
];

const getDefaultDueParts = (value?: string | null) => {
  if (!value) {
    const now = new Date();
    return {
      date: now.toISOString().split('T')[0],
      time: '09:00'
    };
  }

  const date = new Date(value);
  return {
    date: date.toISOString().split('T')[0],
    time: date.toISOString().slice(11, 16)
  };
};

export const InternalTaskModal: React.FC<InternalTaskModalProps> = ({
  user,
  users,
  teams,
  task,
  onClose,
  onSuccess,
  selfOnly = false
}) => {
  const defaultDue = React.useMemo(() => getDefaultDueParts(task?.dueAt), [task?.dueAt]);
  const [loading, setLoading] = React.useState(false);
  const [logs, setLogs] = React.useState<TaskActivityLog[]>([]);
  const [assigneeSearch, setAssigneeSearch] = React.useState('');
  const [form, setForm] = React.useState({
    title: task?.title || '',
    description: task?.description || '',
    category: task?.category || 'OPERACIONAL',
    priority: task?.priority || 'MEDIUM' as TaskPriority,
    taskScope: (task?.metadata?.taskScope || (selfOnly ? 'PESSOAL' : 'SETOR')) as TaskTemplate['taskScope'],
    assignMode: (selfOnly ? 'SPECIFIC' : (task?.metadata?.assignMode || 'SPECIFIC')) as TaskTemplate['assignMode'],
    selectedUserIds: task?.assignedTo ? [task.assignedTo] : (selfOnly ? [user.id] : []),
    selectedRole: UserRole.OPERATOR,
    selectedTeamId: user.teamId || '',
    selectedSectorCode: user.sectorCode || '',
    dueDate: defaultDue.date,
    dueTime: defaultDue.time,
    recurrenceType: 'NONE' as TaskRecurrenceType,
    weeklyDays: ['MON'] as string[],
    isAccumulative: false,
    generateOnlyIfPreviousClosed: false,
    requiresApproval: Boolean(task?.metadata?.requiresApproval),
    requiresCommentOnCompletion: Boolean(task?.metadata?.requiresCommentOnCompletion)
  });

  React.useEffect(() => {
    if (!task?.id) return;

    dataService.getTaskActivityLogs(task.id)
      .then(setLogs)
      .catch(error => console.error('Erro ao carregar historico da tarefa.', error));
  }, [task?.id]);

  const availableUsers = React.useMemo(
    () => getTaskAssignableUsers(users),
    [users]
  );

  const filteredAssignableUsers = React.useMemo(() => {
    const normalizedSearch = assigneeSearch.trim().toLowerCase();
    const baseUsers = selfOnly ? availableUsers.filter(candidate => candidate.id === user.id) : availableUsers;

    if (!normalizedSearch) {
      return baseUsers;
    }

    return baseUsers.filter(candidate =>
      candidate.name.toLowerCase().includes(normalizedSearch)
      || candidate.role.toLowerCase().includes(normalizedSearch)
      || (candidate.teamName || '').toLowerCase().includes(normalizedSearch)
      || (candidate.sectorCode || '').toLowerCase().includes(normalizedSearch)
    );
  }, [assigneeSearch, availableUsers, selfOnly, user.id]);

  const isManager = user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR;
  const isReadOnlyTaskView = Boolean(task && !isManager && !selfOnly);

  const handleToggleUser = (userId: string) => {
    setForm(current => ({
      ...current,
      selectedUserIds: current.selectedUserIds.includes(userId)
        ? current.selectedUserIds.filter(currentUserId => currentUserId !== userId)
        : [...current.selectedUserIds, userId]
    }));
  };

  const handleToggleWeekday = (weekday: string) => {
    setForm(current => ({
      ...current,
      weeklyDays: current.weeklyDays.includes(weekday)
        ? current.weeklyDays.filter(currentWeekday => currentWeekday !== weekday)
        : [...current.weeklyDays, weekday]
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return alert('Informe o titulo da tarefa.');

    setLoading(true);
    try {
      const dueAt = form.dueDate
        ? new Date(`${form.dueDate}T${form.dueTime || '09:00'}:00`).toISOString()
        : null;

      if (task?.id) {
        await dataService.updateTaskInstance(task.id, {
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category.trim(),
          priority: form.priority,
          dueAt,
          assignedTo: !selfOnly && form.selectedUserIds.length > 0 ? form.selectedUserIds[0] : task.assignedTo,
          metadata: {
            ...(task.metadata || {}),
            requiresApproval: form.requiresApproval,
            requiresCommentOnCompletion: form.requiresCommentOnCompletion,
            taskScope: form.taskScope,
            assignMode: form.assignMode
          }
        }, user.id, 'Detalhes da tarefa atualizados via Agenda Central.');
      } else if (form.recurrenceType !== 'NONE') {
        await dataService.saveTaskTemplate({
          title: form.title.trim(),
          description: form.description.trim() || null,
          category: form.category.trim(),
          taskScope: form.taskScope,
          recurrenceType: form.recurrenceType,
          recurrenceConfig: {
            start_date: form.dueDate,
            weekdays: form.recurrenceType === 'WEEKLY' ? form.weeklyDays : undefined,
            day_of_month: form.recurrenceType === 'MONTHLY' ? Number(form.dueDate.slice(-2)) : undefined
          },
          isAccumulative: form.isAccumulative,
          generateOnlyIfPreviousClosed: form.generateOnlyIfPreviousClosed,
          requiresApproval: form.requiresApproval,
          requiresCommentOnCompletion: form.requiresCommentOnCompletion,
          defaultPriority: form.priority,
          defaultDueTime: form.dueTime,
          createdBy: user.id,
          isActive: true,
          assignMode: selfOnly ? 'SPECIFIC' : form.assignMode,
          assignConfig: selfOnly ? { userIds: [user.id] } : (
            form.assignMode === 'SPECIFIC'
              ? { userIds: form.selectedUserIds }
              : form.assignMode === 'ROLE'
                ? { roles: [form.selectedRole] }
                : form.assignMode === 'TEAM'
                  ? {
                    teamId: form.selectedTeamId || null,
                    sectorCode: form.selectedSectorCode || null
                  }
                  : {}
          )
        });
        await dataService.syncTaskRecurringInstances();
      } else {
        await dataService.createInternalTasks({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim(),
          priority: form.priority,
          dueAt,
          startsAt: dueAt,
          assignedBy: user.id,
          taskScope: selfOnly ? 'PESSOAL' : form.taskScope,
          assignMode: selfOnly ? 'SPECIFIC' : form.assignMode,
          assignedToIds: selfOnly ? [user.id] : (form.assignMode === 'SPECIFIC' ? form.selectedUserIds : undefined),
          assignConfig: selfOnly ? { userIds: [user.id] } : (
            form.assignMode === 'ROLE'
              ? { roles: [form.selectedRole] }
              : form.assignMode === 'TEAM'
                ? {
                  teamId: form.selectedTeamId || null,
                  sectorCode: form.selectedSectorCode || null
                }
                : {}
          ),
          requiresApproval: form.requiresApproval,
          requiresCommentOnCompletion: form.requiresCommentOnCompletion
        });
      }

      await onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'Nao foi possivel salvar a tarefa interna.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-5xl max-h-[92vh] rounded-[36px] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between bg-slate-900 px-8 py-6 text-white">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Agenda Central</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight">
              {task ? 'Editar Tarefa Interna' : (selfOnly ? 'Nova Tarefa Pessoal' : 'Nova Demanda Interna')}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-white/10 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {isReadOnlyTaskView && task ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.9fr]">
            <div className="max-h-[calc(92vh-88px)] overflow-y-auto p-8 space-y-8">
              <div className="rounded-[28px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-medium text-amber-800">
                Demandas do setor ficam editaveis apenas para gestores. Voce pode acompanhar os detalhes aqui e concluir pela Agenda Central quando a entrega estiver pronta.
              </div>

              <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Resumo da demanda</p>
                <h4 className="mt-3 text-2xl font-black tracking-tight text-slate-900">{task.title}</h4>
                {task.description && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">{task.description}</p>
                )}

                <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-white px-3 py-2 text-slate-600">Categoria: {task.category}</span>
                  <span className="rounded-full bg-white px-3 py-2 text-slate-600">Prioridade: {task.priority}</span>
                  <span className="rounded-full bg-white px-3 py-2 text-slate-600">Prazo: {task.dueAt ? new Date(task.dueAt).toLocaleString('pt-BR') : 'Sem prazo'}</span>
                  <span className="rounded-full bg-white px-3 py-2 text-slate-600">Responsavel: {task.assignedUser?.name || 'Nao atribuido'}</span>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="text-blue-600" size={18} />
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Historico basico</h4>
                </div>

                {logs.length === 0 ? (
                  <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm font-medium text-slate-400">
                    Nenhum evento registrado ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {logs.map(log => (
                      <div key={log.id} className="rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{log.action}</p>
                        <p className="mt-2 text-sm font-bold text-slate-700">{log.note || 'Atualizacao operacional.'}</p>
                        <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          {log.actorName || 'Sistema'} - {new Date(log.createdAt).toLocaleString('pt-BR')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="border-l border-slate-100 bg-slate-50/70 p-8">
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Permissoes</p>
                <div className="mt-4 space-y-3 text-sm font-medium text-slate-600">
                  <p>Voce pode abrir, acompanhar e concluir esta demanda.</p>
                  <p>Edicao estrutural, reatribuicao e regras de recorrencia ficam com gestores.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full rounded-2xl bg-slate-900 px-4 py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl hover:bg-slate-800"
              >
                Fechar
              </button>
            </aside>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.95fr] gap-0">
          <div className="p-8 overflow-y-auto max-h-[calc(92vh-88px)] space-y-8">
            <section className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Titulo</label>
                  <input
                    value={form.title}
                    onChange={event => setForm(current => ({ ...current, title: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-slate-800 outline-none focus:border-orange-400"
                    placeholder="Ex: Confirmar documentacao do protocolo"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Categoria</label>
                  <input
                    value={form.category}
                    onChange={event => setForm(current => ({ ...current, category: event.target.value }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-bold text-slate-700 outline-none focus:border-orange-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Prioridade</label>
                  <select
                    value={form.priority}
                    onChange={event => setForm(current => ({ ...current, priority: event.target.value as TaskPriority }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-[11px] uppercase tracking-widest text-slate-700 outline-none focus:border-orange-400"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Media</option>
                    <option value="HIGH">Alta</option>
                    <option value="CRITICAL">Critica</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Descricao</label>
                  <textarea
                    value={form.description}
                    onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
                    className="w-full h-28 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-medium text-slate-700 outline-none focus:border-orange-400 resize-none"
                    placeholder="Contexto operacional, combinados e observacoes."
                  />
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="flex items-center gap-3">
                <Users className="text-blue-600" size={20} />
                <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Atribuicao e visibilidade</h4>
              </div>

              {!selfOnly && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Escopo</label>
                    <select
                      value={form.taskScope}
                      onChange={event => setForm(current => ({ ...current, taskScope: event.target.value as TaskTemplate['taskScope'] }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-[11px] uppercase tracking-widest text-slate-700 outline-none focus:border-orange-400"
                    >
                      <option value="SETOR">Setor / Time</option>
                      <option value="PESSOAL">Pessoal</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Destino</label>
                    <select
                      value={form.assignMode}
                      onChange={event => setForm(current => ({ ...current, assignMode: event.target.value as TaskTemplate['assignMode'] }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-[11px] uppercase tracking-widest text-slate-700 outline-none focus:border-orange-400"
                    >
                      <option value="SPECIFIC">Usuarios especificos</option>
                      <option value="ROLE">Por funcao</option>
                      <option value="TEAM">Por time/setor</option>
                      <option value="ALL">Todos</option>
                    </select>
                  </div>
                </div>
              )}

              {(selfOnly || form.assignMode === 'SPECIFIC') && (
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsaveis</p>
                      {!selfOnly && (
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          Selecione um ou mais funcionarios para receber esta tarefa.
                        </p>
                      )}
                    </div>
                    {!selfOnly && (
                      <div className="w-full md:max-w-xs">
                        <input
                          value={assigneeSearch}
                          onChange={event => setAssigneeSearch(event.target.value)}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-400"
                          placeholder="Buscar funcionario, time ou setor"
                        />
                      </div>
                    )}
                  </div>

                  {!selfOnly && (
                    <div className="mb-3 flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[11px] font-bold text-slate-500">
                      <span>Selecionados</span>
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
                        {form.selectedUserIds.length}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredAssignableUsers.map(candidate => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => !selfOnly && handleToggleUser(candidate.id)}
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${form.selectedUserIds.includes(candidate.id) ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`}
                      >
                        <span>
                          <span className="block font-black">{candidate.name}</span>
                          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {[candidate.role, candidate.teamName || candidate.sectorCode || null].filter(Boolean).join(' • ')}
                          </span>
                        </span>
                        <UserCircle2 size={18} />
                      </button>
                    ))}
                  </div>
                  {!selfOnly && filteredAssignableUsers.length === 0 && (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm font-semibold text-slate-400">
                      Nenhum funcionario encontrado com esse filtro.
                    </div>
                  )}
                </div>
              )}

              {!selfOnly && form.assignMode === 'ROLE' && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Funcao alvo</label>
                  <select
                    value={form.selectedRole}
                    onChange={event => setForm(current => ({ ...current, selectedRole: event.target.value as UserRole }))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-[11px] uppercase tracking-widest text-slate-700 outline-none focus:border-orange-400"
                  >
                    {Object.values(UserRole).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
              )}

              {!selfOnly && form.assignMode === 'TEAM' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Time</label>
                    <select
                      value={form.selectedTeamId}
                      onChange={event => setForm(current => ({ ...current, selectedTeamId: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-bold text-slate-700 outline-none focus:border-orange-400"
                    >
                      <option value="">Selecionar time</option>
                      {teams.filter(team => team.active).map(team => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Setor</label>
                    <input
                      value={form.selectedSectorCode}
                      onChange={event => setForm(current => ({ ...current, selectedSectorCode: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-bold text-slate-700 outline-none focus:border-orange-400"
                      placeholder="atendimento, tecnico, logistico..."
                    />
                  </div>
                </div>
              )}
            </section>

            {!task && (
              <section className="space-y-5">
                <div className="flex items-center gap-3">
                  <CalendarDays className="text-orange-500" size={20} />
                  <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Prazo e recorrencia</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Data</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-bold text-slate-700 outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Hora</label>
                    <input
                      type="time"
                      value={form.dueTime}
                      onChange={event => setForm(current => ({ ...current, dueTime: event.target.value }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-bold text-slate-700 outline-none focus:border-orange-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Recorrencia</label>
                    <select
                      value={form.recurrenceType}
                      onChange={event => setForm(current => ({ ...current, recurrenceType: event.target.value as TaskRecurrenceType }))}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-black text-[11px] uppercase tracking-widest text-slate-700 outline-none focus:border-orange-400"
                    >
                      <option value="NONE">Sem recorrencia</option>
                      <option value="DAILY">Diaria</option>
                      <option value="WEEKDAYS">Dias uteis</option>
                      <option value="WEEKLY">Semanal</option>
                      <option value="MONTHLY">Mensal</option>
                    </select>
                  </div>
                </div>

                {form.recurrenceType === 'WEEKLY' && (
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_OPTIONS.map(option => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => handleToggleWeekday(option.key)}
                        className={`rounded-2xl px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${form.weeklyDays.includes(option.key) ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {form.recurrenceType !== 'NONE' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.isAccumulative}
                        onChange={event => setForm(current => ({ ...current, isAccumulative: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Acumulativa
                    </label>
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={form.generateOnlyIfPreviousClosed}
                        onChange={event => setForm(current => ({ ...current, generateOnlyIfPreviousClosed: event.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Gerar so se anterior fechar
                    </label>
                    <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 text-[11px] font-bold leading-relaxed text-orange-700">
                      Recorrencias sao materializadas sob demanda pela Agenda Central e registradas com historico completo.
                    </div>
                  </div>
                )}
              </section>
            )}

            <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.requiresApproval}
                  onChange={event => setForm(current => ({ ...current, requiresApproval: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Exigir aprovacao na conclusao
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.requiresCommentOnCompletion}
                  onChange={event => setForm(current => ({ ...current, requiresCommentOnCompletion: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Exigir comentario ao concluir
              </label>
            </section>
          </div>

          <aside className="border-l border-slate-100 bg-slate-50/70 p-8 max-h-[calc(92vh-88px)] overflow-y-auto">
            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <ClipboardList className="text-blue-600" size={18} />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Resumo</p>
                  <h4 className="text-lg font-black text-slate-900">{form.title || 'Nova tarefa'}</h4>
                </div>
              </div>
              <div className="mt-5 space-y-3 text-sm font-medium text-slate-600">
                <p><span className="font-black text-slate-800">Escopo:</span> {selfOnly ? 'Pessoal' : form.taskScope}</p>
                <p><span className="font-black text-slate-800">Destino:</span> {selfOnly ? 'Eu mesmo' : form.assignMode}</p>
                <p><span className="font-black text-slate-800">Prazo:</span> {form.dueDate} {form.dueTime}</p>
                <p><span className="font-black text-slate-800">Prioridade:</span> {form.priority}</p>
              </div>
            </div>

            {task && (
              <div className="mt-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Historico basico</p>
                <div className="mt-4 space-y-3">
                  {logs.length === 0 ? (
                    <p className="text-sm font-medium text-slate-400">Nenhum evento registrado ainda.</p>
                  ) : logs.map(log => (
                    <div key={log.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{log.action}</p>
                      <p className="mt-1 text-sm font-bold text-slate-700">{log.note || 'Atualizacao operacional.'}</p>
                      <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        {log.actorName || 'Sistema'} • {new Date(log.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || (!isManager && !selfOnly && form.selectedUserIds.length === 0 && form.assignMode === 'SPECIFIC')}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-4 text-[11px] font-black uppercase tracking-widest text-white shadow-xl hover:bg-slate-800 disabled:opacity-50"
              >
                {loading ? <Loader2 className="mx-auto animate-spin" size={18} /> : <span className="inline-flex items-center gap-2"><Save size={14} /> Salvar</span>}
              </button>
            </div>
          </aside>
          </form>
        )}
      </div>
    </div>
  );
};
