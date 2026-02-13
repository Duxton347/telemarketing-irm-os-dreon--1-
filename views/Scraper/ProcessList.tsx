
import React, { useEffect, useState } from 'react';
import {
    Search, Plus, MapPin, Play, Trash2, AlertCircle, CheckCircle2,
    Settings, Loader2, Database, ExternalLink
} from 'lucide-react';
import { ScraperProcess, scraperService } from '../../services/scraperService';
import { ProcessForm } from './ProcessForm';

export const ProcessList: React.FC<{ user: any }> = ({ user }) => {
    const [processes, setProcesses] = useState<ScraperProcess[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [runningIds, setRunningIds] = useState<Set<string>>(new Set());

    const loadProcesses = async () => {
        setIsLoading(true);
        try {
            const data = await scraperService.getProcesses();
            setProcesses(data || []);
        } catch (error) {
            console.error(error);
            alert("Erro ao carregar processos.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadProcesses(); }, []);

    const handleRun = async (process: ScraperProcess) => {
        if (!confirm(`Iniciar a execução do processo "${process.name}"?\nIsso pode gerar custos de API.`)) return;

        setRunningIds(prev => new Set(prev).add(process.id!));
        try {
            await scraperService.runProcess(process.id!, user.id);
            alert("Execução iniciada com sucesso! Verifique a aba 'Execuções'.");
        } catch (error: any) {
            alert(`Erro ao iniciar: ${error.message}`);
        } finally {
            setRunningIds(prev => {
                const next = new Set(prev);
                next.delete(process.id!);
                return next;
            });
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja arquivar este processo?")) return;
        try {
            await scraperService.deleteProcess(id);
            loadProcesses();
        } catch (error) {
            alert("Erro ao excluir.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Processos de Captação</h2>
                    <p className="text-slate-500">Gerencie suas automações de busca no Google Maps.</p>
                </div>
                <button
                    onClick={() => setIsFormOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg hover:shadow-blue-500/30"
                >
                    <Plus size={20} /> Novo Processo
                </button>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20 text-slate-400">
                    <Loader2 className="animate-spin" size={32} />
                </div>
            ) : processes.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[32px] p-12 text-center">
                    <Database className="mx-auto text-slate-300 mb-4" size={48} />
                    <h3 className="text-lg font-bold text-slate-600 mb-2">Nenhum processo configurado</h3>
                    <p className="text-slate-400 mb-6 max-w-md mx-auto">Crie seu primeiro processo definindo uma palavra-chave (ex: "Pizzaria") e uma localização (ex: "Centro, Campinas").</p>
                    <button
                        onClick={() => setIsFormOpen(true)}
                        className="text-blue-600 font-bold hover:underline"
                    >
                        Criar agora
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {processes.map(process => (
                        <div key={process.id} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-2 h-full bg-blue-500"></div>

                            <div className="flex justify-between items-start mb-4 pl-4">
                                <div>
                                    <h3 className="text-lg font-black text-slate-800 leading-tight">{process.name}</h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">{process.keyword}</p>
                                </div>
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <MapPin size={20} />
                                </div>
                            </div>

                            <div className="pl-4 space-y-3 mb-6">
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                    <span className="truncate">{process.location_input}</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                                    <span>Raio: <strong>{process.radius_km} km</strong></span>
                                </div>
                                {process.resolved_address && (
                                    <div className="text-[10px] text-slate-400 bg-slate-50 p-2 rounded-lg truncate">
                                        📍 {process.resolved_address}
                                    </div>
                                )}
                            </div>

                            <div className="pl-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                                <button
                                    onClick={() => handleDelete(process.id!)}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>

                                <button
                                    onClick={() => handleRun(process)}
                                    disabled={runningIds.has(process.id!)}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-slate-800 disabled:opacity-50 transition-all"
                                >
                                    {runningIds.has(process.id!) ? (
                                        <><Loader2 className="animate-spin" size={14} /> Rodando...</>
                                    ) : (
                                        <><Play size={14} /> Executar</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isFormOpen && (
                <ProcessForm
                    onClose={() => setIsFormOpen(false)}
                    onSuccess={() => { setIsFormOpen(false); loadProcesses(); }}
                    user={user}
                />
            )}
        </div>
    );
};
