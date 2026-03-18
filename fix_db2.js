import { supabase } from './lib/supabase.js';
async function run() {
  const { data, error } = await supabase.from('questions').select('*');
  console.log(data ? data.length : error);
}
run();
