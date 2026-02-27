import React, { useEffect, useState } from 'react';
import { X, History, MessageSquare, Phone, Tag, Star, Loader2, CalendarClock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { CallRecord, Task } from '../types';

interface Props {
    prospectId: string;
    onClose: () => void;
}

const ProspectHistoryDrawer: React.FC<Props> = ({ prospectId, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<{
        calls: CallRecord[];
        tasks: Task[];
    }>({ calls: [], tasks: [] });

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const data = await dataService.getProspectHistory(prospectId);
                setHistory(data);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchHistory();
    }, [prospectId]);

    const renderResponses = (responses: Record<string, any>) => {
        if (!responses || Object.keys(responses).length === 0) return null;

        return (
            <div className="mt-3 space-y-1">
                {Object.entries(responses).map(([k, v]) => {
                    if (k === 'upsell_offer' || k === 'note' || k === 'is_bulk_upsell' || k === 'call_type') return null;
                    return (
                        <p key={k} className="text-[10px] text-slate-500 font-medium">
                            • <span className="font-bold">{v}</span>
                        </p>
                    );
                })}
            </div>
        );
    };

    return (
        <>
            <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><History size={20} /></div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800">Histórico</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ID: {prospectId.slice(0, 8)}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X size={20} className="text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="animate-spin text-blue-500" size={32} /></div>
                    ) : (
                        <>
                            {/* Upsell Highlights (Extracted from calls) */}
                            {history.calls.filter(c => c.responses?.upsell_offer).length > 0 && (
                                <div>
                                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2">
                                        <Tag size={14} className="text-amber-500" /> Indicações de Upsell
                                    </h4>
                                    <div className="space-y-3">
                                        {history.calls.filter(c => c.responses?.upsell_offer).map(u => (
                                            <div key={u.id} className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-sm font-black text-amber-800">{u.responses.upsell_offer}</span>
                                                    <span className="text-[10px] uppercase font-bold text-amber-600">{new Date(u.startTime).toLocaleDateString()}</span>
                                                </div>
                                                {u.responses.note && <p className="text-xs text-amber-700 font-medium">{u.responses.note}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Interações (Calls) */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2">
                                    <Phone size={14} className="text-blue-500" /> Interações Registradas
                                </h4>
                                {history.calls.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic font-medium">Nenhum registro de contato.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {history.calls.map(a => (
                                            <div key={a.id} className="relative pl-6 pb-4 border-l-2 border-slate-100 last:border-transparent">
                                                <div className={`absolute -left-[9px] top-0 p-1 rounded-full ${a.type === 'WHATSAPP' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                                                    {a.type === 'WHATSAPP' ? <MessageSquare size={10} /> : <Phone size={10} />}
                                                </div>
                                                <div className="-mt-1.5">
                                                    <div className="flex justify-between">
                                                        <p className="text-[10px] font-black uppercase text-slate-400">{new Date(a.startTime).toLocaleString()}</p>
                                                        <span className="text-[10px] font-bold text-slate-400">{Math.floor(a.duration / 60)}m {a.duration % 60}s</span>
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-700 mt-1">{a.type}</p>

                                                    {a.responses?.written_report && <p className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded-lg italic">"{a.responses.written_report}"</p>}
                                                    {renderResponses(a.responses)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Tasks / Pulos */}
                            <div>
                                <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest mb-4 flex items-center gap-2">
                                    <CalendarClock size={14} className="text-orange-500" /> Histórico de Agendamentos / Pulos
                                </h4>
                                {history.tasks.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic font-medium">Nenhuma tarefa registrada.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {history.tasks.map(t => (
                                            <div key={t.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="flex justify-between items-center mb-1">
                                                    <span className="text-[10px] font-black uppercase text-slate-500">{t.type}</span>
                                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : t.status === 'skipped' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-600'}`}>
                                                        {t.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-bold text-slate-400">{new Date(t.createdAt).toLocaleDateString()}</p>
                                                {t.skipReason && <p className="text-[10px] text-orange-600 font-bold mt-2">Pulo: {t.skipReason}</p>}
                                                {t.scheduleReason && <p className="text-[10px] text-blue-600 font-bold mt-1">Agendado: {t.scheduleReason}</p>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default ProspectHistoryDrawer;
