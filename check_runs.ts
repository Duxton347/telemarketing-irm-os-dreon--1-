
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function checkRuns() {
    console.log('Fetching all runs...');
    const { data: runs, error } = await supabase
        .from('scraper_runs')
        .select('*');

    if (error) {
        console.error('Error fetching runs:', error);
        return;
    }

    console.log(`Found ${runs.length} runs:`, JSON.stringify(runs, null, 2));
}

checkRuns();
