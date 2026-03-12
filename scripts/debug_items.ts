import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string): string {
    if (!str) return str;
    return str
      .toLowerCase()
      .split(' ')
      .map(word => {
          if (word.length === 0) return word;
          if (['da', 'de', 'do', 'das', 'dos', 'e'].includes(word)) return word;
          return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
}

const itemMapping: Record<string, string> = {
    'BOMBA OISCINA': 'Bomba Piscina',
    'bomba': 'Bomba',
    'BOMBA': 'Bomba',
    'MOTOBOMBA': 'Motobomba',
    'PISCINA': 'Piscina',
    'piscina': 'Piscina',
    'filtro': 'Filtro',
    'FILTRO': 'Filtro',
    'AQUECEDOR': 'Aquecedor',
    'AQUECEDOR A GÁS': 'Aquecedor a Gás',
    'Boiler': 'Boiler',
    'BOILER, OUTROS': 'Boiler, Outros',
    'ELETRICA, OUTROS': 'Elétrica, Outros',
    'FOTOVOLTAICO': 'Fotovoltaico',
    'fotovoltaico': 'Fotovoltaico',
    'LINHA BANHO': 'Linha Banho',
    'LINHA BANHO (AQUECIMENTO)': 'Linha Banho (Aquecimento)',
    'gerador de cloro': 'Gerador de Cloro',
    'Gerador de cloro': 'Gerador de Cloro',
    // ...
};

function standardizeItems(items: string[] | null): string[] | null {
    if (!items || items.length === 0) return items;
    const standardItemsSet = new Set<string>();

    for (let item of items) {
        if (!item) continue;
        const clean = item.trim();
        // Fallback to UpperCase for lookup to be safe?
        // Ah, what if clean is 'BOMBA ' instead of 'BOMBA'? trim fixes it.
        // What if mapping is missing 'BOMBA'? It's there.
        if (itemMapping[clean]) {
            standardItemsSet.add(itemMapping[clean]);
        } else {
            standardItemsSet.add(toTitleCase(clean));
        }
    }

    return Array.from(standardItemsSet);
}

async function debugItems() {
    const { data: clients } = await supabase.from('clients').select('id, items').not('items', 'is', 'null');
    if (!clients) return;
    for (let client of clients) {
        if (client.items && client.items.length > 0) {
            const newI = standardizeItems(client.items);
            if (!newI) continue;
            
            // let's just forcefully sort and compare them
            const t1 = [...client.items].sort().join('|');
            const t2 = [...newI].sort().join('|');

            if (t1 !== t2) {
                console.log(`Original: ${client.items} => Mapped: ${newI}`);
                // let's do the update!
                await supabase.from('clients').update({ items: newI }).eq('id', client.id);
            }
        }
    }
}
debugItems();
