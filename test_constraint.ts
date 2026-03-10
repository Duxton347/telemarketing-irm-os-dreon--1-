import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
    // Check the actual CHECK constraint on call_schedules.call_type
    const { data, error } = await supabase.rpc('exec_sql', {
        sql: `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'call_schedules'::regclass AND contype = 'c';`
    });

    if (error) {
        console.log('RPC not available, trying information_schema...');

        const { data: d2, error: e2 } = await supabase
            .from('call_schedules')
            .select('call_type')
            .limit(5);

        console.log('Sample call_types in DB:', d2);
        if (e2) console.error(e2);
    } else {
        console.log('Constraints:', JSON.stringify(data, null, 2));
    }

    // Try inserting with each possible type to see which ones work
    const testTypes = ['VENDA', 'POS_VENDA', 'PROSPECCAO', 'CONFIRMACAO_PROTOCOLO', 'WHATSAPP', 'REATIVACAO', 'PÓS-VENDA', 'PÓS_VENDA'];

    for (const t of testTypes) {
        const { error: insertError } = await supabase.from('call_schedules').insert({
            call_type: t,
            scheduled_for: '2099-01-01T00:00:00',
            status: 'TEST_DELETE_ME'
        });

        if (insertError) {
            if (insertError.message.includes('call_type_check')) {
                console.log(`❌ "${t}" → REJECTED by constraint`);
            } else {
                console.log(`⚠️  "${t}" → Other error: ${insertError.message}`);
            }
        } else {
            console.log(`✅ "${t}" → ACCEPTED`);
            // Clean up test record
            await supabase.from('call_schedules').delete().eq('status', 'TEST_DELETE_ME');
        }
    }
}

main().catch(console.error);
