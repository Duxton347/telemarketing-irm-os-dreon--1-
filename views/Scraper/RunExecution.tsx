
import React, { useState, useEffect } from 'react';
import {
    Activity, Play, CheckCircle2, XCircle, Clock, Loader2,
    Trash2, CheckSquare
} from 'lucide-react';
import { scraperService, ScraperRun } from '../../services/scraperService';

export const RunExecution: React.FC = () => {
    const [runs, setRuns] = useState<ScraperRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadRuns = async (isPolling = false) => {
        if (!isPolling) setIsLoading(true);
        try {
            const data = await scraperService.getRuns();
            setRuns(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            if (!isPolling) setIsLoading(false);
        }
    };

    const handleForceComplete = async (runId: string) => {
        if (!confirm('Deseja forçar a conclusão desta execução e contabilizar os resultados obtidos?')) return;
        setIsLoading(true);
        try {
            await scraperService.forceCompleteRun(runId);
            await loadRuns();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (runId: string) => {
        if (!confirm('Tem certeza que deseja excluir o histórico desta execução? Os leads não aprovados desta busca também serão removidos.')) return;
        setIsLoading(true);
        try {
            await scraperService.deleteRun(runId);
            await loadRuns();
        } catch (e: any) {
            alert('Erro: ' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRuns();
        const interval = setInterval(() => loadRuns(true), 5000); // Poll every 5s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Histórico de Execuções</h2>
                    <p className="text-slate-500">Acompanhe o status e custos das buscas realizadas.</p>
                </div>
                <button onClick={() => loadRuns()} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Activity size={20} />
                </button>
            </div>

            {isLoading && runs.length === 0 ? (
                <div className="flex justify-center py-20 text-slate-300">
                    <Loader2 className="animate-spin" size={48} />
                </div>
            ) : (
                <div className="space-y-4">
                    {runs.map(run => (
                        <div key={run.id} className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-6 animate-in fade-in slide-in-from-bottom-2">
                            {/* Status Icon */}
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${run.status === 'RUNNING' ? 'bg-blue-100 text-blue-600' :
                                run.status === 'COMPLETED' ? 'bg-green-100 text-green-600' :
                                    run.status === 'FAILED' ? 'bg-red-100 text-red-600' :
                                        'bg-slate-100 text-slate-400'
                                }`}>
                                {run.status === 'RUNNING' ? <Loader2 className="animate-spin" size={32} /> :
                                    run.status === 'COMPLETED' ? <CheckCircle2 size={32} /> :
                                        run.status === 'FAILED' ? <XCircle size={32} /> :
                                            <Clock size={32} />}
                            </div>

                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-lg font-black text-slate-800">
                                    {(run.scraper_processes as any)?.name || 'Processo Removido'}
                                </h3>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                                    Iniciado em {new Date(run.started_at).toLocaleString()}
                                </p>
                                {run.finished_at && (
                                    <p className="text-[10px] text-slate-400">
                                        Finalizado em {new Date(run.finished_at).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-8 text-center bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[200px]">
                                <div>
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Encontrados</p>
                                    <p className="text-xl font-black text-slate-800">{run.total_found}</p>
                                </div>
                                <div className="w-px bg-slate-200"></div>
                                <div>
                                    <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Novos Leads</p>
                                    <p className="text-xl font-black text-emerald-600">{run.total_new}</p>
                                </div>
                            </div>

                            {/* Actions / Details */}
                            <div className="flex flex-row md:flex-col gap-2 justify-center">
                                {run.status === 'RUNNING' && (
                                    <button
                                        onClick={() => handleForceComplete(run.id)}
                                        className="text-[10px] bg-slate-900 text-white px-3 py-2 rounded-xl font-bold uppercase tracking-wider hover:bg-slate-800 transition-colors flex items-center gap-1 shadow-sm"
                                        title="Concluir Manualmente"
                                    >
                                        <CheckSquare size={14} /> Concluir
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(run.id)}
                                    className="text-[10px] text-slate-400 hover:text-red-500 hover:bg-red-50 px-3 py-2 rounded-xl font-bold uppercase tracking-wider transition-colors flex items-center gap-1"
                                    title="Excluir Execução"
                                >
                                    <Trash2 size={14} /> Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                    {runs.length === 0 && (
                        <div className="text-center py-20 text-slate-400">
                            Nenhuma execução registrada.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
