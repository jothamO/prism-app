#!/usr/bin/env node
/**
 * Script to update edge functions to use shared CORS utilities
 * Run: node update-cors-imports.mjs
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const FUNCTIONS_DIR = './supabase/functions';
const SHARED_DIR = '_shared';

// The pattern to find and replace
const OLD_PATTERNS = [
    /const corsHeaders = \{[\s\S]*?'Access-Control-Allow-Origin'[\s\S]*?\};?\r?\n/g,
];

const IMPORT_LINE = `import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";`;

function processFile(filePath) {
    let content = readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // Skip if already has the import
    if (content.includes('from "../_shared/cors.ts"') || content.includes("from '../_shared/cors.ts'")) {
        console.log(`✓ Already updated: ${filePath}`);
        return false;
    }

    // Skip _shared folder
    if (filePath.includes('_shared')) {
        return false;
    }

    let updated = false;

    // Remove inline corsHeaders definition
    for (const pattern of OLD_PATTERNS) {
        if (pattern.test(content)) {
            content = content.replace(pattern, '');
            updated = true;
        }
    }

    // Add import after other imports
    if (updated) {
        // Find the last import statement
        const importMatch = content.match(/^(import .*?from .*?['"].*?['"];?\r?\n)+/m);
        if (importMatch) {
            const lastImportEnd = importMatch.index + importMatch[0].length;
            content = content.slice(0, lastImportEnd) + IMPORT_LINE + '\n' + content.slice(lastImportEnd);
        } else {
            // No imports found, add at the top
            content = IMPORT_LINE + '\n' + content;
        }

        writeFileSync(filePath, content, 'utf-8');
        console.log(`✓ Updated: ${filePath}`);
        return true;
    }

    return false;
}

function main() {
    const functionsDir = FUNCTIONS_DIR;
    const dirs = readdirSync(functionsDir);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const dir of dirs) {
        const fullPath = join(functionsDir, dir);
        if (!statSync(fullPath).isDirectory()) continue;
        if (dir === SHARED_DIR) continue;

        const indexPath = join(fullPath, 'index.ts');
        try {
            if (statSync(indexPath).isFile()) {
                if (processFile(indexPath)) {
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            }
        } catch (e) {
            // No index.ts file
        }
    }

    console.log(`\nDone! Updated ${updatedCount} files, skipped ${skippedCount}`);
}

main();
