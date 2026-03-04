
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function testUpdate() {
    console.log('Testing update with justification columns...');

    // Try to update a non-existent ID just to see if the query fails on column names
    const { error } = await supabase
        .from('sales')
        .update({
            delivery_delay_reason: 'Test Reason',
            delivery_note: 'Test Note'
        })
        .eq('id', '00000000-0000-0000-0000-000000000000');

    if (error) {
        console.error('Update failed:', error.message);
        if (error.message.includes('column') && error.message.includes('not found')) {
            console.log('CONFIRMED: Columns are missing.');
        }
    } else {
        console.log('Update query finished without column errors (columns likely exist).');
    }
}

testUpdate();
