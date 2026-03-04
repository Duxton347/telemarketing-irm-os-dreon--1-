
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('Running migration to add justification columns...');

    // Attempt to add columns via RPC if exec_sql exists, 
    // or just inform the user if we can't do DDL with anon key.

    const sql = `
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_delay_reason TEXT;
        ALTER TABLE sales ADD COLUMN IF NOT EXISTS delivery_note TEXT;
    `;

    // Most Supabase projects have an 'exec_sql' RPC for migrations if set up by previous agents.
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('Migration failed via RPC:', error.message);
        console.log('\n--- MANUAL ACTION REQUIRED ---');
        console.log('Please run the following SQL in your Supabase SQL Editor:');
        console.log(sql);
        console.log('-------------------------------\n');
    } else {
        console.log('Migration applied successfully!');
    }
}

runMigration();
