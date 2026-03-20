import React, { useState, useEffect } from 'react';
import { dataService } from '../services/dataService';
import { UnifiedReportRow, User, CallType, CallRecord, Question, WhatsAppTask } from '../types';
import { Loader2, Calendar, Filter, Users, Tag, CheckSquare, Square, RefreshCcw, Search, ChevronRight } from 'lucide-react';
import BulkRescheduleModal from '../components/BulkRescheduleModal';
import BulkUpsellModal from '../components/BulkUpsellModal';
import { buildManagementReportInsights } from '../utils/managementReportInsights';

interface Props {
    user: User;
    operators: User[];
    onOpenProspect: (clientId: string) => void;
    dateRange: {
        start: string;
        end: string;
    };
}

const PostSaleRemarketingReport: React.FC<Props> = ({ user, operators, onOpenProspect, dateRange }) => {
    const [data, setData] = useState<UnifiedReportRow[]>([]);
    const [calls, setCalls] = useState<CallRecord[]>([]);
    const [whatsappTasks, setWhatsappTasks] = useState<WhatsAppTask[]>([]);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [loading, setLoading] = useState(false);

    // Selection
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    // Filters
    const [segmentation, setSegmentation] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [skipReasonFilter, setSkipReasonFilter] = useState<string>('all');

    // Modals
    const [showReschedule, setShowReschedule] = useState(false);
    const [showUpsell, setShowUpsell] = useState(false);

    const loadReport = async () => {
        setLoading(true);
        try {
            // If operator is NOT admin, perhaps filter by their ID? Or Admin sees all.
            // Based on rules, admin sees all, ops see their own or all depending on CRM rule.
            // We pass undefined to RPC to get all, then filter frontend if needed, or pass user.id if not admin.
            const opsId = user.role !== 'ADMIN' ? user.id : undefined;
            const [rows, allCalls, allWhatsApp, allQuestions] = await Promise.all([
                dataService.listUnifiedReport(opsId),
                dataService.getCalls(dateRange.start, dateRange.end),
                dataService.getWhatsAppTasks(undefined, dateRange.start, dateRange.end),
                dataService.getQuestions()
            ]);

            const relevantCalls = allCalls.filter(call =>
                call.type === CallType.POS_VENDA ||
                call.type === CallType.REATIVACAO ||
                call.type === CallType.VENDA
            );

            const relevantWhatsApp = allWhatsApp.filter(task =>
                task.status === 'completed' && (
                    task.type === CallType.POS_VENDA ||
                    task.type === CallType.REATIVACAO ||
                    task.type === CallType.VENDA
                )
            );

            const relevantQuestions = allQuestions.filter(question =>
                question.type === 'ALL' ||
                question.type === CallType.POS_VENDA ||
                question.type === CallType.REATIVACAO ||
                question.type === CallType.VENDA
            );

            setData(rows);
            setCalls(relevantCalls);
            setWhatsappTasks(relevantWhatsApp);
            setQuestions(relevantQuestions);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadReport();
    }, [user.id, dateRange.start, dateRange.end]);

    const reportInsights = React.useMemo(() => buildManagementReportInsights({
        calls,
        whatsappTasks,
        questions,
        operators
    }), [calls, whatsappTasks, questions, operators]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredData.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(filteredData.map(r => r.clientId));
        }
    };

    // --- FILTERING LOGIC ---
    const filteredData = data.filter(row => {
        // 1. Text Search
        if (searchTerm) {
            const s = searchTerm.toLowerCase();
            if (!row.clientName?.toLowerCase().includes(s) && !row.clientPhone?.includes(s)) return false;
        }

        // 2. Segmentation Chips
        if (segmentation === 'avaliaram_mal') return row.lastRating && row.lastRating <= 3;
        if (segmentation === 'avaliaram_bem') return row.lastRating && row.lastRating >= 4;
        if (segmentation === 'sem_resposta') {
            if (row.responseStatus !== 'Sem Resposta') return false;
            if (skipReasonFilter !== 'all' && row.lastSkipReason !== skipReasonFilter) return false;
            return true;
        }
        if (segmentation === 'responderam') return row.responseStatus === 'Respondeu';
        if (segmentation === 'sem_venda') return row.conversionStatus === 'Sem Venda';
        if (segmentation === 'upsell_possivel') return row.upsellOffer && row.upsellStatus !== 'DONE';

        return true;
    });

    // Unique Skip Reasons
    const uniqueSkipReasons = Array.from(new Set(data.filter(r => r.responseStatus === 'Sem Resposta' && r.lastSkipReason).map(r => r.lastSkipReason as string)));

    // --- STATS ---
    const stats = {
        total: reportInsights.totalQuestionnaireInteractions,
        semResposta: data.filter(r => r.responseStatus === 'Sem Resposta').length,
        avaliaram_mal: reportInsights.satisfactionNegativeCount,
        avaliaram_bem: reportInsights.satisfactionPositiveCount,
        semVenda: data.filter(r => r.conversionStatus === 'Sem Venda').length,
        upsell: data.filter(r => r.upsellOffer && r.upsellStatus !== 'DONE').length,
        responderam: reportInsights.totalQuestionnaireInteractions,
        interesse: reportInsights.interestCount,
        objecao: reportInsights.objectionCount
    };

    const percentageOfBase = (value: number, total = reportInsights.totalQuestionnaireInteractions) =>
        total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';

    return (
        <div className="space-y-6">
            {/* Metrics Cards at the Top */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                    { k: 'all', b: 'Total', v: stats.total, c: 'bg-slate-50 text-slate-700' },
                    { k: 'avaliaram_mal', b: 'Avaliaram Mal', v: stats.avaliaram_mal, c: 'bg-rose-50 text-rose-700' },
                    { k: 'avaliaram_bem', b: 'Avaliaram Bem', v: stats.avaliaram_bem, c: 'bg-emerald-50 text-emerald-700' },
                    { k: 'sem_resposta', b: 'Sem Resposta', v: stats.semResposta, c: 'bg-orange-50 text-orange-700' },
                    { k: 'responderam', b: 'Responderam', v: stats.responderam, c: 'bg-blue-50 text-blue-700' },
                    { k: 'upsell_possivel', b: 'Upsell Possível', v: stats.upsell, c: 'bg-amber-50 text-amber-700' },
                    { k: 'sem_venda', b: 'Sem Venda', v: stats.semVenda, c: 'bg-slate-100 text-slate-800' }
                ].map(s => (
                    <button
                        key={s.k}
                        onClick={() => setSegmentation(s.k)}
                        className={`p-4 rounded-3xl border border-white/50 shadow-sm text-left transition-all ${segmentation === s.k ? 'ring-2 ring-blue-500 scale-95' : 'hover:scale-105'} ${s.c}`}
                    >
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">{s.b}</p>
                        <p className="text-2xl font-black">{s.v}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mt-2">
                            {s.k === 'avaliaram_mal' ? `${percentageOfBase(stats.avaliaram_mal)}% da base` :
                             s.k === 'avaliaram_bem' ? `${percentageOfBase(stats.avaliaram_bem)}% da base` :
                             s.k === 'sem_resposta' ? (data.length > 0 ? `${((stats.semResposta / data.length) * 100).toFixed(1)}% da lista` : '0.0% da lista') :
                             s.k === 'responderam' ? 'Questionarios validos' :
                             s.k === 'upsell_possivel' ? (data.length > 0 ? `${((stats.upsell / data.length) * 100).toFixed(1)}% da lista` : '0.0% da lista') :
                             s.k === 'sem_venda' ? (data.length > 0 ? `${((stats.semVenda / data.length) * 100).toFixed(1)}% da lista` : '0.0% da lista') :
                             'Base respondida'}
                        </p>
                    </button>
                ))}
            </div>

            {/* Sub-filter for Skip Reasons when 'sem_resposta' is selected */}
            {segmentation === 'sem_resposta' && uniqueSkipReasons.length > 0 && (
                <div className="flex flex-wrap gap-2 items-center px-2">
                    <span className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1"><Filter size={14} /> Motivo:</span>
                    <button
                        onClick={() => setSkipReasonFilter('all')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${skipReasonFilter === 'all' ? 'bg-orange-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                        Todos ({stats.semResposta})
                    </button>
                    {uniqueSkipReasons.map(reason => {
                        const count = data.filter(r => r.responseStatus === 'Sem Resposta' && r.lastSkipReason === reason).length;
                        return (
                            <button
                                key={reason}
                                onClick={() => setSkipReasonFilter(reason)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${skipReasonFilter === reason ? 'bg-orange-500 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                            >
                                {reason} ({count})
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between gap-4 mb-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-800">Perguntas, respostas e porcentagens</h3>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Base real dos questionarios de pos-venda e remarketing</p>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-[10px] font-black uppercase">
                            {reportInsights.totalQuestionnaireInteractions} respostas validas
                        </span>
                    </div>

                    {reportInsights.questionBreakdowns.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 rounded-[28px] border border-dashed border-slate-200 text-slate-400 text-sm font-bold">
                            Ainda nao existe questionario respondido nesse periodo para alimentar o pos-venda.
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-2">
                            {reportInsights.questionBreakdowns.map(question => (
                                <div key={question.questionId} className="p-5 rounded-[28px] bg-slate-50 border border-slate-100">
                                    <div className="flex items-start justify-between gap-4 mb-4">
                                        <div>
                                            <p className="text-sm font-black text-slate-800 leading-snug">{question.questionText}</p>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">
                                                {question.totalResponses} respostas
                                                {question.purpose ? ` | ${question.purpose}` : ''}
                                            </p>
                                        </div>
                                        <span className="px-2 py-1 rounded-full bg-white border border-slate-200 text-[10px] font-black uppercase text-slate-600">{question.type}</span>
                                    </div>

                                    <div className="space-y-3">
                                        {question.answers.map(answer => (
                                            <div key={`${question.questionId}-${answer.label}`}>
                                                <div className="flex justify-between gap-3 text-xs font-bold mb-1">
                                                    <span className="text-slate-600">{answer.label}</span>
                                                    <span className="text-slate-900">{answer.count} | {answer.percentage.toFixed(1)}%</span>
                                                </div>
                                                <div className="h-2 w-full bg-white rounded-full overflow-hidden border border-slate-100">
                                                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${answer.percentage}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-5">Leitura Gerencial</h3>
                        <div className="space-y-4">
                            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Taxa de Interesse</p>
                                <p className="text-2xl font-black text-emerald-700 mt-1">{reportInsights.interestRate.toFixed(1)}%</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mt-2">{reportInsights.interestCount} interacoes com interesse forte</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-100">
                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Taxa de Objecao</p>
                                <p className="text-2xl font-black text-rose-700 mt-1">{reportInsights.objectionRate.toFixed(1)}%</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500 mt-2">{reportInsights.objectionCount} interacoes com impeditivo declarado</p>
                            </div>
                            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Satisfacao Media</p>
                                <p className="text-2xl font-black text-blue-700 mt-1">{reportInsights.averageSatisfactionScore.toFixed(1)} / 100</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mt-2">
                                    {reportInsights.satisfactionPositiveCount} avaliaram bem | {reportInsights.satisfactionNegativeCount} avaliaram mal
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
                        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-5">Produto, Equipe e Processo</h3>
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Top Produtos / Ofertas</p>
                                <div className="space-y-2">
                                    {reportInsights.productInsights.slice(0, 4).map(item => (
                                        <div key={item.key} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                            <p className="text-xs font-black text-slate-800">{item.label}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                                Interesse {item.interestRate.toFixed(1)}% | Objecao {item.objectionRate.toFixed(1)}% | Satisfacao {item.satisfactionRate.toFixed(1)}%
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Top Equipe</p>
                                <div className="space-y-2">
                                    {reportInsights.operatorInsights.slice(0, 4).map(item => (
                                        <div key={item.key} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                            <p className="text-xs font-black text-slate-800">{item.label}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                                Interesse {item.interestRate.toFixed(1)}% | Objecao {item.objectionRate.toFixed(1)}% | Satisfacao {item.satisfactionRate.toFixed(1)}%
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Top Processos</p>
                                <div className="space-y-2">
                                    {reportInsights.processInsights.slice(0, 4).map(item => (
                                        <div key={item.key} className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                            <p className="text-xs font-black text-slate-800">{item.label}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                                                Interesse {item.interestRate.toFixed(1)}% | Objecao {item.objectionRate.toFixed(1)}% | Satisfacao {item.satisfactionRate.toFixed(1)}%
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-100 shadow-sm">
                <div className="flex items-center gap-4 flex-1">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text" placeholder="Buscar prospect..."
                            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-slate-50 rounded-2xl border-none font-bold text-slate-700 outline-none"
                        />
                    </div>
                    <button onClick={loadReport} className="p-3 bg-slate-50 text-slate-500 rounded-2xl hover:bg-slate-100">
                        <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                <div className="flex gap-2">
                    <button
                        disabled={selectedIds.length === 0}
                        onClick={() => setShowReschedule(true)}
                        className="px-6 py-3 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50"
                    >
                        Reprogramar ({selectedIds.length})
                    </button>
                    <button
                        disabled={selectedIds.length === 0}
                        onClick={() => setShowUpsell(true)}
                        className="px-6 py-3 bg-amber-500 text-white font-black uppercase tracking-widest text-xs rounded-2xl disabled:opacity-50"
                    >
                        Marcar Upsell ({selectedIds.length})
                    </button>
                </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 pl-8 w-10">
                                    <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-700">
                                        {selectedIds.length === filteredData.length && filteredData.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                                    </button>
                                </th>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Cliente / Prospecto</th>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest text-center">Tentativas</th>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Último Contato</th>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status / Avaliação</th>
                                <th className="py-4 px-6 text-[10px] font-black uppercase text-slate-400 tracking-widest">Upsell</th>
                                <th className="py-4 px-6 pr-8 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={7} className="py-12 text-center text-slate-400"><Loader2 className="animate-spin inline" /></td></tr>
                            ) : filteredData.length === 0 ? (
                                <tr><td colSpan={7} className="py-12 text-center text-slate-400 font-bold text-sm">Nenhum registro encontrado.</td></tr>
                            ) : (
                                filteredData.map(row => (
                                    <tr key={row.clientId} className="hover:bg-blue-50/30 transition-colors group cursor-pointer" onClick={() => onOpenProspect(row.clientId)}>
                                        <td className="py-4 px-6 pl-8" onClick={(e) => { e.stopPropagation(); toggleSelect(row.clientId); }}>
                                            <button className="text-slate-400">
                                                {selectedIds.includes(row.clientId) ? <CheckSquare size={18} className="text-blue-500" /> : <Square size={18} />}
                                            </button>
                                        </td>
                                        <td className="py-4 px-6">
                                            <p className="font-bold text-sm text-slate-800">{row.clientName}</p>
                                            <p className="text-xs text-slate-500">{row.clientPhone}</p>
                                        </td>
                                        <td className="py-4 px-6 text-center">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-black">{row.attemptsCount}</span>
                                        </td>
                                        <td className="py-4 px-6">
                                            <p className="text-xs font-bold text-slate-700">{row.lastContactAt ? new Date(row.lastContactAt).toLocaleDateString() : 'Nunca'}</p>
                                            <p className="text-[10px] uppercase font-bold text-slate-400">{row.lastOutcome || '-'}</p>
                                        </td>
                                        <td className="py-4 px-6">
                                            <div className="flex flex-col gap-1">
                                                <span className={`w-max px-2 py-0.5 rounded text-[10px] font-black uppercase ${row.responseStatus === 'Respondeu' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                                                    {row.responseStatus}
                                                </span>
                                                {row.lastRating !== null && row.lastRating !== undefined && (
                                                    <span className={`w-max px-2 py-0.5 rounded text-[10px] font-black uppercase ${row.lastRating >= 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                        Nota: {row.lastRating}
                                                    </span>
                                                )}
                                                {row.responseStatus === 'Sem Resposta' && row.lastSkipReason && (
                                                    <span className="w-max px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-600">
                                                        Motivo: {row.lastSkipReason}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-xs font-bold text-amber-600 uppercase">
                                            {row.upsellOffer || '-'}
                                        </td>
                                        <td className="py-4 px-6 pr-8 text-right">
                                            <ChevronRight size={18} className="inline opacity-0 group-hover:opacity-100 text-blue-500 transition-opacity" />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showReschedule && (
                <BulkRescheduleModal
                    selectedIds={selectedIds}
                    operators={operators}
                    user={user}
                    onClose={() => setShowReschedule(false)}
                    onSuccess={() => { setShowReschedule(false); setSelectedIds([]); loadReport(); }}
                />
            )}

            {showUpsell && (
                <BulkUpsellModal
                    selectedIds={selectedIds}
                    user={user}
                    onClose={() => setShowUpsell(false)}
                    onSuccess={() => { setShowUpsell(false); setSelectedIds([]); loadReport(); }}
                />
            )}
        </div>
    );
};

export default PostSaleRemarketingReport;
