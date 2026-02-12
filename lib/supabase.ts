import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string): string => {
  // @ts-ignore
  const envValue = (typeof process !== 'undefined' && process.env?.[key]) ||
    // @ts-ignore
    (typeof import.meta !== 'undefined' && import.meta.env?.[key]);

  return (envValue || '').trim();
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL ERROR: Supabase environment variables are missing!');
  console.error('Please check your .env file or deployment settings.');
  console.error('Required: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export const createAuthClient = () => createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
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
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]/g, '-')     // Substitui qualquer não alfanumérico por hífem
    .replace(/-+/g, '-')            // Remove hifens duplos
    .replace(/^-+|-+$/g, '');       // Remove hifens no início ou fim
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
