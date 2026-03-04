
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function inspectSchema() {
    console.log('Inspecting sales table...');

    const { data: records, error } = await supabase
        .from('sales')
        .select('*');

    if (error) {
        console.error('Error fetching sales:', error);
    } else {
        console.log('Found records:', records?.length || 0);
        if (records && records.length > 0) {
            const keys = Object.keys(records[0]);
            console.log('Sales columns:', keys);
        }
    }
}

inspectSchema();
