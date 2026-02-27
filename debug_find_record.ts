
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('.env');
let envContent = '';
try {
    envContent = fs.readFileSync(envPath, 'utf-8');
} catch (e) {
    console.log('.env not found');
}

const getEnv = (key: string) => {
    const match = envContent.match(new RegExp(`${key}=(.*)`));
    return match ? match[1].trim() : process.env[key] || '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseKey = getEnv('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('\n--- ALL RECENT TASKS (Last 20) ---');
const { data: tasks } = await supabase
    .from('tasks')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(20);

tasks?.forEach(t => console.log(`Task [${t.status}] ID:${t.id} Client:${t.clients?.name || t.client_id} Assigned:${t.assigned_to}`));

console.log('\n--- ALL RECENT SCHEDULES (Last 20) ---');
const { data: schedules } = await supabase
    .from('call_schedules')
    .select('*, clients(name)')
    .order('created_at', { ascending: false })
    .limit(20);

schedules?.forEach(s => console.log(`Schedule [${s.status}] ID:${s.id} Client:${s.clients?.name || s.customer_id} Assigned:${s.assigned_operator_id}`));
