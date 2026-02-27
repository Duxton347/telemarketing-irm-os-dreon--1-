
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Construct connection string for Postgres
// Supabase connection string usually is: postgres://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
// However, the .env usually has DATABASE_URL or we need to construct it.
// The user provided VITE_SUPABASE_URL which is the REST API URL (https://[project-ref].supabase.co).
// We might not have the DB password in .env if it's a client-side app.
// Let's check .env content first.

const dbUrl = process.env.DATABASE_URL;

async function run() {
    if (!dbUrl) {
        console.error("DATABASE_URL not found in .env. Cannot run migration directly via pg.");
        console.log("Please run the SQL manually in Supabase Dashboard.");
        process.exit(1);
    }

    const client = new Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connected to database.");

        const sql = fs.readFileSync(path.resolve(__dirname, 'migrations_prospects.sql'), 'utf8');
        console.log("Executing migration...");

        await client.query(sql);
        console.log("Migration applied successfully!");

    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

run();
