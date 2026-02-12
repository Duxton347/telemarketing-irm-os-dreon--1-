
import React from 'react';
import {
    ShoppingBag, Plus, Search, Truck, CheckCircle2,
    MapPin, Tag, X, Save, Loader2, Hash, Zap,
    TrendingUp, DollarSign, BarChart3, Receipt, Check,
    Clock, Filter, Edit2, Trash2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { Sale, SaleCategory, SaleChannel, SaleStatus, User as UserType, UserRole } from '../types';

const SalesView: React.FC<{ user: UserType }> = ({ user }) => {
    const [sales, setSales] = React.useState<Sale[]>([]);
    const [operators, setOperators] = React.useState<UserType[]>([]);
    const [clients, setClients] = React.useState<any[]>([]); // Store all clients for search
    const [clientSuggestions, setClientSuggestions] = React.useState<any[]>([]);
    const [showClientSuggestions, setShowClientSuggestions] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isProcessing, setIsProcessing] = React.useState(false);
    const [updatingId, setUpdatingId] = React.useState<string | null>(null);
    const [editingSaleId, setEditingSaleId] = React.useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState<'all' | SaleStatus>('all');
    const [showSuccessToast, setShowSuccessToast] = React.useState(false);
    const [toastMessage, setToastMessage] = React.useState('');

    // Filros Avançados
    const [dateRange, setDateRange] = React.useState({ start: '', end: '' });
    const [categoryFilter, setCategoryFilter] = React.useState('');
    const [channelFilter, setChannelFilter] = React.useState('');
    const [operatorFilter, setOperatorFilter] = React.useState('');

    const [newSale, setNewSale] = React.useState({
        saleNumber: '',
        clientName: '',
        clientId: '', // New field
        address: '',
        category: SaleCategory.QUIMICOS,
        channel: SaleChannel.WHATSAPP,
        value: ''
    });

    const loadData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const [allSales, allUsers, allClients] = await Promise.all([
                dataService.getSales(),
                dataService.getUsers(),
                dataService.getClients()
            ]);
            setSales(allSales);
            setOperators(allUsers);
            setClients(allClients);
        } catch (e) {
            console.error("Erro ao carregar vendas:", e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    React.useEffect(() => { loadData(); }, [loadData]);

    const triggerToast = (msg: string) => {
        setToastMessage(msg);
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 4000);
    };

    const handleCreateSale = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newSale.saleNumber || !newSale.clientName || !newSale.value) {
            return alert("Por favor, preencha o número do pedido, cliente e valor.");
        }

        setIsProcessing(true);
        try {
            // Duplicate Check (Only on Create)
            if (!editingSaleId) {
                const exists = await dataService.checkSaleExists(newSale.saleNumber);
                if (exists) {
                    alert("ERRO: Este número de pedido já está registrado no sistema!");
                    setIsProcessing(false);
                    return;
                }
            }

            const saleValue = parseFloat(newSale.value.replace(',', '.'));
            const saleData = {
                ...newSale,
                value: isNaN(saleValue) ? 0 : saleValue,
                operatorId: editingSaleId ? undefined : user.id // Maintain original operator on edit
            };

            if (editingSaleId) {
                await dataService.updateSale(editingSaleId, saleData);
                triggerToast("Venda atualizada com sucesso!");
            } else {
                await dataService.saveSale({ ...saleData, operatorId: user.id });
                triggerToast("Venda registrada e enviada para logística!");
            }

            setIsModalOpen(false);
            setEditingSaleId(null);
            setNewSale({
                saleNumber: '',
                clientName: '',
                clientId: '',
                address: '',
                category: SaleCategory.QUIMICOS,
                channel: SaleChannel.WHATSAPP,
                value: ''
            });
            await loadData();
        } catch (e: any) {
            console.error("Erro detalhado:", e);
            alert(`Erro ao salvar venda: ${e.message || JSON.stringify(e)}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleEditClick = (sale: Sale) => {
        setNewSale({
            saleNumber: sale.saleNumber,
            clientName: sale.clientName,
            address: sale.address,
            category: sale.category,
            channel: sale.channel,
            value: String(sale.value)
        });
        setEditingSaleId(sale.id);
        setIsModalOpen(true);
    };

    const handleDeleteClick = async (saleId: string) => {
        if (confirm("ATENÇÃO: Deseja realmente excluir esta venda? Esta ação não pode ser desfeita.")) {
            try {
                // Optimistic Update: Remove from UI immediately
                setSales(prev => prev.filter(s => s.id !== saleId));

                await dataService.deleteSale(saleId);
                triggerToast("Venda removida com sucesso.");

                // Re-fetch to ensure consistency, but UI is already updated
                await loadData();
            } catch (e: any) {
                console.error("Erro ao excluir venda:", e);
                alert(`Erro ao excluir venda: ${e.message || JSON.stringify(e)}`);
                // Rollback
                await loadData();
            }
        }
    };

    const handleUpdateStatus = async (saleId: string, status: SaleStatus) => {
        if (updatingId === saleId) return;

        if (status === SaleStatus.ENTREGUE && !confirm("Deseja confirmar a entrega física deste pedido agora?")) return;

        setUpdatingId(saleId);
        try {
            // 1. Atualiza no banco de dados (Supabase)
            await dataService.updateSaleStatus(saleId, status);

            // 2. Atualiza o estado local IMEDIATAMENTE para que a UI mude o botão para o selo de entregue
            setSales(prevSales => prevSales.map(s =>
                s.id === saleId
                    ? { ...s, status: status, deliveredAt: new Date().toISOString() }
                    : s
            ));

            triggerToast("Venda marcada como entregue com sucesso!");

        } catch (e) {
            console.error("Falha na atualização de status:", e);
            alert("Erro ao atualizar status. Verifique sua conexão com o servidor.");
        } finally {
            setUpdatingId(null);
        }
    };

    const filteredSales = sales.filter(s => {
        const matchesSearch = s.clientName.toLowerCase().includes(searchTerm.toLowerCase()) || s.saleNumber.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || s.status === statusFilter;

        // Filtros de Data
        let matchesDate = true;
        if (dateRange.start) {
            matchesDate = matchesDate && new Date(s.registeredAt) >= new Date(dateRange.start);
        }
        if (dateRange.end) {
            // Ajuste para incluir o final do dia selecionado
            const endDate = new Date(dateRange.end);
            endDate.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && new Date(s.registeredAt) <= endDate;
        }

        // Outros Filtros
        const matchesCategory = !categoryFilter || s.category === categoryFilter;
        const matchesChannel = !channelFilter || s.channel === channelFilter;
        const matchesOperator = !operatorFilter || s.operatorId === operatorFilter;

        return matchesSearch && matchesStatus && matchesDate && matchesCategory && matchesChannel && matchesOperator;
    });

    const totalVolume = filteredSales.reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
    const deliveredVolume = filteredSales.filter(s => s.status === SaleStatus.ENTREGUE).reduce((acc, curr) => acc + (Number(curr.value) || 0), 0);
    const pendingVolume = totalVolume - deliveredVolume;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className="space-y-8 pb-20 animate-in fade-in duration-500 relative">

            {showSuccessToast && (
                <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[300] bg-slate-900 text-white px-10 py-5 rounded-[28px] shadow-2xl flex items-center gap-4 font-black uppercase text-[11px] tracking-widest animate-in slide-in-from-top-12 duration-500 border border-emerald-500/30">
                    <div className="bg-emerald-500 p-2 rounded-full shadow-lg shadow-emerald-500/40">
                        <Check size={20} strokeWidth={4} />
                    </div>
                    {toastMessage}
                </div>
            )}

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase leading-none">Gestão de Vendas Dreon</h2>
                    <p className="text-slate-500 font-bold mt-2">Monitoramento de resultados e confirmação de entregas em tempo real.</p>
                </div>
                <button
                    onClick={() => {
                        setEditingSaleId(null);
                        setNewSale({
                            saleNumber: '',
                            clientName: '',
                            clientId: '',
                            address: '',
                            category: SaleCategory.QUIMICOS,
                            channel: SaleChannel.WHATSAPP,
                            value: ''
                        });
                        setIsModalOpen(true);
                    }}
                    className="bg-slate-900 text-white px-10 py-5 rounded-[28px] font-black uppercase tracking-widest text-[11px] shadow-2xl flex items-center gap-3 hover:bg-slate-800 active:scale-95 transition-all"
                >
                    <Plus size={20} /> Registrar Venda
                </button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Volume Total (Filtrado)</p>
                        <h3 className="text-3xl font-black text-slate-900">{formatCurrency(totalVolume)}</h3>
                    </div>
                    <div className="p-4 bg-blue-600 rounded-3xl text-white shadow-xl shadow-blue-500/20 group-hover:scale-110 transition-transform"><TrendingUp size={24} /></div>
                </div>
                <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-emerald-200 transition-all">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Concluídas (Recebido)</p>
                        <h3 className="text-3xl font-black text-emerald-600">{formatCurrency(deliveredVolume)}</h3>
                    </div>
                    <div className="p-4 bg-emerald-600 rounded-3xl text-white shadow-xl shadow-emerald-500/20 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
                </div>
                <div className="bg-white p-8 rounded-[48px] border border-slate-100 shadow-sm flex items-center justify-between group hover:border-orange-200 transition-all">
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Aguardando Entrega</p>
                        <h3 className="text-3xl font-black text-orange-600">{formatCurrency(pendingVolume)}</h3>
                    </div>
                    <div className="p-4 bg-orange-500 rounded-3xl text-white shadow-xl shadow-orange-500/20 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
                </div>
            </div>

            <div className="space-y-6">
                {/* BARRA DE FILTROS E BUSCA */}
                <div className="flex flex-col gap-4">
                    {/* Linha Superior: Busca e Status */}
                    <div className="flex flex-col lg:flex-row gap-4 items-center">
                        <div className="flex-1 bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm flex items-center gap-4 w-full">
                            <Search className="text-slate-300" size={20} />
                            <input
                                type="text"
                                placeholder="Pesquisar por cliente ou Nº de venda..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="flex-1 bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300"
                            />
                        </div>

                        <div className="bg-white p-1.5 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-1 overflow-x-auto max-w-full">
                            <button
                                onClick={() => setStatusFilter('all')}
                                className={`px-6 py-3 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === 'all' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                                Todas
                            </button>
                            <button
                                onClick={() => setStatusFilter(SaleStatus.PENDENTE)}
                                className={`px-6 py-3 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === SaleStatus.PENDENTE ? 'bg-yellow-500 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                                Pendentes
                            </button>
                            <button
                                onClick={() => setStatusFilter(SaleStatus.ENTREGUE)}
                                className={`px-6 py-3 rounded-[24px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === SaleStatus.ENTREGUE ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                            >
                                Entregues
                            </button>
                        </div>
                    </div>

                    {/* Linha Inferior: Filtros Avançados */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm flex items-center gap-2 px-4">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">De:</span>
                            <input
                                type="date"
                                value={dateRange.start}
                                onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                                className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-full"
                            />
                        </div>
                        <div className="bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm flex items-center gap-2 px-4">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Até:</span>
                            <input
                                type="date"
                                value={dateRange.end}
                                onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                                className="bg-transparent border-none outline-none text-xs font-bold text-slate-700 w-full"
                            />
                        </div>
                        <div className="bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
                            <select
                                value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                className="w-full bg-transparent border-none outline-none text-[10px] font-black uppercase text-slate-500 cursor-pointer"
                            >
                                <option value="">Todas Categorias</option>
                                {Object.values(SaleCategory).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm">
                            <select
                                value={channelFilter}
                                onChange={e => setChannelFilter(e.target.value)}
                                className="w-full bg-transparent border-none outline-none text-[10px] font-black uppercase text-slate-500 cursor-pointer"
                            >
                                <option value="">Todos Canais</option>
                                {Object.values(SaleChannel).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="bg-white p-2 rounded-[24px] border border-slate-100 shadow-sm lg:col-span-4">
                            <select
                                value={operatorFilter}
                                onChange={e => setOperatorFilter(e.target.value)}
                                className="w-full bg-transparent border-none outline-none text-[10px] font-black uppercase text-slate-500 cursor-pointer"
                            >
                                <option value="">Todos Operadores</option>
                                {operators.map(op => <option key={op.id} value={op.id}>{op.name} (@{op.username})</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-300">
                            <Loader2 className="animate-spin" size={48} />
                            <p className="font-black uppercase text-[10px] tracking-widest">Sincronizando Banco de Vendas...</p>
                        </div>
                    ) : filteredSales.map(sale => {
                        const isPendente = sale.status === SaleStatus.PENDENTE;

                        return (
                            <div
                                key={sale.id}
                                className={`p-8 rounded-[40px] border-2 transition-all duration-500 flex flex-col md:flex-row items-center gap-8 ${isPendente ? 'bg-white border-yellow-200 shadow-xl shadow-yellow-500/5 hover:border-yellow-300' : 'bg-emerald-50/50 border-emerald-200/50 opacity-90 hover:opacity-100 hover:border-emerald-300 hover:shadow-lg hover:shadow-emerald-500/10'}`}
                            >
                                <div className="flex-1 space-y-4 w-full">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-4 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-colors duration-500 ${isPendente ? 'bg-yellow-100 text-yellow-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                            {sale.status}
                                        </span>
                                        <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${isPendente ? 'text-slate-400' : 'text-emerald-400'}`}>
                                            <Hash size={12} /> {sale.saleNumber}
                                        </span>
                                        <span className={`text-[10px] font-black uppercase ml-auto md:ml-0 ${isPendente ? 'text-slate-400' : 'text-emerald-400'}`}>
                                            {new Date(sale.registeredAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className={`text-2xl font-black tracking-tighter uppercase leading-none transition-colors ${isPendente ? 'text-slate-800' : 'text-emerald-900'}`}>{sale.clientName}</h4>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mt-2 transition-colors ${isPendente ? 'text-slate-400' : 'text-emerald-600/60'}`}>
                                            <MapPin size={12} className={isPendente ? 'text-red-500' : 'text-emerald-400'} /> {sale.address || 'Endereço não informado'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 pt-2 items-center">
                                        <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase border flex items-center gap-2 transition-all ${isPendente ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-emerald-100/50 text-emerald-600 border-emerald-200'}`}>
                                            <Tag size={10} /> {sale.category}
                                        </span>
                                        <span className={`px-3 py-1 rounded-md text-[9px] font-black uppercase flex items-center gap-2 transition-all ${isPendente ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'}`}>
                                            <Zap size={10} className={isPendente ? 'text-yellow-400' : 'text-white'} /> {sale.channel}
                                        </span>
                                        <div className={`ml-4 font-black text-lg flex items-center gap-1 transition-colors ${isPendente ? 'text-slate-900' : 'text-emerald-700'}`}>
                                            <DollarSign size={16} className={isPendente ? 'text-emerald-500' : 'text-emerald-500'} /> {formatCurrency(Number(sale.value))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center md:items-end gap-4 shrink-0 w-full md:w-auto">
                                    <div className="text-center md:text-right">
                                        <p className={`text-[9px] font-black uppercase tracking-widest ${isPendente ? 'text-slate-400' : 'text-emerald-400'}`}>Indicado por</p>
                                        <p className={`font-bold text-sm ${isPendente ? 'text-slate-700' : 'text-emerald-700'}`}>@{operators.find(o => o.id === sale.operatorId)?.username || 'Venda Externa'}</p>

                                        {/* ADMIN CONTROLS */}
                                        {user.role === UserRole.ADMIN && (
                                            <div className="flex gap-2 justify-end mt-2">
                                                <button onClick={(e) => { e.stopPropagation(); handleEditClick(sale); }} className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200" title="Editar">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteClick(sale.id); }} className="p-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200" title="Excluir">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {isPendente ? (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleUpdateStatus(sale.id, SaleStatus.ENTREGUE);
                                            }}
                                            disabled={updatingId === sale.id}
                                            className="w-full md:w-auto px-12 py-5 bg-emerald-600 text-white rounded-[24px] font-black uppercase text-[11px] tracking-widest shadow-2xl hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                        >
                                            {updatingId === sale.id ? (
                                                <Loader2 className="animate-spin" size={18} />
                                            ) : (
                                                <Truck size={18} strokeWidth={2.5} />
                                            )}
                                            Confirmar Entrega
                                        </button>
                                    ) : (
                                        <div className="flex flex-col items-center md:items-end animate-in zoom-in duration-500">
                                            <div className="flex items-center gap-3 text-emerald-700 bg-emerald-100 px-6 py-4 rounded-[20px] border border-emerald-200 shadow-sm">
                                                <CheckCircle2 size={24} className="animate-pulse" />
                                                <span className="font-black uppercase text-xs tracking-widest">Venda Entregue</span>
                                            </div>
                                            <p className="text-[9px] font-bold text-emerald-400 uppercase mt-2">Finalizado em: {sale.deliveredAt ? new Date(sale.deliveredAt).toLocaleString() : '-'}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {filteredSales.length === 0 && !isLoading && (
                        <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs opacity-40">Nenhum registro encontrado para este filtro.</div>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-[150] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-xl rounded-[48px] shadow-2xl overflow-hidden animate-in zoom-in duration-300">
                        <div className="bg-slate-900 p-10 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-4">
                                    <ShoppingBag className="text-blue-400" /> {editingSaleId ? 'Editar Venda' : 'Nova Venda'}
                                </h3>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">Operador atual: @{user.username}</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-3 rounded-full transition-all active:scale-90"><X size={28} /></button>
                        </div>

                        <form onSubmit={handleCreateSale} className="p-10 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº do Pedido</label>
                                    <input
                                        type="text"
                                        required
                                        value={newSale.saleNumber}
                                        onChange={e => setNewSale({ ...newSale, saleNumber: e.target.value })}
                                        className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                        placeholder="Ex: 99887"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Valor Venda (R$)</label>
                                    <input
                                        type="text"
                                        required
                                        value={newSale.value}
                                        onChange={e => setNewSale({ ...newSale, value: e.target.value })}
                                        className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all text-emerald-600"
                                        placeholder="0,00"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Categoria</label>
                                    <select
                                        value={newSale.category}
                                        onChange={e => setNewSale({ ...newSale, category: e.target.value as SaleCategory })}
                                        className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-black text-[10px] uppercase outline-none cursor-pointer"
                                    >
                                        {Object.values(SaleCategory).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Canal</label>
                                    <select
                                        value={newSale.channel}
                                        onChange={e => setNewSale({ ...newSale, channel: e.target.value as SaleChannel })}
                                        className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-black text-[10px] uppercase outline-none cursor-pointer"
                                    >
                                        {Object.values(SaleChannel).map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2 relative">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Cliente</label>
                                <input
                                    type="text"
                                    required
                                    value={newSale.clientName}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setNewSale({ ...newSale, clientName: val });
                                        if (val.length > 2) {
                                            const matches = clients.filter(c => c.name.toLowerCase().includes(val.toLowerCase()));
                                            setClientSuggestions(matches.slice(0, 5));
                                            setShowClientSuggestions(true);
                                        } else {
                                            setShowClientSuggestions(false);
                                        }
                                    }}
                                    onBlur={() => setTimeout(() => setShowClientSuggestions(false), 200)}
                                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    placeholder="Nome completo do comprador"
                                    autoComplete="off"
                                />
                                {showClientSuggestions && clientSuggestions.length > 0 && (
                                    <div className="absolute top-full left-0 w-full bg-white border border-slate-100 rounded-xl shadow-xl z-50 mt-1 max-h-40 overflow-y-auto">
                                        {clientSuggestions.map(c => (
                                            <div
                                                key={c.id}
                                                className="p-3 hover:bg-slate-50 cursor-pointer text-sm font-bold text-slate-700 transition-colors"
                                                onMouseDown={() => {
                                                    setNewSale({
                                                        ...newSale,
                                                        clientName: c.name,
                                                        clientId: c.id,
                                                        address: c.address || newSale.address
                                                    });
                                                    setShowClientSuggestions(false);
                                                }}
                                            >
                                                {c.name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Endereço Completo</label>
                                <textarea
                                    value={newSale.address}
                                    onChange={e => setNewSale({ ...newSale, address: e.target.value })}
                                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-[32px] font-bold h-28 resize-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    placeholder="Rua, número, bairro e cidade..."
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isProcessing}
                                className="w-full py-6 bg-slate-900 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-3 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                            >
                                {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />} {editingSaleId ? 'Salvar Alterações' : 'Registrar Venda e Gerar Logística'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SalesView;
