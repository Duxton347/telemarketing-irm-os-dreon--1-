
import React, { useState, useEffect } from 'react';
import {
    CheckCircle2, XCircle, Search, Filter, Phone, MapPin, Globe,
    MoreVertical, ArrowRight, Loader2, Inbox, Trash2, Merge
} from 'lucide-react';
import { scraperService, ScraperResult, ScraperRun } from '../../services/scraperService';

export const ResultsReview: React.FC<{ user: any }> = ({ user }) => {
    const [results, setResults] = useState<ScraperResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('PENDING');

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await scraperService.getResults({ status: filterStatus });
            setResults(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [filterStatus]);

    const handleAction = async (result: ScraperResult, action: 'APPROVE' | 'REJECT' | 'IGNORE') => {
        try {
            if (action === 'APPROVE') {
                // Send to Queue
                await scraperService.sendToQueue(result, user.id);
            } else {
                await scraperService.updateResultStatus(result.id, action === 'REJECT' ? 'REJECTED' : 'IGNORED', undefined, user.id);
            }
            // Optimistic update
            setResults(prev => prev.filter(r => r.id !== result.id));
        } catch (e: any) {
            alert("Erro na ação: " + e.message);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Revisão de Leads</h2>
                    <p className="text-slate-500">Aprove ou rejeite os contatos captados.</p>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-xl">
                    {['PENDING', 'APPROVED', 'REJECTED'].map(status => (
                        <button
                            key={status}
                            onClick={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${filterStatus === status ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {status === 'PENDING' ? 'Pendentes' : status === 'APPROVED' ? 'Aprovados' : 'Rejeitados'}
                        </button>
                    ))}
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-slate-300" size={48} />
                </div>
            ) : results.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-[32px] border border-slate-100 border-dashed">
                    <Inbox size={48} className="mb-4 text-slate-200" />
                    <p className="font-bold">Nenhum resultado encontrado.</p>
                    <p className="text-xs">Tente mudar o filtro ou execute um novo processo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {results.map(result => (
                        <div key={result.id} className="bg-white p-6 rounded-[24px] border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row gap-6 animate-in fade-in slide-in-from-bottom-4">
                            <div className="flex-1 space-y-3">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-lg font-black text-slate-800 leading-tight">{result.name}</h3>
                                        {/* Score Badge */}
                                        {result.duplication_score > 0 && (
                                            <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold uppercase">
                                                Duplicidade?
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                                        {(result.scraper_runs as any)?.scraper_processes?.name || 'Processo Desconhecido'}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                        <MapPin size={16} className="text-blue-500 shrink-0" />
                                        <span className="truncate">{result.address}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 p-2 rounded-lg">
                                        <Phone size={16} className="text-green-500 shrink-0" />
                                        <span className="font-bold">{result.phone || 'Sem Telefone'}</span>
                                    </div>
                                    {result.website && (
                                        <div className="flex items-center gap-2 text-xs text-blue-600 px-2">
                                            <Globe size={14} className="shrink-0" />
                                            <a href={result.website} target="_blank" rel="noreferrer" className="hover:underline truncate">{result.website}</a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions Column */}
                            <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                                {filterStatus === 'PENDING' && (
                                    <>
                                        <button
                                            onClick={() => handleAction(result, 'APPROVE')}
                                            className="flex-1 md:flex-none p-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                            title="Aprovar e Enviar para Ligações"
                                        >
                                            <CheckCircle2 size={16} /> Aprovar
                                        </button>
                                        <button
                                            onClick={() => handleAction(result, 'REJECT')}
                                            className="flex-1 md:flex-none p-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                            title="Rejeitar"
                                        >
                                            <XCircle size={16} /> Rejeitar
                                        </button>
                                    </>
                                )}
                                {filterStatus === 'APPROVED' && (
                                    <div className="text-center p-2 bg-green-50 text-green-700 rounded-xl text-xs font-bold">
                                        <CheckCircle2 className="mx-auto mb-1" size={20} />
                                        Enviado
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
