import React from 'react';
import {
  CalendarDays,
  Circle,
  Flag,
  ListTree,
  MoreHorizontal,
  Sparkles,
  Star,
  Trash2,
  User2
} from 'lucide-react';
import type { TaskManagerTask } from './types';

type TaskRowProps = {
  task: TaskManagerTask;
  selected: boolean;
  onSelect: (taskId: string) => void;
  onToggleComplete: (task: TaskManagerTask) => void;
  onToggleImportant: (task: TaskManagerTask) => void;
  onToggleMyDay: (task: TaskManagerTask) => void;
  onDuplicate: (task: TaskManagerTask) => void;
  onDelete: (task: TaskManagerTask) => void;
};

const formatDue = (task: TaskManagerTask) => {
  if (!task.dueAt) return null;

  const date = new Date(task.dueAt);
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit'
  }).format(date);

  if (task.explicitTime) {
    const timeLabel = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
    return `${dateLabel} ${timeLabel}`;
  }

  return dateLabel;
};

const getPriorityLabel = (priority: TaskManagerTask['priority']) => {
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

export const TaskRow: React.FC<TaskRowProps> = ({
  task,
  selected,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onToggleMyDay,
  onDuplicate,
  onDelete
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const dueLabel = formatDue(task);
  const metadata: string[] = [];

  if (task.assignedUser?.name && task.assignedTo && task.assignedTo !== task.assignedBy) {
    metadata.push(`Responsavel: ${task.assignedUser.name}`);
  }
  if (task.listLabel) {
    metadata.push(`Lista: ${task.listLabel}`);
  }
  if (dueLabel) {
    metadata.push(task.isOverdue ? `Atrasada desde ${dueLabel}` : `Prazo ${dueLabel}`);
  }
  if (task.priority && task.priority !== 'LOW') {
    metadata.push(`Prioridade ${getPriorityLabel(task.priority)}`);
  }
  if (task.status === 'AGUARDANDO') {
    metadata.push('Aguardando aprovacao');
  }

  React.useEffect(() => {
    if (!menuOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <article
      className={`group relative rounded-[20px] border px-3.5 py-3 transition-all ${
        selected
          ? 'border-slate-300 bg-slate-50/70'
          : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60'
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={event => {
            event.stopPropagation();
            onToggleComplete(task);
          }}
          className={`mt-0.5 shrink-0 rounded-full transition-colors ${
            task.isCompleted
              ? 'text-emerald-600'
              : 'text-slate-300 hover:text-slate-500'
          }`}
        >
          <Circle size={20} fill={task.isCompleted ? 'currentColor' : 'white'} />
        </button>

        <button
          type="button"
          onClick={() => onSelect(task.id)}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`truncate text-[13px] font-semibold ${
                  task.isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'
                }`}>
                  {task.title}
                </h3>
                {task.isImportant ? <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" /> : null}
                {task.inMyDay ? <Sparkles size={14} className="shrink-0 text-sky-500" /> : null}
              </div>

              {task.description ? (
                <p className="mt-1 line-clamp-2 text-[13px] text-slate-500">{task.description}</p>
              ) : null}

              {metadata.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
                  {task.assignedUser?.name && task.assignedTo && task.assignedTo !== task.assignedBy ? (
                    <span className="inline-flex items-center gap-1.5">
                      <User2 size={12} />
                      {task.assignedUser.name}
                    </span>
                  ) : null}
                  {task.listLabel ? (
                    <span className="inline-flex items-center gap-1.5">
                      <ListTree size={12} />
                      {task.listLabel}
                    </span>
                  ) : null}
                  {dueLabel ? (
                    <span className={`inline-flex items-center gap-1.5 ${task.isOverdue ? 'font-semibold text-red-600' : ''}`}>
                      <CalendarDays size={12} />
                      {task.isOverdue ? `Atrasada ${dueLabel}` : dueLabel}
                    </span>
                  ) : null}
                  {task.priority !== 'LOW' ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Flag size={12} />
                      {getPriorityLabel(task.priority)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </button>

        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={event => {
              event.stopPropagation();
              setMenuOpen(current => !current);
            }}
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <MoreHorizontal size={15} />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-9 z-20 min-w-[220px] rounded-xl border border-slate-200/80 bg-white p-2 shadow-lg shadow-slate-200/35">
              <button
                type="button"
                onClick={() => {
                  onToggleImportant(task);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <span>{task.isImportant ? 'Remover importante' : 'Marcar como importante'}</span>
                <Star size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleMyDay(task);
                  setMenuOpen(false);
                }}
                className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <span>{task.inMyDay ? 'Remover do meu dia' : 'Adicionar ao meu dia'}</span>
                <Sparkles size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDuplicate(task);
                  setMenuOpen(false);
                }}
                className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <span>Duplicar tarefa</span>
                <ListTree size={14} />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(task);
                  setMenuOpen(false);
                }}
                className="mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <span>Excluir</span>
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
};
