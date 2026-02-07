/**
 * Heartbeat Verification Test
 */

import { heartbeatExtractor } from '../src/agent-core/heartbeat-extractor';
import { MemoryManager } from '../src/agent-core/memory-manager';
import { supabase } from '../src/config';

async function verifyHeartbeat() {
    console.log('--- Heartbeat Extraction Verification ---');
    const user_id = '00000000-0000-0000-0000-000000000000'; // Sample test user

    // 1. Insert mock messages
    console.log('1. Inserting mock messages...');
    await supabase.from('messages').insert([
        {
            user_id,
            direction: 'incoming',
            content: 'My business "TechGenius" is registered with CAC and our TIN is 12345678-0001. We operate out of Yaba, Lagos.',
            created_at: new Date().toISOString()
        }
    ]);

    // 2. Run extractor
    console.log('2. Running Heartbeat Extractor...');
    await heartbeatExtractor.processUserHeartbeat(user_id, null);

    // 3. Verify Facts
    console.log('3. Verifying facts in PARA memory...');
    const facts = await MemoryManager.getActiveFacts(user_id);
    console.log('Found Facts:', facts.length);
    facts.forEach(f => {
        console.log(` - [${f.entity_name}]: ${JSON.stringify(f.fact_content)} (${f.layer})`);
    });

    if (facts.some(f => f.entity_name === 'TIN' || f.entity_name === 'Business Name')) {
        console.log('✓ SUCCESS: Heartbeat correctly extracted facts and stored them in PARA memory.');
    } else {
        console.warn('⚠ WARNING: Extraction results were unexpected. Check AI response logs.');
    }
}

verifyHeartbeat().catch(err => {
    console.error('Verification failed:', err);
    process.exit(1);
});
