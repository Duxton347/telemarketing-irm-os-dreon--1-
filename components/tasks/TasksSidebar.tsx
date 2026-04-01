import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TaskSidebarItem, TaskManagerViewKey } from './types';

type TasksSidebarProps = {
  items: TaskSidebarItem[];
  activeView: TaskManagerViewKey;
  onSelect: (viewId: TaskManagerViewKey) => void;
  onCreateList: (name: string) => void;
  onDeleteList?: (viewId: TaskManagerViewKey) => void;
};

export const TasksSidebar: React.FC<TasksSidebarProps> = ({
  items,
  activeView,
  onSelect,
  onCreateList,
  onDeleteList
}) => {
  const [creating, setCreating] = React.useState(false);
  const [newListName, setNewListName] = React.useState('');
  const smartItems = items.filter(item => item.kind === 'smart');
  const sourceItems = items.filter(item => item.kind === 'source');
  const customItems = items.filter(item => item.kind === 'custom');

  const handleCreate = () => {
    const normalized = newListName.trim();
    if (!normalized) return;
    onCreateList(normalized);
    setNewListName('');
    setCreating(false);
  };

  const renderGroup = (groupItems: TaskSidebarItem[], title?: string) => {
    if (groupItems.length === 0) return null;

    return (
      <div className="space-y-1">
        {title ? (
          <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">{title}</p>
        ) : null}

        {groupItems.map(item => {
          const Icon = item.icon;
          const active = item.id === activeView;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all ${
                active
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'
              }`}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                active ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                <Icon size={16} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.label}</span>
              </span>

              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                active ? 'bg-white/14 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {item.count}
              </span>

              {item.kind === 'custom' && onDeleteList ? (
                <span
                  onClick={event => {
                    event.stopPropagation();
                    onDeleteList(item.id);
                  }}
                  className={`hidden rounded-xl p-2 transition-colors group-hover:inline-flex ${
                    active ? 'hover:bg-white/12' : 'hover:bg-slate-100'
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <Trash2 size={14} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="flex h-full flex-col gap-5 border-r border-slate-200/80 bg-slate-50/70 px-3 py-4">
      <div className="space-y-1 px-1.5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Tarefas</p>
        <h2 className="text-xl font-black tracking-tight text-slate-900">Organize seu fluxo</h2>
        <p className="text-[13px] text-slate-500">Escolha uma lista e trabalhe em uma coisa por vez.</p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {renderGroup(smartItems)}
        {renderGroup(sourceItems, 'Listas base')}
        {renderGroup(customItems, 'Listas personalizadas')}
      </div>

      {creating ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-2.5 shadow-sm shadow-slate-200/30">
          <input
            autoFocus
            value={newListName}
            onChange={event => setNewListName(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleCreate();
              }

              if (event.key === 'Escape') {
                setCreating(false);
                setNewListName('');
              }
            }}
            placeholder="Nome da nova lista"
            className="w-full rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none placeholder:text-slate-400"
          />

          <div className="mt-2.5 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setNewListName('');
              }}
              className="rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              className="rounded-full bg-slate-900 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-colors hover:bg-slate-800"
            >
              Criar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600 transition-colors hover:bg-slate-100"
        >
          <Plus size={14} />
          Nova lista
        </button>
      )}
    </aside>
  );
};
