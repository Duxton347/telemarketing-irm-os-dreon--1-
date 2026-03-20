
import React from 'react';
import {
  Search, UserPlus, ChevronRight, Phone, History, Users, Calendar, X,
  MapPin, Save, Edit2, Loader2, ClipboardList, Clock, AlertTriangle, Download
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { SATISFACTION_EMOJIS } from '../constants';
import { Client, UserRole, ProtocolStatus, ClientTag, ClientHistoryData, ClientPortfolioEntry } from '../types';
import { HelpTooltip } from '../components/HelpTooltip';
import { HELP_TEXTS } from '../utils/helpTexts';
import { EmailService } from '../services/emailService';
import { Mail, ShieldCheck, Tag as TagIcon, Plus, Sparkles } from 'lucide-react';
import { buildPortfolioCategoryGroups, collectPortfolioMetadata, getClientPortfolioEntries, mergePortfolioEntries } from '../utils/clientPortfolio';

const EMPTY_CLIENT_HISTORY: ClientHistoryData = {
  calls: [],
  protocols: [],
  summary: {
    totalCalls: 0,
    totalProtocols: 0,
    openProtocols: 0,
    callCountsByType: [],
    callCountsByPurpose: [],
    callCountsByTargetProduct: []
  }
};

type ClientFormState = {
  id: string;
  name: string;
  phone: string;
  phone_secondary: string;
  address: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  zip_code: string;
  portfolio_entries: ClientPortfolioEntry[];
};

const createEmptyPortfolioEntry = (): ClientPortfolioEntry => ({
  id: `portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  profile: '',
  product_category: '',
  equipment: '',
  quantity: 1
});

const createEmptyClientData = (): ClientFormState => ({
  id: '',
  name: '',
  phone: '',
  phone_secondary: '',
  address: '',
  street: '',
  neighborhood: '',
  city: '',
  state: '',
  zip_code: '',
  portfolio_entries: [createEmptyPortfolioEntry()]
});

const Clients: React.FC<{ user: any }> = ({ user }) => {
  const [clients, setClients] = React.useState<Client[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [selectedClient, setSelectedClient] = React.useState<Client | null>(null);
  const [clientHistory, setClientHistory] = React.useState<ClientHistoryData>(EMPTY_CLIENT_HISTORY);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const [neighborhoodFilter, setNeighborhoodFilter] = React.useState('');
  const [cityFilter, setCityFilter] = React.useState('');
  const [clientTags, setClientTags] = React.useState<ClientTag[]>([]);
  const [isEmailModalOpen, setIsEmailModalOpen] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState('');
  const [expandedCategory, setExpandedCategory] = React.useState<string | null>(null);

  const [clientData, setClientData] = React.useState<ClientFormState>(createEmptyClientData);
  const resetClientForm = React.useCallback(() => setClientData(createEmptyClientData()), []);

  const selectedPortfolioEntries = React.useMemo(() => getClientPortfolioEntries(selectedClient), [selectedClient]);
  const selectedPortfolioMetadata = React.useMemo(
    () => collectPortfolioMetadata(selectedPortfolioEntries),
    [selectedPortfolioEntries]
  );
  const selectedCategoryGroups = React.useMemo(
    () => buildPortfolioCategoryGroups(selectedPortfolioEntries),
    [selectedPortfolioEntries]
  );

  const addPortfolioEntry = () => {
    setClientData(prev => ({
      ...prev,
      portfolio_entries: [...prev.portfolio_entries, createEmptyPortfolioEntry()]
    }));
  };

  const updatePortfolioEntry = (index: number, field: keyof ClientPortfolioEntry, value: string | number) => {
    setClientData(prev => ({
      ...prev,
      portfolio_entries: prev.portfolio_entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry
      )
    }));
  };

  const removePortfolioEntry = (index: number) => {
    setClientData(prev => {
      const nextEntries = prev.portfolio_entries.filter((_, entryIndex) => entryIndex !== index);
      return {
        ...prev,
        portfolio_entries: nextEntries.length > 0 ? nextEntries : [createEmptyPortfolioEntry()]
      };
    });
  };

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const allClients = await dataService.getClients(true);
      setClients(allClients || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => { loadClients(); }, []);

  // Carrega histórico quando um cliente é selecionado
  React.useEffect(() => {
    const fetchHistory = async () => {
      if (!selectedClient) {
        setClientHistory(EMPTY_CLIENT_HISTORY);
        return;
      }
      setClientHistory(EMPTY_CLIENT_HISTORY);
      setHistoryLoading(true);
      try {
        const [history, tags] = await Promise.all([
          dataService.getClientHistory(selectedClient.id),
          dataService.getClientTags(selectedClient.id)
        ]);
        setClientHistory(history);
        setClientTags(tags);
      } catch (e) {
        console.error("Erro ao carregar histórico:", e);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
    setNewEmail(selectedClient?.email || '');
  }, [selectedClient]);

  React.useEffect(() => {
    setExpandedCategory(null);
  }, [selectedClient?.id]);

  React.useEffect(() => {
    if (selectedCategoryGroups.length === 0) {
      setExpandedCategory(null);
      return;
    }

    setExpandedCategory(current =>
      current && selectedCategoryGroups.some(group => group.category === current)
        ? current
        : selectedCategoryGroups[0].category
    );
  }, [selectedCategoryGroups]);

  const handleSaveEmail = async () => {
    if (!selectedClient || !newEmail) return;
    setIsProcessing(true);
    try {
      await EmailService.saveEmail(selectedClient.id, newEmail);
      setSelectedClient({ ...selectedClient, email: newEmail });
      setIsEmailModalOpen(false);
      alert("E-mail salvo com sucesso!");
    } catch (e) {
      alert("Erro ao salvar e-mail.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientData.name || !clientData.phone) return;

    setIsProcessing(true);
    try {
      const portfolioEntries = mergePortfolioEntries(clientData.portfolio_entries);
      const portfolioMetadata = collectPortfolioMetadata(portfolioEntries);
      let savedClient: Client;

      if (editMode && clientData.id) {
        savedClient = await dataService.saveClientProfile(clientData.id, {
          name: clientData.name,
          phone: clientData.phone,
          phone_secondary: clientData.phone_secondary,
          address: clientData.address,
          street: clientData.street,
          neighborhood: clientData.neighborhood,
          city: clientData.city,
          state: clientData.state,
          zip_code: clientData.zip_code,
          portfolio_entries: portfolioEntries,
          customer_profiles: portfolioMetadata.customer_profiles,
          product_categories: portfolioMetadata.product_categories,
          equipment_models: portfolioMetadata.equipment_models,
          items: portfolioMetadata.equipment_models
        });
      } else {
        savedClient = await dataService.upsertClient({
          id: clientData.id || undefined,
          name: clientData.name,
          phone: clientData.phone,
          phone_secondary: clientData.phone_secondary,
          address: clientData.address,
          street: clientData.street,
          neighborhood: clientData.neighborhood,
          city: clientData.city,
          state: clientData.state,
          zip_code: clientData.zip_code,
          portfolio_entries: portfolioEntries,
          customer_profiles: portfolioMetadata.customer_profiles,
          product_categories: portfolioMetadata.product_categories,
          equipment_models: portfolioMetadata.equipment_models,
          items: portfolioMetadata.equipment_models
        });
      }

      setSelectedClient(savedClient);

      setIsModalOpen(false);
      setEditMode(false);
      resetClientForm();
      await loadClients();
    } catch (e) { alert("Erro ao salvar cliente."); }
    finally { setIsProcessing(false); }
  };

  const startEdit = (c: Client) => {
    const portfolioEntries = getClientPortfolioEntries(c);
    setClientData({
      id: c.id,
      name: c.name,
      phone: c.phone,
      phone_secondary: c.phone_secondary || '',
      address: c.address || '',
      street: c.street || '',
      neighborhood: c.neighborhood || '',
      city: c.city || '',
      state: c.state || '',
      zip_code: c.zip_code || '',
      portfolio_entries: portfolioEntries.length > 0 ? portfolioEntries : [createEmptyPortfolioEntry()]
    });
    setEditMode(true);
    setIsModalOpen(true);
  };

  const neighborhoods = Array.from(new Set(clients.map(c => c.neighborhood).filter(Boolean))) as string[];
  const cities = Array.from(new Set(clients.map(c => c.city).filter(Boolean))) as string[];

  const filtered = (clients || []).filter(c => {
    const matchSearch = (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || '').includes(search) ||
      (c.phone_secondary || '').includes(search);
    const matchNeighborhood = neighborhoodFilter ? c.neighborhood === neighborhoodFilter : true;
    const matchCity = cityFilter ? c.city === cityFilter : true;
    return matchSearch && matchNeighborhood && matchCity;
  });

  const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPERVISOR;

  const handleExportClientsCsv = () => {
    const rows = clients
      .map(client => ({
        name: (client.name || '').trim(),
        phone: (client.phone || '').trim()
      }))
      .filter(client => client.name || client.phone)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    if (rows.length === 0) {
      alert('Nao ha clientes para exportar.');
      return;
    }

    const escapeCsv = (value: string) => `"${String(value || '').replace(/"/g, '""')}"`;
    const csvContent = [
      'Nome,Telefone',
      ...rows.map(row => `${escapeCsv(row.name)},${escapeCsv(row.phone)}`)
    ].join('\r\n');

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `clientes-cadastrados-${stamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Base de Clientes 360º</h2>
          <p className="text-slate-500 text-sm font-bold mt-1">Gestão centralizada com histórico de atendimentos e protocolos.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleExportClientsCsv}
            className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-emerald-700 transition-all"
          >
            <Download size={18} /> Exportar CSV
          </button>
          <button onClick={() => {
            setEditMode(false);
            resetClientForm();
            setIsModalOpen(true);
          }} className="flex items-center gap-2 bg-blue-600 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-blue-700 transition-all">
            <UserPlus size={18} /> Novo Cliente
          </button>
        </div>
      </header>

      <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-2 flex-1 w-full">
          <Search className="text-slate-400 shrink-0" size={20} />
          <input
            type="text"
            placeholder="Pesquisar por nome ou telefone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-transparent border-none outline-none font-bold text-slate-700 placeholder:text-slate-300"
          />
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <select
            value={neighborhoodFilter}
            onChange={e => setNeighborhoodFilter(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none"
          >
            <option value="">Todos os Bairros</option>
            {neighborhoods.sort().map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none"
          >
            <option value="">Todas as Cidades</option>
            {cities.sort().map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-260px)]">
        {/* LISTA DE CLIENTES */}
        <div className="lg:col-span-4 flex flex-col h-full overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-300">
              <Loader2 className="animate-spin" size={32} />
              <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando Base...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-300 font-black uppercase tracking-widest text-[10px]">Nenhum cliente encontrado</div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClient(c)}
                  className={`w-full p-6 bg-white border-2 rounded-[32px] flex items-center justify-between group transition-all ${selectedClient?.id === c.id ? 'border-blue-600 shadow-xl shadow-blue-500/10' : 'border-slate-50 hover:border-slate-200 shadow-sm'}`}
                >
                  <div className="text-left flex flex-col gap-1 items-start">
                    <div className="flex items-center gap-2">
                      <h4 className="font-black text-slate-800 uppercase text-sm tracking-tight">{c.name}</h4>
                      {c.status === 'INATIVO' && (
                        <span className="px-2 py-0.5 bg-rose-600/20 text-rose-500 border border-rose-500/30 rounded-lg text-[8px] font-black uppercase tracking-widest shrink-0">
                          INATIVO
                        </span>
                      )}
                      {c.status === 'LEAD' && (
                        <span className="px-2 py-0.5 bg-indigo-600/20 text-indigo-500 border border-indigo-500/30 rounded-lg text-[8px] font-black uppercase tracking-widest shrink-0">
                          LEAD
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{c.phone}</span>
                  </div>
                  <ChevronRight size={18} className={`transition-transform ${selectedClient?.id === c.id ? 'text-blue-600 translate-x-1' : 'text-slate-200'} shrink-0`} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* DETALHES E HISTÓRICO */}
        <div className="lg:col-span-8 h-full overflow-y-auto custom-scrollbar">
          {selectedClient ? (
            <div className="bg-white rounded-[56px] shadow-sm border border-slate-100 flex flex-col animate-in slide-in-from-right-4 duration-300">
              <div className="p-8 md:p-10 border-b border-slate-100 flex justify-between items-start bg-slate-50/50 shrink-0">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-[8px] font-black uppercase tracking-widest">CLIENTE DREON</span>
                    <span className="text-slate-400 text-[9px] font-black tracking-widest uppercase">#{selectedClient.id.substring(0, 8)}</span>
                    {selectedClient.status === 'INATIVO' && (
                      <span className="px-3 py-1 bg-rose-600/20 text-rose-500 border border-rose-500/30 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1">
                        <AlertTriangle size={10} /> INATIVO
                      </span>
                    )}
                  </div>
                  <h3 className="text-4xl font-black text-slate-900 tracking-tighter leading-tight uppercase">{selectedClient.name}</h3>
                  <div className="flex flex-col gap-2">
                    <span className="flex items-center gap-2 text-sm font-black text-blue-600"><Phone size={16} /> Primário: {selectedClient.phone}</span>
                    {selectedClient.phone_secondary && <span className="flex items-center gap-2 text-sm font-black text-blue-600"><Phone size={16} /> Secundário: {selectedClient.phone_secondary}</span>}
                    
                    <div className="flex items-center gap-2 text-sm font-black text-slate-600 group cursor-pointer" onClick={() => setIsEmailModalOpen(true)}>
                      <Mail size={16} className={selectedClient.email ? "text-blue-500" : "text-slate-300"} />
                      {selectedClient.email ? (
                        <span className="flex items-center gap-2">
                          {selectedClient.email}
                          <Edit2 size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold italic flex items-center gap-2">
                          Clique para adicionar e-mail
                          <Plus size={12} />
                        </span>
                      )}
                    </div>

                    {selectedClient.neighborhood ? (
                      <div className="flex items-start gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                        <MapPin size={16} className="shrink-0 text-red-500" />
                        <div>
                          <p>{selectedClient.street || ''}</p>
                          <p>{selectedClient.neighborhood} - {selectedClient.city} / {selectedClient.state}</p>
                          <p className="text-[10px] mt-1">CEP: {selectedClient.zip_code || 'N/A'}</p>
                        </div>
                      </div>
                    ) : (
                      <span className="flex items-start gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2"><MapPin size={16} className="shrink-0 text-red-500" /> {selectedClient.address || 'Sem endereço cadastrado'}</span>
                    )}

                    {selectedClient.last_purchase_date && (
                      <div className="flex items-start gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">
                        <Calendar size={16} className="shrink-0 text-amber-500" />
                        <div>
                          <p className="text-[10px] text-slate-400 mb-1">Última Compra:</p>
                          <p className="text-amber-500">{selectedClient.last_purchase_date}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="text-6xl drop-shadow-md">{SATISFACTION_EMOJIS[selectedClient.satisfaction] || '😐'}</div>
                  {isAdmin && (
                    <button onClick={() => startEdit(selectedClient)} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all flex items-center gap-2">
                      <Edit2 size={12} /> Editar
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar">
                {/* TAGS DA INTELIGÊNCIA DREON */}
                <section className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                    <Sparkles size={14} className="text-blue-500" /> Tags de Intensidade e Perfil
                    <HelpTooltip content={HELP_TEXTS.TAGS_SISTEMA} />
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {clientTags.length > 0 ? clientTags.map((tag, i) => (
                      <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                        tag.status === 'APROVADA_SUPERVISOR' ? 'bg-green-50 text-green-700 border-green-200' : 
                        tag.status === 'REJEITADA' ? 'bg-red-50 text-red-700 border-red-200 opacity-50' :
                        'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        <span className="text-[10px] font-black uppercase">{tag.label}</span>
                        {tag.status === 'APROVADA_SUPERVISOR' && <ShieldCheck size={12} />}
                      </div>
                    )) : (
                      <p className="text-xs font-bold text-slate-300 italic">Nenhuma tag identificada para este cliente.</p>
                    )}
                  </div>
                </section>

                <section className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                        <Users size={14} className="text-amber-500" /> Perfil do Cliente
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {selectedPortfolioMetadata.customer_profiles.length > 0 ? selectedPortfolioMetadata.customer_profiles.map((profile, index) => (
                          <span key={`${profile}-${index}`} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-[10px] font-black uppercase border border-amber-100">{profile}</span>
                        )) : (
                          <span className="text-xs font-bold text-slate-300 italic">Nenhum perfil vinculado</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                        <TagIcon size={14} className="text-slate-500" /> Produtos Possuidos pelo Cliente
                      </h5>
                      <div className="flex flex-wrap gap-3">
                        {selectedCategoryGroups.length > 0 ? selectedCategoryGroups.map(group => {
                          const isExpanded = expandedCategory === group.category;
                          const toneClass =
                            group.priority === 'high'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : group.priority === 'medium'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-slate-50 text-slate-600 border-slate-200';

                          return (
                            <button
                              key={group.category}
                              type="button"
                              onClick={() => setExpandedCategory(group.category)}
                              className={`px-4 py-2.5 rounded-2xl border text-xs font-black uppercase tracking-wide transition-all shadow-sm ${
                                isExpanded ? 'bg-slate-900 text-white border-slate-900' : toneClass
                              }`}
                            >
                              {group.category}
                            </button>
                          );
                        }) : (
                          <span className="text-xs font-bold text-slate-300 italic">Nenhuma categoria vinculada</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                      <TagIcon size={14} className="text-indigo-500" /> Produtos da Categoria Selecionada
                    </h5>
                    {expandedCategory && selectedCategoryGroups.find(group => group.category === expandedCategory) ? (
                      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Categoria Selecionada</p>
                            <h6 className="text-lg font-black text-slate-800 mt-1">{expandedCategory}</h6>
                          </div>
                          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-600 border border-slate-200 text-[10px] font-black uppercase shadow-sm">
                            {selectedCategoryGroups.find(group => group.category === expandedCategory)?.total_quantity} item(ns)
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                          {selectedCategoryGroups.find(group => group.category === expandedCategory)!.equipments.map(equipment => (
                            <div key={equipment.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                              <p className="text-sm font-black text-slate-800 leading-tight">{equipment.name}</p>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-3">Quantidade</p>
                              <p className="text-2xl font-black text-slate-900 mt-1">{equipment.quantity}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-bold text-slate-400">
                        Selecione uma categoria para ver os produtos relacionados.
                      </div>
                    )}
                  </div>

                  <div className="hidden">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                      <TagIcon size={14} className="text-indigo-500" /> Equipamentos e Itens Específicos
                    </h5>
                    <div className="space-y-3">
                      {selectedCategoryGroups.length > 0 ? selectedCategoryGroups.map(group => {
                        const isExpanded = expandedCategory === group.category;

                        return (
                          <div key={group.category} className="rounded-[24px] border border-slate-200 bg-white overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setExpandedCategory(isExpanded ? null : group.category)}
                              className="w-full p-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-colors"
                            >
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-3 py-1 rounded-lg bg-cyan-50 text-cyan-700 text-[10px] font-black uppercase border border-cyan-100">{group.category}</span>
                                  {group.profiles.map(profile => (
                                    <span key={profile} className="px-3 py-1 rounded-lg bg-amber-50 text-amber-700 text-[10px] font-black uppercase border border-amber-100">{profile}</span>
                                  ))}
                                </div>
                                <p className="text-xs font-bold text-slate-500">{group.equipments.length} produto(s) especifico(s) vinculado(s)</p>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <div className="rounded-2xl bg-slate-900 px-3 py-2 text-white text-center min-w-[82px]">
                                  <p className="text-[8px] font-black uppercase tracking-widest">Qtd Total</p>
                                  <p className="text-2xl font-black leading-none mt-1">{group.total_quantity}</p>
                                </div>
                                <ChevronRight size={18} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                  {group.equipments.map(equipment => (
                                    <div key={equipment.name} className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-cyan-50 p-4">
                                      <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500">Produto Especifico</p>
                                      <h6 className="text-sm font-black text-slate-800 mt-2">{equipment.name}</h6>
                                      <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-white">
                                        <span className="text-[8px] font-black uppercase tracking-widest">Qtd</span>
                                        <span className="text-lg font-black leading-none">{equipment.quantity}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }) : (
                        <span className="text-xs font-bold text-slate-300 italic">Nenhum equipamento vinculado</span>
                      )}
                    </div>
                  </div>

                  <div className="hidden">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2">
                      <ClipboardList size={14} className="text-slate-500" /> Relações Técnicas por Linha
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedPortfolioEntries.length > 0 ? selectedPortfolioEntries.map((entry, index) => (
                        <div key={entry.id || `${entry.profile}-${entry.product_category}-${entry.equipment}-${index}`} className="p-4 bg-slate-50 rounded-[24px] border border-slate-100 space-y-2">
                          {entry.profile && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-600">Perfil: <span className="text-slate-700">{entry.profile}</span></p>
                          )}
                          {entry.product_category && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-cyan-600">Categoria: <span className="text-slate-700">{entry.product_category}</span></p>
                          )}
                          {entry.equipment && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-indigo-600">Equipamento: <span className="text-slate-700">{entry.equipment}</span></p>
                          )}
                          <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Quantidade: <span className="text-slate-700">{entry.quantity || 1}</span></p>
                        </div>
                      )) : (
                        <span className="text-xs font-bold text-slate-300 italic">Nenhuma linha técnica vinculada.</span>
                      )}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><ClipboardList size={14} className="text-slate-500" /> Resumo Operacional</h5>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">LigaÃ§Ãµes</p>
                      <p className="text-2xl font-black text-slate-800 mt-2">{clientHistory.summary.totalCalls}</p>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Protocolos</p>
                      <p className="text-2xl font-black text-slate-800 mt-2">{clientHistory.summary.totalProtocols}</p>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Abertos</p>
                      <p className="text-2xl font-black text-slate-800 mt-2">{clientHistory.summary.openProtocols}</p>
                    </div>
                  </div>
                  {clientHistory.summary.callCountsByType.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Contagem por Tipo de LigaÃ§Ã£o</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByType.map(item => (
                          <span key={item.key} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase border border-slate-200">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {clientHistory.summary.callCountsByPurpose.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Contagem por Proposito</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByPurpose.map(item => (
                          <span key={item.key} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase border border-blue-100">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {clientHistory.summary.callCountsByTargetProduct.length > 0 && (
                    <div>
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Contagem por Produto/Oferta</p>
                      <div className="flex flex-wrap gap-2">
                        {clientHistory.summary.callCountsByTargetProduct.map(item => (
                          <span key={item.key} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase border border-indigo-100">
                            {item.label}: {item.total}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {/* ÚLTIMAS LIGAÇÕES */}
                  <section className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><History size={14} className="text-blue-500" /> Histórico de Ligações</h5>
                    {historyLoading ? (
                      <div className="flex justify-center p-8"><Loader2 className="animate-spin text-blue-200" /></div>
                    ) : clientHistory.calls.length > 0 ? (
                      <div className="space-y-3">
                        {clientHistory.calls.slice(0, 5).map(call => (
                          <div key={call.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                            <div className="flex justify-between items-start">
                              <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-slate-200 text-slate-600 rounded">{call.type}</span>
                              <span className="text-[8px] font-black text-slate-400 uppercase">{new Date(call.startTime).toLocaleDateString()}</span>
                            </div>
                            {(call.proposito || call.targetProduct || call.offerProduct) && (
                              <div className="flex flex-wrap gap-2">
                                {call.proposito && <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded text-[8px] font-black uppercase">{call.proposito}</span>}
                                {call.targetProduct && <span className="px-2 py-0.5 bg-cyan-100 text-cyan-600 rounded text-[8px] font-black uppercase">{call.targetProduct}</span>}
                                {call.offerProduct && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-600 rounded text-[8px] font-black uppercase">{call.offerProduct}</span>}
                              </div>
                            )}
                            <p className="text-xs font-bold text-slate-700 italic line-clamp-2">"{call.responses?.written_report || 'Sem resumo'}"</p>
                            {(call.offerInterestLevel || call.offerBlockerReason) && (
                              <div className="pt-2 border-t border-slate-200/60 space-y-1">
                                {call.offerInterestLevel && <p className="text-[9px] font-black uppercase text-slate-500">Receptividade: <span className="text-slate-700">{call.offerInterestLevel}</span></p>}
                                {call.offerBlockerReason && <p className="text-[9px] font-black uppercase text-slate-500">Impedimento: <span className="text-slate-700">{call.offerBlockerReason}</span></p>}
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200/50">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><Clock size={10} /> {Math.floor(call.duration / 60)}m {call.duration % 60}s</span>
                              <span className="text-[8px] font-black text-blue-500 uppercase tracking-widest">ID Operador: {call.operatorId.substring(0, 6)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] font-black uppercase text-slate-300 py-10 text-center tracking-widest">Nenhuma ligação registrada</p>
                    )}
                  </section>

                  {/* PROTOCOLOS DO CLIENTE */}
                  <section className="space-y-4">
                    <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-100 pb-2"><ClipboardList size={14} className="text-red-500" /> Protocolos Vinculados</h5>
                    {historyLoading ? (
                      <div className="flex justify-center p-8"><Loader2 className="animate-spin text-red-100" /></div>
                    ) : clientHistory.protocols.length > 0 ? (
                      <div className="space-y-3">
                        {clientHistory.protocols.map(proto => (
                          <div key={proto.id} className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-2">
                            <div className="flex justify-between items-center">
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded text-white ${proto.status === ProtocolStatus.FECHADO ? 'bg-slate-500' : 'bg-red-600'}`}>
                                {proto.status}
                              </span>
                              <span className="text-[9px] font-black text-slate-300 uppercase">#{proto.protocolNumber || proto.id.substring(0, 8)}</span>
                            </div>
                            <h6 className="text-sm font-black text-slate-800 leading-tight">{proto.title}</h6>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Aberto em: {new Date(proto.openedAt).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] font-black uppercase text-slate-300 py-10 text-center tracking-widest">Nenhum protocolo aberto</p>
                    )}
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full bg-slate-50 border-4 border-dashed border-slate-100 rounded-[56px] flex flex-col items-center justify-center p-20 text-center gap-6 opacity-40">
              <Users size={64} className="text-slate-300" />
              <p className="text-sm font-black uppercase text-slate-400 tracking-widest">Selecione um cliente para auditar o histórico completo</p>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="bg-slate-900 p-8 text-white flex justify-between items-center">
              <h3 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
                {editMode ? <Edit2 size={24} className="text-blue-400" /> : <UserPlus size={24} className="text-blue-400" />}
                {editMode ? 'Editar Cadastro' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-all"><X size={24} /></button>
            </div>

            <form onSubmit={handleSaveClient} className="p-10 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
                <input type="text" required value={clientData.name} onChange={e => setClientData({ ...clientData, name: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone Principal</label>
                  <input type="text" required value={clientData.phone} onChange={e => setClientData({ ...clientData, phone: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone Secundário</label>
                  <input type="text" value={clientData.phone_secondary} onChange={e => setClientData({ ...clientData, phone_secondary: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-5">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil, Categoria e Equipamento</h4>
                    <p className="text-xs font-bold text-slate-400 mt-1">Cada linha representa um vínculo técnico do cliente.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addPortfolioEntry}
                    className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 transition-all"
                  >
                    <Plus size={14} /> Adicionar Linha
                  </button>
                </div>

                <div className="space-y-4">
                  {clientData.portfolio_entries.map((entry, index) => (
                    <div key={entry.id || `${index}`} className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_120px_auto] gap-3 items-end bg-white rounded-[24px] border border-slate-200 p-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Perfil</label>
                        <input
                          type="text"
                          value={entry.profile}
                          onChange={e => updatePortfolioEntry(index, 'profile', e.target.value)}
                          placeholder="Ex: Construtor"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Categoria</label>
                        <input
                          type="text"
                          value={entry.product_category}
                          onChange={e => updatePortfolioEntry(index, 'product_category', e.target.value)}
                          placeholder="Ex: Boiler com Placa Solar"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamento</label>
                        <input
                          type="text"
                          value={entry.equipment}
                          onChange={e => updatePortfolioEntry(index, 'equipment', e.target.value)}
                          placeholder="Ex: BZ20"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quantidade</label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={entry.quantity || 1}
                          onChange={e => updatePortfolioEntry(index, 'quantity', Number(e.target.value || 1))}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm outline-none focus:border-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removePortfolioEntry(index)}
                        className="h-11 px-4 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 space-y-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">Endereço Estruturado</h4>
                <div className="space-y-3">
                  <input type="text" placeholder="Rua e Número" value={clientData.street} onChange={e => setClientData({ ...clientData, street: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Bairro" value={clientData.neighborhood} onChange={e => setClientData({ ...clientData, neighborhood: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                    <input type="text" placeholder="Cidade" value={clientData.city} onChange={e => setClientData({ ...clientData, city: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input type="text" placeholder="Estado (UF)" maxLength={2} value={clientData.state} onChange={e => setClientData({ ...clientData, state: e.target.value.toUpperCase() })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                    <input type="text" placeholder="CEP" value={clientData.zip_code} onChange={e => setClientData({ ...clientData, zip_code: e.target.value })} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 opacity-50">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Observações / Endereço Completo</label>
                <textarea value={clientData.address} onChange={e => setClientData({ ...clientData, address: e.target.value })} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold h-20 resize-none outline-none focus:ring-4 focus:ring-blue-500/10 transition-all" />
              </div>
              <button type="submit" disabled={isProcessing} className="w-full py-6 bg-blue-600 text-white rounded-[32px] font-black uppercase tracking-widest text-[10px] shadow-2xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50">
                {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={18} />} {editMode ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </form>
          </div>
        </div>
      )}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
          <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl animate-in zoom-in duration-200">
             <div className="p-8 space-y-6">
                <div className="flex justify-between items-center">
                   <h3 className="text-lg font-black uppercase text-slate-800 tracking-tighter flex items-center gap-2">
                      <Mail className="text-blue-600" /> Gerenciar E-mail
                   </h3>
                   <button onClick={() => setIsEmailModalOpen(false)} className="text-slate-300 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Endereço de E-mail</label>
                   <input 
                      type="email" 
                      value={newEmail} 
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="email@cliente.com.br"
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-500/10 transition-all"
                   />
                </div>
                <button 
                  onClick={handleSaveEmail}
                  disabled={isProcessing}
                  className="w-full py-5 bg-blue-600 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] shadow-xl flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : <Save size={16} />} Salvar E-mail
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
