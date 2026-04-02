import React from 'react';
import { CheckCircle2, ListTodo } from 'lucide-react';
import type { TaskManagerTask } from './types';
import { TaskRow } from './TaskRow';

type TasksListProps = {
  tasks: TaskManagerTask[];
  selectedTaskId?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onSelect: (taskId: string) => void;
  onToggleComplete: (task: TaskManagerTask) => void;
  onToggleImportant: (task: TaskManagerTask) => void;
  onToggleMyDay: (task: TaskManagerTask) => void;
  onDuplicate: (task: TaskManagerTask) => void;
  onDelete: (task: TaskManagerTask) => void;
};

export const TasksList: React.FC<TasksListProps> = ({
  tasks,
  selectedTaskId,
  emptyTitle,
  emptyDescription,
  onSelect,
  onToggleComplete,
  onToggleImportant,
  onToggleMyDay,
  onDuplicate,
  onDelete
}) => {
  if (tasks.length === 0) {
    return (
      <div className="rounded-[22px] border border-dashed border-slate-200/80 bg-slate-50/70 px-6 py-12 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm shadow-slate-200/30">
          <ListTodo size={24} />
        </div>
        <h3 className="mt-4 text-lg font-black tracking-tight text-slate-800">{emptyTitle}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">{emptyDescription}</p>
      </div>
    );
  }

  const completedCount = tasks.filter(task => task.isCompleted).length;

  return (
    <div className="space-y-3">
      {completedCount > 0 ? (
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">
          <CheckCircle2 size={14} />
          {completedCount} concluida{completedCount > 1 ? 's' : ''}
        </div>
      ) : null}

      <div className="space-y-2.5">
        {tasks.map(task => (
          <TaskRow
            key={task.id}
            task={task}
            selected={task.id === selectedTaskId}
            onSelect={onSelect}
            onToggleComplete={onToggleComplete}
            onToggleImportant={onToggleImportant}
            onToggleMyDay={onToggleMyDay}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
};
