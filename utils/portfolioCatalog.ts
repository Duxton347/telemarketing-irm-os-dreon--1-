import { Client, ClientPortfolioEntry } from '../types';
import {
  collectPortfolioMetadata,
  getClientPortfolioEntries,
  mergePortfolioEntries,
  mergeUniquePortfolioValues,
  normalizeComparableText,
  normalizePortfolioQuantity,
  normalizePortfolioValue
} from './clientPortfolio';

export interface PortfolioCatalogCategory {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface PortfolioCatalogProduct {
  id: string;
  name: string;
  category: string;
  aliases: string[];
  active: boolean;
  sort_order: number;
}

export interface PortfolioCatalogConfig {
  version: number;
  categories: PortfolioCatalogCategory[];
  products: PortfolioCatalogProduct[];
  updated_at?: string;
}

const DEFAULT_CATEGORY_NAMES = [
  'GERADOR DE CLORO',
  'PISCINA'
];

const DEFAULT_PRODUCTS: PortfolioCatalogProduct[] = [
  {
    id: 'sal-gerador',
    name: 'SAL P/ GERADOR',
    category: 'GERADOR DE CLORO',
    aliases: ['SAL P/ GERADOR 25KG', 'SAL P/ GERADOR 25,0KG', 'SAL PARA GERADOR', 'SAL GERADOR', 'SAL'],
    active: true,
    sort_order: 10
  },
  {
    id: 'motobomba',
    name: 'MOTOBOMBA',
    category: 'PISCINA',
    aliases: ['MOTOBOMBA 1/3CV VEICO', 'MOTOBOMBA VEICO', 'BOMBA PISCINA'],
    active: true,
    sort_order: 20
  }
];

const createCatalogId = (value: string, fallbackPrefix: string) => {
  const normalized = normalizeComparableText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || `${fallbackPrefix}-${Date.now()}`;
};

const defaultCategories = DEFAULT_CATEGORY_NAMES.map((name, index) => ({
  id: createCatalogId(name, 'category'),
  name,
  active: true,
  sort_order: (index + 1) * 10
}));

const mergeCategoryLists = (...groups: Array<PortfolioCatalogCategory[] | undefined>) => {
  const byId = new Map<string, PortfolioCatalogCategory>();
  const byName = new Map<string, string>();

  for (const group of groups) {
    for (const item of group || []) {
      const name = normalizePortfolioValue(item.name);
      if (!name) continue;

      const comparable = normalizeComparableText(name);
      const existingId = byName.get(comparable);
      const id = existingId || item.id || createCatalogId(name, 'category');
      const current = byId.get(id);

      const nextItem: PortfolioCatalogCategory = {
        id,
        name,
        active: item.active ?? true,
        sort_order: item.sort_order ?? current?.sort_order ?? (byId.size + 1) * 10
      };

      byId.set(id, current ? { ...current, ...nextItem } : nextItem);
      byName.set(comparable, id);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR')
  );
};

const mergeProductLists = (...groups: Array<PortfolioCatalogProduct[] | undefined>) => {
  const byId = new Map<string, PortfolioCatalogProduct>();
  const byName = new Map<string, string>();

  for (const group of groups) {
    for (const item of group || []) {
      const name = normalizePortfolioValue(item.name);
      if (!name) continue;

      const comparable = normalizeComparableText(name);
      const existingId = byName.get(comparable);
      const id = existingId || item.id || createCatalogId(name, 'product');
      const current = byId.get(id);

      const aliases = mergeUniquePortfolioValues(current?.aliases, item.aliases);
      const nextItem: PortfolioCatalogProduct = {
        id,
        name,
        category: normalizePortfolioValue(item.category),
        aliases,
        active: item.active ?? true,
        sort_order: item.sort_order ?? current?.sort_order ?? (byId.size + 1) * 10
      };

      byId.set(id, current ? { ...current, ...nextItem, aliases } : nextItem);
      byName.set(comparable, id);
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR')
  );
};

export const sanitizePortfolioCatalogConfig = (
  config?: Partial<PortfolioCatalogConfig> | null
): PortfolioCatalogConfig => {
  const categories = mergeCategoryLists(defaultCategories, config?.categories);
  const products = mergeProductLists(DEFAULT_PRODUCTS, config?.products);

  return {
    version: 1,
    categories,
    products,
    updated_at: config?.updated_at
  };
};

export const getActivePortfolioCatalogCategories = (config: PortfolioCatalogConfig) =>
  config.categories.filter(category => category.active);

export const getActivePortfolioCatalogProducts = (config: PortfolioCatalogConfig) =>
  config.products.filter(product => product.active);

const matchByKeyword = (value: string, keywords: string[]) => {
  const comparable = normalizeComparableText(value);
  return keywords.some(keyword => {
    const normalizedKeyword = normalizeComparableText(keyword);
    return normalizedKeyword && (
      comparable === normalizedKeyword ||
      comparable.includes(normalizedKeyword) ||
      normalizedKeyword.includes(comparable)
    );
  });
};

export const findPortfolioCatalogProduct = (value?: string, config?: PortfolioCatalogConfig) => {
  const comparable = normalizeComparableText(value);
  if (!comparable || !config) return null;

  return config.products.find(product =>
    [product.name, ...(product.aliases || [])].some(candidate => matchByKeyword(comparable, [candidate]))
  ) || null;
};

const findCategoryByName = (value?: string, config?: PortfolioCatalogConfig) => {
  const comparable = normalizeComparableText(value);
  if (!comparable || !config) return null;

  return config.categories.find(category => normalizeComparableText(category.name) === comparable) || null;
};

export const normalizePortfolioEntryWithCatalog = (
  entry: Partial<ClientPortfolioEntry>,
  config?: PortfolioCatalogConfig
) => {
  const profile = normalizePortfolioValue(entry.profile);
  const equipment = normalizePortfolioValue(entry.equipment);
  let productCategory = normalizePortfolioValue(entry.product_category);
  const quantity = normalizePortfolioQuantity(entry.quantity);

  if (!profile && !equipment && !productCategory) return null;

  const matchedProduct = findPortfolioCatalogProduct(equipment, config);
  if (matchedProduct) {
    if (!matchedProduct.active) return null;
    productCategory = matchedProduct.category || productCategory;
  }

  if (!productCategory && equipment) {
    const equipmentComparable = normalizeComparableText(equipment);

    if (equipmentComparable.includes('motobomba')) {
      productCategory = 'PISCINA';
    } else if (equipmentComparable.includes('sal')) {
      productCategory = 'GERADOR DE CLORO';
    } else if (equipmentComparable.includes('gerador de cloro')) {
      return null;
    }
  }

  const standaloneCategory = !productCategory && equipment ? findCategoryByName(equipment, config) : null;
  if (standaloneCategory) {
    return null;
  }

  if (productCategory) {
    const mappedCategory = findCategoryByName(productCategory, config);
    if (mappedCategory) {
      if (!mappedCategory.active) return null;
      productCategory = mappedCategory.name;
    }
  }

  if (!profile && !equipment && !productCategory) return null;

  return {
    id: entry.id,
    profile,
    product_category: productCategory,
    equipment,
    quantity
  } satisfies ClientPortfolioEntry;
};

export const normalizePortfolioEntriesWithCatalog = (
  entries: Array<Partial<ClientPortfolioEntry> | null | undefined>,
  config?: PortfolioCatalogConfig
) => mergePortfolioEntries(
  entries
    .map(entry => normalizePortfolioEntryWithCatalog(entry || {}, config))
    .filter(Boolean) as ClientPortfolioEntry[]
);

export const normalizeClientPortfolioSnapshot = (client: Partial<Client>, config?: PortfolioCatalogConfig) => {
  const portfolioEntries = normalizePortfolioEntriesWithCatalog(getClientPortfolioEntries(client), config);
  const portfolioMetadata = collectPortfolioMetadata(portfolioEntries);

  return {
    portfolio_entries: portfolioEntries,
    customer_profiles: mergeUniquePortfolioValues(client.customer_profiles, portfolioMetadata.customer_profiles),
    product_categories: mergeUniquePortfolioValues(portfolioMetadata.product_categories),
    equipment_models: mergeUniquePortfolioValues(portfolioMetadata.equipment_models),
    items: mergeUniquePortfolioValues(portfolioMetadata.equipment_models)
  };
};

export const buildPortfolioCatalogFromClients = (
  clients: Array<Partial<Client>>,
  existingConfig?: Partial<PortfolioCatalogConfig> | null
) => {
  const seedConfig = sanitizePortfolioCatalogConfig(existingConfig);
  const nextCategoryMap = new Map(
    seedConfig.categories.map(category => [normalizeComparableText(category.name), category] as const)
  );
  const nextProductMap = new Map(
    seedConfig.products.map(product => [normalizeComparableText(product.name), product] as const)
  );

  for (const client of clients) {
    const normalizedSnapshot = normalizeClientPortfolioSnapshot(client, seedConfig);

    normalizedSnapshot.product_categories.forEach((categoryName, index) => {
      const comparable = normalizeComparableText(categoryName);
      if (!nextCategoryMap.has(comparable)) {
        nextCategoryMap.set(comparable, {
          id: createCatalogId(categoryName, 'category'),
          name: categoryName,
          active: true,
          sort_order: seedConfig.categories.length * 10 + index + 10
        });
      }
    });

    normalizedSnapshot.portfolio_entries.forEach((entry, index) => {
      const equipmentName = normalizePortfolioValue(entry.equipment);
      if (!equipmentName) return;

      const comparable = normalizeComparableText(equipmentName);
      const existingProduct = nextProductMap.get(comparable);
      if (existingProduct) {
        if (!existingProduct.category && entry.product_category) {
          existingProduct.category = entry.product_category;
        }
        return;
      }

      nextProductMap.set(comparable, {
        id: createCatalogId(equipmentName, 'product'),
        name: equipmentName,
        category: entry.product_category || '',
        aliases: [],
        active: true,
        sort_order: seedConfig.products.length * 10 + index + 10
      });
    });
  }

  return sanitizePortfolioCatalogConfig({
    version: 1,
    categories: Array.from(nextCategoryMap.values()),
    products: Array.from(nextProductMap.values()),
    updated_at: existingConfig?.updated_at
  });
};

export const getCatalogProductsByCategory = (config: PortfolioCatalogConfig, categoryNames?: string[]) => {
  const categorySet = new Set((categoryNames || []).map(normalizeComparableText));

  return getActivePortfolioCatalogProducts(config).filter(product => {
    if (categorySet.size === 0) return true;
    return categorySet.has(normalizeComparableText(product.category));
  });
};
