import { supabase } from '../lib/supabase';
import { Campanha, Client, CallRecord, Task, ClientTag } from '../types';
import { mergePortfolioEntries, normalizeComparableText } from '../utils/clientPortfolio';
import {
  parseAddress,
  resolveKnownCity,
  isLikelyInvalidStructuredCity,
  isLikelyInvalidStructuredNeighborhood
} from '../utils/addressParser';
import { normalizeInterestProduct, normalizeInterestProductList } from '../utils/interestCatalog';
import {
  getActivePortfolioCatalogCategories,
  getActivePortfolioCatalogProducts,
  normalizeClientPortfolioSnapshot
} from '../utils/portfolioCatalog';
import { getQuestionnaireSatisfactionLevel, getQuestionnaireSatisfactionScore } from '../utils/questionnaireInsights';
import { dataService } from './dataService';
import { PortfolioCatalogService } from './portfolioCatalogService';

export interface CampaignPlannerFilters {
  periodos?: Array<{ de: string; ate: string }>;
  diasAvulsos?: string[];
  callTypes?: string[];
  resultados?: string[];
  operadores?: string[];
  niveisSatisfacao?: string[];
  statusCliente?: string[];
  tags?: string[];
  interesses?: string[];
  perfisCliente?: string[];
  categoriasProduto?: string[];
  equipamentos?: string[];
  bairros?: string[];
  cidades?: string[];
  campanhaAtual?: string;
  temEmail?: boolean;
  produtoAlvo?: string;
  ofertaAlvo?: string;
  escopoLinha?: string;
}

export interface CampaignDispatch {
  nomeCampanha: string;
  proposito: string;
  callType: string;
  canal: 'voz' | 'whatsapp' | 'email' | 'ambos';
  operatorId: string | null;
  clientIds: string[];
  filters: CampaignPlannerFilters;
}

export interface CampaignDispatchPreview {
  clients_selected: number;
  queue_entries_expected: number;
  voice_entries_expected: number;
  whatsapp_entries_expected: number;
  blocked_recent_call: number;
  blocked_existing_voice_queue: number;
  blocked_existing_whatsapp_queue: number;
  fully_blocked_clients: number;
}

export interface ClientWithLastCall extends Client {
  call_logs_filtradas: CallRecord[];
  ultima_ligacao_filtrada: CallRecord | null;
  ultima_satisfacao_nivel?: 'ALTA' | 'MEDIA' | 'BAIXA' | 'SEM_LEITURA';
  ultima_satisfacao_score?: number | null;
}

export interface PortfolioFilterOptions {
  profiles: string[];
  categories: string[];
  equipments: string[];
  equipmentByCategory: Record<string, string[]>;
}

const normalizeLocationLabel = (value?: string | null) => {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || undefined;
};

const resolveCampaignClientLocation = (client: Pick<Client, 'city' | 'neighborhood' | 'address'> | any) => {
  const rawAddress = String(client?.address || '').trim();
  const parsed = rawAddress ? parseAddress(rawAddress) : {};

  const currentCity = normalizeLocationLabel(client?.city);
  const parsedCity = normalizeLocationLabel(parsed.city);
  const canonicalCurrentCity = currentCity && !isLikelyInvalidStructuredCity(currentCity)
    ? (resolveKnownCity(currentCity) || currentCity)
    : undefined;
  const canonicalParsedCity = parsedCity
    ? (resolveKnownCity(parsedCity) || parsedCity)
    : undefined;

  const currentNeighborhood = normalizeLocationLabel(client?.neighborhood);
  const parsedNeighborhood = normalizeLocationLabel(parsed.neighborhood);
  const canonicalNeighborhood = currentNeighborhood && !isLikelyInvalidStructuredNeighborhood(currentNeighborhood)
    ? currentNeighborhood
    : parsedNeighborhood;

  return {
    city: canonicalCurrentCity || canonicalParsedCity,
    neighborhood: canonicalNeighborhood
  };
};

const matchesNormalizedLocationFilter = (
  value: string | undefined,
  filters: string[] | undefined,
  mode: 'city' | 'neighborhood'
) => {
  if (!filters?.length) return true;

  const normalizedValue = mode === 'city'
    ? normalizeComparableText(resolveKnownCity(value) || value)
    : normalizeComparableText(value);

  if (!normalizedValue) return false;

  return filters.some(filter => {
    const normalizedFilter = mode === 'city'
      ? normalizeComparableText(resolveKnownCity(filter) || filter)
      : normalizeComparableText(filter);

    return Boolean(normalizedFilter) && normalizedFilter === normalizedValue;
  });
};

const matchesPortfolioFilter = (values: string[] | undefined, filters: string[] | undefined) => {
  if (!filters?.length) return true;

  const normalizedValues = (values || [])
    .map(value => normalizeComparableText(value))
    .filter(Boolean);

  return filters.some(filter => {
    const normalizedFilter = normalizeComparableText(filter);
    if (!normalizedFilter) return false;

    return normalizedValues.some(value =>
      value === normalizedFilter ||
      value.includes(normalizedFilter) ||
      normalizedFilter.includes(value)
    );
  });
};

const addUniqueComparableValue = (bucket: Map<string, string>, value?: string) => {
  const normalizedValue = normalizeComparableText(value);
  if (!normalizedValue) return;
  if (!bucket.has(normalizedValue)) {
    bucket.set(normalizedValue, value!.trim());
  }
};

const sortPortfolioValues = (bucket: Map<string, string>) =>
  Array.from(bucket.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

const buildPortfolioFilterOptions = (
  catalog: Awaited<ReturnType<typeof PortfolioCatalogService.getCatalogConfig>>,
  clients: any[]
): PortfolioFilterOptions => {
  const profiles = new Map<string, string>();
  const categories = new Map<string, string>();
  const equipments = new Map<string, string>();
  const equipmentByCategory = new Map<string, Map<string, string>>();

  const linkCategoryEquipment = (category?: string, equipment?: string) => {
    const normalizedCategory = normalizeComparableText(category);
    const normalizedEquipment = normalizeComparableText(equipment);
    if (!normalizedCategory || !normalizedEquipment) return;

    const currentBucket = equipmentByCategory.get(normalizedCategory) || new Map<string, string>();
    if (!currentBucket.has(normalizedEquipment)) {
      currentBucket.set(normalizedEquipment, equipment!.trim());
    }
    equipmentByCategory.set(normalizedCategory, currentBucket);
  };

  getActivePortfolioCatalogCategories(catalog).forEach(category => {
    addUniqueComparableValue(categories, category.name);
  });

  getActivePortfolioCatalogProducts(catalog).forEach(product => {
    addUniqueComparableValue(equipments, product.name);
    addUniqueComparableValue(categories, product.category);
    linkCategoryEquipment(product.category, product.name);
  });

  clients.forEach(client => {
    const snapshot = normalizeClientPortfolioSnapshot(client as any, catalog);

    snapshot.customer_profiles.forEach(profile => addUniqueComparableValue(profiles, profile));
    snapshot.product_categories.forEach(category => addUniqueComparableValue(categories, category));
    snapshot.equipment_models.forEach(equipment => addUniqueComparableValue(equipments, equipment));

    snapshot.portfolio_entries.forEach(entry => {
      addUniqueComparableValue(profiles, entry.profile);
      addUniqueComparableValue(categories, entry.product_category);
      addUniqueComparableValue(equipments, entry.equipment);
      linkCategoryEquipment(entry.product_category, entry.equipment);
    });
  });

  return {
    profiles: sortPortfolioValues(profiles),
    categories: sortPortfolioValues(categories),
    equipments: sortPortfolioValues(equipments),
    equipmentByCategory: Object.fromEntries(
      Array.from(equipmentByCategory.entries()).map(([categoryKey, bucket]) => [
        categoryKey,
        Array.from(bucket.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
      ])
    )
  };
};

const chunkValues = <T,>(values: T[], chunkSize = 200) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
};

const collectIdSet = async (
  ids: string[],
  loader: (chunk: string[]) => Promise<string[]>
) => {
  const collected = new Set<string>();
  for (const chunk of chunkValues(ids)) {
    const values = await loader(chunk);
    values.filter(Boolean).forEach(value => collected.add(value));
  }
  return collected;
};

const analyzeDispatchTargets = async (
  dispatch: Pick<CampaignDispatch, 'canal' | 'clientIds'>
) => {
  const uniqueClientIds = Array.from(new Set((dispatch.clientIds || []).filter(Boolean)));
  const wantsVoice = dispatch.canal === 'voz' || dispatch.canal === 'ambos';
  const wantsWhatsApp = dispatch.canal === 'whatsapp' || dispatch.canal === 'ambos';

  if (uniqueClientIds.length === 0) {
    return {
      uniqueClientIds,
      creatableVoiceClientIds: new Set<string>(),
      creatableWhatsAppClientIds: new Set<string>(),
      preview: {
        clients_selected: 0,
        queue_entries_expected: 0,
        voice_entries_expected: 0,
        whatsapp_entries_expected: 0,
        blocked_recent_call: 0,
        blocked_existing_voice_queue: 0,
        blocked_existing_whatsapp_queue: 0,
        fully_blocked_clients: 0
      } as CampaignDispatchPreview
    };
  }

  const recentThreshold = new Date();
  recentThreshold.setDate(recentThreshold.getDate() - 3);

  const [recentCallClients, pendingVoiceClients, scheduledVoiceClients, pendingWhatsAppClients] = await Promise.all([
    collectIdSet(uniqueClientIds, async chunk => {
      const { data, error } = await supabase
        .from('call_logs')
        .select('client_id')
        .in('client_id', chunk)
        .gte('start_time', recentThreshold.toISOString());
      if (error) throw error;
      return (data || []).map((row: any) => row.client_id).filter(Boolean);
    }),
    wantsVoice
      ? collectIdSet(uniqueClientIds, async chunk => {
          const { data, error } = await supabase
            .from('tasks')
            .select('client_id')
            .in('client_id', chunk)
            .eq('status', 'pending');
          if (error) throw error;
          return (data || []).map((row: any) => row.client_id).filter(Boolean);
        })
      : Promise.resolve(new Set<string>()),
    wantsVoice
      ? collectIdSet(uniqueClientIds, async chunk => {
          const { data, error } = await supabase
            .from('call_schedules')
            .select('customer_id')
            .in('customer_id', chunk)
            .in('status', ['APROVADO', 'PENDENTE_APROVACAO']);
          if (error) throw error;
          return (data || []).map((row: any) => row.customer_id).filter(Boolean);
        })
      : Promise.resolve(new Set<string>()),
    wantsWhatsApp
      ? collectIdSet(uniqueClientIds, async chunk => {
          const { data, error } = await supabase
            .from('whatsapp_tasks')
            .select('client_id')
            .in('client_id', chunk)
            .in('status', ['pending', 'started']);
          if (error) throw error;
          return (data || []).map((row: any) => row.client_id).filter(Boolean);
        })
      : Promise.resolve(new Set<string>())
  ]);

  const creatableVoiceClientIds = new Set<string>();
  const creatableWhatsAppClientIds = new Set<string>();
  const blockedRecentCall = new Set<string>();
  const blockedExistingVoiceQueue = new Set<string>();
  const blockedExistingWhatsAppQueue = new Set<string>();
  let fullyBlockedClients = 0;

  uniqueClientIds.forEach(clientId => {
    let canCreateAnything = false;
    const hasRecentCall = recentCallClients.has(clientId);
    const hasPendingVoiceQueue = pendingVoiceClients.has(clientId) || scheduledVoiceClients.has(clientId);
    const hasPendingWhatsAppQueue = pendingWhatsAppClients.has(clientId);

    if (wantsVoice) {
      if (hasRecentCall) {
        blockedRecentCall.add(clientId);
      } else if (hasPendingVoiceQueue) {
        blockedExistingVoiceQueue.add(clientId);
      } else {
        creatableVoiceClientIds.add(clientId);
        canCreateAnything = true;
      }
    }

    if (wantsWhatsApp) {
      if (hasRecentCall) {
        blockedRecentCall.add(clientId);
      } else if (hasPendingWhatsAppQueue) {
        blockedExistingWhatsAppQueue.add(clientId);
      } else {
        creatableWhatsAppClientIds.add(clientId);
        canCreateAnything = true;
      }
    }

    if (!canCreateAnything) {
      fullyBlockedClients++;
    }
  });

  return {
    uniqueClientIds,
    creatableVoiceClientIds,
    creatableWhatsAppClientIds,
    preview: {
      clients_selected: uniqueClientIds.length,
      queue_entries_expected: creatableVoiceClientIds.size + creatableWhatsAppClientIds.size,
      voice_entries_expected: creatableVoiceClientIds.size,
      whatsapp_entries_expected: creatableWhatsAppClientIds.size,
      blocked_recent_call: blockedRecentCall.size,
      blocked_existing_voice_queue: blockedExistingVoiceQueue.size,
      blocked_existing_whatsapp_queue: blockedExistingWhatsAppQueue.size,
      fully_blocked_clients: fullyBlockedClients
    } as CampaignDispatchPreview
  };
};

export const CampaignPlannerService = {
  getCampaigns: async (): Promise<Campanha[]> => {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .select('*, operator_destino_id ( username_display )')
        .order('prioridade', { ascending: true })
        .order('criado_em', { ascending: false });
        
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      return [];
    }
  },

  createCampaign: async (payload: Partial<Campanha>): Promise<Campanha | null> => {
    try {
      const { data, error } = await supabase
        .from('campanhas')
        .insert([payload])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error creating campaign:', err);
      return null;
    }
  },

  updateCampaign: async (id: string, updates: Partial<Campanha>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('campanhas')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('Error updating campaign:', err);
      return false;
    }
  },

  toggleCampaignStatus: async (id: string, currentStatus: boolean): Promise<boolean> => {
    return CampaignPlannerService.updateCampaign(id, { ativa: !currentStatus });
  },

  getDistinctCities: async (): Promise<string[]> => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('city, address, invalid')
        .neq('invalid', true);
      if (error) throw error;
      const bucket = new Map<string, string>();
      (data || []).forEach((row: any) => {
        const resolvedCity = resolveCampaignClientLocation(row).city;
        const normalizedCity = normalizeComparableText(resolvedCity);
        if (resolvedCity && normalizedCity && !bucket.has(normalizedCity)) {
          bucket.set(normalizedCity, resolvedCity);
        }
      });
      return Array.from(bucket.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (e) { console.error(e); return []; }
  },

  getDistinctNeighborhoods: async (city?: string): Promise<string[]> => {
    try {
      const query = supabase
        .from('clients')
        .select('city, neighborhood, address, invalid')
        .neq('invalid', true);
      const { data, error } = await query;
      if (error) throw error;
      const normalizedCityFilter = normalizeComparableText(resolveKnownCity(city) || city);
      const bucket = new Map<string, string>();

      (data || []).forEach((row: any) => {
        const resolvedLocation = resolveCampaignClientLocation(row);
        if (
          normalizedCityFilter &&
          normalizeComparableText(resolveKnownCity(resolvedLocation.city) || resolvedLocation.city) !== normalizedCityFilter
        ) {
          return;
        }

        const neighborhood = resolvedLocation.neighborhood;
        const normalizedNeighborhood = normalizeComparableText(neighborhood);
        if (neighborhood && normalizedNeighborhood && !bucket.has(normalizedNeighborhood)) {
          bucket.set(normalizedNeighborhood, neighborhood);
        }
      });

      return Array.from(bucket.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (e) { console.error(e); return []; }
  },

  getDistinctItems: async (): Promise<string[]> => {
    try {
      const options = await CampaignPlannerService.getPortfolioFilterOptions();
      return options.equipments;
    } catch (e) { console.error(e); return []; }
  },

  getDistinctCustomerProfiles: async (): Promise<string[]> => {
    try {
      const options = await CampaignPlannerService.getPortfolioFilterOptions();
      return options.profiles;
    } catch (e) { console.error(e); return []; }
  },

  getDistinctProductCategories: async (): Promise<string[]> => {
    try {
      const options = await CampaignPlannerService.getPortfolioFilterOptions();
      return options.categories;
    } catch (e) { console.error(e); return []; }
  },

  getPortfolioFilterOptions: async (): Promise<PortfolioFilterOptions> => {
    try {
      const [catalog, { data, error }] = await Promise.all([
        PortfolioCatalogService.getCatalogConfig(),
        supabase
          .from('clients')
          .select('customer_profiles, product_categories, equipment_models, portfolio_entries, invalid')
          .neq('invalid', true)
      ]);

      if (error) throw error;
      return buildPortfolioFilterOptions(catalog, data || []);
    } catch (e) {
      console.error(e);
      return {
        profiles: [],
        categories: [],
        equipments: [],
        equipmentByCategory: {}
      };
    }
  },

  getDistinctInterestProducts: async (): Promise<string[]> => {
    try {
      // Fetch all interest_product from clients
      const { data: clientsData, error: err1 } = await supabase.from('clients').select('interest_product').not('interest_product', 'is', null).neq('interest_product', '');

      // Fetch all interest_product from quotes
      const { data: quotesData, error: err2 } = await supabase.from('quotes').select('interest_product').not('interest_product', 'is', null).neq('interest_product', '');

      const allProducts = [
        ...(clientsData?.map(c => c.interest_product) || []),
        ...(quotesData?.map(q => q.interest_product) || [])
      ];

      return normalizeInterestProductList(allProducts).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (e) { console.error(e); return []; }
  },

  getDistinctCallTypes: async (): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from('call_logs').select('call_type').not('call_type', 'is', null);
      if (error) throw error;
      const types = Array.from(new Set(data.map(r => r.call_type)));
      return types.sort();
    } catch (e) { console.error(e); return []; }
  },

  getDistinctTagCategories: async (): Promise<string[]> => {
    try {
      const [{ data: tagData, error: tagError }, { data: clientData, error: clientError }] = await Promise.all([
        supabase.from('client_tags').select('categoria').not('categoria', 'is', null),
        supabase.from('clients').select('tags').not('tags', 'is', null)
      ]);
      if (tagError) throw tagError;
      if (clientError) throw clientError;

      const cats = new Set<string>((tagData || []).map(r => r.categoria).filter(Boolean));
      (clientData || [])
        .flatMap((row: any) => row.tags || [])
        .filter(Boolean)
        .forEach((tag: string) => cats.add(tag));

      return Array.from(cats).sort();
    } catch (e) { console.error(e); return []; }
  },

  fetchClientsByFilters: async (filters: CampaignPlannerFilters): Promise<ClientWithLastCall[]> => {
    try {
      const [catalogConfig, questions] = await Promise.all([
        PortfolioCatalogService.getCatalogConfig(),
        dataService.getQuestions()
      ]);
      let query = supabase
        .from('clients')
        .select(`
          *, 
          call_logs (
            id, call_type, responses, start_time, operator_id, proposito
          )
        `);

      if (filters.statusCliente?.length) {
        query = query.in('status', filters.statusCliente);
      }
      
      // Filtra números inválidos
      query = query.neq('invalid', true);

      // Exclui prospects que já são clientes (evita duplicidade no disparador)
      if (filters.tags?.length) {
        // Tag Categories matching
        query = query.overlaps('tags', filters.tags); 
      }
      if (filters.temEmail === true) {
        query = query.not('email', 'is', null).neq('email', '');
      }
      if (filters.temEmail === false) {
        query = query.or('email.is.null,email.eq.');
      }

      const { data: clients, error } = await query;
      if (error) throw new Error(error.message);

      return (clients ?? [])
        .map(client => {
          const callLogs = (client.call_logs ?? []) as any[];
          const normalizedSnapshot = normalizeClientPortfolioSnapshot(client as any, catalogConfig);

          const callsFiltered = callLogs.filter(cr => {
            if (!cr.start_time) return false;
            const crDate = new Date(cr.start_time);

            const matchesPeriodo = !filters.periodos?.length || filters.periodos.some(p => {
              const de = new Date(p.de);
              const ate = new Date(p.ate);
              ate.setHours(23, 59, 59);
              return crDate >= de && crDate <= ate;
            });

            const matchesDia = !filters.diasAvulsos?.length || filters.diasAvulsos.some(d => {
              const dia = new Date(d);
              return crDate.toDateString() === dia.toDateString();
            });

            const matchesData = matchesPeriodo || matchesDia || (!filters.periodos?.length && !filters.diasAvulsos?.length);

            const matchesCallType = !filters.callTypes?.length || filters.callTypes.includes(cr.call_type);
            const matchesOperador = !filters.operadores?.length || filters.operadores.includes(cr.operator_id);
            
            const crResultado = cr.responses?.resultado || '';
            const matchesResultado = !filters.resultados?.length || filters.resultados.includes(crResultado);
            const targetProduct = cr.responses?.target_product || '';
            const offerProduct = cr.responses?.offer_product || '';
            const portfolioScope = cr.responses?.portfolio_scope || '';
            const matchesTargetProduct = !filters.produtoAlvo || matchesPortfolioFilter([targetProduct], [filters.produtoAlvo]);
            const matchesOfferProduct = !filters.ofertaAlvo || matchesPortfolioFilter([offerProduct], [filters.ofertaAlvo]);
            const matchesPortfolioScope = !filters.escopoLinha || normalizeComparableText(portfolioScope) === normalizeComparableText(filters.escopoLinha);

            return matchesData &&
              matchesCallType &&
              matchesResultado &&
              matchesOperador &&
              matchesTargetProduct &&
              matchesOfferProduct &&
              matchesPortfolioScope;
          });

          // Map snake_case back to expected format if needed by ClientWithLastCall / UI components
          const mappedCallsFiltered = callsFiltered.map(cr => ({
            id: cr.id,
            type: cr.call_type,
            responses: cr.responses,
            startTime: cr.start_time,
            operatorId: cr.operator_id,
            clientId: client.id,
            proposito: cr.proposito,
            targetProduct: cr.responses?.target_product,
            offerProduct: cr.responses?.offer_product,
            portfolioScope: cr.responses?.portfolio_scope
          })) as CallRecord[];

          const ultimaLigacaoFiltrada = [...mappedCallsFiltered].sort(
            (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
          )[0] ?? null;
          const ultimaSatisfacaoScore = ultimaLigacaoFiltrada
            ? getQuestionnaireSatisfactionScore(
                ultimaLigacaoFiltrada.responses || {},
                questions,
                ultimaLigacaoFiltrada.type,
                ultimaLigacaoFiltrada.proposito
              )
            : null;
          const ultimaSatisfacaoNivel = ultimaLigacaoFiltrada
            ? getQuestionnaireSatisfactionLevel(
                ultimaLigacaoFiltrada.responses || {},
                questions,
                ultimaLigacaoFiltrada.type,
                ultimaLigacaoFiltrada.proposito
              )
            : 'SEM_LEITURA';
          const resolvedLocation = resolveCampaignClientLocation(client as any);
          const normalizedInterestProduct = normalizeInterestProduct(client.interest_product);
          const normalizedOffers = normalizeInterestProductList(client.offers || []);

          return {
            ...client,
            city: resolvedLocation.city || client.city,
            neighborhood: resolvedLocation.neighborhood || client.neighborhood,
            interest_product: normalizedInterestProduct,
            offers: normalizedOffers,
            customer_profiles: normalizedSnapshot.customer_profiles,
            product_categories: normalizedSnapshot.product_categories,
            equipment_models: normalizedSnapshot.equipment_models,
            items: normalizedSnapshot.items,
            portfolio_entries: normalizedSnapshot.portfolio_entries,
            call_logs_filtradas: mappedCallsFiltered,
            ultima_ligacao_filtrada: ultimaLigacaoFiltrada,
            ultima_satisfacao_nivel: ultimaSatisfacaoNivel,
            ultima_satisfacao_score: ultimaSatisfacaoScore,
          };
        })
        .filter(client => {
          const isLeadAlreadyClient =
            client.status === 'LEAD' &&
            Array.isArray(client.tags) &&
            client.tags.includes('JA_CLIENTE');
          const temFiltroLigacao = filters.callTypes?.length ||
            filters.resultados?.length ||
            filters.operadores?.length ||
            filters.niveisSatisfacao?.length ||
            filters.periodos?.length ||
            filters.diasAvulsos?.length ||
            filters.produtoAlvo ||
            filters.ofertaAlvo ||
            filters.escopoLinha;

          const matchesProfiles = matchesPortfolioFilter(client.customer_profiles, filters.perfisCliente);
          const matchesCategories = matchesPortfolioFilter(client.product_categories, filters.categoriasProduto);
          const matchesEquipment = matchesPortfolioFilter(client.equipment_models, filters.equipamentos);
          const matchesCities = matchesNormalizedLocationFilter(client.city, filters.cidades, 'city');
          const matchesNeighborhoods = matchesNormalizedLocationFilter(client.neighborhood, filters.bairros, 'neighborhood');
          const matchesInterests = !filters.interesses?.length || matchesPortfolioFilter(
            [client.interest_product, ...(client.offers || [])].filter(Boolean),
            filters.interesses
          );
          const matchesSatisfaction = !filters.niveisSatisfacao?.length ||
            filters.niveisSatisfacao.includes(client.ultima_satisfacao_nivel || 'SEM_LEITURA');

          return !isLeadAlreadyClient &&
            (!temFiltroLigacao || client.call_logs_filtradas.length > 0) &&
            matchesProfiles &&
            matchesCategories &&
            matchesEquipment &&
            matchesCities &&
            matchesNeighborhoods &&
            matchesInterests &&
            matchesSatisfaction;
        }) as any[];
    } catch (err) {
      console.error('Error in fetchClientsByFilters:', err);
      throw err;
    }
  },

  previewDispatchCampaign: async (
    dispatch: Pick<CampaignDispatch, 'canal' | 'clientIds'>
  ): Promise<CampaignDispatchPreview> => {
    const analysis = await analyzeDispatchTargets(dispatch);
    return analysis.preview;
  },

  dispatchCampaign: async (dispatch: CampaignDispatch): Promise<{
    campanha_id: string;
    clients_selected: number;
    tasks_criadas: number;
    ligacoes_criadas: number;
    whatsapp_criados: number;
    ignorados: number;
    bloqueados_contato_recente: number;
    bloqueados_fila_voz: number;
    bloqueados_fila_whatsapp: number;
    erros: string[];
  }> => {
    const result = {
      campanha_id: '',
      clients_selected: 0,
      tasks_criadas: 0,
      ligacoes_criadas: 0,
      whatsapp_criados: 0,
      ignorados: 0,
      bloqueados_contato_recente: 0,
      bloqueados_fila_voz: 0,
      bloqueados_fila_whatsapp: 0,
      erros: [] as string[]
    };

    try {
      const analysis = await analyzeDispatchTargets(dispatch);
      result.clients_selected = analysis.preview.clients_selected;
      result.bloqueados_contato_recente = analysis.preview.blocked_recent_call;
      result.bloqueados_fila_voz = analysis.preview.blocked_existing_voice_queue;
      result.bloqueados_fila_whatsapp = analysis.preview.blocked_existing_whatsapp_queue;
      result.ignorados = analysis.preview.fully_blocked_clients;

      const { data: campanha, error: errCamp } = await supabase
        .from('campanhas')
        .insert({
          nome: dispatch.nomeCampanha,
          proposito_alvo: dispatch.proposito,
          call_type_alvo: dispatch.callType,
          tipo_mensagem: dispatch.canal,
          publico_alvo: 'todos',
          ativa: true,
          criado_pelo_planner: true,
          filters_usados: dispatch.filters,
          total_clientes: analysis.uniqueClientIds.length,
          operator_destino_id: dispatch.operatorId,
        })
        .select('id')
        .single();

      if (errCamp || !campanha) throw new Error(errCamp?.message ?? 'Erro ao criar campanha');
      result.campanha_id = campanha.id;

      const batchSize = 50;
      for (let i = 0; i < analysis.uniqueClientIds.length; i += batchSize) {
        const batch = analysis.uniqueClientIds.slice(i, i + batchSize);

        for (const clientId of batch) {
          try {
            const canCreateVoice = analysis.creatableVoiceClientIds.has(clientId);
            const canCreateWhatsApp = analysis.creatableWhatsAppClientIds.has(clientId);

            if (!canCreateVoice && !canCreateWhatsApp) {
              continue;
            }

            if ((dispatch.canal === 'voz' || dispatch.canal === 'ambos') && canCreateVoice) {
              const { error: taskInsertError } = await supabase.from('tasks').insert({
                client_id: clientId,
                assigned_to: dispatch.operatorId,
                type: dispatch.callType,
                proposito: dispatch.proposito,
                status: 'pending',
                created_at: new Date().toISOString(),
                campanha_id: campanha.id
              });
              if (taskInsertError) throw taskInsertError;
              result.tasks_criadas++;
              result.ligacoes_criadas++;
            }

            if ((dispatch.canal === 'whatsapp' || dispatch.canal === 'ambos') && canCreateWhatsApp) {
              const { error: waInsertError } = await supabase.from('whatsapp_tasks').insert({
                client_id: clientId,
                assigned_to: dispatch.operatorId,
                type: dispatch.callType,
                status: 'pending',
                source: 'manual',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
              if (waInsertError) throw waInsertError;
              result.tasks_criadas++;
              result.whatsapp_criados++;
            }

            const { error: interactionError } = await supabase.from('campanha_interacoes').insert({
              campanha_id: campanha.id,
              client_id: clientId,
              tipo_interacao: 'ENTRADA',
              notas: `Adicionado via Planejador de Campanhas — "${dispatch.nomeCampanha}"`,
              operador_id: dispatch.operatorId,
              data_hora: new Date().toISOString()
            });
            if (interactionError) throw interactionError;

            const { error: clientUpdateError } = await supabase
              .from('clients')
              .update({ campanha_atual_id: campanha.id })
              .eq('id', clientId);
            if (clientUpdateError) throw clientUpdateError;

          } catch (e) {
            result.erros.push(`Erro no cliente ${clientId}: ${String(e)}`);
          }
        }
        if (i + batchSize < dispatch.clientIds.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }
    } catch (err: any) {
      result.erros.push(err.message);
    }

    return result;
  },

  saveTemplate: async (nome: string, filters: CampaignPlannerFilters, userId: string): Promise<void> => {
    await supabase.from('campaign_planner_templates').insert({
      nome, filters, criado_por: userId, criado_em: new Date().toISOString()
    });
  },

  loadTemplates: async (): Promise<any[]> => {
    const { data } = await supabase
      .from('campaign_planner_templates')
      .select('*')
      .order('usado_em', { ascending: false, nullsFirst: false });
    return data ?? [];
  },

  markTemplateUsed: async (templateId: string): Promise<void> => {
    await supabase
      .from('campaign_planner_templates')
      .update({ usado_em: new Date().toISOString() })
      .eq('id', templateId);
  },
  
  bulkUpdateClientProducts: async (updates: { clientId: string, products: string[] }[]): Promise<number> => {
     let updated = 0;
     const catalogConfig = await PortfolioCatalogService.getCatalogConfig();

     for (const update of updates) {
       if (!update.products || update.products.length === 0) continue;

       const { data: client } = await supabase
         .from('clients')
         .select('id, name, phone, items, equipment_models, customer_profiles, product_categories, portfolio_entries')
         .eq('id', update.clientId)
         .maybeSingle();

       if (!client) continue;

       const mergedEntries = mergePortfolioEntries(
         (client as any).portfolio_entries,
         update.products.map(product => ({
           profile: '',
           product_category: '',
           equipment: product,
           quantity: 1
         }))
       );

       const normalizedSnapshot = normalizeClientPortfolioSnapshot({
         ...(client as any),
         portfolio_entries: mergedEntries
       }, catalogConfig);

       await supabase
         .from('clients')
         .update({
           items: normalizedSnapshot.items,
           equipment_models: normalizedSnapshot.equipment_models,
           customer_profiles: normalizedSnapshot.customer_profiles,
           product_categories: normalizedSnapshot.product_categories,
           portfolio_entries: normalizedSnapshot.portfolio_entries
         })
         .eq('id', update.clientId);

       updated++;
     }

     return updated;
   }
};
