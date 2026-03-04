
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function fixStuckRuns() {
    console.log('Fetching stuck runs...');
    const { data: runs, error } = await supabase
        .from('scraper_runs')
        .select('*')
        .eq('status', 'RUNNING');

    if (error) {
        console.error('Error fetching runs:', error);
        return;
    }

    console.log(`Found ${runs.length} stuck runs.`);

    for (const run of runs) {
        console.log(`Fixing run ${run.id}...`);

        // Count total found and new in scraper_results
        const { count: foundCount } = await supabase
            .from('scraper_results')
            .select('*', { count: 'exact', head: true })
            .eq('run_id', run.id);

        await supabase
            .from('scraper_runs')
            .update({
                status: 'COMPLETED',
                total_found: foundCount || 0,
                // Total new can't be easily recalculated perfectly without duplicating logic,
                // but we can just use the found count or what we currently have
                // total_new: foundCount || 0,
            })
            .eq('id', run.id);

        console.log(`Fixed run ${run.id}. Found: ${foundCount}`);
    }
}

fixStuckRuns();
