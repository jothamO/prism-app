import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VerifyRequest {
    type: 'nin' | 'bvn' | 'cac' | 'tin';
    identifier: string;
    nameToMatch?: string;
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 */
function calculateNameSimilarity(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;

    const str1 = s1.toUpperCase().trim();
    const str2 = s2.toUpperCase().trim();

    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
    const str1Matches = new Array(str1.length).fill(false);
    const str2Matches = new Array(str2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    // Find matches
    for (let i = 0; i < str1.length; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, str2.length);

        for (let j = start; j < end; j++) {
            if (str2Matches[j] || str1[i] !== str2[j]) continue;
            str1Matches[i] = true;
            str2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    // Count transpositions
    let k = 0;
    for (let i = 0; i < str1.length; i++) {
        if (!str1Matches[i]) continue;
        while (!str2Matches[k]) k++;
        if (str1[i] !== str2[k]) transpositions++;
        k++;
    }

    // Jaro similarity
    const jaro = (matches / str1.length + matches / str2.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler modification - boost for common prefix
    let prefix = 0;
    for (let i = 0; i < Math.min(4, str1.length, str2.length); i++) {
        if (str1[i] === str2[i]) prefix++;
        else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Verify identity document using Mono Lookup API
 */
async function verifyWithMono(type: string, identifier: string): Promise<{
    valid: boolean;
    data?: any;
    error?: string;
}> {
    const monoSecretKey = Deno.env.get('MONO_SECRET_KEY');

    if (!monoSecretKey) {
        console.log('[verify-identity] Mono not configured, using mock');
        return mockVerification(type, identifier);
    }

    try {
        let endpoint: string;
        let body: any;

        switch (type) {
            case 'nin':
                endpoint = 'https://api.withmono.com/v2/lookup/nin';
                body = { nin: identifier };
                break;
            case 'bvn':
                endpoint = 'https://api.withmono.com/v2/lookup/bvn';
                body = { bvn: identifier };
                break;
            case 'cac':
                endpoint = 'https://api.withmono.com/v2/lookup/cac';
                body = { rc_number: identifier };
                break;
            case 'tin':
                endpoint = 'https://api.withmono.com/v2/lookup/tin';
                body = { tin: identifier };
                break;
            default:
                return { valid: false, error: 'Invalid verification type' };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'mono-sec-key': monoSecretKey,
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return { valid: false, error: data.message || 'Verification failed' };
        }

        return { valid: true, data: data.data };
    } catch (error) {
        console.error('[verify-identity] Mono API error:', error);
        return { valid: false, error: 'Verification service unavailable' };
    }
}

/**
 * Mock verification for development/testing
 */
function mockVerification(type: string, identifier: string): { valid: boolean; data?: any; error?: string } {
    // Simulate validation
    if (identifier.length !== 11 && type !== 'cac' && type !== 'tin') {
        return { valid: false, error: `Invalid ${type.toUpperCase()} format` };
    }

    // Mock successful responses
    const mockData: Record<string, any> = {
        nin: {
            first_name: 'EUNICE',
            middle_name: 'BAYODE',
            last_name: 'ADEOLA',
            full_name: 'EUNICE BAYODE ADEOLA',
            date_of_birth: '1990-05-15',
            gender: 'Female',
        },
        bvn: {
            first_name: 'EUNICE',
            middle_name: 'BAYODE',
            last_name: 'ADEOLA',
            full_name: 'EUNICE BAYODE ADEOLA',
            phone_number: '+2348012345678',
        },
        cac: {
            company_name: 'TEKPOINT SOLUTIONS LIMITED',
            rc_number: identifier,
            status: 'Active',
            registration_date: '2019-03-15',
            directors: ['CHUKWUEMEKA OKONKWO'],
        },
        tin: {
            tax_id: identifier,
            name: 'TEKPOINT SOLUTIONS LIMITED',
            status: 'Active',
            vat_registered: true,
        },
    };

    return { valid: true, data: mockData[type] };
}

/**
 * Extract full name from Mono response
 */
function extractName(type: string, data: any): string {
    if (type === 'nin' || type === 'bvn') {
        return data.full_name || `${data.first_name} ${data.middle_name || ''} ${data.last_name}`.trim();
    }
    if (type === 'cac' || type === 'tin') {
        return data.company_name || data.name || '';
    }
    return '';
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body: VerifyRequest = await req.json();
        const { type, identifier, nameToMatch } = body;

        console.log(`[verify-identity] Verifying ${type}: ${identifier.substring(0, 4)}...`);

        if (!type || !identifier) {
            return new Response(
                JSON.stringify({ valid: false, error: 'Missing type or identifier' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate format
        if ((type === 'nin' || type === 'bvn') && identifier.length !== 11) {
            return new Response(
                JSON.stringify({ valid: false, error: `${type.toUpperCase()} must be 11 digits` }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Call Mono API
        const result = await verifyWithMono(type, identifier);

        if (!result.valid) {
            return new Response(
                JSON.stringify({ valid: false, error: result.error }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Extract verified name
        const verifiedName = extractName(type, result.data);

        // Calculate name match if requested
        let nameMatch = true;
        let similarity = 1;

        if (nameToMatch && verifiedName) {
            similarity = calculateNameSimilarity(nameToMatch, verifiedName);
            nameMatch = similarity >= 0.7; // 70% threshold
        }

        console.log(`[verify-identity] Verified: ${verifiedName}, similarity: ${similarity}`);

        return new Response(
            JSON.stringify({
                valid: true,
                verifiedName,
                nameMatch,
                similarity,
                data: result.data,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('[verify-identity] Error:', error);
        return new Response(
            JSON.stringify({ valid: false, error: 'Verification service error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
