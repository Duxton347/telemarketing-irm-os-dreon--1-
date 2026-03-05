import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function testGet() {
    console.log("Testing getResults query...");
    let query = supabase
        .from('scraper_results')
        .select('*, scraper_runs(scraper_processes(name))')
        .order('created_at', { ascending: false })
        .limit(5);

    const { data, error } = await query;
    if (error) {
        console.error("Supabase Error:", error);
    } else {
        console.log("Data count:", data?.length);
        if (data && data.length > 0) {
            console.log("Sample:", JSON.stringify(data[0], null, 2));
        }
    }
}

testGet();
