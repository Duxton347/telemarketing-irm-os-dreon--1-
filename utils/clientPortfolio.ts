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

const LOW_SIGNAL_PORTFOLIO_KEYWORDS = [
  'conexao',
  'conexoes',
  'conexão',
  'conexões',
  'curva',
  'joelho',
  'luva',
  'niple',
  'nipple',
  'tubo',
  'tubo pvc',
  'cano',
  'registro',
  'adaptador',
  'flange',
  'cola',
  'fita veda',
  'veda rosca',
  'hidraulica',
  'hidráulica',
  'material hidraulico',
  'material hidráulico',
  'acessorio',
  'acessório',
  'kit instalacao',
  'kit instalação',
  'instalacao',
  'instalação',
  'suporte',
  'abracadeira',
  'abraçadeira',
  'ralo',
  'dreno'
];

const HIGH_SIGNAL_PORTFOLIO_KEYWORDS = [
  'boiler',
  'placa solar',
  'solar',
  'fotovoltaico',
  'aquecedor',
  'gerador de cloro',
  'trocador de calor',
  'bomba de calor',
  'bomba calor',
  'pressurizador',
  'spa',
  'sauna',
  'ionizador'
];

const getPortfolioSignalText = (entry: Partial<ClientPortfolioEntry>) =>
  normalizeComparableText([entry.profile, entry.product_category, entry.equipment].filter(Boolean).join(' '));

const hasAnyPortfolioKeyword = (entry: Partial<ClientPortfolioEntry>, keywords: string[]) => {
  const signalText = getPortfolioSignalText(entry);
  return keywords.some(keyword => signalText.includes(normalizeComparableText(keyword)));
};

export const isLowSignalPortfolioEntry = (entry: Partial<ClientPortfolioEntry>) =>
  hasAnyPortfolioKeyword(entry, LOW_SIGNAL_PORTFOLIO_KEYWORDS);

export const isHighSignalPortfolioEntry = (entry: Partial<ClientPortfolioEntry>) =>
  hasAnyPortfolioKeyword(entry, HIGH_SIGNAL_PORTFOLIO_KEYWORDS);

export const getOperatorPriorityPortfolioEntries = (entries: ClientPortfolioEntry[]) => {
  const normalizedEntries = mergePortfolioEntries(entries);
  const hasHighSignalEntries = normalizedEntries.some(isHighSignalPortfolioEntry);

  const prioritizedEntries = hasHighSignalEntries
    ? normalizedEntries.filter(entry => !isLowSignalPortfolioEntry(entry))
    : normalizedEntries;

  return prioritizedEntries.sort((a, b) => {
    const signalScoreA = isHighSignalPortfolioEntry(a) ? 1 : 0;
    const signalScoreB = isHighSignalPortfolioEntry(b) ? 1 : 0;
    const quantityA = normalizePortfolioQuantity(a.quantity);
    const quantityB = normalizePortfolioQuantity(b.quantity);

    return signalScoreB - signalScoreA ||
      quantityB - quantityA ||
      a.product_category.localeCompare(b.product_category, 'pt-BR') ||
      a.equipment.localeCompare(b.equipment, 'pt-BR');
  });
};

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
