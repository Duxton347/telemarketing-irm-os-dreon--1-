import React from 'react';
import {
    MapPin, Plus, Calendar, User, Search, Navigation,
    MoreVertical, CheckCircle2, Clock, X, Save, Loader2,
    Filter, ArrowUp, ArrowDown, FileText, Download, TrendingUp, Users, Trash2, History, ArrowRight
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Visit, Client, User as UserType, CallType, SaleStatus, ExternalSalesperson, SaleCategory, SaleChannel } from '../types';
import { exportToExcel, exportToPDF } from '../utils/RouteExport';
import { normalizePhone } from '../lib/supabase';

const Routes: React.FC<{ user: UserType }> = ({ user }) => {
    // --- STATE ---
    const [activeTab, setActiveTab] = React.useState<'BUILDER' | 'EXECUTION' | 'HISTORY'>('EXECUTION');

    // Data State
    const [visits, setVisits] = React.useState<Visit[]>([]);
    const [candidates, setCandidates] = React.useState<any[]>([]);
    const [selectedCandidates, setSelectedCandidates] = React.useState<any[]>([]);
    const [operators, setOperators] = React.useState<UserType[]>([]);
    const [externalSalespeople, setExternalSalespeople] = React.useState<ExternalSalesperson[]>([]);

    // Filters
    const [builderFilters, setBuilderFilters] = React.useState({
        operatorId: '',
        date: new Date().toISOString().split('T')[0],
        type: 'ALL'
    });

    const [executionFilters, setExecutionFilters] = React.useState({
        externalSalesperson: '',
        status: 'PENDING'
    });

    const [historyFilters, setHistoryFilters] = React.useState({
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        externalSalesperson: ''
    });

    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);

    // Modal State
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [activeVisit, setActiveVisit] = React.useState<Visit | null>(null);
    const [modalType, setModalType] = React.useState<'FINALIZE' | 'MANUAL_ADD' | 'MANAGE_SALESPEOPLE' | null>(null);

    // Finalize Form Data
    const [finalizeData, setFinalizeData] = React.useState({
        outcome: 'REALIZED',
        note: '',
        rescheduleReason: '',
        rescheduleDate: '',
        newPhone: '',
        newName: '',
        generateSale: false,
        saleValue: 0,
        saleNumber: '',
        saleExternal: ''
    });

    // Manual Add Form Data
    const [manualClientSearch, setManualClientSearch] = React.useState('');
    const [manualClients, setManualClients] = React.useState<Client[]>([]);
    const [manualSelectedClient, setManualSelectedClient] = React.useState<Client | null>(null);
    const [manualVisitData, setManualVisitData] = React.useState({
        address: '',
        contactPerson: '',
        description: '',
        notes: '' // Purpose/observation for salesperson
    });

    // Salesperson Management
    const [newSalespersonName, setNewSalespersonName] = React.useState('');

    // --- LOAD DATA ---
    const loadData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [allVisits, allOperators, allExternal] = await Promise.all([
                dataService.getVisits(),
                dataService.getUsers(),
                dataService.getExternalSalespeople()
            ]);
            setVisits(allVisits);
            setOperators(allOperators);
            setExternalSalespeople(allExternal);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { loadData(); }, [loadData]);

    // --- BUILDER ACTIONS ---
    const handleSearchCandidates = async () => {
        setIsLoading(true);
        try {
            const results = await dataService.getRouteCandidates(builderFilters);
            setCandidates(results);
        } catch (e) {
            alert("Erro ao buscar candidatos: " + e);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleCandidate = (candidate: any) => {
        if (selectedCandidates.find(c => c.id === candidate.id)) {
            setSelectedCandidates(prev => prev.filter(c => c.id !== candidate.id));
        } else {
            setSelectedCandidates(prev => [...prev, candidate]);
        }
    };

    const confirmCreateRoute = async (externalName: string) => {
        setIsProcessing(true);
        try {
            for (let i = 0; i < selectedCandidates.length; i++) {
                const c = selectedCandidates[i];
                await dataService.saveVisit({
                    clientId: c.clientId,
                    clientName: c.clientName,
                    address: c.address,
                    phone: c.phone,
                    salespersonId: user.id,
                    salespersonName: user.name,
                    scheduledDate: new Date(`${builderFilters.date}T09:00:00`).toISOString(),
                    status: 'PENDING',
                    orderIndex: visits.length + i,
                    externalSalesperson: externalName,
                    isIndication: c.type === 'CALL' || c.type === 'MANUAL' || c.type === 'WHATSAPP',
                    originType: c.type,
                    originId: c.id,
                    contactPerson: c.contactPerson,
                    notes: c.notes // Include notes
                });
            }
            alert("Rota criada com sucesso!");
            setSelectedCandidates([]);
            setCandidates([]);
            setActiveTab('EXECUTION');
            await loadData();
        } catch (e) {
            alert("Erro ao criar rota.");
        } finally {
            setIsProcessing(false);
        }
    }

    // --- MANUAL ADDITION ---
    const handleSearchManualClient = async () => {
        if (manualClientSearch.length < 3) return;
        // Fetch all clients then filter locally for responsiveness
        const res = await dataService.getClients();
        const filtered = res.filter(c =>
            c.name.toLowerCase().includes(manualClientSearch.toLowerCase()) ||
            (c.phone && c.phone.includes(manualClientSearch))
        ).slice(0, 10); // Limit to top 10 matches
        setManualClients(filtered);
    };

    const handleSelectManualClient = (client: Client) => {
        setManualSelectedClient(client);
        setManualVisitData({
            ...manualVisitData,
            address: client.address
        });
        setManualClientSearch('');
        setManualClients([]);
    };

    const handleAddManualCandidate = () => {
        if (!manualSelectedClient) return;
        const candidate = {
            id: `manual-${Date.now()}`,
            type: 'MANUAL',
            clientName: manualSelectedClient.name,
            clientId: manualSelectedClient.id,
            address: manualVisitData.address,
            phone: manualSelectedClient.phone,
            date: new Date().toISOString(),
            description: `Manual: ${manualVisitData.description}`,
            operatorId: user.id,
            contactPerson: manualVisitData.contactPerson,
            notes: manualVisitData.notes // Add notes
        };
        setCandidates(prev => [candidate, ...prev]);
        setSelectedCandidates(prev => [candidate, ...prev]);
        setModalType(null);
        setIsModalOpen(false);
        setManualSelectedClient(null);
        setManualClientSearch('');
        setManualClients([]);
        setManualVisitData({ address: '', contactPerson: '', description: '', notes: '' });
    };

    // --- SALESPERSON MANAGEMENT ---
    const handleAddSalesperson = async () => {
        if (!newSalespersonName) return;
        try {
            await dataService.addExternalSalesperson(newSalespersonName);
            setNewSalespersonName('');
            // Refresh external list
            const updated = await dataService.getExternalSalespeople();
            setExternalSalespeople(updated);
        } catch (e) { alert("Erro ao adicionar."); }
    };

    const handleRemoveSalesperson = async (id: string) => {
        if (!confirm("Remover este vendedor?")) return;
        try {
            await dataService.removeExternalSalesperson(id);
            // Refresh external list
            const updated = await dataService.getExternalSalespeople();
            setExternalSalespeople(updated);
        } catch (e) { alert("Erro ao remover."); }
    }

    // --- EXECUTION ACTIONS ---
    const moveVisit = async (visitId: string, direction: -1 | 1) => {
        const visitIndex = callsToRender.findIndex(v => v.id === visitId);
        if (visitIndex === -1) return;
        const targetIndex = visitIndex + direction;
        if (targetIndex < 0 || targetIndex >= callsToRender.length) return;

        const v1 = callsToRender[visitIndex];
        const v2 = callsToRender[targetIndex];

        // Optimistic swap
        const newVisits = [...visits];
        // This is complex because we are sorting by orderIndex.
        // We essentially want to swap their orderIndexes.

        try {
            await Promise.all([
                dataService.updateVisit(v1.id, { orderIndex: v2.orderIndex || 0 }),
                dataService.updateVisit(v2.id, { orderIndex: v1.orderIndex || 0 })
            ]);
            loadData();
        } catch (e) { console.error("Error reordering", e); }
    };

    const handleDeleteVisit = async (id: string) => {
        if (!confirm("Tem certeza que deseja EXCLUIR esta visita?")) return;
        try {
            await dataService.deleteVisit(id);
            loadData();
        } catch (e) { alert("Erro ao excluir."); }
    };

    // --- FINALIZATION ---
    const openFinalizeModal = (visit: Visit) => {
        setActiveVisit(visit);
        setFinalizeData({
            outcome: 'REALIZED',
            note: '',
            rescheduleReason: '',
            rescheduleDate: '',
            newPhone: visit.phone,
            newName: visit.clientName,
            generateSale: false,
            saleValue: 0,
            saleNumber: '',
            saleExternal: visit.externalSalesperson || ''
        });
        setModalType('FINALIZE');
        setIsModalOpen(true);
    };

    const handleFinalize = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeVisit) return;

        setIsProcessing(true);
        try {
            // Update Client Info
            if (finalizeData.newPhone !== activeVisit.phone || finalizeData.newName !== activeVisit.clientName) {
                await dataService.upsertClient({
                    id: activeVisit.clientId,
                    name: finalizeData.newName,
                    phone: finalizeData.newPhone,
                    address: activeVisit.address
                });
            }

            if (finalizeData.outcome === 'RESCHEDULED') {
                if (!finalizeData.rescheduleReason) throw new Error("Selecione um motivo.");

                let newDate = new Date();
                if (finalizeData.rescheduleDate === 'DAY') newDate.setDate(newDate.getDate() + 1);
                else if (finalizeData.rescheduleDate === 'WEEK') newDate.setDate(newDate.getDate() + 7);
                else if (finalizeData.rescheduleDate === 'MONTH') newDate.setMonth(newDate.getMonth() + 1);

                // Create new pending visit
                await dataService.saveVisit({
                    ...activeVisit,
                    id: undefined,
                    scheduledDate: newDate.toISOString(),
                    status: 'PENDING',
                    orderIndex: visits.length + 1,
                });

                // Close current
                await dataService.updateVisit(activeVisit.id, {
                    status: 'CANCELED',
                    outcome: `Reagendado: ${finalizeData.rescheduleReason}. ${finalizeData.note}`
                });

            } else {
                // Mark as Completed
                await dataService.updateVisit(activeVisit.id, {
                    status: 'COMPLETED',
                    realized: true,
                    outcome: finalizeData.note || 'Realizada'
                });

                if (finalizeData.generateSale) {
                    if (!finalizeData.saleNumber) throw new Error("Informe o número da venda.");

                    await dataService.saveSale({
                        saleNumber: finalizeData.saleNumber,
                        clientName: finalizeData.newName,
                        address: activeVisit.address,
                        category: SaleCategory.OUTROS,
                        channel: SaleChannel.PROSPECCAO,
                        operatorId: user.id, // Current user is the registrar
                        value: Number(finalizeData.saleValue),
                        externalSalesperson: finalizeData.saleExternal // New field linked
                    });
                }
            }

            setIsModalOpen(false);
            setModalType(null);
            loadData();
            alert("Visita finalizada com sucesso!");
        } catch (e: any) {
            alert("Erro: " + e.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // --- DERIVED STATE ---
    const callsToRender = visits.filter(v => {
        if (activeTab === 'HISTORY') {
            const vDate = new Date(v.scheduledDate).toISOString().split('T')[0];
            return v.status === 'COMPLETED' &&
                vDate >= historyFilters.startDate &&
                vDate <= historyFilters.endDate &&
                (!historyFilters.externalSalesperson || v.externalSalesperson === historyFilters.externalSalesperson);
        } else {
            // Execution view
            if (v.status !== 'PENDING') return false;
            if (executionFilters.externalSalesperson && v.externalSalesperson !== executionFilters.externalSalesperson) return false;
            return true;
        }
    });

    const [selectedExternalForCreate, setSelectedExternalForCreate] = React.useState('');

    return (
        <div className="space-y-8 animate-in fade-in pb-24">
            {/* --- TOP NAVIGATION & HEADER --- */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex bg-slate-100 rounded-2xl p-1 gap-1">
                    <button
                        onClick={() => setActiveTab('EXECUTION')}
                        className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'EXECUTION' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Em Andamento
                    </button>
                    {(user.role === 'ADMIN' || user.role === 'SUPERVISOR') && (
                        <button
                            onClick={() => setActiveTab('BUILDER')}
                            className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'BUILDER' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Planejador
                        </button>
                    )}
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'HISTORY' ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        Histórico
                    </button>
                </div>

                {/* --- ACTIONS BAR BASED ON TAB --- */}
                <div className="flex items-center gap-3">
                    {activeTab === 'EXECUTION' && (
                        <>
                            <select
                                value={executionFilters.externalSalesperson}
                                onChange={e => setExecutionFilters({ ...executionFilters, externalSalesperson: e.target.value })}
                                className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Todos Vendedores</option>
                                {externalSalespeople.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                            <div className="h-8 w-px bg-slate-200"></div>
                            <button onClick={() => { const title = `Rota_Atual_${new Date().toISOString().split('T')[0]}`; exportToPDF(callsToRender, title); }} className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors"><FileText size={18} /></button>
                            <button onClick={() => { const title = `Rota_Atual_${new Date().toISOString().split('T')[0]}`; exportToExcel(callsToRender, title); }} className="p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition-colors"><Download size={18} /></button>
                        </>
                    )}
                    {activeTab === 'HISTORY' && (
                        <>
                            <input type="date" value={historyFilters.startDate} onChange={e => setHistoryFilters({ ...historyFilters, startDate: e.target.value })} className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none" />
                            <span className="text-slate-300 font-bold">ATÉ</span>
                            <input type="date" value={historyFilters.endDate} onChange={e => setHistoryFilters({ ...historyFilters, endDate: e.target.value })} className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none" />
                            <select
                                value={historyFilters.externalSalesperson}
                                onChange={e => setHistoryFilters({ ...historyFilters, externalSalesperson: e.target.value })}
                                className="bg-slate-50 border border-slate-200 p-3 rounded-xl text-xs font-bold outline-none"
                            >
                                <option value="">Todos Vendedores</option>
                                {externalSalespeople.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                            </select>
                        </>
                    )}
                </div>
            </div>

            {/* --- TAB CONTENT: BUILDER --- */}
            {activeTab === 'BUILDER' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 space-y-6">
                        {/* Filters Card */}
                        <div className="bg-white p-6 rounded-[32px] border border-slate-100 flex flex-wrap gap-4 items-center">
                            <select className="p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none" value={builderFilters.operatorId} onChange={e => setBuilderFilters({ ...builderFilters, operatorId: e.target.value })}>
                                <option value="">Todos Operadores</option>
                                {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                            </select>
                            <input type="date" className="p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none" value={builderFilters.date} onChange={e => setBuilderFilters({ ...builderFilters, date: e.target.value })} />
                            <select className="p-3 bg-slate-50 rounded-xl font-bold text-sm outline-none" value={builderFilters.type} onChange={e => setBuilderFilters({ ...builderFilters, type: e.target.value })}>
                                <option value="ALL">Todos Tipos</option>
                                <option value="VISIT">Prospects (Visita Física)</option>
                                {Object.values(CallType).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <button onClick={handleSearchCandidates} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors"><Search size={20} /></button>

                            <div className="h-8 w-px bg-slate-200 mx-2"></div>

                            <button onClick={() => { setModalType('MANUAL_ADD'); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:bg-slate-800 transition-colors"><Plus size={16} /> Manual</button>
                            <button onClick={() => { setModalType('MANAGE_SALESPEOPLE'); setIsModalOpen(true); }} className="flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-xs tracking-wider hover:bg-slate-200 transition-colors"><Users size={16} /> Vendedores</button>
                        </div>

                        {/* Candidates List */}
                        <div className="bg-white p-6 rounded-[32px] border border-slate-100 min-h-[400px]">
                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <Loader2 className="animate-spin mb-4" size={32} />
                                    <p className="font-bold text-sm">Buscando...</p>
                                </div>
                            ) : candidates.length > 0 ? (
                                <div className="space-y-3">
                                    {candidates.map(c => (
                                        <div key={c.id} onClick={() => toggleCandidate(c)} className={`group p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all hover:shadow-md ${selectedCandidates.find(sc => sc.id === c.id) ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs ${c.type === 'MANUAL' ? 'bg-purple-100 text-purple-600' :
                                                    c.type === 'WHATSAPP' ? 'bg-green-100 text-green-600' :
                                                        c.type === 'VISIT_PROSPECT' ? 'bg-pink-100 text-pink-600' :
                                                            'bg-blue-100 text-blue-600'
                                                    }`}>
                                                    {c.type === 'MANUAL' ? 'MAN' : c.type === 'WHATSAPP' ? 'ZAP' : c.type === 'VISIT_PROSPECT' ? 'PROS' : 'TEL'}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-base">{c.clientName}</p>
                                                    <div className="flex gap-2 text-xs text-slate-500 mt-1">
                                                        <span>{new Date(c.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        <span>•</span>
                                                        <span>{c.description}</span>
                                                    </div>
                                                    {c.contactPerson && <p className="text-xs font-bold text-blue-600 mt-1 bg-blue-50 px-2 py-0.5 rounded-lg w-fit">Procurar: {c.contactPerson}</p>}
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedCandidates.find(sc => sc.id === c.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 group-hover:border-slate-400'}`}>
                                                {selectedCandidates.find(sc => sc.id === c.id) && <CheckCircle2 size={14} />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400 opacity-60">
                                    <Filter size={48} className="mb-4 text-slate-200" />
                                    <p className="font-bold text-lg">Nenhum candidato encontrado</p>
                                    <p className="text-xs">Use os filtros acima ou adicione manualmente.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Route Draft */}
                    <div className="lg:col-span-4 bg-slate-900 text-white p-8 rounded-[40px] sticky top-6 h-fit shadow-2xl shadow-slate-900/20">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black uppercase tracking-wider">Nova Rota</h3>
                            <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold">{selectedCandidates.length} Visitas</span>
                        </div>

                        <div className="mb-8 space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsável Pela Rota</label>
                            <select
                                value={selectedExternalForCreate}
                                onChange={e => setSelectedExternalForCreate(e.target.value)}
                                className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-white font-bold outline-none focus:bg-white/10 transition-colors"
                            >
                                <option value="" className="text-slate-900">Selecione o Vendedor...</option>
                                {externalSalespeople.map(s => <option key={s.id} value={s.name} className="text-slate-900">{s.name}</option>)}
                            </select>
                        </div>

                        <div className="max-h-[400px] overflow-y-auto mb-8 space-y-2 pr-2 custom-scrollbar">
                            {selectedCandidates.map((c, i) => (
                                <div key={i} className="flex justify-between items-center text-sm text-slate-300 border-b border-white/10 pb-3 group">
                                    <div className="flex gap-3 items-center overflow-hidden">
                                        <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="truncate">{c.clientName}</span>
                                            {c.notes && <span className="text-[9px] text-white/50 truncate italic">"{c.notes}"</span>}
                                        </div>
                                    </div>
                                    <button onClick={() => toggleCandidate(c)} className="text-white/20 hover:text-white transition-colors"><X size={14} /></button>
                                </div>
                            ))}
                            {selectedCandidates.length === 0 && <p className="text-center text-white/30 text-xs py-4 italic">Selecione visitas ao lado...</p>}
                        </div>

                        <button
                            onClick={() => confirmCreateRoute(selectedExternalForCreate)}
                            disabled={!selectedExternalForCreate || selectedCandidates.length === 0}
                            className="w-full py-4 bg-blue-600 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-blue-600/30 flex items-center justify-center gap-2"
                        >
                            {isProcessing ? <Loader2 className="animate-spin" /> : 'Gerar Rota'} <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* --- TAB CONTENT: EXECUTION --- */}
            {activeTab === 'EXECUTION' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {callsToRender.map((visit, index) => (
                        <div key={visit.id} className="bg-white rounded-[32px] p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col justify-between group">
                            <div>
                                <div className="flex justify-between items-start mb-4">
                                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-600 flex items-center gap-1">
                                        <Clock size={10} /> Pendente
                                    </span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {(user.role === 'ADMIN' || user.role === 'SUPERVISOR') && (
                                            <>
                                                <button onClick={() => moveVisit(visit.id, -1)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200"><ArrowUp size={14} /></button>
                                                <button onClick={() => moveVisit(visit.id, 1)} className="p-1.5 bg-slate-50 text-slate-400 hover:text-slate-800 rounded-lg hover:bg-slate-200"><ArrowDown size={14} /></button>
                                                <button onClick={() => handleDeleteVisit(visit.id)} className="p-1.5 bg-red-50 text-red-300 hover:text-red-600 rounded-lg hover:bg-red-100"><Trash2 size={14} /></button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <h4 className="text-lg font-black text-slate-800 leading-tight mb-3">{visit.clientName}</h4>
                                <div className="space-y-2 mb-4">
                                    <p className="text-xs text-slate-500 flex items-center gap-2"><MapPin size={14} className="text-blue-500" /> {visit.address}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">Tel: {visit.phone}</p>
                                        {visit.contactPerson && <p className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">Falar: {visit.contactPerson}</p>}
                                    </div>
                                    {visit.notes && (
                                        <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 flex gap-2 items-start">
                                            <span className="font-bold shrink-0">Obs:</span>
                                            <span className="italic">{visit.notes}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="text-[10px] uppercase text-slate-400 font-bold border-t border-slate-100 pt-3 mt-2 flex justify-between">
                                    <span>Vendedor: {visit.externalSalesperson || 'N/A'}</span>
                                    <span>#{index + 1}</span>
                                </div>
                            </div>
                            <button onClick={() => openFinalizeModal(visit)} className="w-full mt-5 py-3.5 bg-slate-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                                <CheckCircle2 size={14} /> Finalizar
                            </button>
                        </div>
                    ))}
                    {callsToRender.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-20 bg-white rounded-[32px] border border-slate-100 border-dashed">
                            <TrendingUp size={48} className="text-slate-200 mb-4" />
                            <p className="text-slate-400 font-bold">Nenhuma visita pendente para os filtros atuais.</p>
                        </div>
                    )}
                </div>
            )}

            {/* --- TAB CONTENT: HISTORY --- */}
            {activeTab === 'HISTORY' && (
                <div className="bg-white rounded-[32px] shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Data</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Cliente</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Vendedor</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Resultado</th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {callsToRender.length > 0 ? callsToRender.map(visit => (
                                    <tr key={visit.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-4 flex flex-col">
                                            <span className="font-bold text-slate-700 text-sm">{new Date(visit.scheduledDate).toLocaleDateString()}</span>
                                            <span className="text-xs text-slate-400">{new Date(visit.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </td>
                                        <td className="p-4">
                                            <p className="font-bold text-slate-800 text-sm">{visit.clientName}</p>
                                            <p className="text-xs text-slate-500 truncate max-w-[200px]">{visit.address}</p>
                                        </td>
                                        <td className="p-4">
                                            <p className="font-bold text-sm text-slate-700">{visit.externalSalesperson || 'N/A'}</p>
                                            <p className="text-[10px] text-slate-400 uppercase">Interno: {visit.salespersonName}</p>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${visit.realized ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                {visit.realized ? 'REALIZADA' : 'NÃO REALIZADA'}
                                            </span>
                                            <p className="text-xs text-slate-500 mt-1 max-w-[200px]">{visit.outcome}</p>
                                        </td>
                                        <td className="p-4 text-right">
                                            {/* Could add view sale link here if we stored sale ID in visit */}
                                            {user.role === 'ADMIN' && (
                                                <button onClick={() => handleDeleteVisit(visit.id)} className="text-red-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="p-10 text-center text-slate-400 font-bold opacity-60">Nenhum histórico encontrado para o período.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- MODALS --- */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">

                    {/* MODAL: MANUAL ADD */}
                    {modalType === 'MANUAL_ADD' && (
                        <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl p-8 animate-in zoom-in-50 duration-200">
                            <h3 className="text-xl font-black uppercase mb-6 text-slate-800 flex items-center gap-2"><Plus size={24} className="text-blue-600" /> Adicionar Manualmente</h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Buscar ou Digitar Cliente</label>
                                    <div className="relative">
                                        <Search className="absolute left-4 top-3.5 text-slate-400" size={18} />
                                        <input
                                            type="text"
                                            placeholder="Digite para buscar..."
                                            value={manualClientSearch}
                                            onChange={e => { setManualClientSearch(e.target.value); handleSearchManualClient(); }}
                                            className="w-full p-3 pl-11 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                        {manualClients.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 bg-white shadow-xl rounded-xl mt-2 border border-slate-100 max-h-[200px] overflow-y-auto z-10">
                                                {manualClients.map(c => (
                                                    <div
                                                        key={c.id}
                                                        onClick={() => handleSelectManualClient(c)}
                                                        className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-0"
                                                    >
                                                        <p className="font-bold text-sm text-slate-800">{c.name}</p>
                                                        <p className="text-xs text-slate-500">{c.phone} • {c.address}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {manualSelectedClient ? (
                                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 mb-4">
                                        <p className="font-bold text-blue-900">{manualSelectedClient.name}</p>
                                        <p className="text-xs text-blue-700">{manualSelectedClient.address}</p>
                                    </div>
                                ) : <div className="h-4"></div>}

                                <input
                                    value={manualVisitData.contactPerson}
                                    onChange={e => setManualVisitData({ ...manualVisitData, contactPerson: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Quem procurar? (Opcional)"
                                />
                                <textarea
                                    value={manualVisitData.address}
                                    onChange={e => setManualVisitData({ ...manualVisitData, address: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm resize-none h-20 outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Endereço da visita..."
                                ></textarea>
                                <input
                                    value={manualVisitData.description}
                                    onChange={e => setManualVisitData({ ...manualVisitData, description: e.target.value })}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Motivo (ex: Entrega)..."
                                />
                                <textarea
                                    value={manualVisitData.notes}
                                    onChange={e => setManualVisitData({ ...manualVisitData, notes: e.target.value })}
                                    className="w-full p-3 bg-orange-50 border-2 border-orange-200 rounded-xl font-bold text-sm resize-none h-20 outline-none focus:ring-2 focus:ring-orange-400"
                                    placeholder="📝 Observação para o vendedor (ex: Oferecer químicos, Trocador de calor)..."
                                ></textarea>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button onClick={() => { setIsModalOpen(false); setManualSelectedClient(null); }} className="py-3.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-50 uppercase text-xs">Cancelar</button>
                                    <button onClick={handleAddManualCandidate} disabled={!manualVisitData.address || !manualVisitData.description} className="py-3.5 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-wider hover:bg-blue-500 disabled:opacity-50">Adicionar</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* MODAL: MANAGE SALESPEOPLE */}
                    {modalType === 'MANAGE_SALESPEOPLE' && (
                        <div className="bg-white w-full max-w-md rounded-[32px] shadow-2xl p-8 animate-in zoom-in-50 duration-200">
                            <h3 className="text-xl font-black uppercase mb-6 text-slate-800 flex items-center gap-2"><Users size={24} className="text-slate-600" /> Vendedores Externos</h3>
                            <div className="flex gap-2 mb-6">
                                <input
                                    value={newSalespersonName}
                                    onChange={e => setNewSalespersonName(e.target.value)}
                                    placeholder="Nome do novo vendedor..."
                                    className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <button onClick={handleAddSalesperson} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500"><Plus size={20} /></button>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                {externalSalespeople.map(s => (
                                    <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 group">
                                        <span className="font-bold text-sm text-slate-700">{s.name}</span>
                                        <button onClick={() => handleRemoveSalesperson(s.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="w-full mt-6 py-3.5 bg-slate-100 text-slate-500 rounded-xl font-bold uppercase text-xs hover:bg-slate-200">Fechar</button>
                        </div>
                    )}

                    {/* MODAL: FINALIZE */}
                    {modalType === 'FINALIZE' && (
                        <div className="bg-white w-full max-w-lg rounded-[48px] shadow-2xl p-8 max-h-[90vh] overflow-y-auto animate-in zoom-in-50 duration-200 custom-scrollbar">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-black uppercase text-slate-800">Finalizar Visita</h3>
                                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200"><X size={20} /></button>
                            </div>

                            <form onSubmit={handleFinalize} className="space-y-6">
                                {/* Contact Info Update */}
                                <div className="bg-slate-50 p-4 rounded-2xl space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dados do Cliente</p>
                                    <input value={finalizeData.newName} onChange={e => setFinalizeData({ ...finalizeData, newName: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Nome do Cliente" />
                                    <input value={finalizeData.newPhone} onChange={e => setFinalizeData({ ...finalizeData, newPhone: e.target.value })} className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="Telefone" />
                                </div>

                                {/* Outcome Toggle */}
                                <div className="grid grid-cols-2 gap-4">
                                    <button type="button" onClick={() => setFinalizeData({ ...finalizeData, outcome: 'REALIZED' })} className={`p-4 rounded-2xl font-black uppercase text-xs tracking-wider border-2 transition-all ${finalizeData.outcome === 'REALIZED' ? 'bg-green-50 text-green-700 border-green-500 shadow-sm' : 'bg-white text-slate-400 border-slate-200 opacity-60 hover:opacity-100'}`}>Realizada</button>
                                    <button type="button" onClick={() => setFinalizeData({ ...finalizeData, outcome: 'RESCHEDULED' })} className={`p-4 rounded-2xl font-black uppercase text-xs tracking-wider border-2 transition-all ${finalizeData.outcome === 'RESCHEDULED' ? 'bg-orange-50 text-orange-700 border-orange-500 shadow-sm' : 'bg-white text-slate-400 border-slate-200 opacity-60 hover:opacity-100'}`}>Reagendar</button>
                                </div>

                                {finalizeData.outcome === 'REALIZED' ? (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                        <textarea value={finalizeData.note} onChange={e => setFinalizeData({ ...finalizeData, note: e.target.value })} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-24 resize-none outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm text-slate-700" placeholder="Relatório da visita..."></textarea>

                                        <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 space-y-4">
                                            <div className="flex items-center gap-3">
                                                <input type="checkbox" id="genSale" checked={finalizeData.generateSale} onChange={e => setFinalizeData({ ...finalizeData, generateSale: e.target.checked })} className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                                                <label htmlFor="genSale" className="text-sm font-bold text-blue-900">Gerar Venda (Indicação)</label>
                                            </div>

                                            {finalizeData.generateSale && (
                                                <div className="grid grid-cols-1 gap-3 pl-8 animate-in mt-2">
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-blue-700 mb-1 block">Número da Venda</label>
                                                        <input type="text" value={finalizeData.saleNumber} onChange={e => setFinalizeData({ ...finalizeData, saleNumber: e.target.value })} className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ex: 12345" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-blue-700 mb-1 block">Valor da Venda</label>
                                                        <input type="number" value={finalizeData.saleValue} onChange={e => setFinalizeData({ ...finalizeData, saleValue: Number(e.target.value) })} className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500" placeholder="R$ 0,00" />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-blue-700 mb-1 block">Vendedor Externo</label>
                                                        <select value={finalizeData.saleExternal} onChange={e => setFinalizeData({ ...finalizeData, saleExternal: e.target.value })} className="w-full p-3 bg-white border border-blue-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
                                                            <option value="">Selecione...</option>
                                                            {externalSalespeople.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Motivo do Reagendamento</label>
                                            <select value={finalizeData.rescheduleReason} onChange={e => setFinalizeData({ ...finalizeData, rescheduleReason: e.target.value })} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-orange-500">
                                                <option value="">Selecione...</option>
                                                <option value="AUSENTE">Responsável Ausente</option>
                                                <option value="FECHADO">Local Fechado</option>
                                                <option value="NAO_QUIS">Não Quis Receber</option>
                                            </select>
                                        </div>
                                        {finalizeData.rescheduleReason === 'NAO_QUIS' && <textarea value={finalizeData.note} onChange={e => setFinalizeData({ ...finalizeData, note: e.target.value })} className="w-full p-3 bg-red-50 border border-red-100 text-red-800 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500" placeholder="Justificativa obrigatória..."></textarea>}

                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reagendar Para</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {['DAY', 'WEEK', 'MONTH'].map(o => (
                                                    <button key={o} type="button" onClick={() => setFinalizeData({ ...finalizeData, rescheduleDate: o })} className={`p-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${finalizeData.rescheduleDate === o ? 'bg-slate-800 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                                        {o === 'DAY' ? '+1 Dia' : o === 'WEEK' ? '+1 Semana' : '+1 Mês'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <button type="submit" disabled={isProcessing} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg shadow-blue-600/20 hover:bg-blue-500 hover:shadow-blue-600/40 transition-all flex justify-center">{isProcessing ? <Loader2 className="animate-spin" /> : 'Confirmar Finalização'}</button>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Routes;
