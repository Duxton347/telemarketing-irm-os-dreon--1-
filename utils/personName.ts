export type PersonNameOption = {
  id: string;
  label: string;
};

export const cleanPersonName = (value?: unknown) =>
  String(value || '').replace(/\s+/g, ' ').trim();

export const normalizePersonNameKey = (value?: unknown) =>
  cleanPersonName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const findCanonicalPersonName = (
  value: unknown,
  options: Array<string | PersonNameOption>
) => {
  const cleaned = cleanPersonName(value);
  const key = normalizePersonNameKey(cleaned);
  if (!key) return cleaned;

  const match = options.find(option => {
    const label = typeof option === 'string' ? option : option.label;
    return normalizePersonNameKey(label) === key;
  });

  if (!match) return cleaned;
  return cleanPersonName(typeof match === 'string' ? match : match.label);
};

export const buildPersonNameOptions = (
  ...groups: Array<Array<string | PersonNameOption | null | undefined>>
): PersonNameOption[] => {
  const byKey = new Map<string, PersonNameOption>();

  groups.flat().forEach((option, index) => {
    if (!option) return;
    const label = cleanPersonName(typeof option === 'string' ? option : option.label);
    const key = normalizePersonNameKey(label);
    if (!key || byKey.has(key)) return;

    byKey.set(key, {
      id: typeof option === 'string' ? `${key}-${index}` : option.id,
      label
    });
  });

  return Array.from(byKey.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
};
