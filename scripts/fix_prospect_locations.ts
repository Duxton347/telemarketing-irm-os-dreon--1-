import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Use anon key for local test or update with service role key if needed

if (!supabaseUrl || !supabaseKey) {
  console.error("No Supabase URL or Key found in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseAddress(fullAddress: string) {
  let neighborhood = null;
  let city = null;
  let state = null;

  if (!fullAddress) return { neighborhood, city, state };

  const cleanAddr = fullAddress.trim();

  // Extract State (UF) at the end: " - SP", ", SP", "- SP, Brasil"
  const stateMatch = cleanAddr.match(/\b([A-Z]{2})(?:,?\s*Brasil)?$/i);
  if (stateMatch) {
    state = stateMatch[1].toUpperCase();
  }

  // Remove CEP and Brasil to simplify
  let str = cleanAddr.replace(/(?:CEP:?\s*)?(\d{5}-?\d{3})/i, '').replace(/Brasil\s*$/i, '').trim();
  
  // Clean trailing punctuation
  str = str.replace(/[,-\s]+$/, '');

  if (state && str.endsWith(state)) {
    str = str.slice(0, -state.length).trim();
    str = str.replace(/[,-\s]+$/, '');
  }

  // Common format: Rua X, 123 - Bairro, Cidade
  const partsByComma = str.split(',').map(s => s.trim()).filter(Boolean);
  
  if (partsByComma.length > 1) {
    let potentialCity = partsByComma[partsByComma.length - 1];
    
    if (potentialCity.includes('-')) {
      const subParts = potentialCity.split('-').map(s => s.trim());
      city = subParts[subParts.length - 1];
      neighborhood = subParts[subParts.length - 2];
    } else {
      city = potentialCity;
      
      let beforeCity = partsByComma.slice(0, -1).join(',').trim();
      if (beforeCity.includes('-')) {
        const subParts = beforeCity.split('-').map(s => s.trim());
        neighborhood = subParts[subParts.length - 1];
      }
    }
  } else {
    if (str.includes('-')) {
      const parts = str.split('-').map(s => s.trim());
      if (parts.length >= 3) {
        city = parts[parts.length - 1];
        neighborhood = parts[parts.length - 2];
      } else if (parts.length === 2) {
        city = parts[1];
      }
    }
  }

  // Clean empty logic
  if (city && city.length <= 2) city = null; // SP is state, not city
  if (neighborhood && neighborhood.length <= 2) neighborhood = null;
  if (city?.toUpperCase() === 'ILHABELA') city = 'ILHABELA';

  return { 
    neighborhood: neighborhood || null, 
    city: city?.toUpperCase() || null, 
    state: state || null 
  };
}

async function run() {
  console.log("Starting Prospect Location Migration...");

  // Fetch all LEADS with address but missing or bad city/neighborhood/state
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, address, city, neighborhood, state')
    .eq('status', 'LEAD')
    .filter('address', 'not.is', 'null');

  if (error) {
    console.error("Error fetching clients:", error);
    return;
  }

  console.log(`Found ${clients.length} leads to process.`);

  let updatedCount = 0;

  for (const client of clients) {
    if (!client.address) continue;
    
    // We update if the city has commas or is null, or state is null
    const isBadFormat = !client.city || !client.neighborhood || !client.state || client.city.includes(',');

    if (isBadFormat) {
      const parsed = parseAddress(client.address);
      
      // We only update if parsed values exist
      if (parsed.city || parsed.state || parsed.neighborhood) {
          console.log(`[UPDATE] ${client.name} | City: ${client.city} -> ${parsed.city} | Neigh: ${client.neighborhood} -> ${parsed.neighborhood} | State: ${parsed.state}`);
          
          const { error: updateError } = await supabase
            .from('clients')
            .update({
              city: parsed.city || client.city,
              neighborhood: parsed.neighborhood || client.neighborhood,
              state: parsed.state || client.state
            })
            .eq('id', client.id);

          if (updateError) {
              console.error(`Error updating ${client.id}:`, updateError);
          } else {
              updatedCount++;
          }
      }
    }
  }

  console.log(`\nMigration completed. Updated ${updatedCount} records.`);
}

run().catch(console.error);
