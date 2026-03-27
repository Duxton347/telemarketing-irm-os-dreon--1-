import React, { useEffect, useState } from 'react';
import {
    CheckCircle2,
    Download,
    Globe,
    Inbox,
    Loader2,
    MapPin,
    Phone,
    XCircle
} from 'lucide-react';
import { scraperService, ScraperResult, ScraperRun } from '../../services/scraperService';
import { exportScraperResultsToExcel } from '../../utils/scraperExport';

export const ResultsReview: React.FC<{ user: any }> = ({ user }) => {
    const [results, setResults] = useState<ScraperResult[]>([]);
    const [runs, setRuns] = useState<ScraperRun[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [filterStatus, setFilterStatus] = useState('PENDING');
    const [selectedRunId, setSelectedRunId] = useState('');

    const [filterWithPhone, setFilterWithPhone] = useState(false);
    const [filterWithoutPhone, setFilterWithoutPhone] = useState(false);
    const [filterWithAddress, setFilterWithAddress] = useState(false);
    const [filterWithoutAddress, setFilterWithoutAddress] = useState(false);
    const [filterWithWebsite, setFilterWithWebsite] = useState(false);
    const [filterWithoutWebsite, setFilterWithoutWebsite] = useState(false);
    const [cityFilter, setCityFilter] = useState('');
    const [isProcessingBulk, setIsProcessingBulk] = useState(false);

    const loadRuns = async () => {
        try {
            const data = await scraperService.getRuns();
            setRuns((data || []) as ScraperRun[]);
        } catch (e) {
            console.error(e);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        try {
            const data = await scraperService.getResults({
                status: filterStatus,
                runId: selectedRunId || undefined
            });
            setResults(data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadRuns();
    }, []);

    useEffect(() => {
        loadData();
    }, [filterStatus, selectedRunId]);

    const matchesClientFilters = (result: ScraperResult) => {
        if (cityFilter && !result.address?.toLowerCase().includes(cityFilter.toLowerCase())) return false;

        if (filterWithPhone && !result.phone) return false;
        if (filterWithoutPhone && result.phone) return false;

        if (filterWithAddress && !result.address) return false;
        if (filterWithoutAddress && result.address) return false;

        if (filterWithWebsite && !result.website) return false;
        if (filterWithoutWebsite && result.website) return false;

        return true;
    };

    const filteredResults = results.filter(matchesClientFilters);

    const handleAction = async (result: ScraperResult, action: 'APPROVE' | 'REJECT' | 'IGNORE') => {
        try {
            if (action === 'APPROVE') {
                const processName = (result.scraper_runs as any)?.scraper_processes?.name;
                await scraperService.approveLead(result, user.id, processName);
            } else {
                await scraperService.updateResultStatus(
                    result.id,
                    action === 'REJECT' ? 'REJECTED' : 'IGNORED',
                    undefined,
                    user.id
                );
            }

            setResults(prev => prev.filter(item => item.id !== result.id));
        } catch (e: any) {
            alert('Erro na acao: ' + e.message);
        }
    };

    const handleBulkApprove = async () => {
        if (!confirm(`Tem certeza que deseja aprovar ${filteredResults.length} leads em massa?`)) return;

        setIsProcessingBulk(true);

        try {
            for (const result of filteredResults) {
                const processName = (result.scraper_runs as any)?.scraper_processes?.name;
                await scraperService.approveLead(result, user.id, processName);
            }

            setResults(prev => prev.filter(result => !filteredResults.some(filtered => filtered.id === result.id)));
            alert(`${filteredResults.length} leads aprovados com sucesso!`);
        } catch (e: any) {
            alert('Erro na aprovacao em massa: ' + e.message);
        } finally {
            setIsProcessingBulk(false);
        }
    };

    const handleExport = async () => {
        setIsExporting(true);

        try {
            const exportBase = await scraperService.getAllResults({
                status: filterStatus,
                runId: selectedRunId || undefined
            });

            const exportResults = exportBase.filter(matchesClientFilters);

            if (exportResults.length === 0) {
                alert('Nenhum resultado encontrado para exportar com os filtros atuais.');
                return;
            }

            const selectedRun = runs.find(run => run.id === selectedRunId);
            const runLabel = selectedRun
                ? `${(selectedRun.scraper_processes as any)?.name || 'busca'}_${new Date(selectedRun.started_at).toLocaleDateString('pt-BR')}`
                : filterStatus;

            const { count } = exportScraperResultsToExcel(exportResults, {
                status: filterStatus,
                runLabel,
                cityFilter: cityFilter || undefined
            });

            alert(`${count} resultado(s) exportado(s) com sucesso.`);
        } catch (e: any) {
            alert('Erro ao exportar: ' + (e?.message || 'Falha ao gerar o arquivo.'));
        } finally {
            setIsExporting(false);
        }
    };

    const getRunLabel = (run: ScraperRun) => {
        const processName = (run.scraper_processes as any)?.name || 'Busca sem nome';
        const startedAt = new Date(run.started_at).toLocaleString('pt-BR');
        return `${processName} - ${startedAt}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-2xl font-black text-slate-800">Revisao de Leads</h2>
                    <p className="text-slate-500">Aprove, filtre e exporte os contatos captados.</p>
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

            <div className="flex flex-col gap-4 bg-white p-4 rounded-[24px] border border-slate-100 shadow-sm">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-1 w-full flex-col md:flex-row gap-4">
                        <div className="relative flex-1 w-full">
                            <MapPin className="absolute left-3 top-2.5 text-slate-400" size={16} />
                            <input
                                type="text"
                                placeholder="Cidade ou bairro no endereco..."
                                value={cityFilter}
                                onChange={e => setCityFilter(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <select
                            value={selectedRunId}
                            onChange={e => setSelectedRunId(e.target.value)}
                            className="w-full md:max-w-md px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
                        >
                            <option value="">Todas as buscas recentes</option>
                            {runs.map(run => (
                                <option key={run.id} value={run.id}>
                                    {getRunLabel(run)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex w-full md:w-auto flex-wrap items-center justify-end gap-3">
                        <button
                            onClick={handleExport}
                            disabled={isExporting || isLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-md disabled:opacity-50 text-sm whitespace-nowrap"
                        >
                            {isExporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
                            Exportar Excel
                        </button>

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
                </div>

                <div className="flex flex-wrap gap-2">
                    <button onClick={() => setFilterWithPhone(!filterWithPhone)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithPhone ? 'bg-blue-100 border-blue-300 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>+ Telefone</button>
                    <button onClick={() => setFilterWithoutPhone(!filterWithoutPhone)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithoutPhone ? 'bg-orange-100 border-orange-300 text-orange-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>- Telefone</button>

                    <button onClick={() => setFilterWithAddress(!filterWithAddress)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithAddress ? 'bg-blue-100 border-blue-300 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>+ Endereco</button>
                    <button onClick={() => setFilterWithoutAddress(!filterWithoutAddress)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithoutAddress ? 'bg-orange-100 border-orange-300 text-orange-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>- Endereco</button>

                    <button onClick={() => setFilterWithWebsite(!filterWithWebsite)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithWebsite ? 'bg-blue-100 border-blue-300 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>+ Website</button>
                    <button onClick={() => setFilterWithoutWebsite(!filterWithoutWebsite)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${filterWithoutWebsite ? 'bg-orange-100 border-orange-300 text-orange-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>- Website</button>
                </div>

                <p className="text-[11px] font-medium text-slate-400">
                    A exportacao respeita os filtros desta tela e gera colunas separadas para nome, numero, site e endereco.
                </p>
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
                                    <div className="flex justify-between items-start gap-3">
                                        <h3 className="text-lg font-black text-slate-800 leading-tight">{result.name}</h3>
                                        {result.duplication_score > 0 && (
                                            <span className="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold uppercase">
                                                Duplicidade?
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">
                                        {(result.scraper_runs as any)?.scraper_processes?.name || 'Processo desconhecido'}
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
                                            <a
                                                href={result.website}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="hover:underline truncate"
                                                title={result.website}
                                            >
                                                {result.website.replace(/^https?:\/\//, '')}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-row md:flex-col gap-2 justify-center border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-4">
                                {filterStatus === 'PENDING' && (
                                    <>
                                        <button
                                            onClick={() => handleAction(result, 'APPROVE')}
                                            className="flex-1 md:flex-none p-3 bg-green-50 text-green-700 hover:bg-green-100 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
                                            title="Aprovar e enviar para CRM"
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
