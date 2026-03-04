
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'c:/Users/Judson/Downloads/telemarketing-irm-os-dreon--1--Duxton347-patch-1/telemarketing-irm-os-dreon--1--Duxton347-patch-1/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function testAll() {
    console.log('Testing multiple columns...');
    const { error } = await supabase
        .from('sales')
        .update({
            delivery_delay_reason: 'test',
            delivery_note: 'test',
            external_salesperson: 'test',
            customer_id: '00000000-0000-0000-0000-000000000000'
        })
        .eq('id', '00000000-0000-0000-0000-000000000000');

    if (error) console.log('Error:', error.message);
}
testAll();
