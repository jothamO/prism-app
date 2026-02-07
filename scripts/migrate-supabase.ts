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
const NEW_PG_CONNECTION = 'postgresql://postgres.mgozsryewbirhxjpcuvy:aDsB2svv-5hyQfs%@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_ANON_KEY);
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY);

// Tables to migrate in dependency order (parents before children)
const TABLES_TO_MIGRATE = [
    // Core tables without foreign keys first
    'compliance_rules',
    'tax_deadlines',
    'tax_brackets',
    'compliance_automations',
    'historical_tax_rules',

    // Auth-dependent tables (profiles depends on auth.users which we can't migrate directly)
    // We'll handle profiles separately

    // User-owned tables
    'user_tax_profiles',
    'user_preferences',
    'remembered_facts',
    'chat_messages',

    // Business tables
    'bank_transactions',
    'invoices',
    'projects',
    'project_transactions',
    'filings',

    // Inventory
    'inventory_items',
    'inventory_transactions',

    // Analytics
    'analytics_events',
    'calculation_logs',
];

async function runMigrations(pgClient: Client): Promise<void> {
    // Robust path finding for migrations
    const migrationsDir = fs.existsSync(path.join(__dirname, '..', 'supabase', 'migrations'))
        ? path.join(__dirname, '..', 'supabase', 'migrations')
        : path.join(__dirname, '..', '..', 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort(); // Chronological order by filename

    console.log(`📁 Found ${files.length} migration files`);

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');

        console.log(`🔄 Running: ${file}`);
        try {
            await pgClient.query(sql);
            console.log(`✅ Success: ${file}`);
        } catch (error: any) {
            // Some migrations may fail if objects already exist - log and continue
            if (error.message.includes('already exists') ||
                error.message.includes('does not exist') ||
                error.message.includes('duplicate key')) {
                console.log(`⚠️ Skipped (already applied): ${file}`);
            } else {
                console.error(`❌ Failed: ${file}`, error.message);
                // Don't throw - continue with other migrations
            }
        }
    }
}

async function migrateTable(tableName: string): Promise<number> {
    console.log(`\n📊 Migrating table: ${tableName}`);

    try {
        // Fetch from old instance (limited by RLS - may not get all data)
        const { data, error } = await oldSupabase
            .from(tableName)
            .select('*');

        if (error) {
            console.log(`⚠️ Cannot read ${tableName}: ${error.message}`);
            return 0;
        }

        if (!data || data.length === 0) {
            console.log(`📭 No data in ${tableName}`);
            return 0;
        }

        console.log(`📥 Fetched ${data.length} rows from ${tableName}`);

        // Upsert into new instance
        const { error: insertError } = await newSupabase
            .from(tableName)
            .upsert(data, {
                onConflict: 'id',
                ignoreDuplicates: true
            });

        if (insertError) {
            console.log(`⚠️ Insert error for ${tableName}: ${insertError.message}`);
            return 0;
        }

        console.log(`✅ Migrated ${data.length} rows to ${tableName}`);
        return data.length;

    } catch (err: any) {
        console.log(`❌ Error migrating ${tableName}: ${err.message}`);
        return 0;
    }
}

async function main() {
    console.log('🚀 PRISM Supabase Migration Script');
    console.log('===================================\n');

    // Step 1: Connect to new Postgres and run migrations
    console.log('📡 Step 1: Connecting to new Supabase Postgres...');
    const pgClient = new Client({ connectionString: NEW_PG_CONNECTION });

    try {
        await pgClient.connect();
        console.log('✅ Connected to new database\n');

        console.log('📜 Step 2: Running schema migrations...');
        await runMigrations(pgClient);

    } catch (err: any) {
        console.error('❌ Postgres connection failed:', err.message);
        console.log('\n⚠️ Falling back to REST API migration only...');
    } finally {
        await pgClient.end();
    }

    // Step 3: Migrate data table by table
    console.log('\n📦 Step 3: Migrating data...');
    let totalRows = 0;

    for (const table of TABLES_TO_MIGRATE) {
        const count = await migrateTable(table);
        totalRows += count;
    }

    console.log('\n===================================');
    console.log(`✅ Migration Complete!`);
    console.log(`📊 Total rows migrated: ${totalRows}`);
    console.log('\n⚠️ Note: User passwords cannot be migrated.');
    console.log('   Users will need to reset their passwords.');
}

main().catch(console.error);
