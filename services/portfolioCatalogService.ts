import { supabase } from '../lib/supabase';
import { Client } from '../types';
import {
  PortfolioCatalogConfig,
  buildPortfolioCatalogFromClients,
  normalizeClientPortfolioSnapshot,
  sanitizePortfolioCatalogConfig
} from '../utils/portfolioCatalog';

const PORTFOLIO_CATALOG_KEY = 'CLIENT_PORTFOLIO_CATALOG_V1';

const fetchStoredCatalog = async () => {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', PORTFOLIO_CATALOG_KEY)
    .maybeSingle();

  if (error) {
    console.error('Erro ao carregar catalogo tecnico:', error);
    return null;
  }

  if (!data?.value) return null;

  try {
    return sanitizePortfolioCatalogConfig(JSON.parse(data.value));
  } catch (error) {
    console.error('Erro ao interpretar catalogo tecnico:', error);
    return null;
  }
};

const fetchClientPortfolioRows = async () => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, phone, items, equipment_models, customer_profiles, product_categories, portfolio_entries');

  if (error) throw error;
  return (data || []) as Partial<Client>[];
};

export const PortfolioCatalogService = {
  getSettingKey: () => PORTFOLIO_CATALOG_KEY,

  getCatalogConfig: async (): Promise<PortfolioCatalogConfig> => {
    const storedCatalog = await fetchStoredCatalog();
    if (storedCatalog) return storedCatalog;

    const clientRows = await fetchClientPortfolioRows();
    return buildPortfolioCatalogFromClients(clientRows);
  },

  saveCatalogConfig: async (config: PortfolioCatalogConfig): Promise<PortfolioCatalogConfig> => {
    const sanitized = sanitizePortfolioCatalogConfig({
      ...config,
      updated_at: new Date().toISOString()
    });

    const { error } = await supabase.from('system_settings').upsert({
      key: PORTFOLIO_CATALOG_KEY,
      value: JSON.stringify(sanitized),
      description: 'Catalogo tecnico de categorias e produtos dos clientes',
      updated_at: new Date().toISOString()
    });

    if (error) throw error;
    return sanitized;
  },

  applyCatalogToAllClients: async (catalog?: PortfolioCatalogConfig): Promise<number> => {
    const effectiveCatalog = catalog || await PortfolioCatalogService.getCatalogConfig();
    const clientRows = await fetchClientPortfolioRows();

    let updatedCount = 0;
    for (const client of clientRows) {
      if (!client.id) continue;

      const snapshot = normalizeClientPortfolioSnapshot(client, effectiveCatalog);
      const nextPayload = {
        items: snapshot.items,
        equipment_models: snapshot.equipment_models,
        customer_profiles: snapshot.customer_profiles,
        product_categories: snapshot.product_categories,
        portfolio_entries: snapshot.portfolio_entries
      };

      const { error } = await supabase
        .from('clients')
        .update(nextPayload)
        .eq('id', client.id);

      if (error) {
        console.error(`Erro ao aplicar catalogo no cliente ${client.id}:`, error);
        continue;
      }

      updatedCount++;
    }

    return updatedCount;
  }
};
