import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, Plus, FileText, CheckCircle, XCircle,
    DollarSign, User, Calendar, Loader2, ArrowRight,
    Filter, LayoutGrid, X, Download
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { dataService } from '../services/dataService';
import { Quote, QuoteStatus, Client, Sale, SaleStatus, SaleCategory, SaleChannel } from '../types';
import { CurrencyInput } from '../components/CurrencyInput';
import { AutocompleteInput } from '../components/AutocompleteInput';
import { buildPersonNameOptions, findCanonicalPersonName, normalizePersonNameKey } from '../utils/personName';

interface QuotesProps {
    user: any;
}

import { CampaignPlannerService } from '../services/campaignPlannerService';

type ProbabilityFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const formatLocalDateInput = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseLocalDate = (value?: string) => {
    if (!value) return null;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day, 0, 0, 0, 0);
};

const shiftDate = (base: Date, amount: number) => {
    const next = new Date(base);
    next.setDate(next.getDate() + amount);
    return next;
};

const getMonthStart = (base = new Date()) => new Date(base.getFullYear(), base.getMonth(), 1);

const matchesProbabilityFilter = (value: number, filter: ProbabilityFilter) => {
    if (filter === 'ALL') return true;
    if (filter === 'HIGH') return value >= 70;
    if (filter === 'MEDIUM') return value >= 40 && value < 70;
    return value < 40;
};

export const Quotes: React.FC<QuotesProps> = ({ user }) => {
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [externalSalespeople, setExternalSalespeople] = useState<{id:string, name:string}[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [interestProducts, setInterestProducts] = useState<string[]>([]);

    const [isLoading, setIsLoading] = useState(true);
    const [isSavingQuote, setIsSavingQuote] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'WON' | 'LOST'>('OPEN');
    const [salespersonFilter, setSalespersonFilter] = useState('ALL');
    const [probabilityFilter, setProbabilityFilter] = useState<ProbabilityFilter>('ALL');
    const [dateRange, setDateRange] = useState({ start: formatLocalDateInput(), end: formatLocalDateInput() });
    const [datePreset, setDatePreset] = useState<'today' | 'yesterday' | 'last7' | 'month' | 'custom'>('today');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isConverting, setIsConverting] = useState(false);
    const [convertingQuote, setConvertingQuote] = useState<Quote | null>(null);

    const [newQuote, setNewQuote] = useState<Partial<Quote>>({
        status: 'OPEN',
        win_probability: 50,
        value: 0
    });

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [q, c, u, ext, products, saleRows] = await Promise.all([
                dataService.getQuotes(),
                dataService.getClients(true),
                dataService.getUsers(),
                dataService.getExternalSalespeople(),
                CampaignPlannerService.getDistinctInterestProducts(),
                dataService.getSales()
            ]);
            setQuotes(q);
            setClients(c);
            setUsers(u);
            setExternalSalespeople(ext);
            setInterestProducts(products);
            setSales(saleRows);
        } catch (e) {
            console.error(e);
            alert("Erro ao carregar dados de orçamentos.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const salespersonNameOptions = useMemo(() => buildPersonNameOptions(
        externalSalespeople.map(e => ({ id: e.id, label: e.name })),
        users.map(u => ({ id: u.id, label: u.name })),
        quotes.map(q => q.salesperson_name).filter(Boolean),
        sales.map(s => s.externalSalesperson).filter(Boolean)
    ), [externalSalespeople, users, quotes, sales]);

    const allSalespeopleNames = useMemo(
        () => salespersonNameOptions.map(option => option.label),
        [salespersonNameOptions]
    );

    const getCanonicalSalespersonName = (name?: string) =>
        findCanonicalPersonName(name, salespersonNameOptions);

    const filteredQuotes = useMemo(() => {
        return quotes.filter(q => {
            const normalizedSearch = searchTerm.toLowerCase().trim();
            const normalizedSalespersonFilter = normalizePersonNameKey(salespersonFilter);
            const matchSearch =
                !normalizedSearch ||
                q.client_name.toLowerCase().includes(normalizedSearch) ||
                q.quote_number.toLowerCase().includes(normalizedSearch) ||
                (q.interest_product || '').toLowerCase().includes(normalizedSearch);
            const matchStatus = statusFilter === 'ALL' || q.status === statusFilter;
            const matchSalesperson = salespersonFilter === 'ALL' || normalizePersonNameKey(q.salesperson_name) === normalizedSalespersonFilter;
            const matchProbability = matchesProbabilityFilter(Number(q.win_probability) || 0, probabilityFilter);
            let matchDate = true;
            const quoteDate = q.created_at ? new Date(q.created_at) : null;

            if (dateRange.start) {
                const startDate = parseLocalDate(dateRange.start);
                if (startDate && quoteDate) {
                    matchDate = matchDate && quoteDate >= startDate;
                }
            }

            if (dateRange.end) {
                const endDate = parseLocalDate(dateRange.end);
                if (endDate && quoteDate) {
                    endDate.setHours(23, 59, 59, 999);
                    matchDate = matchDate && quoteDate <= endDate;
                }
            }

            return matchSearch && matchStatus && matchSalesperson && matchProbability && matchDate;
        });
    }, [quotes, searchTerm, statusFilter, salespersonFilter, probabilityFilter, dateRange]);

    // Metrics
    const metrics = useMemo(() => {
        const open = filteredQuotes.filter(q => q.status === 'OPEN');
        const won = filteredQuotes.filter(q => q.status === 'WON');
        const openValue = open.reduce((acc, val) => acc + Number(val.value), 0);

        // Group by salesperson
        const bySalesperson: Record<string, number> = {};
        filteredQuotes.forEach(q => {
            const canonicalName = getCanonicalSalespersonName(q.salesperson_name) || 'N/A';
            bySalesperson[canonicalName] = (bySalesperson[canonicalName] || 0) + 1;
        });
        const topSalespeople = Object.entries(bySalesperson).sort((a, b) => b[1] - a[1]).slice(0, 3);

        return {
            openCount: open.length,
            openValue,
            wonCount: won.length,
            topSalespeople
        };
    }, [filteredQuotes, salespersonNameOptions]);

    const normalizeQuoteNumber = (value?: string) => (value || '').trim();

    const revealQuoteInList = (quoteNumber: string) => {
        setStatusFilter('ALL');
        setSearchTerm(quoteNumber);
    };

    const getQuoteStatusLabel = (status?: QuoteStatus) => {
        switch (status) {
            case 'WON':
                return 'Fechado (Ganho)';
            case 'LOST':
                return 'Perdido';
            case 'OPEN':
            default:
                return 'Em Aberto';
        }
    };

    const buildDuplicateQuoteMessage = (quoteNumber: string, existingQuote?: Quote | null) => {
        if (existingQuote) {
            return `O orçamento ${quoteNumber} já existe para ${existingQuote.client_name} e está com status ${getQuoteStatusLabel(existingQuote.status)}. Ajustei os filtros para mostrar todos os status e busquei por esse número. Feche esta janela para localizá-lo.`;
        }

        return `O número ${quoteNumber} já existe no banco. Ajustei os filtros para mostrar todos os status e busquei por esse número. Se ele ainda não aparecer, provavelmente está fora do filtro anterior ou da sua visualização atual.`;
    };

    const handleSaveQuote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSavingQuote) return;
        const normalizedQuoteNumber = normalizeQuoteNumber(newQuote.quote_number);
        const canonicalSalespersonName = getCanonicalSalespersonName(newQuote.salesperson_name);
        if (!newQuote.client_name || !canonicalSalespersonName || !normalizedQuoteNumber) {
            alert("Preencha o nome do cliente, o vendedor e o número do orçamento.");
            return;
        }

        setIsSavingQuote(true);
        try {
            const isInternalSalesperson = users.some(u => normalizePersonNameKey(u.name) === normalizePersonNameKey(canonicalSalespersonName));
            if (!isInternalSalesperson) {
                await dataService.addExternalSalesperson(canonicalSalespersonName);
            }

            if (newQuote.id) {
                await dataService.updateQuote(newQuote.id, {
                    ...newQuote,
                    salesperson_name: canonicalSalespersonName,
                    quote_number: normalizedQuoteNumber
                });
            } else {
                let currentClient = clients.find(c => c.name === newQuote.client_name);
                let finalClientId = newQuote.client_id;

                // If client doesn't exist, create it first
                if (!currentClient) {
                    const newClient = await dataService.upsertClient({
                        name: newQuote.client_name,
                        phone: '00000000000', // Dummy phone to satisfy schema constraints for manual entry
                        status: 'LEAD'
                    });
                    finalClientId = newClient.id;
                    setClients(prev => [...prev, newClient]); // Update local state
                }

                await dataService.saveQuote({
                    ...newQuote,
                    quote_number: normalizedQuoteNumber,
                    salesperson_name: canonicalSalespersonName,
                    client_id: finalClientId
                });
            }
            setIsModalOpen(false);
            setNewQuote({ status: 'OPEN', win_probability: 50, value: 0 });
            await loadData();
        } catch (e: any) {
            console.error(e);
            if (e.code === '23505' || e.message?.includes('duplicate') || e.message?.includes('violates unique constraint')) {
                const existingQuote = e.existingQuote || await dataService.findQuoteByNumber(normalizedQuoteNumber).catch(() => null);
                revealQuoteInList(normalizedQuoteNumber);
                alert(buildDuplicateQuoteMessage(normalizedQuoteNumber, existingQuote));
            } else {
                alert("Erro ao salvar orçamento: " + (e.message || 'Erro desconhecido.'));
            }
        } finally {
            setIsSavingQuote(false);
        }
    };

    const handleConvertToSale = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!convertingQuote) return;

        try {
            // 1. Create Sale
            await dataService.saveSale({
                id: '',
                saleNumber: convertingQuote.quote_number, // Use quote number as sale number or map it
                clientName: convertingQuote.client_name,
                clientId: convertingQuote.client_id,
                address: clients.find(c => c.id === convertingQuote.client_id)?.address || 'Não informado',
                category: SaleCategory.OUTROS, // default
                channel: SaleChannel.WHATSAPP, // default
                operatorId: user.id, // Assign to logged-in user
                status: SaleStatus.PENDENTE,
                value: convertingQuote.value,
                registeredAt: new Date().toISOString(),
                externalSalesperson: getCanonicalSalespersonName(convertingQuote.salesperson_name)
            });

            // 2. Update Quote Status
            await dataService.updateQuote(convertingQuote.id, { status: 'WON', justification: 'Convertido em venda' });

            setIsConverting(false);
            setConvertingQuote(null);
            loadData();
            alert("Orçamento convertido em venda com sucesso!");
        } catch (e) {
            alert("Erro ao converter orçamento.");
        }
    };

    const getStatusBadge = (status: string) => {
        switch(status) {
            case 'OPEN': return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black">Em Aberto</span>;
            case 'WON': return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-black">Fechado (Ganho)</span>;
            case 'LOST': return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-black">Perdido</span>;
            default: return null;
        }
    };

    const handleExportQuotes = () => {
        if (filteredQuotes.length === 0) {
            alert('Nao ha orcamentos para exportar com os filtros atuais.');
            return;
        }

        const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const today = new Date().toISOString().slice(0, 10);
        const totalOpenValue = filteredQuotes
            .filter(quote => quote.status === 'OPEN')
            .reduce((acc, quote) => acc + Number(quote.value || 0), 0);

        pdf.setFontSize(16);
        pdf.text('Relatorio de Orcamentos', 14, 16);
        pdf.setFontSize(9);
        pdf.text(`Gerado em ${today}`, 14, 23);
        pdf.text(`Periodo: ${dateRange.start || 'inicio'} ate ${dateRange.end || 'hoje'}`, 14, 28);
        pdf.text(`Registros: ${filteredQuotes.length}`, 14, 33);
        pdf.text(`Valor em aberto: ${formatCurrency(totalOpenValue)}`, 14, 38);

        autoTable(pdf, {
            startY: 43,
            head: [[
                'Nº Orçamento',
                'Cliente',
                'Data',
                'Vendedor',
                'Valor',
                'Chance',
                'Status',
                'Produto de Interesse'
            ]],
            body: filteredQuotes.map(quote => ([
                quote.quote_number,
                quote.client_name,
                new Date(quote.created_at).toLocaleDateString('pt-BR'),
                getCanonicalSalespersonName(quote.salesperson_name),
                formatCurrency(Number(quote.value || 0)),
                `${Number(quote.win_probability || 0)}%`,
                quote.status,
                quote.interest_product || 'Nao informado'
            ])),
            styles: {
                fontSize: 8,
                cellPadding: 2.5,
                valign: 'middle'
            },
            headStyles: {
                fillColor: [15, 23, 42],
                textColor: [255, 255, 255],
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 34 },
                1: { cellWidth: 48 },
                2: { cellWidth: 24, halign: 'center' },
                3: { cellWidth: 40 },
                4: { cellWidth: 28, halign: 'right' },
                5: { cellWidth: 20, halign: 'center' },
                6: { cellWidth: 24, halign: 'center' },
                7: { cellWidth: 60 }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            margin: { left: 14, right: 14 }
        });

        pdf.save(`orcamentos-${today}.pdf`);
    };

    const applyDatePreset = (preset: 'today' | 'yesterday' | 'last7' | 'month' | 'custom') => {
        setDatePreset(preset);
        if (preset === 'custom') return;

        const today = new Date();
        let start = today;
        let end = today;

        if (preset === 'yesterday') {
            start = shiftDate(today, -1);
            end = shiftDate(today, -1);
        } else if (preset === 'last7') {
            start = shiftDate(today, -6);
        } else if (preset === 'month') {
            start = getMonthStart(today);
        }

        setDateRange({
            start: formatLocalDateInput(start),
            end: formatLocalDateInput(end)
        });
    };

    return (
        <div className="p-8 space-y-8 h-full overflow-y-auto">
            <header className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Orçamentos</h1>
                    <p className="text-slate-500 font-medium">Acompanhe e converta suas cotações em vendas.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportQuotes}
                        className="px-5 py-3 bg-white text-slate-700 rounded-xl font-bold border border-slate-200 hover:border-blue-300 hover:text-blue-700 transition-colors flex items-center gap-2"
                    >
                        <Download size={18} /> Exportar PDF
                    </button>
                    <button
                        onClick={() => { setNewQuote({ status: 'OPEN', win_probability: 50, value: 0 }); setIsModalOpen(true); }}
                        className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                        <Plus size={18} /> Novo Orçamento
                    </button>
                </div>
            </header>

            {/* DASHBOARD */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-blue-100 border-l-4 border-l-blue-500">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">Orçamentos em Aberto</p>
                    <h3 className="text-3xl font-black text-slate-800">{metrics.openCount}</h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-green-100 border-l-4 border-l-green-500">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">Valor Total (Em Aberto / Filtro Atual)</p>
                    <h3 className="text-3xl font-black text-slate-800">
                        {formatCurrency(metrics.openValue)}
                    </h3>
                </div>
                <div className="bg-white p-6 rounded-2xl border shadow-sm border-slate-100">
                    <p className="text-xs text-slate-500 font-bold uppercase mb-2">Top Vendedores (Filtro Atual)</p>
                    <div className="flex gap-4">
                        {metrics.topSalespeople.map(([name, count]) => (
                            <div key={name} className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100 text-center cursor-pointer hover:border-blue-300 transition-colors" onClick={() => setSalespersonFilter(name)}>
                                <p className="font-bold text-slate-700 truncate text-sm">{name}</p>
                                <p className="text-xl font-black text-blue-600">{count}</p>
                            </div>
                        ))}
                        {metrics.topSalespeople.length === 0 && <p className="text-sm text-slate-400">Nenhum dado</p>}
                    </div>
                </div>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl border shadow-sm space-y-4">
                <div className="flex flex-wrap gap-2">
                    {[
                        { key: 'today', label: 'Hoje' },
                        { key: 'yesterday', label: 'Ontem' },
                        { key: 'last7', label: '7 dias' },
                        { key: 'month', label: 'Este mes' },
                        { key: 'custom', label: 'Outra data' }
                    ].map(option => (
                        <button
                            key={option.key}
                            onClick={() => applyDatePreset(option.key as typeof datePreset)}
                            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${datePreset === option.key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-blue-300 hover:text-blue-700'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">De</span>
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={e => {
                                setDatePreset('custom');
                                setDateRange(prev => ({ ...prev, start: e.target.value }));
                            }}
                            className="bg-transparent outline-none text-sm font-medium text-slate-700"
                        />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ate</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={e => {
                                setDatePreset('custom');
                                setDateRange(prev => ({ ...prev, end: e.target.value }));
                            }}
                            className="bg-transparent outline-none text-sm font-medium text-slate-700"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                    <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por cliente ou nº orçamento..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border-transparent focus:border-blue-500 focus:bg-white rounded-lg outline-none transition-all font-medium"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-slate-400" />
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as any)}
                        className="p-2 bg-slate-50 rounded-lg font-medium text-sm outline-none border-transparent focus:border-blue-500 cursor-pointer"
                    >
                        <option value="ALL">Todos os Status</option>
                        <option value="OPEN">Em Aberto</option>
                        <option value="WON">Fechado (Ganho)</option>
                        <option value="LOST">Perdido</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <User size={18} className="text-slate-400" />
                    <select
                        value={salespersonFilter}
                        onChange={e => setSalespersonFilter(e.target.value)}
                        className="p-2 bg-slate-50 rounded-lg font-medium text-sm outline-none border-transparent focus:border-blue-500 cursor-pointer max-w-[200px]"
                    >
                        <option value="ALL">Todos os Vendedores</option>
                        {allSalespeopleNames.map(n => (
                            <option key={n} value={n}>{n}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <LayoutGrid size={18} className="text-slate-400" />
                    <select
                        value={probabilityFilter}
                        onChange={e => setProbabilityFilter(e.target.value as ProbabilityFilter)}
                        className="p-2 bg-slate-50 rounded-lg font-medium text-sm outline-none border-transparent focus:border-blue-500 cursor-pointer"
                    >
                        <option value="ALL">Todas as Chances</option>
                        <option value="HIGH">Chance Alta (70%+)</option>
                        <option value="MEDIUM">Chance Média (40% a 69%)</option>
                        <option value="LOW">Chance Baixa (até 39%)</option>
                    </select>
                </div>
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
                {isLoading ? (
                    <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-blue-500" /></div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 text-[10px] uppercase font-black tracking-widest text-slate-500">
                            <tr>
                                <th className="p-4">Nº Orçamento</th>
                                <th className="p-4">Cliente / Lead</th>
                                <th className="p-4">Produto de Interesse</th>
                                <th className="p-4">Vendedor</th>
                                <th className="p-4">Valor</th>
                                <th className="p-4">Probabilidade</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredQuotes.length === 0 && (
                                <tr><td colSpan={8} className="p-8 text-center text-slate-400 font-medium">Nenhum orçamento encontrado.</td></tr>
                            )}
                            {filteredQuotes.map(q => (
                                <tr key={q.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="p-4 font-mono text-sm font-bold text-slate-600">{q.quote_number}</td>
                                    <td className="p-4 font-bold text-slate-800">{q.client_name}</td>
                                    <td className="p-4 text-sm font-semibold text-slate-600">{q.interest_product || 'Não informado'}</td>
                                    <td className="p-4 text-sm font-medium text-slate-600">{getCanonicalSalespersonName(q.salesperson_name)}</td>
                                    <td className="p-4 font-bold text-slate-800">{formatCurrency(q.value)}</td>
                                    <td className="p-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                <div className={`h-full ${q.win_probability >= 70 ? 'bg-green-500' : q.win_probability >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${q.win_probability}%` }}></div>
                                            </div>
                                            <span className="text-xs font-bold text-slate-500">{q.win_probability}%</span>
                                        </div>
                                    </td>
                                    <td className="p-4">{getStatusBadge(q.status)}</td>
                                    <td className="p-4 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => { setNewQuote({ ...q, salesperson_name: getCanonicalSalespersonName(q.salesperson_name) }); setIsModalOpen(true); }} className="p-2 bg-white rounded-lg border shadow-sm hover:text-blue-600 transition-colors" title="Editar"><FileText size={16} /></button>
                                        {q.status === 'OPEN' && (
                                            <button onClick={() => { setConvertingQuote(q); setIsConverting(true); }} className="p-2 bg-green-50 text-green-600 rounded-lg border border-green-200 shadow-sm hover:bg-green-100 transition-colors" title="Transformar em Venda"><ArrowRight size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* MODAL REGISTRO/EDIÇÃO */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                            <h2 className="text-xl font-black uppercase text-slate-800 tracking-tighter">
                                {newQuote.id ? 'Editar Orçamento' : 'Novo Orçamento'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500"><X size={24} /></button>
                        </div>
                        <form onSubmit={handleSaveQuote} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Nº do Orçamento</label>
                                    <input required type="text" value={newQuote.quote_number || ''} onChange={e => setNewQuote({...newQuote, quote_number: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-mono text-sm outline-none focus:border-blue-500" placeholder="Ex: ORC-2024-001" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Vendedor Responsável</label>
                                    <AutocompleteInput
                                        value={newQuote.salesperson_name || ''}
                                        onChange={val => setNewQuote({...newQuote, salesperson_name: getCanonicalSalespersonName(val)})}
                                        options={salespersonNameOptions}
                                        placeholder="Nome do vendedor..."
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 focus:bg-white rounded-xl outline-none transition-all font-bold text-sm text-slate-700 shadow-inner"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Cliente / Lead</label>
                                    <AutocompleteInput
                                        value={newQuote.client_name || ''}
                                        onChange={val => {
                                            const matched = clients.find(c => c.name === val);
                                            setNewQuote({...newQuote, client_name: val, client_id: matched?.id});
                                        }}
                                        options={clients.map(c => ({ id: c.id, label: c.name }))}
                                        placeholder="Nome do cliente (busque ou digite novo)..."
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 focus:bg-white rounded-xl outline-none transition-all font-bold text-sm text-slate-700 shadow-inner"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Produto de Interesse</label>
                                    {newQuote.interest_product === 'ADD_NEW' ? (
                                        <div className="flex gap-2">
                                            <input
                                                autoFocus
                                                type="text"
                                                placeholder="Digite o novo produto..."
                                                className="w-full p-3 bg-white border border-blue-300 rounded-xl font-bold text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-inner"
                                                onBlur={(e) => {
                                                    const val = e.target.value.trim();
                                                    if (val) {
                                                        if (!interestProducts.includes(val)) setInterestProducts([...interestProducts, val]);
                                                        setNewQuote({...newQuote, interest_product: val});
                                                    } else {
                                                        setNewQuote({...newQuote, interest_product: ''});
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.currentTarget.blur();
                                                    }
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <select
                                            value={newQuote.interest_product || ''}
                                            onChange={e => setNewQuote({...newQuote, interest_product: e.target.value})}
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none shadow-sm"
                                        >
                                            <option value="">-- Selecione o Produto --</option>
                                            {interestProducts.map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                            {newQuote.interest_product && !interestProducts.includes(newQuote.interest_product) && newQuote.interest_product !== 'ADD_NEW' && (
                                                <option value={newQuote.interest_product}>{newQuote.interest_product}</option>
                                            )}
                                            <option value="ADD_NEW" className="font-black text-blue-600 bg-blue-50">+ Adicionar Novo Produto...</option>
                                        </select>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Valor (R$)</label>
                                    <CurrencyInput required value={newQuote.value || 0} onChange={val => setNewQuote({...newQuote, value: val})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Chance de Fechar (%)</label>
                                    <input required type="number" min="0" max="100" value={newQuote.win_probability || 50} onChange={e => setNewQuote({...newQuote, win_probability: parseInt(e.target.value)})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:border-blue-500" />
                                </div>
                                <div className="col-span-1 space-y-1">
                                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Status</label>
                                    <select value={newQuote.status} onChange={e => setNewQuote({...newQuote, status: e.target.value as QuoteStatus})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm outline-none focus:border-blue-500">
                                        <option value="OPEN">Em Aberto</option>
                                        <option value="WON">Fechado (Ganho)</option>
                                        <option value="LOST">Perdido</option>
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Justificativa / Motivo</label>
                                <textarea value={newQuote.justification || ''} onChange={e => setNewQuote({...newQuote, justification: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-medium text-sm outline-none focus:border-blue-500 min-h-[80px]" placeholder="Por que não fechou ainda? Ou qual o motivo de perda/ganho?" />
                            </div>

                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                                <button type="submit" disabled={isSavingQuote} className="px-8 py-3 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2">
                                    {isSavingQuote ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar Orçamento'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL CONVERTER VENDA */}
            {isConverting && convertingQuote && (
                <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center animate-in zoom-in">
                        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle size={40} />
                        </div>
                        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter mb-2">Transformar em Venda?</h2>
                        <p className="text-slate-500 mb-8 font-medium">Você está preste a converter o orçamento <strong className="text-slate-800">{convertingQuote.quote_number}</strong> de <strong className="text-slate-800">{convertingQuote.client_name}</strong> em uma venda real no sistema.</p>

                        <form onSubmit={handleConvertToSale} className="space-y-4">
                            <div className="flex gap-4">
                                <button type="button" onClick={() => { setIsConverting(false); setConvertingQuote(null); }} className="flex-1 py-4 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                                <button type="submit" className="flex-1 py-4 bg-green-600 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-green-700 shadow-xl shadow-green-500/30 transition-all active:scale-95 flex justify-center items-center gap-2">
                                    <DollarSign size={16} /> Confirmar Venda
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};




