import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const normalizePhone = (p: string) => p.replace(/\D/g, '');
const normalizeName = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

async function run() {
  console.log("Fetching all clients and leads...");
  
  // Fetch everything to compare
  const { data: allRecords, error } = await supabase.from('clients').select('id, name, phone, status, tags');
  
  if (error) {
    console.error("Error fetching records:", error);
    process.exit(1);
  }

  const buyers = allRecords.filter(r => r.status === 'CLIENT');
  const leads = allRecords.filter(r => r.status === 'LEAD');

  console.log(`Found ${buyers.length} buyers and ${leads.length} leads.`);

  const buyersByPhone = new Map<string, any>();
  const buyersByName = new Map<string, any>();

  for (const b of buyers) {
    if (b.phone) {
      const p = normalizePhone(b.phone);
      if (p.length >= 8) buyersByPhone.set(p, b);
    }
    if (b.name) {
      buyersByName.set(normalizeName(b.name), b);
    }
  }

  let matchCount = 0;
  const updates: any[] = [];
  const logLines: string[] = ['Lead_ID,Lead_Name,Lead_Phone,Matched_With_Buyer_ID,Buyer_Name'];

  for (const l of leads) {
    let matchedBuyer = null;

    if (l.phone) {
      const lp = normalizePhone(l.phone);
      if (lp.length >= 8 && buyersByPhone.has(lp)) {
        matchedBuyer = buyersByPhone.get(lp);
      }
    }

    if (!matchedBuyer && l.name) {
      const ln = normalizeName(l.name);
      if (buyersByName.has(ln)) {
        matchedBuyer = buyersByName.get(ln);
      }
    }

    if (matchedBuyer) {
      matchCount++;
      const currentTags = l.tags || [];
      if (!currentTags.includes('JA_CLIENTE')) {
        updates.push({
          id: l.id,
          tags: [...currentTags, 'JA_CLIENTE']
        });
      }
      logLines.push(`${l.id},"${l.name}",${l.phone},${matchedBuyer.id},"${matchedBuyer.name}"`);
    }
  }

  console.log(`Identified ${matchCount} leads that are already buyers.`);
  console.log(`Needs update: ${updates.length} leads.`);

  // Apply updates (in chunks if necessary)
  const chunkSize = 100;
  let updatedCount = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    for (const update of chunk) {
       const { error: updErr } = await supabase.from('clients').update({ tags: update.tags }).eq('id', update.id);
       if (updErr) {
         console.error(`Error updating lead ${update.id}:`, updErr);
       } else {
         updatedCount++;
       }
    }
  }
  
  console.log(`Successfully updated ${updatedCount} leads.`);

  // Write Report
  const reportPath = path.resolve(process.cwd(), 'scripts', 'reconciliation_report.csv');
  fs.writeFileSync(reportPath, logLines.join('\n'), 'utf-8');
  console.log(`Report written to ${reportPath}`);
}

run().catch(console.error);
