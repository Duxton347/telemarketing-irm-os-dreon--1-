import { Client, ClientPortfolioEntry } from '../types';

export const normalizeComparableText = (value?: string) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

export const normalizePortfolioValue = (value?: string) =>
  (value || '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ');

export const normalizePortfolioQuantity = (value?: number | string | null) => {
  const normalized = Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return 1;
  }

  return Math.round(normalized);
};

export const buildPortfolioEntryKey = (entry: Partial<ClientPortfolioEntry>) => {
  const profile = normalizeComparableText(entry.profile);
  const category = normalizeComparableText(entry.product_category);
  const equipment = normalizeComparableText(entry.equipment);
  return [profile, category, equipment].join('::');
};

export const sanitizePortfolioEntry = (entry?: Partial<ClientPortfolioEntry> | null): ClientPortfolioEntry | null => {
  if (!entry) return null;

  const profile = normalizePortfolioValue(entry.profile);
  const productCategory = normalizePortfolioValue(entry.product_category);
  const equipment = normalizePortfolioValue(entry.equipment);

  if (!profile && !productCategory && !equipment) {
    return null;
  }

  const key = buildPortfolioEntryKey({ profile, product_category: productCategory, equipment });

  return {
    id: entry.id || key,
    profile,
    product_category: productCategory,
    equipment,
    quantity: normalizePortfolioQuantity(entry.quantity)
  };
};

export const mergeUniquePortfolioValues = (...groups: Array<Array<string | undefined> | undefined>) => {
  const seen = new Set<string>();
  const next: string[] = [];

  for (const group of groups) {
    for (const rawValue of group || []) {
      const value = normalizePortfolioValue(rawValue);
      if (!value) continue;

      const comparable = normalizeComparableText(value);
      if (seen.has(comparable)) continue;

      seen.add(comparable);
      next.push(value);
    }
  }

  return next;
};

export const mergePortfolioEntries = (...groups: Array<Array<Partial<ClientPortfolioEntry> | null | undefined> | undefined>) => {
  const byKey = new Map<string, ClientPortfolioEntry>();
  const next: ClientPortfolioEntry[] = [];

  for (const group of groups) {
    for (const rawEntry of group || []) {
      const entry = sanitizePortfolioEntry(rawEntry);
      if (!entry) continue;

      const key = buildPortfolioEntryKey(entry);
      if (!key) continue;

      const existing = byKey.get(key);
      if (existing) {
        existing.quantity = normalizePortfolioQuantity(existing.quantity) + normalizePortfolioQuantity(entry.quantity);
        continue;
      }

      const nextEntry = {
        ...entry,
        quantity: normalizePortfolioQuantity(entry.quantity)
      };

      byKey.set(key, nextEntry);
      next.push(nextEntry);
    }
  }

  return next;
};

export const collectPortfolioMetadata = (entries: ClientPortfolioEntry[]) => ({
  customer_profiles: mergeUniquePortfolioValues(entries.map(entry => entry.profile)),
  product_categories: mergeUniquePortfolioValues(entries.map(entry => entry.product_category)),
  equipment_models: mergeUniquePortfolioValues(entries.map(entry => entry.equipment))
});

export const getClientEquipmentList = (client?: Partial<Client> | null) =>
  mergeUniquePortfolioValues(client?.equipment_models, client?.items);

export const getClientPortfolioEntries = (client?: Partial<Client> | null) => {
  const existingEntries = mergePortfolioEntries(client?.portfolio_entries);
  if (existingEntries.length > 0) {
    return existingEntries;
  }

  return getClientEquipmentList(client).map((equipment, index) => ({
    id: `${normalizeComparableText(equipment)}-${index}`,
    profile: '',
    product_category: '',
    equipment,
    quantity: 1
  }));
};
