
export const STORAGE_KEYS = {
  USERS: 'dreon_users',
  CLIENTS: 'dreon_clients',
  CALLS: 'dreon_calls',
  PROTOCOLS: 'dreon_protocols',
  PROTOCOL_EVENTS: 'dreon_protocol_events',
  TASKS: 'dreon_tasks'
};

export const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
};

export const normalizePhone = (phone: string) => {
  return phone.replace(/\D/g, '');
};

export const getFromStorage = <T>(key: string, defaultValue: T): T => {
  const stored = localStorage.getItem(key);
  if (!stored) return defaultValue;
  try {
    return JSON.parse(stored);
  } catch {
    return defaultValue;
  }
};

export const saveToStorage = <T>(key: string, data: T): void => {
  localStorage.setItem(key, JSON.stringify(data));
};
