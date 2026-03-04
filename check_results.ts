
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function checkResults() {
    const { data: results, error } = await supabase.from('scraper_results').select('id, name, run_id, address, review_status');
    console.log(`Found ${results?.length || 0} results.`);
    if (results && results.length > 0) {
        console.log(results.slice(0, 3));
    }
}

checkResults();
