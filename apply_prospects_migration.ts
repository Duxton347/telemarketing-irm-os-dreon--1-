
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  console.log('Applying migration: migrations_prospects_module.sql');
  
  try {
    const sql = fs.readFileSync(path.resolve(__dirname, 'migrations_prospects_module.sql'), 'utf8');
    
    // Split by statement if needed, but simple ALTERs usually work in one block for Supabase RPC if using custom SQL function
    // But since we using standard client, we can't execute raw SQL directly unless we use the rpc 'exec_sql' trick or similar.
    // The user previously used a tool for this. 
    // Since I don't have the `exec_sql` RPC function guaranteed, I will assume the user HAS one or I will use the mcp tool if it works?
    // Wait, the MCP tool failed. 
    // Let's rely on the fact that we might have an `exec_sql` function or similar from previous turns?
    
    // Actually, checking `dataService` might reveal if there is a way to run SQL. 
    // If not, I'll try to use the MCP tool again with the correct Project ID if I can find it.
    // But I don't have the Project ID.
    
    // Plan B: Use the `postgres` npm package to connect directly if I had the connection string? 
    // I only have the URL and Key. 
    
    // Let's try to check NOT creating the detailed script yet, but check if there is an existing way.
    // Ah, I see `migrations_scraper_module.sql` exists. How was THAT applied? 
    // Likely manually or via a similar process.
    
    // I will try to use the MCP tool one more time but maybe I need to ask the user for the project ID? 
    // "Project reference in URL is not valid" suggests the URL in .env might be the issue or how I parsed it.
    
    // Let's try to parse the Project ID from the Supabase URL.
    // URL format: https://<project_id>.supabase.co
    
    const projectId = supabaseUrl.split('//')[1].split('.')[0];
    console.log('Derived Project ID:', projectId);
    
    // This script isn't running the MCP tool, it's running via node. 
    // So this script needs to use an RPC or similar. 
    
    // Let's assume there is an `exec_sql` function.
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
        console.error('RPC exec_sql failed:', error);
        console.log('Trying alternative: mcp tool needs to be called by the agent, not this script.');
        // This script is just a placeholder if I can't run SQL from agent.
    } else {
        console.log('Migration applied successfully via RPC!');
    }

  } catch (e) {
    console.error('Error reading/executing migration:', e);
  }
}

applyMigration();
