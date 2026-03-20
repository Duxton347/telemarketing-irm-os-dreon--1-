import { supabase } from '../lib/supabase';
import { Campanha, Client, CallRecord, Task, ClientTag } from '../types';
import { mergePortfolioEntries } from '../utils/clientPortfolio';
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

export interface ClientWithLastCall extends Client {
  call_logs_filtradas: CallRecord[];
  ultima_ligacao_filtrada: CallRecord | null;
  ultima_satisfacao_nivel?: 'ALTA' | 'MEDIA' | 'BAIXA' | 'SEM_LEITURA';
  ultima_satisfacao_score?: number | null;
}

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
      const { data, error } = await supabase.from('clients').select('city').not('city', 'is', null).neq('city', '');
      if (error) throw error;
      const cities = Array.from(new Set(data.map(r => r.city)));
      return cities.sort();
    } catch (e) { console.error(e); return []; }
  },

  getDistinctNeighborhoods: async (city?: string): Promise<string[]> => {
    try {
      let query = supabase.from('clients').select('neighborhood').not('neighborhood', 'is', null).neq('neighborhood', '');
      if (city) query = query.eq('city', city);
      const { data, error } = await query;
      if (error) throw error;
      const neighborhoods = Array.from(new Set(data.map(r => r.neighborhood)));
      return neighborhoods.sort();
    } catch (e) { console.error(e); return []; }
  },

  getDistinctItems: async (): Promise<string[]> => {
    try {
      const catalog = await PortfolioCatalogService.getCatalogConfig();
      return getActivePortfolioCatalogProducts(catalog)
        .map(product => product.name)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (e) { console.error(e); return []; }
  },

  getDistinctCustomerProfiles: async (): Promise<string[]> => {
    try {
      const { data, error } = await supabase.from('clients').select('*');
      if (error) throw error;

      const values = (data || []).flatMap((row: any) => [
        ...(row.customer_profiles || []),
        ...((row.portfolio_entries || []).map((entry: any) => entry?.profile).filter(Boolean))
      ]);

      return Array.from(new Set(values.filter(Boolean))).sort();
    } catch (e) { console.error(e); return []; }
  },

  getDistinctProductCategories: async (): Promise<string[]> => {
    try {
      const catalog = await PortfolioCatalogService.getCatalogConfig();
      return getActivePortfolioCatalogCategories(catalog)
        .map(category => category.name)
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    } catch (e) { console.error(e); return []; }
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

      const uniqueProducts = Array.from(new Set(allProducts.filter(Boolean)));
      return uniqueProducts.sort();
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
      query = query.not('tags', 'cs', '{"JA_CLIENTE"}');
      if (filters.bairros?.length) {
        query = query.in('neighborhood', filters.bairros);
      }
      if (filters.cidades?.length) {
        query = query.in('city', filters.cidades);
      }
      if (filters.tags?.length) {
        // Tag Categories matching
        query = query.overlaps('tags', filters.tags); 
      }
      if (filters.interesses?.length) {
        query = query.overlaps('offers', filters.interesses);
      }
      if (filters.interesses?.length) {
        query = query.in('interest_product', filters.interesses);
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

            return matchesData && matchesCallType && matchesResultado && matchesOperador;
          });

          // Map snake_case back to expected format if needed by ClientWithLastCall / UI components
          const mappedCallsFiltered = callsFiltered.map(cr => ({
            id: cr.id,
            type: cr.call_type,
            responses: cr.responses,
            startTime: cr.start_time,
            operatorId: cr.operator_id,
            clientId: client.id,
            proposito: cr.proposito
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

          return {
            ...client,
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
          const temFiltroLigacao = filters.callTypes?.length ||
            filters.resultados?.length ||
            filters.operadores?.length ||
            filters.niveisSatisfacao?.length ||
            filters.periodos?.length ||
            filters.diasAvulsos?.length;

          const matchesProfiles = !filters.perfisCliente?.length ||
            filters.perfisCliente.some(profile => client.customer_profiles?.includes(profile));
          const matchesCategories = !filters.categoriasProduto?.length ||
            filters.categoriasProduto.some(category => client.product_categories?.includes(category));
          const matchesEquipment = !filters.equipamentos?.length ||
            filters.equipamentos.some(equipment => client.equipment_models?.includes(equipment));
          const matchesSatisfaction = !filters.niveisSatisfacao?.length ||
            filters.niveisSatisfacao.includes(client.ultima_satisfacao_nivel || 'SEM_LEITURA');

          return (!temFiltroLigacao || client.call_logs_filtradas.length > 0) &&
            matchesProfiles &&
            matchesCategories &&
            matchesEquipment &&
            matchesSatisfaction;
        }) as any[];
    } catch (err) {
      console.error('Error in fetchClientsByFilters:', err);
      throw err;
    }
  },

  dispatchCampaign: async (dispatch: CampaignDispatch): Promise<{
    campanha_id: string;
    tasks_criadas: number;
    ignorados: number;
    erros: string[];
  }> => {
    const result = { campanha_id: '', tasks_criadas: 0, ignorados: 0, erros: [] as string[] };

    try {
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
          total_clientes: dispatch.clientIds.length,
          operator_destino_id: dispatch.operatorId,
        })
        .select('id')
        .single();

      if (errCamp || !campanha) throw new Error(errCamp?.message ?? 'Erro ao criar campanha');
      result.campanha_id = campanha.id;

      const batchSize = 50;
      for (let i = 0; i < dispatch.clientIds.length; i += batchSize) {
        const batch = dispatch.clientIds.slice(i, i + batchSize);

        for (const clientId of batch) {
          try {
            const ago3 = new Date();
            ago3.setDate(ago3.getDate() - 3);

            const { data: recentCall } = await supabase
              .from('call_logs').select('id')
              .eq('client_id', clientId)
              .gte('start_time', ago3.toISOString())
              .maybeSingle();

            const { data: pendingTask } = await supabase
              .from('tasks').select('id')
              .eq('client_id', clientId)
              .eq('type', dispatch.callType)
              .eq('status', 'pending')
              .maybeSingle();

            const { data: pendingSchedule } = await supabase
              .from('call_schedules').select('id')
              .eq('customer_id', clientId)
              .eq('status', 'APROVADO')
              .maybeSingle();

            if (recentCall || pendingTask || pendingSchedule) {
              result.ignorados++;
              continue;
            }

            if (dispatch.canal === 'voz' || dispatch.canal === 'ambos') {
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
            }

            if (dispatch.canal === 'whatsapp' || dispatch.canal === 'ambos') {
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
              // assuming whatsapp task acts similar for purpose
              result.tasks_criadas++;
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
