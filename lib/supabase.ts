import { createClient, navigatorLock, processLock, type GoTrueClientOptions } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL ERROR: Supabase environment variables are missing!');
  console.error('Please check your .env file or deployment settings.');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
} else {
  console.log('Supabase environment loaded successfully.');
}

type AuthLock = NonNullable<GoTrueClientOptions['lock']>;

let hasLoggedAuthLockFallback = false;

const hasNavigatorLocks = () =>
  typeof globalThis !== 'undefined' &&
  typeof globalThis.navigator !== 'undefined' &&
  typeof globalThis.navigator.locks !== 'undefined';

const resilientAuthLock: AuthLock = async (name, acquireTimeout, fn) => {
  if (!hasNavigatorLocks()) {
    return processLock(name, acquireTimeout, fn);
  }

  try {
    return await navigatorLock(name, acquireTimeout, fn);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldFallback =
      Boolean((error as { isAcquireTimeout?: boolean } | null | undefined)?.isAcquireTimeout) ||
      message.includes('Navigator LockManager lock');

    if (!shouldFallback) {
      throw error;
    }

    if (!hasLoggedAuthLockFallback) {
      hasLoggedAuthLockFallback = true;
      console.warn('Supabase auth lock timed out; using in-tab fallback lock.', error);
    }

    return processLock(name, acquireTimeout, fn);
  }
};

const sharedAuthOptions = {
  lock: resilientAuthLock
};

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: sharedAuthOptions
  }
);

export const createAuthClient = () => createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      ...sharedAuthOptions,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  }
);

export const slugify = (text: string) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export const normalizePhone = (phone: string) => {
  return phone.replace(/\D/g, '');
};

export const getInternalEmail = (username: string) => {
  if (!username) return '';
  const trimmed = username.trim().toLowerCase();

  if (trimmed.includes('@') && trimmed.includes('.')) {
    return trimmed;
  }

  const slug = slugify(trimmed);
  return `${slug}@dreon-telemarketing.com.br`;
};
