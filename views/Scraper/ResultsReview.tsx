
import React, { useState, useEffect } from 'react';
import {
    CheckCircle2, XCircle, Search, Filter, Phone, MapPin, Globe, Mail,
    MoreVertical, ArrowRight, Loader2, Inbox, Trash2, Merge
} from 'lucide-react';
import { scraperService, ScraperResult, ScraperRun } from '../../services/scraperService';

export const ResultsReview: React.FC<{ user: any }> = ({ user }) => {
    const [results, setResults] = useState<ScraperResult[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('PENDING');

    // Filters and Bulk Actions
    const [onlyWithPhone, setOnlyWithPhone] = useState(false);
    const [cityFilter, setCityFilter] = useState('');
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

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
                // Send to CRM (Not Queue anymore)
                const processName = (result.scraper_runs as any)?.scraper_processes?.name;
                await scraperService.approveLead(result, user.id, processName);
            } else {
                await scraperService.updateResultStatus(result.id, action === 'REJECT' ? 'REJECTED' : 'IGNORED', undefined, user.id);
            }
            // Optimistic update
            setResults(prev => prev.filter(r => r.id !== result.id));
        } catch (e: any) {
            alert("Erro na ação: " + e.message);
        }
    };

    const filteredResults = results.filter(r => {
        if (onlyWithPhone && !r.phone) return false;
        if (cityFilter && !r.address.toLowerCase().includes(cityFilter.toLowerCase())) return false;
        return true;
    });

    const handleBulkApprove = async () => {
        if (!confirm(`Tem certeza que deseja aprovar ${filteredResults.length} leads em massa?`)) return;
        setIsProcessingBulk(true);
        try {
            for (const r of filteredResults) {
                const processName = (r.scraper_runs as any)?.scraper_processes?.name;
                await scraperService.approveLead(r, user.id, processName);
            }
            setResults(prev => prev.filter(r => !filteredResults.some(fr => fr.id === r.id)));
            alert(`${filteredResults.length} leads aprovados com sucesso!`);
        } catch (e: any) {
            alert("Erro na aprovação em massa: " + e.message);
        } finally {
            setIsProcessingBulk(false);
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

            {/* BARRA DE FILTROS ADICIONAL */}
            <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm items-center justify-between">
                <div className="flex gap-4 items-center flex-1 w-full">
                    <div className="relative flex-1 max-w-sm">
                        <MapPin className="absolute left-3 top-2.5 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Alguma cidade ou bairro no endereço..."
                            value={cityFilter}
                            onChange={e => setCityFilter(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-slate-600">
                        <input
                            type="checkbox"
                            checked={onlyWithPhone}
                            onChange={e => setOnlyWithPhone(e.target.checked)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Com Telefone
                    </label>
                </div>
                {filterStatus === 'PENDING' && filteredResults.length > 0 && (
                    <button
                        onClick={handleBulkApprove}
                        disabled={isProcessingBulk}
                        className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 text-sm whitespace-nowrap"
                    >
                        {isProcessingBulk ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Aprovar Todos ({filteredResults.length})
                    </button>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-slate-300" size={48} />
                </div>
            ) : filteredResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-[32px] border border-slate-100 border-dashed">
                    <Inbox size={48} className="mb-4 text-slate-200" />
                    <p className="font-bold">Nenhum resultado encontrado.</p>
                    <p className="text-xs">Tente mudar o filtro ou execute um novo processo.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {filteredResults.map(result => (
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

                                <div className="space-y-2 mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-slate-600 bg-slate-50 p-2 rounded-lg truncate">
                                        <MapPin size={14} className="text-blue-500 shrink-0" />
                                        <span className="truncate" title={result.address}>{result.address}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] sm:text-xs font-black text-slate-600 bg-slate-50 p-2 rounded-lg truncate">
                                        <Phone size={14} className="text-green-500 shrink-0" />
                                        <span>{result.phone || 'S/ Tel'}</span>
                                    </div>
                                    {result.website && (
                                        <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold text-blue-600 bg-blue-50/50 p-2 rounded-lg truncate">
                                            <Globe size={14} className="shrink-0" />
                                            <a href={result.website} target="_blank" rel="noreferrer" className="hover:underline truncate" title={result.website}>{result.website.replace(/^https?:\/\//, '')}</a>
                                        </div>
                                    )}
                                </div>

                                {/* Actions Column */}
                                <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                                    {filterStatus === 'PENDING' && (
                                        <>
                                            <button
                                                onClick={() => handleAction(result, 'APPROVE')}
                                                className="flex-1 md:flex-none p-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                                title="Aprovar e Enviar para CRM"
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
