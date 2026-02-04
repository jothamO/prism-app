import dotenv from 'dotenv';
dotenv.config();

import { supabase } from './src/config/database';
import { heartbeatExtractorService } from './src/services/heartbeat-extractor.service';

async function runTest() {
    console.log('🧪 Starting Heartbeat Extraction Test...');
    const key = process.env.ANTHROPIC_API_KEY;
    console.log(`🔑 API Key loaded: ${key ? key.substring(0, 10) + '...' + key.substring(key.length - 4) : 'MISSING'}`);

    try {
        // 1. Find a test user or create one
        let { data: user } = await supabase.from('users').select('id, whatsapp_number').limit(1).single();

        if (!user) {
            console.log('⚠️ No user found. Creating test user...');
            const { data: newUser, error: createErr } = await supabase.from('users').insert({
                whatsapp_number: '+234' + Math.floor(Math.random() * 1000000000).toString().padStart(10, '0'),
                full_name: 'Heartbeat Test User',
                last_heartbeat_at: new Date(Date.now() - 86400000).toISOString() // 24 hours ago
            }).select('id, whatsapp_number').single();

            if (createErr) {
                console.error('❌ Failed to create test user:', createErr.message);
                return;
            }
            user = newUser;
            console.log(`✅ Created test user: ${user?.whatsapp_number} (${user?.id})`);
        } else {
            console.log(`👤 Using existing user: ${user.whatsapp_number} (${user.id})`);
        }

        // 2. Insert mock messages with tax facts
        console.log('📝 Inserting mock chat messages...');
        const mockMessages = [
            {
                user_id: user.id,
                direction: 'incoming',
                content: 'I just registered my business. The name is "Okafor Ventures" and my TIN is 98765432-0001.',
                created_at: new Date().toISOString()
            },
            {
                user_id: user.id,
                direction: 'incoming',
                content: 'We are located in Lagos state, specifically Ikeja LGA. We have 5 employees now.',
                created_at: new Date().toISOString()
            }
        ];

        const { error: msgError } = await supabase.from('messages').insert(mockMessages);
        if (msgError) throw msgError;

        // 3. Run heartbeat for this specific user
        console.log('💗 Running point heartbeat for user...');
        // We set lastHeartbeatAt to slightly before now to catch our new messages
        const slightlyBefore = new Date(Date.now() - 60000).toISOString();
        await heartbeatExtractorService.processUserHeartbeat(user.id, slightlyBefore);

        // 4. Verify facts in atomic_facts
        console.log('🧐 Verifying extracted facts...');
        const { data: facts, error: factError } = await supabase
            .from('atomic_facts')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_superseded', false);

        if (factError) throw factError;

        console.log(`✅ Extraction Complete. Found ${facts?.length || 0} active facts:`);
        facts?.forEach(f => {
            console.log(` - [${f.entity_name}]: ${JSON.stringify(f.fact_content)} (Confidence: ${f.confidence})`);
        });

        // 5. Test Supersession
        console.log('🔄 Testing Supersession (Updating TIN)...');
        await supabase.from('messages').insert({
            user_id: user.id,
            direction: 'incoming',
            content: 'Actually, I made a mistake. My corrected TIN is 11223344-5555.',
            created_at: new Date().toISOString()
        });

        await heartbeatExtractorService.processUserHeartbeat(user.id, new Date().toISOString());

        const { data: updatedFacts } = await supabase
            .from('atomic_facts')
            .select('*')
            .eq('user_id', user.id)
            .eq('entity_name', 'TIN')
            .order('created_at', { ascending: false });

        console.log('📋 TIN History:');
        updatedFacts?.forEach(f => {
            console.log(` - Value: ${f.fact_content} | Superseded: ${f.is_superseded} | Created: ${f.created_at}`);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

runTest();
