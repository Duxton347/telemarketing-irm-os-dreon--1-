
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    console.log('Inspecting clients table...');

    // 1. Check if 'origin' column exists by selecting one record
    const { data: record, error } = await supabase
        .from('clients')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching clients:', error);
    } else if (record && record.length > 0) {
        const keys = Object.keys(record[0]);
        console.log('Client columns:', keys);
        console.log('Has origin column?', keys.includes('origin'));
    } else {
        console.log('No clients found to inspect columns, but table exists.');
        // Can try to insert a dummy to check schema constraints? Or assume it's okay.
        // Let's assume okay if no error.
    }

    // 2. Try to insert/upsert a test record to check constraints if possible
    // actually, let's just rely on the column list for now.
}

inspectSchema();
