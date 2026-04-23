import React from 'react';
import { AlertTriangle, Bell, ChevronDown, ChevronUp, Copy, X } from 'lucide-react';
import { AppErrorEntry, subscribeToAppErrors } from '../utils/appErrorBus';

const formatErrorTimestamp = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const GlobalErrorCenter: React.FC = () => {
  const [entries, setEntries] = React.useState<AppErrorEntry[]>([]);
  const [expanded, setExpanded] = React.useState(true);

  React.useEffect(() => {
    return subscribeToAppErrors(entry => {
      setEntries(prev => [entry, ...prev].slice(0, 8));
      setExpanded(true);
    });
  }, []);

  const latestEntry = entries[0];

  const handleDismiss = (id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const handleCopy = async (entry: AppErrorEntry) => {
    const payload = [
      `Origem: ${entry.source}`,
      `Quando: ${formatErrorTimestamp(entry.createdAt)}`,
      `Mensagem: ${entry.message}`,
      entry.details ? `Detalhes: ${entry.details}` : ''
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(payload);
    } catch (error) {
      console.error('Nao foi possivel copiar o erro.', error);
    }
  };

  if (entries.length === 0 || !latestEntry) {
    return null;
  }

  return (
    <div className="fixed right-4 bottom-4 z-[90] w-[min(28rem,calc(100vw-2rem))]">
      <div className="bg-slate-950 text-white rounded-[28px] shadow-2xl border border-rose-500/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(prev => !prev)}
          className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-rose-500/10 hover:bg-rose-500/15 transition-colors text-left"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-2xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-200/80">
                Central de Erros
              </p>
              <p className="text-sm font-bold truncate">
                {latestEntry.message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2 py-1 rounded-full bg-white/10 text-[10px] font-black uppercase tracking-widest">
              {entries.length}
            </span>
            {expanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </div>
        </button>

        {expanded && (
          <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3 bg-slate-950">
            {entries.map(entry => (
              <div
                key={entry.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                      <Bell size={12} />
                      {entry.source}
                    </p>
                    <p className="text-sm font-bold text-white break-words">
                      {entry.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDismiss(entry.id)}
                    className="p-2 rounded-xl hover:bg-white/10 text-slate-300 shrink-0"
                    aria-label="Dispensar erro"
                  >
                    <X size={16} />
                  </button>
                </div>

                {entry.details && (
                  <div className="bg-black/20 border border-white/10 rounded-xl p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                      Detalhes tecnicos
                    </p>
                    <p className="text-xs font-mono text-rose-200 whitespace-pre-wrap break-words">
                      {entry.details}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {formatErrorTimestamp(entry.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(entry)}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[10px] font-black uppercase tracking-widest flex items-center gap-2"
                  >
                    <Copy size={12} />
                    Copiar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalErrorCenter;
