import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Use anon key for local test or update with service role key if needed

if (!supabaseUrl || !supabaseKey) {
  console.error("No Supabase URL or Key found in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(str: string): string {
    if (!str) return str;
    return str
      .toLowerCase()
      .split(' ')
      .map(word => {
          if (word.length === 0) return word;
          // small words like 'da', 'de', 'do', 'das', 'dos' should stay lower
          if (['da', 'de', 'do', 'das', 'dos', 'e'].includes(word)) {
              return word;
          }
          return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
}

function standardizeCity(city: string | null): string | null {
    if (!city) return null;
    let clean = city.trim();
    
    // Some cities came with this string at start due to previous bugs
    if (clean.startsWith(', ')) {
        const parts = clean.split('-').map(s => s.trim());
        if (parts.length > 1) {
            clean = parts[0].replace(/,\s*/, '').trim();
        } else {
            clean = clean.replace(/,\s*/, '').trim();
        }
    }
    
    // Remove specific garbage
    clean = clean.replace(/, Sumare.*/i, 'SUMARE');

    // Remove any trailing dashes or commas
    clean = clean.replace(/[-\s,]+$/, '');
    
    // Return uppercase without accents or just uppercase? CRM usually prefers uppercase
    return clean.toUpperCase();
}

function standardizeNeighborhood(neighborhood: string | null): string | null {
    if (!neighborhood) return null;
    let clean = neighborhood.trim();
    clean = clean.replace(/[-\s,]+$/, ''); // remove trailing punct
    return toTitleCase(clean);
}

const itemMapping: Record<string, string> = {
    'BOMBA OISCINA': 'Bomba Piscina',
    'bomba': 'Bomba',
    'BOMBA': 'Bomba',
    'MOTOBOMBA': 'Motobomba',
    'Pressurizadora': 'Pressurizadora',
    'PISCINA, PRESSURIZADORA': 'Piscina, Pressurizadora',
    'Casa de bomba': 'Casa de Bomba',

    'AQUECEDOR': 'Aquecedor',
    'AQUECEDOR A GÁS': 'Aquecedor a Gás',
    'Boiler': 'Boiler',
    'BOILER, OUTROS': 'Boiler, Outros',
    'Trocador de calor': 'Trocador de Calor',

    'filtro': 'Filtro',
    'FILTRO': 'Filtro',

    'Quimicos': 'Químicos',
    'Quimico': 'Químicos',

    'gerador de cloro': 'Gerador de Cloro',
    'Gerador de cloro': 'Gerador de Cloro',

    'PISCINA': 'Piscina',
    'piscina': 'Piscina',
    'PISCINA, BOILER': 'Piscina, Boiler',

    'SAUNA': 'Sauna',
    'LED': 'LED', // Acronym
    'SAL': 'Sal',
    'Flange': 'Flange',

    'Todas as linhas': 'Todas As Linhas',
    'LINHA BANHO': 'Linha Banho',
    'LINHA BANHO (AQUECIMENTO)': 'Linha Banho (Aquecimento)',
    'ELETRICA, OUTROS': 'Elétrica, Outros',
    
    'REFLETORES': 'Refletores',
    'Luminária': 'Luminária',
    
    'fotovoltaico': 'Fotovoltaico',
    'FOTOVOLTAICO': 'Fotovoltaico',
    'Fotovoltaico': 'Fotovoltaico',
    'PLACAS AQUECIMENTO': 'Placas Aquecimento',
};

function standardizeItems(items: string[] | null): string[] | null {
    if (!items || items.length === 0) return items;
    const standardItemsSet = new Set<string>();

    for (let item of items) {
        if (!item) continue;
        const clean = item.trim();
        if (itemMapping[clean]) {
            standardItemsSet.add(itemMapping[clean]);
        } else {
            // For unmapped items, standard title case
            standardItemsSet.add(toTitleCase(clean));
        }
    }

    return Array.from(standardItemsSet);
}

async function run() {
  console.log("Starting Data Standardization...");

  let updatedCount = 0;
  let hasMore = true;
  let page = 0;
  const pageSize = 1000;
  let totalFound = 0;

  let sqlStream = fs.createWriteStream('temp_updates.sql', { flags: 'w' });

  while (hasMore) {
      const { data: clients, error } = await supabase
        .from('clients')
        .select('id, city, neighborhood, items')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) {
        console.error("Error fetching clients:", error);
        break;
      }

      if (!clients || clients.length === 0) {
        hasMore = false;
        break;
      }

      totalFound += clients.length;
      console.log(`Processing page ${page + 1} (${clients.length} rows)...`);

      for (const client of clients) {
          let needsUpdate = false;
          let newCity = client.city;
          let newNeigh = client.neighborhood;
          let newItems = client.items;

          const stdCity = standardizeCity(client.city);
          if (stdCity !== client.city) {
              newCity = stdCity;
              needsUpdate = true;
          }

          const stdNeigh = standardizeNeighborhood(client.neighborhood);
          if (stdNeigh !== client.neighborhood) {
              newNeigh = stdNeigh;
              needsUpdate = true;
          }

          if (client.items && client.items.length > 0) {
              const stdItems = standardizeItems(client.items);
              if (stdItems && (stdItems.length !== client.items.length || !stdItems.every((val, index) => val === client.items[index]))) {
                  newItems = stdItems;
                  needsUpdate = true;
              }
          }

          if (needsUpdate) {
              // Escape strings for SQL
              const escapeSql = (str: string | null) => str ? `'${str.replace(/'/g, "''")}'` : 'NULL';
              
              const citySql = escapeSql(newCity);
              const neighSql = escapeSql(newNeigh);
              
              let itemsSql = 'NULL';
              if (newItems && newItems.length > 0) {
                  // Format as ARRAY['val1', 'val2']::text[]
                  const parts = newItems.map((i: string) => escapeSql(i)).join(',');
                  itemsSql = `ARRAY[${parts}]::text[]`;
              } else if (newItems && newItems.length === 0) {
                  itemsSql = `ARRAY[]::text[]`;
              }

              const sql = `UPDATE clients SET city = ${citySql}, neighborhood = ${neighSql}, items = ${itemsSql} WHERE id = '${client.id}';\n`;
              sqlStream.write(sql);
              updatedCount++;
          }
      }

      page++;
  }

  sqlStream.end();
  console.log(`\nChecked total of ${totalFound} records.`);

  console.log(`\nStandardization completed. Updated ${updatedCount} records.`);
}

run().catch(console.error);
