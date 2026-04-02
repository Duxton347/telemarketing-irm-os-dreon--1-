import React from 'react';
import { Search } from 'lucide-react';

type TasksHeaderProps = {
  title: string;
  subtitle: string;
  pendingCount: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  children?: React.ReactNode;
};

export const TasksHeader: React.FC<TasksHeaderProps> = ({
  title,
  subtitle,
  pendingCount,
  searchValue,
  onSearchChange,
  children
}) => (
  <div className="space-y-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Lista selecionada</p>
        <h1 className="mt-1.5 text-3xl font-black tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1.5 text-[13px] text-slate-500">{subtitle}</p>
      </div>

      {children ? <div className="shrink-0">{children}</div> : null}
    </div>

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="inline-flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Pendentes</span>
        <span className="text-base font-black text-slate-900">{pendingCount}</span>
      </div>

      <label className="flex flex-1 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 shadow-sm shadow-slate-200/25">
        <Search size={16} className="text-slate-400" />
        <input
          value={searchValue}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Buscar tarefa, descricao ou responsavel"
          className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
        />
      </label>
    </div>
  </div>
);
