const normalizeComparableText = (value?: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b\w/g, char => char.toUpperCase());

const cleanRawInterestValue = (value?: string) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const INTEREST_RULES: Array<{ canonical: string; match: (normalized: string) => boolean }> = [
  {
    canonical: 'Aquecedor a Gás',
    match: normalized =>
      normalized.includes('aquecedor') &&
      (
        normalized.includes(' gas') ||
        normalized.endsWith('gas') ||
        normalized.includes(' emmeti') ||
        normalized.includes(' komeco') ||
        normalized.includes(' veico')
      )
  },
  {
    canonical: 'Aquecedor de Piscina',
    match: normalized =>
      normalized.includes('aquecedor') &&
      normalized.includes('piscina')
  },
  {
    canonical: 'Aquecedor',
    match: normalized => normalized.includes('aquecedor')
  },
  {
    canonical: 'Boiler',
    match: normalized => normalized.includes('boiler')
  },
  {
    canonical: 'Fotovoltaico',
    match: normalized =>
      normalized.includes('fotovolta') ||
      normalized.includes('energia solar')
  },
  {
    canonical: 'Placas Aquecimento',
    match: normalized =>
      normalized.includes('placa') &&
      normalized.includes('aquec')
  },
  {
    canonical: 'Linha Banho (Aquecimento)',
    match: normalized =>
      normalized.includes('linha banho') ||
      (normalized.includes('banho') && normalized.includes('aquec'))
  },
  {
    canonical: 'Trocador de Calor',
    match: normalized =>
      normalized.includes('trocador') &&
      normalized.includes('calor')
  },
  {
    canonical: 'Gerador de Cloro',
    match: normalized =>
      normalized.includes('gerador') &&
      normalized.includes('cloro')
  },
  {
    canonical: 'Pressurizadora',
    match: normalized => normalized.includes('pressuriz')
  },
  {
    canonical: 'Filtro',
    match: normalized => normalized.includes('filtro')
  },
  {
    canonical: 'Bomba Recalque',
    match: normalized =>
      normalized.includes('bomba recalque') ||
      normalized.includes('recalque')
  },
  {
    canonical: 'Bomba',
    match: normalized =>
      normalized.includes('bomba') ||
      normalized.includes('motobomba')
  },
  {
    canonical: 'Quadro',
    match: normalized => normalized.includes('quadro')
  },
  {
    canonical: 'Químicos',
    match: normalized =>
      normalized.includes('quimic') ||
      normalized.includes('genco') ||
      normalized === 'cloro'
  }
];

export const normalizeInterestProduct = (value?: string) => {
  const cleaned = cleanRawInterestValue(value);
  if (!cleaned) return undefined;

  const normalized = normalizeComparableText(cleaned);
  if (!normalized) return undefined;

  const matchedRule = INTEREST_RULES.find(rule => rule.match(normalized));
  if (matchedRule) return matchedRule.canonical;

  return toTitleCase(cleaned);
};

export const normalizeInterestProductList = (values?: Array<string | undefined | null>) => {
  const bucket = new Map<string, string>();

  for (const value of values || []) {
    const normalizedValue = normalizeInterestProduct(value || undefined);
    const comparable = normalizeComparableText(normalizedValue);
    if (!normalizedValue || !comparable || bucket.has(comparable)) continue;
    bucket.set(comparable, normalizedValue);
  }

  return Array.from(bucket.values());
};
