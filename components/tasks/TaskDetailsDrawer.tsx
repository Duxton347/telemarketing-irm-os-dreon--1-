import React from 'react';
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Circle,
  Flag,
  ListTree,
  Repeat,
  Sparkles,
  Star,
  Trash2,
  User2,
  X
} from 'lucide-react';
import type { TaskList, TaskPriority, TaskRecurrenceType, User } from '../../types';
import type { TaskManagerTask } from './types';

type TaskDetailsDraft = {
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
};

type TaskDetailsDrawerProps = {
  task: TaskManagerTask | null;
  open: boolean;
  canAssignOthers: boolean;
  availableLists: TaskList[];
  assignableUsers: User[];
  saving: boolean;
  onClose: () => void;
  onSave: (task: TaskManagerTask, draft: TaskDetailsDraft) => void;
  onToggleComplete: (task: TaskManagerTask) => void;
  onDelete: (task: TaskManagerTask) => void;
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'LOW', label: 'Baixa' },
  { value: 'MEDIUM', label: 'Media' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'CRITICAL', label: 'Critica' }
];

const RECURRENCE_OPTIONS: Array<{ value: TaskRecurrenceType; label: string }> = [
  { value: 'NONE', label: 'Sem recorrencia' },
  { value: 'DAILY', label: 'Diaria' },
  { value: 'WEEKDAYS', label: 'Dias uteis' },
  { value: 'WEEKLY', label: 'Semanal' },
  { value: 'MONTHLY', label: 'Mensal' }
];

const WEEKDAY_OPTIONS = [
  { key: 'MON', label: 'Seg' },
  { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' },
  { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' },
  { key: 'SAT', label: 'Sab' },
  { key: 'SUN', label: 'Dom' }
];

const toDateValue = (value?: string | null) => (value ? new Date(value).toISOString().slice(0, 10) : '');
const toTimeValue = (value?: string | null) => (value ? new Date(value).toISOString().slice(11, 16) : '');

const buildDraft = (task: TaskManagerTask | null): TaskDetailsDraft => ({
  title: task?.title || '',
  description: task?.description || '',
  listId: task?.listId || '',
  assignedUserId: task?.assignedTo || '',
  priority: task?.priority || 'MEDIUM',
  dueDate: toDateValue(task?.dueAt),
  dueTime: task?.explicitTime ? toTimeValue(task?.dueAt) : '',
  reminderDate: toDateValue(task?.reminderAt),
  reminderTime: toTimeValue(task?.reminderAt),
  recurrenceType: task?.recurrenceType || 'NONE',
  weeklyDays: task?.recurrenceWeekdays || [],
  isImportant: Boolean(task?.isImportant),
  inMyDay: Boolean(task?.inMyDay)
});

export const TaskDetailsDrawer: React.FC<TaskDetailsDrawerProps> = ({
  task,
  open,
  canAssignOthers,
  availableLists,
  assignableUsers,
  saving,
  onClose,
  onSave,
  onToggleComplete,
  onDelete
}) => {
  const [draft, setDraft] = React.useState<TaskDetailsDraft>(() => buildDraft(task));

  React.useEffect(() => {
    setDraft(buildDraft(task));
  }, [task]);

  if (!task || !open) return null;

  return (
    <>
      <div className="fixed inset-0 z-30 bg-slate-900/20 xl:hidden" onClick={onClose} />

      <aside className="fixed inset-y-4 right-4 z-40 w-[min(100vw-2rem,360px)] overflow-hidden rounded-[24px] border border-slate-200/85 bg-white shadow-xl shadow-slate-900/10 xl:static xl:inset-auto xl:w-full xl:shadow-none">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-slate-200/80 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Detalhes da tarefa</p>
              <h2 className="mt-1.5 text-lg font-black tracking-tight text-slate-900">{task.title}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <button
              type="button"
              onClick={() => onToggleComplete(task)}
              className={`flex w-full items-center justify-between rounded-[18px] border px-3.5 py-2.5 text-left transition-colors ${
                task.isCompleted
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span className="inline-flex items-center gap-3 text-sm font-semibold">
                {task.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                {task.isCompleted ? 'Tarefa concluida' : 'Marcar como concluida'}
              </span>
            </button>

            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Titulo</span>
              <input
                value={draft.title}
                onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Descricao</span>
              <textarea
                value={draft.description}
                onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 outline-none"
              />
            </label>

            <div className="grid grid-cols-1 gap-3">
              <label className="space-y-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <ListTree size={12} />
                  Lista
                </span>
                <select
                  value={draft.listId}
                  onChange={event => setDraft(current => ({ ...current, listId: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                >
                  <option value="">Sem lista personalizada</option>
                  {availableLists.map(list => (
                    <option key={list.id} value={list.id}>{list.name}</option>
                  ))}
                </select>
              </label>

              {canAssignOthers ? (
                <label className="space-y-2">
                  <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    <User2 size={12} />
                    Responsavel
                  </span>
                  <select
                    value={draft.assignedUserId}
                    onChange={event => setDraft(current => ({ ...current, assignedUserId: event.target.value }))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                  >
                    <option value="">Sem atribuicao</option>
                    {assignableUsers.map(candidate => (
                      <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <CalendarDays size={12} />
                  Prazo
                </span>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={event => setDraft(current => ({ ...current, dueDate: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Hora</span>
                <input
                  type="time"
                  value={draft.dueTime}
                  onChange={event => setDraft(current => ({ ...current, dueTime: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>

              <label className="space-y-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <Bell size={12} />
                  Lembrete
                </span>
                <input
                  type="date"
                  value={draft.reminderDate}
                  onChange={event => setDraft(current => ({ ...current, reminderDate: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Hora do lembrete</span>
                <input
                  type="time"
                  value={draft.reminderTime}
                  onChange={event => setDraft(current => ({ ...current, reminderTime: event.target.value }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <Repeat size={12} />
                  Recorrencia
                </span>
                <select
                  value={draft.recurrenceType}
                  onChange={event => setDraft(current => ({ ...current, recurrenceType: event.target.value as TaskRecurrenceType }))}
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                >
                  {RECURRENCE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                  <Flag size={12} />
                  Prioridade
                </span>
                <select
                  value={draft.priority}
                  onChange={event => setDraft(current => ({ ...current, priority: event.target.value as TaskPriority }))}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none"
                >
                  {PRIORITY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {draft.recurrenceType === 'WEEKLY' ? (
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Dias da semana</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_OPTIONS.map(option => {
                    const active = draft.weeklyDays.includes(option.key);

                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setDraft(current => ({
                          ...current,
                          weeklyDays: current.weeklyDays.includes(option.key)
                            ? current.weeklyDays.filter(day => day !== option.key)
                            : [...current.weeklyDays, option.key]
                        }))}
                        className={`rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                          active
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setDraft(current => ({ ...current, isImportant: !current.isImportant }))}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  draft.isImportant
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Star size={16} />
                  Importante
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDraft(current => ({ ...current, inMyDay: !current.inMyDay }))}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                  draft.inMyDay
                    ? 'bg-sky-50 text-sky-700'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="inline-flex items-center gap-3">
                  <Sparkles size={16} />
                  Meu dia
                </span>
              </button>
            </div>
          </div>

          <div className="border-t border-slate-200/80 px-5 py-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => onDelete(task)}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 size={14} />
                Excluir
              </button>

              <button
                type="button"
                onClick={() => onSave(task, draft)}
                disabled={saving || !draft.title.trim()}
                className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
