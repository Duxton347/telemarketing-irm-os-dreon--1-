import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Use anon key for local test or update with service role key if needed
const supabase = createClient(supabaseUrl, supabaseKey);

// Just testing an update
async function test() {
  const { data: client, error } = await supabase.from('clients').select('id, items').not('items', 'is', 'null').limit(1).single();
  if (client) {
    console.log("Before:", client.items);
    const { data: updated, error: uErr } = await supabase.from('clients').update({ items: ['Test'] }).eq('id', client.id).select('items');
    console.log("After:", updated, "Error:", uErr);
    
    // revert
    await supabase.from('clients').update({ items: client.items }).eq('id', client.id);
  }
}
test();
