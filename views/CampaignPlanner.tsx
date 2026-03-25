import React, { useState, useEffect } from 'react';
import { 
  CampaignPlannerService, 
  CampaignPlannerFilters, 
  CampaignDispatchPreview,
  ClientWithLastCall,
  PortfolioFilterOptions
} from '../services/campaignPlannerService';
import { PortfolioCatalogService } from '../services/portfolioCatalogService';
import { CallType } from '../types';
import { dataService } from '../services/dataService';
import { Calendar, Filter, Users, Send, Search, Save, X, Settings2, MapPin, Phone, Tag as TagIcon, LayoutGrid, Clock, Mail } from 'lucide-react';
import { PortfolioCatalogManager } from '../components/PortfolioCatalogManager';
import { HelpTooltip } from '../components/HelpTooltip';
import { HELP_TEXTS } from '../utils/helpTexts';
import { normalizeComparableText } from '../utils/clientPortfolio';
import { resolveKnownCity } from '../utils/addressParser';
import { normalizeInterestProduct } from '../utils/interestCatalog';
import {
  PortfolioCatalogConfig,
  getCatalogProductsByCategory
} from '../utils/portfolioCatalog';

export const CampaignPlanner: React.FC = () => {
  const findMatchingListOption = React.useCallback((rawValue: string, options: string[], mode: 'city' | 'neighborhood') => {
    const trimmed = rawValue.trim();
    if (!trimmed) return undefined;

    const normalizedTarget = mode === 'city'
      ? normalizeComparableText(resolveKnownCity(trimmed) || trimmed)
      : normalizeComparableText(trimmed);

    return options.find(option => {
      const normalizedOption = mode === 'city'
        ? normalizeComparableText(resolveKnownCity(option) || option)
        : normalizeComparableText(option);

      return Boolean(normalizedOption) && normalizedOption === normalizedTarget;
    });
  }, []);

  const findMatchingInterestOption = React.useCallback((rawValue: string, options: string[]) => {
    const trimmed = rawValue.trim();
    if (!trimmed) return undefined;

    const normalizedTarget = normalizeComparableText(normalizeInterestProduct(trimmed) || trimmed);

    return options.find(option =>
      normalizeComparableText(normalizeInterestProduct(option) || option) === normalizedTarget
    );
  }, []);

  // Dynamic filter lists from DB
  const [citiesList, setCitiesList] = useState<string[]>([]);
  const [neighborhoodsList, setNeighborhoodsList] = useState<string[]>([]);
  const [itemsList, setItemsList] = useState<string[]>([]);
  const [profilesList, setProfilesList] = useState<string[]>([]);
  const [productCategoriesList, setProductCategoriesList] = useState<string[]>([]);
  const [callTypesList, setCallTypesList] = useState<string[]>([]);
  const [tagCategoriesList, setTagCategoriesList] = useState<string[]>([]);
  const [operadoresList, setOperadoresList] = useState<any[]>([]);
  const [interestProductsList, setInterestProductsList] = useState<string[]>([]);
  const [catalogConfig, setCatalogConfig] = useState<PortfolioCatalogConfig | null>(null);
  const [portfolioFilterOptions, setPortfolioFilterOptions] = useState<PortfolioFilterOptions>({
    profiles: [],
    categories: [],
    equipments: [],
    equipmentByCategory: {}
  });
  const [isCatalogManagerOpen, setIsCatalogManagerOpen] = useState(false);

  // Selected filters
  const [filters, setFilters] = useState<CampaignPlannerFilters>({
    periodos: [],
    diasAvulsos: [],
    callTypes: [],
    withoutSelectedCallTypes: false,
    resultados: [],
    operadores: [],
    niveisSatisfacao: [],
    statusCliente: ['CLIENT', 'INATIVO', 'LEAD'],
    tags: [],
    interesses: [],
    perfisCliente: [],
    categoriasProduto: [],
    equipamentos: [],
    bairros: [],
    cidades: [],
    temEmail: undefined,
    produtoAlvo: '',
    ofertaAlvo: '',
    escopoLinha: ''
  });

  // Data state
  const [clients, setClients] = useState<ClientWithLastCall[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchPreview, setDispatchPreview] = useState<CampaignDispatchPreview | null>(null);
  const [dispatchPreviewLoading, setDispatchPreviewLoading] = useState(false);

  // Dispatch state
  const [campNome, setCampNome] = useState('');
  const [campProposito, setCampProposito] = useState('');
  const [campCallType, setCampCallType] = useState<CallType>(CallType.PROSPECCAO);
  const [campCanal, setCampCanal] = useState<'voz'|'whatsapp'|'ambos'>('voz');
  const [campOperador, setCampOperador] = useState('');

  // UI state for date range picker
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Initial Load options
  const loadReferenceData = React.useCallback(async () => {
    const [
      users,
      cities,
      catalog,
      portfolioOptions,
      callTypes,
      tagCategories,
      interestProducts
    ] = await Promise.all([
      dataService.getUsers(),
      CampaignPlannerService.getDistinctCities(),
      PortfolioCatalogService.getCatalogConfig(),
      CampaignPlannerService.getPortfolioFilterOptions(),
      CampaignPlannerService.getDistinctCallTypes(),
      CampaignPlannerService.getDistinctTagCategories(),
      CampaignPlannerService.getDistinctInterestProducts()
    ]);

    const activeOperators = users.filter(u => u.active);
    setOperadoresList(activeOperators.map(u => ({ id: u.id, username_display: u.name })));
    setCitiesList(cities);
    setCatalogConfig(catalog);
    setPortfolioFilterOptions(portfolioOptions);
    setItemsList(portfolioOptions.equipments);
    setProductCategoriesList(portfolioOptions.categories);
    setProfilesList(portfolioOptions.profiles);
    setCallTypesList(callTypes);
    setTagCategoriesList(tagCategories);
    setInterestProductsList(interestProducts);
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  // Update neighborhoods when city filter changes
  useEffect(() => {
    if (filters.cidades && filters.cidades.length > 0) {
      // For simplicity, fetch neighborhoods for the first selected city, 
      // or combined if you enhance the service
      CampaignPlannerService.getDistinctNeighborhoods(filters.cidades[0]).then(setNeighborhoodsList);
    } else {
      CampaignPlannerService.getDistinctNeighborhoods().then(setNeighborhoodsList);
    }
  }, [filters.cidades]);

  const filteredEquipmentOptions = React.useMemo(() => {
    if (!filters.categoriasProduto?.length) {
      return itemsList;
    }

    const fromPortfolio = filters.categoriasProduto.flatMap(category => {
      const normalizedCategory = category
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      return portfolioFilterOptions.equipmentByCategory[normalizedCategory] || [];
    });

    const fromCatalog = catalogConfig
      ? getCatalogProductsByCategory(catalogConfig, filters.categoriasProduto).map(product => product.name)
      : [];

    const merged = Array.from(new Set([...fromPortfolio, ...fromCatalog, ...itemsList]))
      .filter(item => {
        if (!filters.categoriasProduto?.length) return true;

        const normalizedItem = item
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        return filters.categoriasProduto.some(category => {
          const normalizedCategory = category
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

          const fromMap = portfolioFilterOptions.equipmentByCategory[normalizedCategory] || [];
          return fromMap.some(mapped => {
            const normalizedMapped = mapped
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .trim();
            return normalizedMapped === normalizedItem;
          });
        });
      });

    return merged.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [catalogConfig, filters.categoriasProduto, itemsList, portfolioFilterOptions.equipmentByCategory]);

  const getSatisfactionMeta = (client: ClientWithLastCall) => {
    const scoreLabel =
      typeof client.ultima_satisfacao_score === 'number'
        ? `${Math.round(client.ultima_satisfacao_score)}%`
        : null;

    switch (client.ultima_satisfacao_nivel) {
      case 'ALTA':
        return {
          label: 'Satisfacao alta',
          scoreLabel,
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        };
      case 'MEDIA':
        return {
          label: 'Satisfacao media',
          scoreLabel,
          className: 'bg-amber-50 text-amber-700 border-amber-200'
        };
      case 'BAIXA':
        return {
          label: 'Satisfacao baixa',
          scoreLabel,
          className: 'bg-rose-50 text-rose-700 border-rose-200'
        };
      default:
        return {
          label: 'Sem leitura',
          scoreLabel: null,
          className: 'bg-slate-100 text-slate-600 border-slate-200'
        };
    }
  };

  // Main search action
  const handleSearch = async () => {
    setLoading(true);
    try {
      // If dates are populated, inject them into periodos
      const searchFilters = { ...filters };
      if (dateFrom && dateTo) {
        searchFilters.periodos = [{ de: dateFrom, ate: dateTo }];
      } else if (dateFrom) {
        searchFilters.periodos = [{ de: dateFrom, ate: new Date().toISOString() }];
      } else {
        searchFilters.periodos = [];
      }

      const res = await CampaignPlannerService.fetchClientsByFilters(searchFilters);
      setClients(res);
      setSelectedIds(new Set()); // reset selection on new search
    } catch (err) {
      console.error(err);
      alert('Erro ao buscar clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const selectedClients = clients.filter(client => selectedIds.has(client.id));
  const selectedLeadCount = selectedClients.filter(client => client.status === 'LEAD').length;
  const estimatedQueueEntries = dispatchPreview?.queue_entries_expected ?? (selectedIds.size * (campCanal === 'ambos' ? 2 : 1));

  useEffect(() => {
    let cancelled = false;

    if (selectedIds.size === 0) {
      setDispatchPreview(null);
      setDispatchPreviewLoading(false);
      return;
    }

    setDispatchPreviewLoading(true);
    CampaignPlannerService.previewDispatchCampaign({
      canal: campCanal,
      clientIds: Array.from(selectedIds)
    })
      .then(preview => {
        if (!cancelled) {
          setDispatchPreview(preview);
        }
      })
      .catch(error => {
        console.error(error);
        if (!cancelled) {
          setDispatchPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDispatchPreviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [campCanal, selectedIds]);

  const handleDispatch = async () => {
    if (!campNome || !campOperador) {
      alert("Preencha o nome da campanha e o operador destino.");
      return;
    }
    if (selectedIds.size === 0) {
      alert("Selecione pelo menos um cliente para criar a campanha.");
      return;
    }
    if (dispatchPreview && dispatchPreview.queue_entries_expected === 0) {
      alert("Nenhum cliente elegivel para entrar na fila com o canal escolhido.");
      return;
    }

    setDispatching(true);
    try {
      const result = await CampaignPlannerService.dispatchCampaign({
        nomeCampanha: campNome,
        proposito: campProposito,
        callType: campCallType,
        canal: campCanal,
        operatorId: campOperador || null, // Ensure empty string becomes null for database integrity
        clientIds: Array.from(selectedIds),
        filters
      });

      alert(
        `Disparo Concluído!\n` +
        `Clientes selecionados: ${result.clients_selected}\n` +
        `Itens de fila criados: ${result.tasks_criadas}\n` +
        `- Ligações: ${result.ligacoes_criadas}\n` +
        `- WhatsApp: ${result.whatsapp_criados}\n` +
        `Bloqueados por contato recente: ${result.bloqueados_contato_recente}\n` +
        `Bloqueados por fila de ligacao: ${result.bloqueados_fila_voz}\n` +
        `Bloqueados por fila de WhatsApp: ${result.bloqueados_fila_whatsapp}\n` +
        `Clientes sem abertura possivel: ${result.ignorados}\n` +
        `Erros de criação: ${result.erros.length}`
      );
      setCampNome('');
      setSelectedIds(new Set());
    } catch (err: any) {
      alert('Erro ao despachar campanha: ' + err.message);
    } finally {
      setDispatching(false);
    }
  };

  const toggleFilterArray = (key: keyof CampaignPlannerFilters, val: string) => {
    const current = (filters[key] as string[]) || [];
    setFilters({
      ...filters,
      [key]: current.includes(val) ? current.filter(x => x !== val) : [...current, val]
    });
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 mt-4 gap-4 relative z-10">
        <div className="relative">
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-20"></div>
          <h1 className="relative text-3xl font-black text-slate-900 uppercase tracking-tighter flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-blue-500/30">
              <Calendar size={24} />
            </div>
            Planejador de Campanhas
            <HelpTooltip content={HELP_TEXTS.CAMPANHA_PLANNER} />
          </h1>
          <p className="text-slate-500 font-bold mt-2 uppercase text-xs tracking-widest flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            Segmente sua base com busca inteligente e envie cargas de trabalho
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCatalogManagerOpen(true)}
          className="px-5 py-3 rounded-2xl border border-slate-200 bg-white text-slate-700 font-black uppercase tracking-widest text-[10px] flex items-center gap-2 shadow-sm hover:border-blue-300 hover:text-blue-700 transition-all"
        >
          <Settings2 size={16} /> Gerenciar catalogo tecnico
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8">
        
        {/* LEFT COLUMN: FILTERS & RESULTS */}
        <div className="flex-1 space-y-6">
          
          {/* FILTER PANEL */}
          <div className="bg-white p-6 rounded-[24px] shadow-sm border border-slate-200">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2 mb-6">
              <Settings2 size={16} className="text-blue-600" /> Filtros de Segmentação
            </h2>
            <div className="mb-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <p className="text-xs font-bold text-slate-500">
                O catalogo tecnico reduz o excesso de opcoes. Ao escolher uma categoria, a lista de produtos fica mais enxuta.
              </p>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-blue-700 border border-blue-100">
                {filters.categoriasProduto?.length || 0} categoria(s) e {filters.equipamentos?.length || 0} produto(s) filtrados
              </div>
            </div>
             
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-5">
              
              {/* BLOCK 1: Profile & Status */}
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Users size={12} /> Gênero de Cliente
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['CLIENT', 'INATIVO', 'LEAD'].map(status => (
                      <button
                        key={status}
                        onClick={() => toggleFilterArray('statusCliente', status)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                          filters.statusCliente?.includes(status) 
                            ? 'bg-slate-900 text-white shadow-sm' 
                            : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/60'
                        }`}
                      >
                        {status === 'CLIENT' ? 'Clientes (Compradores)' : status === 'LEAD' ? 'Prospectos' : 'Inativos'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Mail size={12} /> Tem E-mail?
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilters({ ...filters, temEmail: true })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filters.temEmail === true ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                    >Sim</button>
                    <button
                      onClick={() => setFilters({ ...filters, temEmail: false })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filters.temEmail === false ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                    >Não</button>
                    <button
                      onClick={() => setFilters({ ...filters, temEmail: undefined })}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${filters.temEmail === undefined ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-500 border border-slate-200'}`}
                    >Ambos</button>
                  </div>
                </div>
              </div>

              {/* BLOCK 2: Geography & Equipment */}
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <LayoutGrid size={12} /> Produto de Interesse (Orçamentos / Leads)
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="interest-list"
                      placeholder="Buscar Produto de Interesse..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-purple-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const matchedInterest = findMatchingInterestOption(e.target.value, interestProductsList);
                        if (matchedInterest) {
                          if (!filters.interesses?.includes(matchedInterest)) setFilters({ ...filters, interesses: [...(filters.interesses || []), matchedInterest] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const matchedInterest = findMatchingInterestOption(e.currentTarget.value, interestProductsList);
                          if (matchedInterest && !filters.interesses?.includes(matchedInterest)) {
                            setFilters({ ...filters, interesses: [...(filters.interesses || []), matchedInterest] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="interest-list">
                      {interestProductsList.map(i => <option key={i} value={i} />)}
                    </datalist>
                  </div>
                  {filters.interesses && filters.interesses.length > 0 && (
                     <div className="flex flex-wrap gap-1 mt-2">
                       {filters.interesses.map(int => (
                         <span key={int} className="inline-flex items-center gap-1 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                           {int} <X size={12} className="cursor-pointer hover:text-purple-200 transition-colors" onClick={() => toggleFilterArray('interesses', int)} />
                         </span>
                       ))}
                     </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Users size={12} /> Perfil do Cliente
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="profiles-list"
                      placeholder="Buscar Perfil..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-amber-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (profilesList.includes(val)) {
                          if (!filters.perfisCliente?.includes(val)) setFilters({ ...filters, perfisCliente: [...(filters.perfisCliente || []), val] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !filters.perfisCliente?.includes(val)) {
                            setFilters({ ...filters, perfisCliente: [...(filters.perfisCliente || []), val] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="profiles-list">
                      {profilesList.map(profile => <option key={profile} value={profile} />)}
                    </datalist>
                  </div>
                  {filters.perfisCliente && filters.perfisCliente.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {filters.perfisCliente.map(profile => (
                        <span key={profile} className="inline-flex items-center gap-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                          {profile} <X size={12} className="cursor-pointer hover:text-amber-200 transition-colors" onClick={() => toggleFilterArray('perfisCliente', profile)} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <TagIcon size={12} /> Categoria do Produto
                  </label>
                  <p className="text-[11px] font-bold text-slate-500">
                    Lista controlada pelo catalogo tecnico. Ajustes globais ficam em "Gerenciar catalogo tecnico".
                  </p>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="product-categories-list"
                      placeholder="Buscar Categoria..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-cyan-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (productCategoriesList.includes(val)) {
                          if (!filters.categoriasProduto?.includes(val)) setFilters({ ...filters, categoriasProduto: [...(filters.categoriasProduto || []), val] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !filters.categoriasProduto?.includes(val)) {
                            setFilters({ ...filters, categoriasProduto: [...(filters.categoriasProduto || []), val] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="product-categories-list">
                      {productCategoriesList.map(category => <option key={category} value={category} />)}
                    </datalist>
                  </div>
                  {filters.categoriasProduto && filters.categoriasProduto.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {filters.categoriasProduto.map(category => (
                        <span key={category} className="inline-flex items-center gap-1 bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                          {category} <X size={12} className="cursor-pointer hover:text-cyan-200 transition-colors" onClick={() => toggleFilterArray('categoriasProduto', category)} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <MapPin size={12} /> Cidade / Região (Pesquisável)
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="cities-list"
                      placeholder="Buscar Cidade..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const matchedCity = findMatchingListOption(e.target.value, citiesList, 'city');
                        if (matchedCity) {
                          if (!filters.cidades?.includes(matchedCity)) setFilters({ ...filters, cidades: [...(filters.cidades || []), matchedCity] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const matchedCity = findMatchingListOption(e.currentTarget.value, citiesList, 'city');
                          if (matchedCity && !filters.cidades?.includes(matchedCity)) {
                            setFilters({ ...filters, cidades: [...(filters.cidades || []), matchedCity] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="cities-list">
                      {citiesList.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  {filters.cidades && filters.cidades.length > 0 && (
                     <div className="flex flex-wrap gap-1 mt-2">
                       {filters.cidades.map(c => (
                         <span key={c} className="inline-flex items-center gap-1 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                           {c} <X size={12} className="cursor-pointer hover:text-indigo-200 transition-colors" onClick={() => toggleFilterArray('cidades', c)} />
                         </span>
                       ))}
                     </div>
                  )}

                  <div className="relative mt-3">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="neighborhoods-list"
                      placeholder="Buscar Bairro..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const matchedNeighborhood = findMatchingListOption(e.target.value, neighborhoodsList, 'neighborhood');
                        if (matchedNeighborhood) {
                          if (!filters.bairros?.includes(matchedNeighborhood)) setFilters({ ...filters, bairros: [...(filters.bairros || []), matchedNeighborhood] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const matchedNeighborhood = findMatchingListOption(e.currentTarget.value, neighborhoodsList, 'neighborhood');
                          if (matchedNeighborhood && !filters.bairros?.includes(matchedNeighborhood)) {
                            setFilters({ ...filters, bairros: [...(filters.bairros || []), matchedNeighborhood] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="neighborhoods-list">
                      {neighborhoodsList.map(n => <option key={n} value={n} />)}
                    </datalist>
                  </div>
                  {filters.bairros && filters.bairros.length > 0 && (
                     <div className="flex flex-wrap gap-1 mt-2">
                       {filters.bairros.map(b => (
                         <span key={b} className="inline-flex items-center gap-1 bg-gradient-to-r from-indigo-500 to-blue-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                           {b} <X size={12} className="cursor-pointer hover:text-indigo-200 transition-colors" onClick={() => toggleFilterArray('bairros', b)} />
                         </span>
                       ))}
                     </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <LayoutGrid size={12} /> Equipamentos Conhecidos (Pesquisável)
                  </label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      list="items-list"
                      placeholder="Buscar Equipamento..."
                      className="w-full pl-9 text-sm font-semibold rounded-xl border-slate-200 bg-slate-50 focus:ring-teal-500 focus:bg-white transition-all shadow-inner"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (filteredEquipmentOptions.includes(val)) {
                          if (!filters.equipamentos?.includes(val)) setFilters({ ...filters, equipamentos: [...(filters.equipamentos || []), val] });
                          e.target.value = '';
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = e.currentTarget.value.trim();
                          if (val && !filters.equipamentos?.includes(val)) {
                            setFilters({ ...filters, equipamentos: [...(filters.equipamentos || []), val] });
                            e.currentTarget.value = '';
                          }
                        }
                      }}
                    />
                    <datalist id="items-list">
                      {filteredEquipmentOptions.map(i => <option key={i} value={i} />)}
                    </datalist>
                  </div>
                  {filters.equipamentos && filters.equipamentos.length > 0 && (
                     <div className="flex flex-wrap gap-1 mt-2">
                       {filters.equipamentos.map(eq => (
                         <span key={eq} className="inline-flex items-center gap-1 bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-xs font-bold animate-in zoom-in duration-200">
                           {eq} <X size={12} className="cursor-pointer hover:text-teal-200 transition-colors" onClick={() => toggleFilterArray('equipamentos', eq)} />
                         </span>
                       ))}
                     </div>
                  )}
                </div>
              </div>

              {/* BLOCK 3: History & Interactions */}
              <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Phone size={12} /> Filtros por tipo de Contato Prévio
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {callTypesList.length === 0 ? <span className="text-xs text-slate-400">Nenhum histórico</span> : null}
                    {callTypesList.map(ct => (
                      <button
                        key={ct}
                        onClick={() => toggleFilterArray('callTypes', ct)}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-300 border shadow-sm ${
                          filters.callTypes?.includes(ct) 
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-emerald-500/30' 
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        {ct}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                    <button
                      type="button"
                      disabled={!filters.callTypes?.length}
                      onClick={() => setFilters(prev => ({
                        ...prev,
                        withoutSelectedCallTypes: !prev.withoutSelectedCallTypes
                      }))}
                      className={`w-full px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                        !filters.callTypes?.length
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : filters.withoutSelectedCallTypes
                            ? 'bg-rose-600 text-white shadow-lg shadow-rose-200'
                            : 'bg-slate-900 text-white'
                      }`}
                    >
                      {filters.withoutSelectedCallTypes ? 'Trazer sem esses contatos' : 'Trazer com esses contatos'}
                    </button>
                    <p className="text-[11px] font-bold text-slate-500 mt-2">
                      Ative para localizar clientes que ainda nao receberam os tipos selecionados no periodo filtrado.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <TagIcon size={12} /> Nivel de Satisfacao da Ultima Ligacao
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'ALTA', label: 'Alta', active: 'bg-emerald-500 text-white border-transparent shadow-emerald-500/30' },
                      { key: 'MEDIA', label: 'Media', active: 'bg-amber-500 text-white border-transparent shadow-amber-500/30' },
                      { key: 'BAIXA', label: 'Baixa', active: 'bg-rose-500 text-white border-transparent shadow-rose-500/30' },
                      { key: 'SEM_LEITURA', label: 'Sem leitura', active: 'bg-slate-700 text-white border-transparent shadow-slate-500/20' }
                    ].map(level => (
                      <button
                        key={level.key}
                        onClick={() => toggleFilterArray('niveisSatisfacao', level.key)}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-300 border shadow-sm ${
                          filters.niveisSatisfacao?.includes(level.key)
                            ? level.active
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Clock size={12} /> Periodo do Ultimo Contato
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="date" 
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full text-xs font-bold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner" 
                    />
                    <input 
                      type="date" 
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full text-xs font-bold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner" 
                    />
                  </div>
                </div>

                <div className="hidden">

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Clock size={12} /> Período do Último Contato
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'ALTA', label: 'Alta', active: 'bg-emerald-500 text-white border-transparent shadow-emerald-500/30' },
                      { key: 'MEDIA', label: 'Média', active: 'bg-amber-500 text-white border-transparent shadow-amber-500/30' },
                      { key: 'BAIXA', label: 'Baixa', active: 'bg-rose-500 text-white border-transparent shadow-rose-500/30' },
                      { key: 'SEM_LEITURA', label: 'Sem leitura', active: 'bg-slate-700 text-white border-transparent shadow-slate-500/20' }
                    ].map(level => (
                      <button
                        key={level.key}
                        onClick={() => toggleFilterArray('niveisSatisfacao', level.key)}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-300 border shadow-sm ${
                          filters.niveisSatisfacao?.includes(level.key)
                            ? level.active
                            : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <TagIcon size={12} /> Nivel de Satisfacao da Ultima Ligacao
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="date" 
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full text-xs font-bold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner" 
                    />
                    <input 
                      type="date" 
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full text-xs font-bold rounded-xl border-slate-200 bg-slate-50 focus:ring-blue-500 focus:bg-white transition-all shadow-inner" 
                    />
                  </div>
                </div>

                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <TagIcon size={12} /> Categorias / Tags de Resposta
                  </label>
                  <div className="rounded-[20px] border border-slate-200 bg-white/80 p-3">
                    <div className="max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      <div className="flex flex-wrap gap-2 content-start">
                        {tagCategoriesList.length === 0 ? <span className="text-xs text-slate-400">Sem tags mapeadas</span> : null}
                        {tagCategoriesList.map(cat => (
                          <button
                            key={cat}
                            onClick={() => toggleFilterArray('tags', cat)}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded-lg uppercase tracking-wider transition-all duration-300 border shadow-sm ${
                              filters.tags?.includes(cat) 
                                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-rose-500/30' 
                                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {filters.tags && filters.tags.length > 0 && (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                          Tags Selecionadas ({filters.tags.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {filters.tags.map(tag => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase"
                            >
                              {tag}
                              <X size={12} className="cursor-pointer hover:text-rose-100 transition-colors" onClick={() => toggleFilterArray('tags', tag)} />
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* ACTION BAR */}
            <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-6">
              <button
                className="flex items-center gap-2 px-4 py-2 text-slate-500 font-bold text-sm rounded-xl hover:bg-slate-50 transition-colors"
              >
                <Save size={16} /> Salvar como Preset
              </button>
              
              <button
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 bg-slate-900 text-white font-black uppercase tracking-widest rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-transform active:scale-95 shadow-lg shadow-slate-900/20"
              >
                {loading ? <span className="animate-pulse">Calculando Matriz...</span> : <><Search size={18} /> Filtrar Base de Clientes</>}
              </button>
            </div>
          </div>

          {/* RESULTS TABLE */}
          {clients.length > 0 && (
            <div className="bg-white rounded-[24px] shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[400px]">
              <div className="p-5 border-b border-slate-100 bg-white flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Users size={16} className="text-blue-600" />
                  Público Alvo Encontrado ({clients.length})
                </h3>
                <div className="flex items-center gap-4">
                  <div className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 uppercase tracking-widest">
                    {selectedIds.size} Selecionados
                  </div>
                </div>
              </div>
              
              <div className="overflow-auto flex-1 max-h-[600px]">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="text-[10px] text-slate-500 font-black uppercase tracking-widest bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                    <tr>
                      <th className="px-5 py-4 w-[50px] text-center">
                        <input 
                          type="checkbox" 
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                          checked={selectedIds.size === clients.length && clients.length > 0}
                          onChange={handleToggleSelectAll}
                        />
                      </th>
                      <th className="px-4 py-4">Status / Cliente</th>
                      <th className="px-4 py-4">Localização & Info</th>
                      <th className="px-4 py-4 min-w-[180px]">Perfil, Categoria & Equipamentos</th>
                      <th className="px-4 py-4 text-right">Último Contato / Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {clients.map(c => {
                      const satisfactionMeta = getSatisfactionMeta(c);

                      return (
                      <tr key={c.id} className="hover:bg-blue-50/50 transition-colors group cursor-pointer" onClick={(e) => {
                        // Avoid toggling if clicking directly on the checkbox or links
                        if ((e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'A') {
                          handleToggleSelect(c.id);
                        }
                      }}>
                        <td className="px-5 py-4 text-center">
                          <input 
                            type="checkbox" 
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 transition-all"
                            checked={selectedIds.has(c.id)}
                            onChange={() => handleToggleSelect(c.id)}
                            onClick={e => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1">
                            <span className={`w-fit px-2 py-0.5 text-[9px] font-black uppercase rounded bg-slate-100 tracking-wider ${
                              c.status === 'CLIENT' ? 'text-emerald-700 bg-emerald-50' :
                              c.status === 'INATIVO' ? 'text-rose-700 bg-rose-50' : 
                              'text-blue-700 bg-blue-50'
                            }`}>
                              {c.status === 'CLIENT' ? 'CLIENTE' : c.status === 'INATIVO' ? 'INATIVO' : 'PROSPECTO'}
                            </span>
                            <div className="font-bold text-slate-800 text-sm mt-1">{c.name}</div>
                            <div className="text-xs text-slate-500 font-medium">{c.phone}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs text-slate-700 font-semibold">{c.city || 'Cidade N/D'}</div>
                          <div className="text-xs text-slate-500">{c.neighborhood || 'Bairro N/D'}</div>
                          {c.email && <div className="text-[10px] text-blue-500 mt-1 flex items-center gap-1"><Mail size={10}/> {c.email}</div>}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[240px]">
                            {/* Tags / Categs array on client object if they exist */}
                            {c.customer_profiles?.slice(0, 2).map((profile, idx) => (
                              <span key={`profile-${idx}`} className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{profile}</span>
                            ))}
                            {c.product_categories?.slice(0, 2).map((category, idx) => (
                              <span key={`category-${idx}`} className="bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{category}</span>
                            ))}
                            {c.tags?.slice(0, 3).map((t, idx) => (
                              <span key={idx} className="bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{t}</span>
                            ))}
                            {/* Equipamentos from items array */}
                            {c.equipment_models?.slice(0, 2).map((item, idx) => (
                              <span key={idx} className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{item}</span>
                            ))}
                            {c.interest_product && (
                              <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase" title="Produto de Interesse (Lead/Orçamento)">{c.interest_product}</span>
                            )}
                            {((c.customer_profiles?.length || 0) + (c.product_categories?.length || 0) + (c.tags?.length || 0) + (c.equipment_models?.length || 0) + (c.interest_product ? 1 : 0) > 7) && (
                              <span className="text-[9px] text-slate-400 font-bold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">+{((c.customer_profiles?.length || 0) + (c.product_categories?.length || 0) + (c.tags?.length || 0) + (c.equipment_models?.length || 0) + (c.interest_product ? 1 : 0) - 7)} mais</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          {c.ultima_ligacao_filtrada ? (
                             <div className="flex flex-col items-end gap-1 text-xs">
                               <div className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                                 {new Date(c.ultima_ligacao_filtrada.startTime).toLocaleDateString('pt-BR')}
                               </div>
                               <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                 {c.ultima_ligacao_filtrada.type}
                               </div>
                               <div className={`px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider ${satisfactionMeta.className}`}>
                                 {satisfactionMeta.label}
                                 {satisfactionMeta.scoreLabel ? ` ${satisfactionMeta.scoreLabel}` : ''}
                               </div>
                             </div>
                          ) : (
                             <span className="text-xs italic text-slate-400">Nenhum histórico</span>
                          )}
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: DISPATCH CONFIGURATION */}
        <div className="w-full xl:w-[400px] shrink-0">
          <div className="bg-slate-900 rounded-[32px] p-8 text-white shadow-2xl shadow-slate-900/40 sticky top-8 border border-slate-800 relative overflow-hidden backdrop-blur-xl bg-opacity-95">
            {/* Background aesthetic element */}
            <div className="absolute -top-32 -right-32 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>

            <h2 className="text-xl font-black mb-8 uppercase tracking-tighter flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
                <Send size={20} className="text-white ml-0.5" />
              </div>
              Configurar Disparo
            </h2>
            
            <div className="space-y-6 relative z-10">
              
              {/* Campaign Definition */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nome da Campanha *</label>
                  <input 
                    type="text" 
                    value={campNome} 
                    onChange={e => setCampNome(e.target.value)} 
                    placeholder="Ex: Feirão Químicos Março" 
                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 focus:bg-slate-800 transition-all placeholder:text-slate-600 shadow-inner" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Propósito (Opcional)</label>
                  <input 
                    type="text" 
                    value={campProposito} 
                    onChange={e => setCampProposito(e.target.value)} 
                    placeholder="Ex: Oferecer avaliação gratuita" 
                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 focus:bg-slate-800 transition-all placeholder:text-slate-600 shadow-inner" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Linha / Produto Alvo</label>
                  <input
                    list="campaign-target-products"
                    value={filters.produtoAlvo || ''}
                    onChange={e => setFilters({ ...filters, produtoAlvo: e.target.value })}
                    placeholder="Ex: Gerador de Cloro"
                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-cyan-500 focus:bg-slate-800 transition-all placeholder:text-slate-600 shadow-inner"
                  />
                  <datalist id="campaign-target-products">
                    {[...productCategoriesList, ...itemsList, ...interestProductsList].filter(Boolean).sort().map(item => <option key={item} value={item} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Oferta / Produto Oferecido</label>
                  <input
                    list="campaign-offer-products"
                    value={filters.ofertaAlvo || ''}
                    onChange={e => setFilters({ ...filters, ofertaAlvo: e.target.value })}
                    placeholder="Ex: Sal para Gerador de Cloro"
                    className="w-full bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-emerald-500 focus:bg-slate-800 transition-all placeholder:text-slate-600 shadow-inner"
                  />
                  <datalist id="campaign-offer-products">
                    {[...productCategoriesList, ...interestProductsList].filter(Boolean).sort().map(item => <option key={item} value={item} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escopo da Linha</label>
                  <select
                    value={filters.escopoLinha || ''}
                    onChange={e => setFilters({ ...filters, escopoLinha: e.target.value })}
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 focus:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <option value="">Não especificado</option>
                    <option value="somente_linha_alvo">Somente a linha alvo</option>
                    <option value="mais_de_uma_linha">Mais de uma linha do cliente</option>
                    <option value="todas_as_linhas">Todas as linhas</option>
                  </select>
                </div>
              </div>

              <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-700 to-transparent my-6"></div>

              {/* Execution Settings */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo de Ligação</label>
                  <select 
                    value={campCallType} 
                    onChange={e => setCampCallType(e.target.value as CallType)} 
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 focus:bg-slate-800 transition-colors cursor-pointer"
                  >
                    {Object.values(CallType).map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Canais de Contato Permissíveis</label>
                  <select 
                    value={campCanal} 
                    onChange={e => setCampCanal(e.target.value as any)} 
                    className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm font-bold text-white outline-none focus:border-blue-500 focus:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <option value="voz">Apenas Voz (Bloquear WhatsApp)</option>
                    <option value="whatsapp">Apenas WhatsApp</option>
                    <option value="ambos">Voz + WhatsApp (2 itens por cliente)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">Operador Destino *</label>
                  <select 
                    value={campOperador} 
                    onChange={e => setCampOperador(e.target.value)} 
                    className="w-full bg-[#001c24] border border-cyan-500/30 rounded-xl p-3 text-sm font-bold text-cyan-400 outline-none focus:border-cyan-400 focus:bg-[#002b36] transition-colors cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                  >
                    <option value="">+ Selecionar Operador</option>
                    {operadoresList.map(op => <option key={op.id} value={op.id}>{op.username_display || op.id}</option>)}
                  </select>
                </div>

                <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Prévia da carga</p>
                  <p className="text-sm font-black text-white">{selectedIds.size} clientes selecionados</p>
                  <p className="text-xs font-bold text-slate-300">
                    Previsão bruta de fila: {estimatedQueueEntries} item(ns)
                    {campCanal === 'ambos' ? ' (voz + WhatsApp para cada cliente)' : campCanal === 'voz' ? ' (somente voz)' : ' (somente WhatsApp)'}
                  </p>
                  {dispatchPreviewLoading ? (
                    <p className="text-xs font-bold text-slate-300">Conferindo fila existente e contato recente...</p>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-slate-400">
                        Previsão validada: {dispatchPreview?.voice_entries_expected || 0} ligação(ões) elegíveis e {dispatchPreview?.whatsapp_entries_expected || 0} WhatsApp(s) elegíveis.
                      </p>
                      {(dispatchPreview?.blocked_recent_call || dispatchPreview?.blocked_existing_voice_queue || dispatchPreview?.blocked_existing_whatsapp_queue) ? (
                        <p className="text-xs font-bold text-amber-300">
                          Bloqueios atuais: {dispatchPreview?.blocked_recent_call || 0} por contato recente, {dispatchPreview?.blocked_existing_voice_queue || 0} por fila de ligação e {dispatchPreview?.blocked_existing_whatsapp_queue || 0} por fila de WhatsApp.
                        </p>
                      ) : null}
                    </>
                  )}
                  {selectedLeadCount > 0 && (
                    <p className="text-xs font-bold text-amber-300">
                      {selectedLeadCount} prospecto(s) LEAD estão incluídos na seleção atual.
                    </p>
                  )}
                </div>
              </div>

              {/* Summary & Submit */}
              <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700 p-5 rounded-2xl mt-8">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-slate-400">Clientes Selecionados:</span>
                  <span className="text-3xl font-black text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]">{selectedIds.size}</span>
                </div>
                
                <button
                  onClick={handleDispatch}
                  disabled={dispatching || selectedIds.size === 0}
                  className={`w-full py-4 font-black uppercase tracking-widest rounded-xl transition-all duration-300 flex items-center justify-center gap-2 relative overflow-hidden group
                    ${dispatching 
                      ? 'bg-blue-900/50 text-blue-300 cursor-wait' 
                      : selectedIds.size > 0 
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 hover:scale-[1.02] shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.7)] cursor-pointer' 
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    }
                  `}
                >
                  {/* Button shine effect */}
                  {selectedIds.size > 0 && !dispatching && (
                    <div className="absolute inset-0 -translate-x-full group-hover:animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                  )}

                  {dispatching ? (
                    <span className="animate-pulse">Criando Fila...</span>
                  ) : selectedIds.size > 0 ? (
                    <>
                      Enviar para Operador
                      <Send size={18} className="translate-x-1 group-hover:translate-x-2 transition-transform" />
                    </>
                  ) : (
                    'Selecione Clientes'
                  )}
                </button>
                {selectedIds.size === 0 && (
                  <p className="text-[10px] text-center text-slate-500 font-bold uppercase tracking-widest mt-4">
                    Selecione na tabela ao lado
                  </p>
                )}
              </div>

            </div>
          </div>
        </div>

        {isCatalogManagerOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md">
            <div className="w-full max-w-7xl max-h-[92vh] overflow-y-auto rounded-[36px] border border-slate-200 bg-slate-50 p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter text-slate-900">Catalogo Tecnico</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    Gerencie categorias, produtos e aplique a classificacao na base inteira.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCatalogManagerOpen(false)}
                  className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-500 hover:text-slate-900"
                >
                  <X size={18} />
                </button>
              </div>

              <PortfolioCatalogManager
                onCatalogChange={(nextCatalog) => {
                  setCatalogConfig(nextCatalog);
                  void loadReferenceData();
                }}
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
