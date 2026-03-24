import React, { useState, useEffect } from 'react';
import {
    Search, Filter, Plus, Phone, MessageCircle, Calendar,
    UserPlus, CheckCircle2, MapPin, Globe, Mail, DollarSign,
    Target, Loader2, Users, ChevronRight, X, Send, BarChart3, Clock, Play, FileText,
    History, ClipboardList, Map as MapIcon
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Client, CallType, User } from '../types';
import { normalizeComparableText } from '../utils/clientPortfolio';
import { resolveKnownCity } from '../utils/addressParser';

const FUNNEL_STAGES = [
    { id: 'NEW', label: 'Novo Lead', color: 'bg-blue-100 text-blue-700' },
    { id: 'CONTACT_ATTEMPT', label: 'Tentativa', color: 'bg-yellow-100 text-yellow-700' },
    { id: 'CONTACT_MADE', label: 'Contato Feito', color: 'bg-orange-100 text-orange-700' },
    { id: 'QUALIFIED', label: 'Qualificado', color: 'bg-purple-100 text-purple-700' },
    { id: 'PROPOSAL_SENT', label: 'Proposta', color: 'bg-indigo-100 text-indigo-700' },
    { id: 'PHYSICAL_VISIT', label: 'Visita Física', color: 'bg-pink-100 text-pink-700' }
];

const ORIGIN_TYPES = [
    { id: 'ALL', label: 'Todas Origens' },
    { id: 'GOOGLE_SEARCH', label: 'Google Maps' },
    { id: 'MANUAL', label: 'Manual' },
    { id: 'CSV_IMPORT', label: 'Planilha CSV' }
];

import { CampaignPlannerService } from '../services/campaignPlannerService';

const normalizeProspectCity = (value?: string) =>
    resolveKnownCity(value) || value || '';

const matchesProspectLocation = (value?: string, filter?: string, mode: 'city' | 'neighborhood' = 'city') => {
    if (!filter || filter === 'ALL') return true;

    const normalizedValue = mode === 'city'
        ? normalizeComparableText(normalizeProspectCity(value))
        : normalizeComparableText(value);
    const normalizedFilter = mode === 'city'
        ? normalizeComparableText(normalizeProspectCity(filter))
        : normalizeComparableText(filter);

    return Boolean(normalizedValue) && normalizedValue === normalizedFilter;
};

const buildProspectAddressLabel = (client?: Partial<Client> | null) =>
    client?.address || [client?.street, client?.neighborhood, client?.city, client?.state].filter(Boolean).join(', ');

const formatHistoryTimestamp = (value?: string) => {
    if (!value) return 'Data indisponivel';

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return 'Data invalida';
    }

    return parsed.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatHistoryDuration = (value?: number | null) => {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration < 0) {
        return 'Duracao indisponivel';
    }

    return `${Math.floor(duration / 60)}m ${duration % 60}s`;
};

const formatHistoryOperatorLabel = (value?: string | null) =>
    value ? value.substring(0, 8) : 'Nao informado';

const getSafeText = (value: unknown, fallback = '') =>
    value === null || value === undefined ? fallback : String(value).trim() || fallback;

const normalizeProspectForView = (client: Client): Client => ({
    ...client,
    id: getSafeText(client.id),
    name: getSafeText(client.name, 'Sem Nome'),
    phone: getSafeText(client.phone),
    address: getSafeText(client.address),
    email: getSafeText(client.email, undefined as any),
    website: getSafeText(client.website, undefined as any),
    responsible_phone: getSafeText(client.responsible_phone, undefined as any),
    buyer_name: getSafeText(client.buyer_name, undefined as any),
    interest_product: getSafeText(client.interest_product, undefined as any),
    external_id: getSafeText(client.external_id, undefined as any),
    phone_secondary: getSafeText(client.phone_secondary, undefined as any),
    street: getSafeText(client.street, undefined as any),
    neighborhood: getSafeText(client.neighborhood, undefined as any),
    city: getSafeText(client.city, undefined as any),
    state: getSafeText(client.state, undefined as any),
    zip_code: getSafeText(client.zip_code, undefined as any),
    origin: client.origin === 'GOOGLE_SEARCH' || client.origin === 'CSV_IMPORT' ? client.origin : 'MANUAL',
    status: client.status === 'LEAD' || client.status === 'INATIVO' ? client.status : 'CLIENT',
    funnel_status: FUNNEL_STAGES.some(stage => stage.id === client.funnel_status) ? client.funnel_status : 'NEW'
});

const normalizeOperatorForView = (operator: User): User => ({
    ...operator,
    id: getSafeText(operator.id),
    name: getSafeText(operator.name, 'Sem Nome'),
    username: getSafeText(operator.username)
});

// INTEREST_PRODUCTS is now dynamically loaded from DB

const MetricCard: React.FC<{ title: string; value: string | number; icon: any; color: string }> = ({ title, value, icon: Icon, color }) => {
    return (
        <div className={`p-6 bg-white rounded-[32px] border shadow-sm flex items-center gap-4 ${color}`}>
            <div className={`p-4 rounded-2xl bg-white/50 backdrop-blur-md`}>
                <Icon size={24} />
            </div>
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">{title}</p>
                <h3 className="text-3xl font-black tracking-tight leading-none">{value}</h3>
            </div>
        </div>
    );
};

const Prospects: React.FC = () => {
    const [prospects, setProspects] = useState<Client[]>([]);
    const [operators, setOperators] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedStage, setSelectedStage] = useState('ALL');
    const [selectedOrigin, setSelectedOrigin] = useState('ALL');
    const [selectedInterest, setSelectedInterest] = useState('ALL');
    const [neighborhoodFilter, setNeighborhoodFilter] = useState('ALL');
    const [cityFilter, setCityFilter] = useState('ALL');
    const [interestProducts, setInterestProducts] = useState<string[]>([]);

    const [selectedClient, setSelectedClient] = useState<Client | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newProspect, setNewProspect] = useState<Partial<Client>>({});

    const [bulkDispatchActive, setBulkDispatchActive] = useState(false);
    const [bulkOperator, setBulkOperator] = useState('');
    const [isDispatching, setIsDispatching] = useState(false);

    const [clientHistory, setClientHistory] = useState<{ calls: any[], protocols: any[] }>({ calls: [], protocols: [] });
    const [historyLoading, setHistoryLoading] = useState(false);

    const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
    const [newVisit, setNewVisit] = useState({ date: '', salespersonId: '' });

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [data, ops, products] = await Promise.all([
                dataService.getProspects(),
                dataService.getUsers(),
                CampaignPlannerService.getDistinctInterestProducts()
            ]);
            const safeProspects = (data || []).filter(Boolean).map(normalizeProspectForView).filter(client => Boolean(client.id));
            const safeOperators = (ops || [])
                .filter(Boolean)
                .map(normalizeOperatorForView)
                .filter(operator => Boolean(operator.id) && operator.role !== 'ADMIN');
            const safeProducts = (products || []).map(product => getSafeText(product)).filter(Boolean);

            setProspects(safeProspects);
            setOperators(safeOperators);
            setInterestProducts(safeProducts);
            if (safeOperators.length > 0) {
                setBulkOperator(safeOperators[0].id);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProspect = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProspect.name || !newProspect.phone) return alert("Nome e Telefone obrigatórios");

        try {
            await dataService.upsertClient({
                ...newProspect,
                status: 'LEAD',
                funnel_status: 'NEW',
                origin: 'MANUAL'
            });
            setIsModalOpen(false);
            setNewProspect({});
            loadData();
            alert("Prospecto cadastrado!");
        } catch (e) {
            alert("Erro ao salvar prospecto");
        }
    };

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            await dataService.updateClientFields(id, { funnel_status: newStatus as any });
            setProspects(prev => prev.map(p => p.id === id ? { ...p, funnel_status: newStatus as any } : p));
            if (selectedClient?.id === id) {
                setSelectedClient(prev => prev ? { ...prev, funnel_status: newStatus as any } : null);
            }
        } catch (e) {
            alert("Erro ao atualizar status");
        }
    };

    const loadClientHistory = async (clientId: string) => {
        setHistoryLoading(true);
        try {
            const history = await dataService.getClientHistory(clientId);
            setClientHistory(history);
        } catch (error) {
            console.error("Error loading history:", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleSelectClient = (client: Client) => {
        setSelectedClient(client);
        loadClientHistory(client.id);
    };

    const handleDispatch = async (ids: string[], operatorId: string) => {
        if (!operatorId) return alert("Selecione um operador");
        setIsDispatching(true);
        try {
            await dataService.dispatchLeadsToQueue(ids, operatorId, CallType.PROSPECCAO);
            alert(`${ids.length} Leads encaminhados para a fila com sucesso!`);
            setBulkDispatchActive(false);
        } catch (e) {
            alert("Erro ao despachar leads");
        } finally {
            setIsDispatching(false);
        }
    };

    const handleScheduleVisit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClient || !newVisit.salespersonId || !newVisit.date) return alert("Preencha todos os campos");

        try {
            const salesperson = operators.find(o => o.id === newVisit.salespersonId);
            await dataService.createVisit({
                clientId: selectedClient.id,
                clientName: selectedClient.name,
                address: buildProspectAddressLabel(selectedClient),
                phone: selectedClient.phone,
                scheduledDate: newVisit.date,
                salespersonId: salesperson?.id || '',
                salespersonName: salesperson?.name || '',
                status: 'PENDING',
                originType: 'MANUAL',
                notes: 'Agendado via CRM (Prospects)'
            });
            setIsVisitModalOpen(false);
            setNewVisit({ date: '', salespersonId: '' });
            alert("Visita agendada com sucesso! O lead já consta no roteiro.");
        } catch (error) {
            console.error(error);
            alert("Erro ao agendar visita.");
        }
    };

    const filteredProspects = prospects.filter(p => {
        if (selectedStage !== 'ALL' && (p.funnel_status || 'NEW') !== selectedStage) return false;
        if (selectedOrigin !== 'ALL' && (p.origin || 'MANUAL') !== selectedOrigin) return false;
        if (selectedInterest !== 'ALL' && (p.interest_product || '') !== selectedInterest) return false;
        if (!matchesProspectLocation(p.neighborhood, neighborhoodFilter, 'neighborhood')) return false;
        if (!matchesProspectLocation(p.city, cityFilter, 'city')) return false;
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            return (p.name || '').toLowerCase().includes(lower) ||
                p.phone.includes(lower) ||
                (p.phone_secondary || '').includes(lower);
        }
        return true;
    });

    const neighborhoods = Array.from(
        prospects.reduce((bucket, prospect) => {
            const neighborhood = String(prospect.neighborhood || '').trim();
            const normalized = normalizeComparableText(neighborhood);
            if (neighborhood && normalized && !bucket.has(normalized)) {
                bucket.set(normalized, neighborhood);
            }
            return bucket;
        }, new globalThis.Map<string, string>()).values()
    ).sort((a, b) => a.localeCompare(b, 'pt-BR')) as string[];

    const cities = Array.from(
        prospects.reduce((bucket, prospect) => {
            const city = normalizeProspectCity(prospect.city)?.trim();
            const normalized = normalizeComparableText(city);
            if (city && normalized && !bucket.has(normalized)) {
                bucket.set(normalized, city);
            }
            return bucket;
        }, new globalThis.Map<string, string>()).values()
    ).sort((a, b) => a.localeCompare(b, 'pt-BR')) as string[];

    const totalLeads = prospects.length;
    const novosLeads = prospects.filter(p => ['NEW', 'CONTACT_ATTEMPT'].includes(p.funnel_status || 'NEW')).length;
    const emContato = prospects.filter(p => ['CONTACT_MADE', 'QUALIFIED'].includes(p.funnel_status || 'NEW')).length;
    const propostas = prospects.filter(p => p.funnel_status === 'PROPOSAL_SENT').length;

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500 h-full flex flex-col">
            <header className="flex flex-col md:flex-row justify-between items-end gap-4 shrink-0">
                <div>
                    <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Gestão de Leads (CRM)</h2>
                    <p className="text-slate-500 text-sm font-bold mt-1">Isolado da base de clientes. Use para focar em prospecção nativa.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-700 transition-all"
                >
                    <Plus size={18} /> Cadastrar Lead
                </button>
            </header>

            {/* KPIs Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                <MetricCard title="Total Cadastrado" value={totalLeads} icon={Users} color="border-slate-200 text-slate-700 bg-slate-50" />
                <MetricCard title="Novos Leads" value={novosLeads} icon={Target} color="border-blue-200 text-blue-700 bg-blue-50" />
                <MetricCard title="Em Negociação" value={emContato} icon={Clock} color="border-amber-200 text-amber-700 bg-amber-50" />
                <MetricCard title="Propostas Enviadas" value={propostas} icon={FileText} color="border-indigo-200 text-indigo-700 bg-indigo-50" />
            </div>

            <div className="bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4 shrink-0">
                <div className="flex-1 flex items-center gap-3 w-full bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200">
                    <Search className="text-slate-400 shrink-0" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar lead por nome ou telefone..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 no-scrollbar">
                    <select
                        className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 rounded-xl py-3 px-4 outline-none cursor-pointer hover:bg-slate-100"
                        value={selectedStage}
                        onChange={e => setSelectedStage(e.target.value)}
                    >
                        <option value="ALL">Todas Fases</option>
                        {FUNNEL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 rounded-xl py-3 px-4 outline-none cursor-pointer hover:bg-slate-100"
                        value={selectedOrigin}
                        onChange={e => setSelectedOrigin(e.target.value)}
                    >
                        {ORIGIN_TYPES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 rounded-xl py-3 px-4 outline-none cursor-pointer hover:bg-slate-100"
                        value={selectedInterest}
                        onChange={e => setSelectedInterest(e.target.value)}
                    >
                        <option value="ALL">Todos Interesses</option>
                        {interestProducts.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 rounded-xl py-3 px-4 outline-none cursor-pointer hover:bg-slate-100"
                        value={neighborhoodFilter}
                        onChange={e => setNeighborhoodFilter(e.target.value)}
                    >
                        <option value="ALL">Todos Bairros</option>
                        {neighborhoods.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 rounded-xl py-3 px-4 outline-none cursor-pointer hover:bg-slate-100"
                        value={cityFilter}
                        onChange={e => setCityFilter(e.target.value)}
                    >
                        <option value="ALL">Todas Cidades</option>
                        {cities.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>

            {/* MASTER DETAIL LAYOUT */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-[60vh]">
                {/* LIST */}
                <div className="lg:col-span-4 flex flex-col h-[75vh]">
                    <div className="mb-4 shrink-0">
                        {filteredProspects.length > 0 && (
                            <div className="p-4 bg-slate-900 rounded-2xl flex flex-col gap-3">
                                <div className="flex justify-between items-center text-white">
                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-70">{filteredProspects.length} Resultados Filtrados</span>
                                    <button
                                        onClick={() => setBulkDispatchActive(!bulkDispatchActive)}
                                        className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        {bulkDispatchActive ? 'Cancelar Lote' : 'Ações em Lote'}
                                    </button>
                                </div>
                                {bulkDispatchActive && (
                                    <div className="flex gap-2 items-center animate-in slide-in-from-top-4">
                                        <select
                                            className="flex-1 bg-white/10 border-none text-white text-xs font-bold rounded-xl py-2 px-3 outline-none"
                                            value={bulkOperator}
                                            onChange={e => setBulkOperator(e.target.value)}
                                        >
                                            {operators.map(o => <option key={o.id} value={o.id} className="text-slate-900">{o.name}</option>)}
                                        </select>
                                        <button
                                            onClick={() => handleDispatch(filteredProspects.map(p => p.id), bulkOperator)}
                                            disabled={isDispatching}
                                            className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                                        >
                                            {isDispatching ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                            Despachar Lote
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300">
                            <Loader2 className="animate-spin" size={32} />
                            <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Leads...</p>
                        </div>
                    ) : filteredProspects.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-slate-300 font-black uppercase tracking-widest text-[10px]">Nenhum lead encontrado</div>
                    ) : (
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                            {filteredProspects.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => handleSelectClient(c)}
                                    className={`w-full p-6 bg-white border-2 rounded-[32px] flex flex-col gap-3 group transition-all text-left ${selectedClient?.id === c.id ? 'border-blue-600 shadow-xl shadow-blue-500/10' : 'border-slate-50 hover:border-slate-200 shadow-sm'}`}
                                >
                                    <div className="flex justify-between items-start w-full">
                                        <div className="flex-1">
                                            <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight leading-tight line-clamp-1">{c.name}</h4>
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.phone}</span>
                                        </div>
                                        <ChevronRight size={18} className={`shrink-0 transition-transform ${selectedClient?.id === c.id ? 'text-blue-600 translate-x-1' : 'text-slate-200'}`} />
                                    </div>
                                    <div className="flex items-center gap-2 w-full justify-between">
                                        <span className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest ${FUNNEL_STAGES.find(s => s.id === (c.funnel_status || 'NEW'))?.color || 'bg-slate-100 text-slate-500'}`}>
                                            {FUNNEL_STAGES.find(s => s.id === (c.funnel_status || 'NEW'))?.label}
                                        </span>
                                        {c.origin === 'GOOGLE_SEARCH' && <Globe size={12} className="text-blue-400" />}
                                        {c.origin === 'CSV_IMPORT' && <FileText size={12} className="text-green-400" />}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* DETAILS PANE */}
                <div className="lg:col-span-8 h-[75vh]">
                    {selectedClient ? (
                        <div className="bg-white h-full rounded-[56px] shadow-sm border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-right-4 duration-300">
                            <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
                                <div className="space-y-4 w-full">
                                    <div className="flex items-center gap-3">
                                        <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">FICHA DO LEAD</span>
                                        <span className="text-slate-400 text-[9px] font-black tracking-widest uppercase flex items-center gap-1">Origem: {selectedClient.origin === 'GOOGLE_SEARCH' ? <Globe size={12} className="text-blue-400" /> : selectedClient.origin === 'CSV_IMPORT' ? <FileText size={12} className="text-emerald-400" /> : <UserPlus size={12} />} {selectedClient.origin || 'MANUAL'}</span>
                                    </div>
                                    <div className="flex justify-between items-start">
                                        <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight uppercase pr-4">{selectedClient.name}</h3>
                                        <button onClick={() => setSelectedClient(null)} className="p-2 hover:bg-slate-200 text-slate-400 rounded-full transition-colors"><X size={24} /></button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4 pt-2">
                                        <span className="flex items-center gap-2 text-sm font-black text-blue-600 bg-blue-50 px-4 py-2 rounded-xl border border-blue-100"><Phone size={14} /> {selectedClient.phone}</span>
                                        <select
                                            className="bg-white border-2 border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-600 rounded-xl py-2 px-3 outline-none cursor-pointer hover:border-slate-200"
                                            value={selectedClient.funnel_status || 'NEW'}
                                            onChange={(e) => handleUpdateStatus(selectedClient.id, e.target.value)}
                                        >
                                            {FUNNEL_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                                {/* DADOS GERAIS */}
                                <section className="space-y-6">
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><FileText size={14} className="text-indigo-500" /> Informações do Lead</h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {selectedClient.email && (
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Email Corporativo</span>
                                                <p className="text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedClient.email}</p>
                                            </div>
                                        )}
                                        {selectedClient.website && (
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Website</span>
                                                <a href={selectedClient.website} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-500 hover:underline flex items-center gap-1 bg-blue-50 p-3 rounded-xl border border-blue-100 w-fit">Acessar Site <Globe size={12} /></a>
                                            </div>
                                        )}
                                        {selectedClient.buyer_name && (
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Comprador/Decisor</span>
                                                <p className="text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">{selectedClient.buyer_name}</p>
                                            </div>
                                        )}
                                        {selectedClient.interest_product && (
                                            <div className="space-y-1">
                                                <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Produto de Interesse</span>
                                                <p className="text-sm font-black text-emerald-600 bg-emerald-50 p-3 rounded-xl border border-emerald-100">{selectedClient.interest_product}</p>
                                            </div>
                                        )}
                                        <div className="space-y-1 md:col-span-2">
                                            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Endereço Principal</span>
                                            {selectedClient.neighborhood ? (
                                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex flex-col gap-1">
                                                    <p className="text-sm font-bold text-slate-700">{selectedClient.street || '-'}</p>
                                                    <p className="text-xs font-bold text-slate-500 uppercase">{selectedClient.neighborhood} - {selectedClient.city} / {selectedClient.state}</p>
                                                    <p className="text-[10px] text-slate-400">CEP: {selectedClient.zip_code || '-'}</p>
                                                </div>
                                            ) : (
                                                <p className="text-sm font-bold text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">{selectedClient.address || 'Sem endereço registrado na captação.'}</p>
                                            )}
                                        </div>
                                    </div>
                                </section>

                                {/* AÇÕES DE ENCAMINHAMENTO */}
                                <section className="space-y-6 pt-6 border-t border-slate-100">
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 pb-2"><Send size={14} className="text-emerald-500" /> Encaminhar para Ação Comercial</h5>

                                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-8 rounded-[32px] border border-emerald-100 shadow-sm relative overflow-hidden">
                                        <Target size={120} className="absolute -right-10 -bottom-10 text-emerald-200/50" />
                                        <div className="flex flex-col gap-6 relative z-10">
                                            <p className="text-xs font-black uppercase tracking-widest text-emerald-700/70">Selecione um operador para colocar esse lead na fila de ligações prioritárias do telemarketing. O lead estará visível no dashboard do operador imediatamente.</p>
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-lg">
                                                <select
                                                    className="flex-1 bg-white border-2 border-emerald-100 text-sm font-bold text-slate-700 rounded-2xl py-4 px-5 outline-none focus:ring-4 focus:ring-emerald-500/20 transition-all hover:border-emerald-300 shadow-sm"
                                                    value={bulkOperator}
                                                    onChange={e => setBulkOperator(e.target.value)}
                                                >
                                                    {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                                </select>
                                                <button
                                                    onClick={() => handleDispatch([selectedClient.id], bulkOperator)}
                                                    disabled={isDispatching}
                                                    className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 shrink-0 border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1"
                                                >
                                                    {isDispatching ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                                    Fila (Call)
                                                </button>
                                            </div>

                                            <div className="pt-4 mt-2 border-t border-emerald-200/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                                                <div className="flex items-center gap-3 text-emerald-800">
                                                    <MapIcon size={24} className="opacity-50" />
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black uppercase tracking-widest">Ação Externa</span>
                                                        <span className="text-[10px] uppercase font-bold opacity-60">Enviar Vendedor na Rua</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setIsVisitModalOpen(true)}
                                                    className="w-full sm:w-auto px-6 py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors shadow-sm"
                                                >
                                                    Agendar Roteiro
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* HISTÓRICO DE INTERAÇÕES */}
                                <section className="space-y-4 pt-6 border-t border-slate-100">
                                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><History size={14} className="text-blue-500" /> Histórico de Contatos</h5>
                                    {historyLoading ? (
                                        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-200" /></div>
                                    ) : clientHistory.calls.length > 0 ? (
                                        <div className="space-y-3">
                                            {clientHistory.calls.map(call => (
                                                <div key={call.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                                                    <div className="flex justify-between items-start">
                                                        <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-slate-200 text-slate-600 rounded">{call.type}</span>
                                                        <span className="text-[8px] font-black text-slate-400 uppercase">{formatHistoryTimestamp(call.startTime)}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-700 italic">"{call.responses?.written_report || call.responses?.questionnaire_text_summary || call.responses?.justificativa || 'Sem notas extras registradas.'}"</p>
                                                    <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> {formatHistoryDuration(call.duration)}</span>
                                                        <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">ID Operador: {formatHistoryOperatorLabel(call.operatorId)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-center">
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Nenhuma interação telefônica registrada ainda.</p>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full bg-slate-50 border-4 border-dashed border-slate-200 rounded-[56px] flex flex-col items-center justify-center p-20 text-center gap-6 opacity-60 transition-all hover:opacity-100">
                            <Target size={84} className="text-blue-300" />
                            <div className="space-y-2">
                                <h4 className="text-xl font-black uppercase text-slate-500 tracking-tight">Área de Análise</h4>
                                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Selecione um lead na lista lateral para analisar a ficha e despachar para os operadores.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Novo Prospecto */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Novo Lead Manual</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveProspect} className="space-y-4">
                            <input type="text" placeholder="Nome da Empresa/Cliente" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all" value={newProspect.name || ''} onChange={e => setNewProspect({ ...newProspect, name: e.target.value })} required />
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Telefone Principal" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all" value={newProspect.phone || ''} onChange={e => setNewProspect({ ...newProspect, phone: e.target.value })} required />
                                <input type="text" placeholder="Telefone Secundário" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all" value={newProspect.phone_secondary || ''} onChange={e => setNewProspect({ ...newProspect, phone_secondary: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <input type="text" placeholder="Comprador" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all" value={newProspect.buyer_name || ''} onChange={e => setNewProspect({ ...newProspect, buyer_name: e.target.value })} />
                                {newProspect.interest_product === 'ADD_NEW' ? (
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Digite o novo produto..."
                                        className="w-full p-4 bg-white rounded-2xl outline-none font-bold text-sm border border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all shadow-inner"
                                        onBlur={(e) => {
                                            const val = e.target.value.trim();
                                            if (val) {
                                                if (!interestProducts.includes(val)) setInterestProducts([...interestProducts, val]);
                                                setNewProspect({...newProspect, interest_product: val});
                                            } else {
                                                setNewProspect({...newProspect, interest_product: ''});
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                            }
                                        }}
                                    />
                                ) : (
                                    <select
                                        value={newProspect.interest_product || ''}
                                        onChange={e => setNewProspect({...newProspect, interest_product: e.target.value})}
                                        className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all cursor-pointer appearance-none text-slate-700"
                                    >
                                        <option value="">-- Produto de Interesse --</option>
                                        {interestProducts.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                        {newProspect.interest_product && !interestProducts.includes(newProspect.interest_product) && newProspect.interest_product !== 'ADD_NEW' && (
                                            <option value={newProspect.interest_product}>{newProspect.interest_product}</option>
                                        )}
                                        <option value="ADD_NEW" className="font-black text-blue-600 bg-blue-50">+ Adicionar Novo Produto...</option>
                                    </select>
                                )}
                            </div>

                            <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 space-y-4">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Endereço Estruturado</h4>
                                <div className="space-y-3">
                                    <input type="text" placeholder="Rua e Número" value={newProspect.street || ''} onChange={e => setNewProspect({ ...newProspect, street: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" placeholder="Bairro" value={newProspect.neighborhood || ''} onChange={e => setNewProspect({ ...newProspect, neighborhood: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                                        <input type="text" placeholder="Cidade" value={newProspect.city || ''} onChange={e => setNewProspect({ ...newProspect, city: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <input type="text" placeholder="Estado (UF)" maxLength={2} value={newProspect.state || ''} onChange={e => setNewProspect({ ...newProspect, state: e.target.value.toUpperCase() })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                                        <input type="text" placeholder="CEP" value={newProspect.zip_code || ''} onChange={e => setNewProspect({ ...newProspect, zip_code: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                                    </div>
                                </div>
                            </div>

                            <textarea placeholder="Observações Gerais (opcional)" className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-blue-500 focus:bg-white transition-all resize-none min-h-[80px] opacity-60" value={newProspect.address || ''} onChange={e => setNewProspect({ ...newProspect, address: e.target.value })} />

                            <div className="flex justify-end pt-4">
                                <button type="submit" className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-all border-b-4 border-blue-800 active:border-b-0 active:translate-y-1">Salvar Lead e Inserir no CRM</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Agendamento de Rota */}
            {isVisitModalOpen && selectedClient && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Agendar Rota</h3>
                            <button onClick={() => setIsVisitModalOpen(false)} className="text-slate-400 hover:bg-slate-100 p-2 rounded-full transition-colors"><X size={20} /></button>
                        </div>
                        <p className="text-xs font-bold text-slate-500 mb-6">Este lead ({selectedClient.name}) será enviado ao roteiro de visitas da equipe externa.</p>

                        <form onSubmit={handleScheduleVisit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selecionar Vendedor (Operador)</label>
                                <select
                                    className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-emerald-500 transition-all"
                                    value={newVisit.salespersonId}
                                    onChange={e => setNewVisit({ ...newVisit, salespersonId: e.target.value })}
                                    required
                                >
                                    <option value="" disabled>Selecione alguém...</option>
                                    {operators.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Sugerida para Visita</label>
                                <input
                                    type="date"
                                    className="w-full p-4 bg-slate-50 rounded-2xl outline-none font-bold text-sm border border-slate-200 focus:border-emerald-500 transition-all"
                                    value={newVisit.date}
                                    onChange={e => setNewVisit({ ...newVisit, date: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="flex justify-end pt-4">
                                <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-all border-b-4 border-emerald-800 active:border-b-0 active:translate-y-1">
                                    Confirmar no Roteiro
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Prospects;
