import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
    // Check specific REAL clients from the CSV
    const testNames = [
        'Marco Antonio Cardoso Siqueira Da Silva',
        'DANIELA QUEIROZ',
        'HIGOR PEDRO CANDIDO DIAS',
        'ENIO FERREIRA JUNIOR',
        'LAIS BASTOS'
    ];

    console.log('=== Verificando clientes REAIS ===');
    for (const name of testNames) {
        const { data } = await supabase
            .from('clients')
            .select('id, name, phone, status, last_purchase_date')
            .ilike('name', `%${name}%`);

        if (!data || data.length === 0) {
            console.log(`❌ "${name}": NÃO ENCONTRADO`);
        } else {
            for (const c of data) {
                console.log(`📋 ${c.name} | phone: ${c.phone} | status: ${c.status} | last_purchase_date: ${c.last_purchase_date}`);
            }
        }
    }

    // Count bad records still remaining
    console.log('\n=== Registros "ruins" restantes ===');
    const { data: badOnes } = await supabase
        .from('clients')
        .select('id, name, phone, status')
        .eq('status', 'INATIVO')
        .limit(10);

    if (badOnes) {
        for (const c of badOnes) {
            console.log(`  ${c.name} | ${c.phone} | ${c.status}`);
        }
    }

    // Total counts
    const { count: inativoCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'INATIVO');

    const { count: totalCount } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true });

    console.log(`\nTotal INATIVO: ${inativoCount}`);
    console.log(`Total clientes: ${totalCount}`);
}

main().catch(console.error);
