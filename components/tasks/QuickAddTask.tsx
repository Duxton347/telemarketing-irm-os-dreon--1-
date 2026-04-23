import React from 'react';
import {
  Bell,
  CalendarDays,
  Flag,
  ListTree,
  Plus,
  Repeat,
  User2
} from 'lucide-react';
import type { TaskList, TaskPriority, TaskRecurrenceType, User } from '../../types';
import type { QuickTaskFormState, QuickTaskOwnership } from './types';

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

const OWNERSHIP_OPTIONS: Array<{ value: QuickTaskOwnership; label: string }> = [
  { value: 'PERSONAL', label: 'Minha tarefa' },
  { value: 'ASSIGNED', label: 'Atribuir para usuario' },
  { value: 'TEAM', label: 'Demanda da equipe' }
];

type QuickAddPanelKey = 'ownership' | 'list' | 'due' | 'reminder' | 'recurrence' | 'priority' | null;

type QuickAddTaskProps = {
  form: QuickTaskFormState;
  expanded: boolean;
  submitting: boolean;
  currentListLabel: string;
  availableLists: TaskList[];
  assignableUsers: User[];
  canAssignOthers: boolean;
  onExpandChange: (expanded: boolean) => void;
  onChange: <K extends keyof QuickTaskFormState>(field: K, value: QuickTaskFormState[K]) => void;
  onToggleWeekday: (weekday: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

const WEEKDAY_OPTIONS = [
  { key: 'MON', label: 'Seg' },
  { key: 'TUE', label: 'Ter' },
  { key: 'WED', label: 'Qua' },
  { key: 'THU', label: 'Qui' },
  { key: 'FRI', label: 'Sex' },
  { key: 'SAT', label: 'Sab' },
  { key: 'SUN', label: 'Dom' }
];

export const QuickAddTask: React.FC<QuickAddTaskProps> = ({
  form,
  expanded,
  submitting,
  currentListLabel,
  availableLists,
  assignableUsers,
  canAssignOthers,
  onExpandChange,
  onChange,
  onToggleWeekday,
  onSubmit
}) => {
  const rootRef = React.useRef<HTMLFormElement | null>(null);
  const [activePanel, setActivePanel] = React.useState<QuickAddPanelKey>(null);
  const showWeeklyDays = form.recurrenceType === 'WEEKLY';

  React.useEffect(() => {
    if (!expanded) {
      setActivePanel(null);
    }
  }, [expanded]);

  React.useEffect(() => {
    if (!activePanel) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActivePanel(null);
        onExpandChange(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [activePanel, onExpandChange]);

  const togglePanel = (panel: Exclude<QuickAddPanelKey, null>) => {
    const nextValue = activePanel === panel ? null : panel;
    setActivePanel(nextValue);
    onExpandChange(nextValue !== null);
  };

  const clearDue = () => {
    onChange('dueDate', '');
    onChange('dueTime', '');
  };

  const clearReminder = () => {
    onChange('reminderDate', '');
    onChange('reminderTime', '');
  };

  const renderPanel = () => {
    if (!activePanel) return null;

    switch (activePanel) {
      case 'ownership':
        return (
          <div className="space-y-3">
            {canAssignOthers ? (
              <>
                <label className="block space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Destino</span>
                  <select
                    value={form.ownership}
                    onChange={event => onChange('ownership', event.target.value as QuickTaskOwnership)}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                  >
                    {OWNERSHIP_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                {form.ownership === 'ASSIGNED' ? (
                  <label className="block space-y-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Responsavel</span>
                    <select
                      value={form.assignedUserId}
                      onChange={event => onChange('assignedUserId', event.target.value)}
                      className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
                    >
                      <option value="">Selecione</option>
                      {assignableUsers.map(candidate => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-slate-500">Essa tarefa sera criada para voce dentro da lista atual.</p>
            )}
          </div>
        );
      case 'list':
        return (
          <div className="space-y-3">
            <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
              Lista ativa: <span className="font-semibold text-slate-900">{currentListLabel}</span>
            </div>

            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lista personalizada</span>
              <select
                value={form.listId}
                onChange={event => onChange('listId', event.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="">Sem lista personalizada</option>
                {availableLists.map(list => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </label>
          </div>
        );
      case 'due':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto]">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Prazo</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={event => onChange('dueDate', event.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Hora</span>
              <input
                type="time"
                value={form.dueTime}
                onChange={event => onChange('dueTime', event.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearDue}
                className="rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 transition-colors hover:bg-slate-100"
              >
                Limpar
              </button>
            </div>
          </div>
        );
      case 'reminder':
        return (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_auto]">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Lembrete</span>
              <input
                type="date"
                value={form.reminderDate}
                onChange={event => onChange('reminderDate', event.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Hora</span>
              <input
                type="time"
                value={form.reminderTime}
                onChange={event => onChange('reminderTime', event.target.value)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={clearReminder}
                className="rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 transition-colors hover:bg-slate-100"
              >
                Limpar
              </button>
            </div>
          </div>
        );
      case 'recurrence':
        return (
          <div className="space-y-3">
            <label className="block space-y-2">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recorrencia</span>
              <select
                value={form.recurrenceType}
                onChange={event => onChange('recurrenceType', event.target.value as TaskRecurrenceType)}
                className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none"
              >
                {RECURRENCE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {showWeeklyDays ? (
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map(option => {
                  const active = form.weeklyDays.includes(option.key);

                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => onToggleWeekday(option.key)}
                      className={`rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'bg-white text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      case 'priority':
        return (
          <div className="flex flex-wrap gap-2">
            {PRIORITY_OPTIONS.map(option => {
              const active = form.priority === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange('priority', option.value)}
                  className={`rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        );
      default:
        return null;
    }
  };

  const iconButtonClass = (active: boolean, hasValue: boolean) => (
    `inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : hasValue
          ? 'border-slate-300 bg-slate-100 text-slate-700'
          : 'border-slate-200/80 bg-white text-slate-400 hover:bg-slate-50'
    }`
  );

  return (
    <form
      ref={rootRef}
      onSubmit={onSubmit}
      className="rounded-[18px] border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/15"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <button
            type="submit"
            disabled={submitting || !form.title.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-400 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Adicionar tarefa"
          >
            <Plus size={16} />
          </button>

          <input
            value={form.title}
            onChange={event => onChange('title', event.target.value)}
            placeholder="Adicionar tarefa"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-slate-800 outline-none placeholder:text-slate-400"
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              title="Destino"
              onClick={() => togglePanel('ownership')}
              className={iconButtonClass(activePanel === 'ownership', canAssignOthers && form.ownership !== 'PERSONAL')}
            >
              <User2 size={15} />
            </button>

            <button
              type="button"
              title={`Lista atual: ${currentListLabel}`}
              onClick={() => togglePanel('list')}
              className={iconButtonClass(activePanel === 'list', Boolean(form.listId))}
            >
              <ListTree size={15} />
            </button>

            <button
              type="button"
              title="Prazo"
              onClick={() => togglePanel('due')}
              className={iconButtonClass(activePanel === 'due', Boolean(form.dueDate))}
            >
              <CalendarDays size={15} />
            </button>

            <button
              type="button"
              title="Lembrete"
              onClick={() => togglePanel('reminder')}
              className={iconButtonClass(activePanel === 'reminder', Boolean(form.reminderDate))}
            >
              <Bell size={15} />
            </button>

            <button
              type="button"
              title="Recorrencia"
              onClick={() => togglePanel('recurrence')}
              className={iconButtonClass(activePanel === 'recurrence', form.recurrenceType !== 'NONE')}
            >
              <Repeat size={15} />
            </button>

            <button
              type="button"
              title="Prioridade"
              onClick={() => togglePanel('priority')}
              className={iconButtonClass(activePanel === 'priority', form.priority !== 'LOW')}
            >
              <Flag size={15} />
            </button>
          </div>
        </div>

        {activePanel ? (
          <div className="rounded-[16px] border border-slate-200/80 bg-slate-50/70 p-3">
            {renderPanel()}
          </div>
        ) : null}
      </div>
    </form>
  );
};
