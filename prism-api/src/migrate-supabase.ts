/**
 * PRISM Supabase Migration Script
 * Migrates schema and data from Lovable-hosted Supabase to self-hosted instance
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// OLD (Lovable) Supabase - Source
const OLD_SUPABASE_URL = 'https://rjajxabpndmpcgssymxw.supabase.co';
const OLD_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJqYWp4YWJwbmRtcGNnc3N5bXh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NjYzNzgsImV4cCI6MjA4MjM0MjM3OH0.FiMP1k2n9GyU89B0nt-7wZyseMHROfnUSsyHPxN1Q6c';

// NEW (Self-hosted) Supabase - Target
const NEW_SUPABASE_URL = 'https://mgozsryewbirhxjpcuvy.supabase.co';
const NEW_SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nb3pzcnlld2Jpcmh4anBjdXZ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTk4MjAyNCwiZXhwIjoyMDg1NTU4MDI0fQ._qjaLIvB7GhLTCRAUHQRNlfkpO2qRkiKYPh35z3Qg1c';

// Direct Postgres connection to NEW instance
const NEW_PG_CONNECTION = 'postgresql://postgres:aDsB2svv-5hyQfs%25@db.mgozsryewbirhxjpcuvy.supabase.co:5432/postgres';

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_ANON_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);

// Tables to migrate in dependency order (parents before children)
const TABLES_TO_MIGRATE = [
    'compliance_rules',
    'tax_deadlines',
    'tax_brackets',
    'compliance_automations',
    'historical_tax_rules',
    'user_tax_profiles',
    'user_preferences',
    'remembered_facts',
    'chat_messages',
    'bank_transactions',
    'invoices',
    'projects',
    'project_transactions',
    'filings',
    'inventory_items',
    'inventory_transactions',
    'analytics_events',
    'calculation_logs',
];

async function runMigrations(pgClient: Client): Promise<void> {
    // Path relative to prism-api/src
    const migrationsDir = path.join(process.cwd(), '..', 'supabase', 'migrations');

    if (!fs.existsSync(migrationsDir)) {
        console.error(`❌ Migrations directory not found at: ${migrationsDir}`);
        return;
    }

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log(`📁 Found ${files.length} migration files`);

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        console.log(`🔄 Running: ${file}`);
        try {
            await pgClient.query(sql);
            console.log(`✅ Success: ${file}`);
        } catch (error: any) {
            if (error.message.includes('already exists') ||
                error.message.includes('does not exist') ||
                error.message.includes('duplicate key')) {
                console.log(`⚠️ Skipped: ${file}`);
            } else {
                console.error(`❌ Failed: ${file}`, error.message);
            }
        }
    }
}

async function migrateTable(tableName: string): Promise<number> {
    console.log(`\n📊 Migrating table: ${tableName}`);
    try {
        const { data, error } = await oldSupabase.from(tableName).select('*');
        if (error) {
            console.log(`⚠️ Cannot read ${tableName}: ${error.message}`);
            return 0;
        }
        if (!data || data.length === 0) {
            console.log(`📭 No data in ${tableName}`);
            return 0;
        }
        console.log(`📥 Fetched ${data.length} rows`);

        const { error: insertError } = await newSupabase.from(tableName).upsert(data);
        if (insertError) {
            console.log(`⚠️ Insert error for ${tableName}: ${insertError.message}`);
            return 0;
        }
        console.log(`✅ Migrated ${data.length} rows`);
        return data.length;
    } catch (err: any) {
        console.log(`❌ Error: ${err.message}`);
        return 0;
    }
}

async function main() {
    console.log('🚀 PRISM Supabase Migration Start');
    console.log('📡 Step 1: Connecting to new Supabase Postgres (with SSL)...');
    const pgClient = new Client({
        connectionString: NEW_PG_CONNECTION,
        ssl: { rejectUnauthorized: false } // Required for Supabase
    });

    try {
        await pgClient.connect();
        console.log('✅ Connected to PG\n');
        await runMigrations(pgClient);
    } catch (err: any) {
        console.error('❌ PG failed:', err.message);
    } finally {
        await pgClient.end();
    }

    console.log('\n📦 Data syncing...');
    let totalRows = 0;
    for (const table of TABLES_TO_MIGRATE) {
        totalRows += await migrateTable(table);
    }
    console.log(`\n✅ Finished. Total rows: ${totalRows}`);
}

main().catch(console.error);
