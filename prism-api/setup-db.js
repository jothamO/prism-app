// setup-db.js – Re‑creates the temporary DB setup script that was removed after the initial run.
// This script connects to the PostgreSQL database (using env vars) and runs the schema SQL.
// Adjust the connection details in the .env file if needed.

import { Client } from 'pg';
import fs from 'fs';
import path from 'path';

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        await client.connect();
        const schemaPath = path.resolve(__dirname, 'schema.sql');
        const sql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(sql);
        console.log('Database schema applied successfully.');
    } catch (err) {
        console.error('Error applying schema:', err);
    } finally {
        await client.end();
    }
}

run();
