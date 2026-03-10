import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

function normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
}

function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

async function main() {
    // STEP 1: Clean up bad INATIVO records created by previous buggy script
    console.log('🧹 STEP 1: Limpando registros INATIVO criados erroneamente...');
    const { data: badRecords } = await supabase
        .from('clients')
        .select('id, name, phone, status')
        .eq('status', 'INATIVO');

    let cleaned = 0;
    if (badRecords) {
        for (const rec of badRecords) {
            // Bad records have address fragments as names (start with "nº" or contain " - ")
            // or have CEP-like phone numbers (only digits, 8 chars = CEP)
            const isBadName = rec.name?.startsWith('nº ') || (rec.name?.includes(' - ') && rec.name?.match(/^\d/));
            const isBadPhone = rec.phone && rec.phone.replace(/\D/g, '').length <= 8 && !rec.phone.includes('(');

            if (isBadName || isBadPhone) {
                await supabase.from('clients').delete().eq('id', rec.id);
                console.log(`  🗑️ Deletado registro ruim: "${rec.name}" (${rec.phone})`);
                cleaned++;
            }
        }
    }
    console.log(`  Limpou ${cleaned} registros ruins.\n`);

    // STEP 2: Read CSV and update REAL clients by exact phone match
    console.log('📝 STEP 2: Atualizando clientes reais com data e status INATIVO...');
    const csv = fs.readFileSync('./clientes_inativos_preenchido.csv', 'utf-8');
    const lines = csv.split(/\r?\n/).filter(l => l.trim() !== '');
    const dataLines = lines.slice(1); // Skip header

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const notFoundList: string[] = [];

    for (const line of dataLines) {
        const values = parseCsvLine(line);

        // CSV columns: Data Última Compra, Endereço, Nome, Telefone
        const dateStr = values[0];
        const nome = values[2];
        const telefone = values[3] || '';

        if (!telefone || !nome) {
            console.log(`⚠️  Faltando dados: nome="${nome}" tel="${telefone}"`);
            notFound++;
            notFoundList.push(`${nome || '???'} (${telefone || 'sem telefone'})`);
            continue;
        }

        const normalizedPhone = normalizePhone(telefone);

        // Convert DD/MM/YYYY to YYYY-MM-DD
        const parts = dateStr.split('/');
        const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dateStr;

        // Find client by EXACT phone match (normalized, full number)
        const { data: clients, error: findError } = await supabase
            .from('clients')
            .select('id, name, phone, status, last_purchase_date')
            .eq('phone', normalizedPhone);

        if (findError) {
            console.error(`❌ Erro ao buscar ${nome}: ${findError.message}`);
            errors++;
            continue;
        }

        if (!clients || clients.length === 0) {
            // Retry: phone might be stored with formatting, try ilike
            const { data: clients2 } = await supabase
                .from('clients')
                .select('id, name, phone, status, last_purchase_date')
                .ilike('name', nome.trim());

            if (!clients2 || clients2.length === 0) {
                console.log(`🔍 Não encontrado: ${nome} (${telefone} → ${normalizedPhone})`);
                notFound++;
                notFoundList.push(`${nome} (${telefone})`);
                continue;
            }

            // Update by name match
            for (const client of clients2) {
                const { error: updateError } = await supabase
                    .from('clients')
                    .update({ last_purchase_date: isoDate, status: 'INATIVO' })
                    .eq('id', client.id);

                if (updateError) {
                    console.error(`❌ Erro ao atualizar ${client.name}: ${updateError.message}`);
                    errors++;
                } else {
                    console.log(`✅ (por nome) ${client.name} → Data: ${isoDate} | INATIVO`);
                    updated++;
                }
            }
            continue;
        }

        // Update by phone match
        for (const client of clients) {
            const { error: updateError } = await supabase
                .from('clients')
                .update({ last_purchase_date: isoDate, status: 'INATIVO' })
                .eq('id', client.id);

            if (updateError) {
                console.error(`❌ Erro ao atualizar ${client.name}: ${updateError.message}`);
                errors++;
            } else {
                console.log(`✅ ${client.name} → Data: ${isoDate} | INATIVO`);
                updated++;
            }
        }
    }

    console.log('\n===== RESUMO =====');
    console.log(`🧹 Registros ruins limpos: ${cleaned}`);
    console.log(`✅ Atualizados: ${updated}`);
    console.log(`🔍 Não encontrados: ${notFound}`);
    console.log(`❌ Erros: ${errors}`);

    if (notFoundList.length > 0) {
        console.log('\nClientes não encontrados:');
        notFoundList.forEach(n => console.log(`  - ${n}`));
    }

    // Final verification
    console.log('\n=== Verificação Final ===');
    const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'INATIVO');
    console.log(`Total INATIVO no banco: ${count}`);

    const { data: sample } = await supabase
        .from('clients')
        .select('name, phone, status, last_purchase_date')
        .eq('status', 'INATIVO')
        .limit(5);
    if (sample) {
        console.log('Amostra:');
        sample.forEach(c => console.log(`  ${c.name} | ${c.phone} | ${c.status} | ${c.last_purchase_date}`));
    }
}

main().catch(console.error);
