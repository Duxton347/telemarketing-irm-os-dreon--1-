import { formatUnknownError } from './errorFormatting';

export interface AppErrorEntry {
  id: string;
  source: string;
  message: string;
  details?: string;
  createdAt: string;
}

type AppErrorListener = (entry: AppErrorEntry) => void;

const listeners = new Set<AppErrorListener>();

let lastSignature = '';
let lastPublishedAt = 0;

const normalizeDetails = (value: unknown) => {
  const text = formatUnknownError(value);
  return text && text !== 'Erro desconhecido' ? text : undefined;
};

export const publishAppError = (input: {
  source: string;
  message?: unknown;
  details?: unknown;
}) => {
  const message = normalizeDetails(input.message) || 'Erro desconhecido';
  const details = normalizeDetails(input.details);
  const signature = `${input.source}::${message}::${details || ''}`;
  const now = Date.now();

  if (signature === lastSignature && now - lastPublishedAt < 2000) {
    return;
  }

  lastSignature = signature;
  lastPublishedAt = now;

  const entry: AppErrorEntry = {
    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
    source: input.source,
    message,
    details,
    createdAt: new Date(now).toISOString()
  };

  listeners.forEach(listener => listener(entry));
};

export const subscribeToAppErrors = (listener: AppErrorListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
