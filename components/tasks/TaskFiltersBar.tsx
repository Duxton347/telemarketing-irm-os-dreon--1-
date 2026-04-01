import React from 'react';
import { Filter } from 'lucide-react';
import type { TaskFilterMode, TaskSortMode } from './types';
import type { User } from '../../types';

type TaskFiltersBarProps = {
  filterMode: TaskFilterMode;
  onFilterModeChange: (mode: TaskFilterMode) => void;
  sortMode: TaskSortMode;
  onSortModeChange: (mode: TaskSortMode) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (value: string) => void;
  users: User[];
  showAssigneeFilter: boolean;
  lockToAll?: boolean;
};

export const TaskFiltersBar: React.FC<TaskFiltersBarProps> = ({
  filterMode,
  onFilterModeChange,
  sortMode,
  onSortModeChange,
  assigneeFilter,
  onAssigneeFilterChange,
  users,
  showAssigneeFilter,
  lockToAll = false
}) => (
  <div className="flex flex-col gap-3 rounded-[22px] border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm shadow-slate-200/20 xl:flex-row xl:items-center xl:justify-between">
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Filter size={15} />
      </span>

      <div className="flex flex-wrap gap-2">
        {!lockToAll ? (
          <button
            onClick={() => onFilterModeChange('active')}
            className={`rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
              filterMode === 'active'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            Pendentes
          </button>
        ) : null}
        <button
          onClick={() => onFilterModeChange('all')}
          className={`rounded-full px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-colors ${
            filterMode === 'all' || lockToAll
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {lockToAll ? 'Concluidas' : 'Tudo'}
        </button>
      </div>
    </div>

    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      {showAssigneeFilter ? (
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-500">
          <span>Responsavel</span>
          <select
            value={assigneeFilter}
            onChange={event => onAssigneeFilterChange(event.target.value)}
            className="bg-transparent font-semibold text-slate-700 outline-none"
          >
            <option value="all">Todos</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-500">
        <span>Ordenar</span>
        <select
          value={sortMode}
          onChange={event => onSortModeChange(event.target.value as TaskSortMode)}
          className="bg-transparent font-semibold text-slate-700 outline-none"
        >
          <option value="smart">Prioridade da tela</option>
          <option value="due">Prazo</option>
          <option value="created">Criacao</option>
        </select>
      </label>
    </div>
  </div>
);
