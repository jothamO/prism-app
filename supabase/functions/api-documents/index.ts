/**
 * API Document Upload Handler
 * Handles document uploads via API with tier enforcement
 * Business+ tiers only
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type',
};

interface APIKey {
    id: string;
    user_id: string;
    tier: string;
    can_access_documents: boolean;
    can_access_ocr: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Validate API key
        const apiKeyHeader = req.headers.get('x-api-key') ||
            req.headers.get('authorization')?.replace('Bearer ', '');

        if (!apiKeyHeader) {
            return jsonResponse({ error: 'API key required' }, 401);
        }

        const keyHash = await hashKey(apiKeyHeader);
        const { data: apiKey } = await supabase
            .from('api_keys')
            .select('id, user_id, tier, can_access_documents, can_access_ocr')
            .eq('key_hash', keyHash)
            .eq('is_active', true)
            .single();

        if (!apiKey) {
            return jsonResponse({ error: 'Invalid API key' }, 401);
        }

        if (!apiKey.can_access_documents) {
            return jsonResponse({
                error: 'Document API requires Business tier or higher',
                code: 'TIER_REQUIRED',
                required_tier: 'business',
                upgrade_url: 'https://prism.ng/developers/upgrade'
            }, 403);
        }

        const url = new URL(req.url);
        const path = url.pathname;

        // POST /api/v1/documents/upload
        if (req.method === 'POST' && path.endsWith('/upload')) {
            return await handleUpload(req, supabase, apiKey);
        }

        // GET /api/v1/documents/:id
        if (req.method === 'GET' && path.includes('/documents/')) {
            const docId = path.split('/').pop();
            return await handleGetDocument(docId!, supabase, apiKey);
        }

        // GET /api/v1/documents/:id/transactions
        if (req.method === 'GET' && path.includes('/transactions')) {
            const docId = path.split('/')[4]; // /api/v1/documents/{id}/transactions
            return await handleGetTransactions(docId, supabase, apiKey);
        }

        return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
        console.error('[API Documents] Error:', error);
        return jsonResponse({ error: 'Internal server error' }, 500);
    }
});

/**
 * Handle document upload
 */
async function handleUpload(
    req: Request,
    supabase: any,
    apiKey: APIKey
): Promise<Response> {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const docType = formData.get('type') as string || 'auto';
    const webhookUrl = formData.get('webhook_url') as string;

    if (!file) {
        return jsonResponse({ error: 'No file provided' }, 400);
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        return jsonResponse({
            error: 'Invalid file type',
            allowed: allowedTypes
        }, 400);
    }

    // Size limit: 10MB
    if (file.size > 10 * 1024 * 1024) {
        return jsonResponse({
            error: 'File too large',
            max_size: '10MB'
        }, 400);
    }

    // Generate unique filename
    const ext = file.name.split('.').pop();
    const filename = `api/${apiKey.user_id}/${Date.now()}.${ext}`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filename, file, { contentType: file.type });

    if (uploadError) {
        return jsonResponse({ error: 'Upload failed' }, 500);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filename);

    // Create processing job
    const jobId = crypto.randomUUID();
    const { error: jobError } = await supabase
        .from('document_processing_jobs')
        .insert({
            id: jobId,
            user_id: apiKey.user_id,
            api_key_id: apiKey.id,
            file_url: urlData.publicUrl,
            file_type: file.type,
            document_type: docType,
            status: 'pending',
            webhook_url: webhookUrl,
        });

    if (jobError) {
        console.error('[API Documents] Job creation failed:', jobError);
    }

    return jsonResponse({
        success: true,
        job_id: jobId,
        status: 'pending',
        message: 'Document queued for processing',
        estimated_time_seconds: 30,
        status_url: `/api/v1/documents/${jobId}`,
        webhook_configured: !!webhookUrl
    }, 202);
}

/**
 * Get document processing status
 */
async function handleGetDocument(
    docId: string,
    supabase: any,
    apiKey: APIKey
): Promise<Response> {
    const { data: job, error } = await supabase
        .from('document_processing_jobs')
        .select('id, status, document_type, result, error, created_at, completed_at')
        .eq('id', docId)
        .eq('api_key_id', apiKey.id)
        .single();

    if (error || !job) {
        return jsonResponse({ error: 'Document not found' }, 404);
    }

    return jsonResponse({
        success: true,
        data: {
            job_id: job.id,
            status: job.status,
            document_type: job.document_type,
            result: job.result,
            error: job.error,
            created_at: job.created_at,
            completed_at: job.completed_at
        }
    }, 200);
}

/**
 * Get extracted transactions from document
 */
async function handleGetTransactions(
    docId: string,
    supabase: any,
    apiKey: APIKey
): Promise<Response> {
    const { data: job } = await supabase
        .from('document_processing_jobs')
        .select('id, status, result')
        .eq('id', docId)
        .eq('api_key_id', apiKey.id)
        .single();

    if (!job) {
        return jsonResponse({ error: 'Document not found' }, 404);
    }

    if (job.status !== 'completed') {
        return jsonResponse({
            error: 'Document not yet processed',
            status: job.status
        }, 400);
    }

    const transactions = job.result?.transactions || [];

    return jsonResponse({
        success: true,
        data: {
            job_id: job.id,
            transaction_count: transactions.length,
            transactions
        }
    }, 200);
}

/**
 * Hash API key
 */
async function hashKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * JSON response helper
 */
function jsonResponse(data: any, status: number): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
