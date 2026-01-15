import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


const MONO_BASE_URL = 'https://api.withmono.com/v3';

interface LookupRequest {
  type: 'nin' | 'tin' | 'cac' | 'cac_directors' | 'cac_shareholders' | 'bvn' | 'account';
  nin?: string;
  number?: string;
  channel?: 'tin' | 'cac';
  query?: string;
  companyId?: string;
  bvn?: string;
  accountNumber?: string;
  bankCode?: string;
}

async function makeMonoRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: object
): Promise<{ data?: any; error?: string; statusCode: number }> {
  const secretKey = Deno.env.get('MONO_SECRET_KEY');
  
  if (!secretKey) {
    return { error: 'MONO_SECRET_KEY not configured', statusCode: 500 };
  }

  const url = `${MONO_BASE_URL}${endpoint}`;
  const headers: HeadersInit = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'mono-sec-key': secretKey
  };

  const options: RequestInit = { method, headers };
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  console.log(`[MonoTest] ${method} ${endpoint}`);

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error(`[MonoTest] Error ${response.status}:`, data);
      return { 
        error: data.message || 'API request failed', 
        data,
        statusCode: response.status 
      };
    }

    console.log(`[MonoTest] Success`);
    return { data: data.data || data, statusCode: response.status };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[MonoTest] Network error:`, err);
    return { error: errorMessage, statusCode: 500 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: LookupRequest = await req.json();
    console.log(`[MonoTest] Request type: ${body.type}`);

    let result: { data?: any; error?: string; statusCode: number };

    switch (body.type) {
      case 'nin':
        if (!body.nin) {
          return new Response(
            JSON.stringify({ error: 'nin is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest('/lookup/nin', 'POST', { nin: body.nin });
        break;

      case 'tin':
        if (!body.number) {
          return new Response(
            JSON.stringify({ error: 'number is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest('/lookup/tin', 'POST', { 
          number: body.number, 
          channel: body.channel || 'tin' 
        });
        break;

      case 'cac':
        if (!body.query) {
          return new Response(
            JSON.stringify({ error: 'query is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest(`/lookup/cac?search=${encodeURIComponent(body.query)}`, 'GET');
        break;

      case 'cac_directors':
        if (!body.companyId) {
          return new Response(
            JSON.stringify({ error: 'companyId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest(`/lookup/cac/${body.companyId}/directors`, 'GET');
        break;

      case 'cac_shareholders':
        if (!body.companyId) {
          return new Response(
            JSON.stringify({ error: 'companyId is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest(`/lookup/cac/${body.companyId}/shareholders`, 'GET');
        break;

      case 'bvn':
        if (!body.bvn) {
          return new Response(
            JSON.stringify({ error: 'bvn is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest('/lookup/bvn/bank-accounts', 'POST', { bvn: body.bvn });
        break;

      case 'account':
        if (!body.accountNumber || !body.bankCode) {
          return new Response(
            JSON.stringify({ error: 'accountNumber and bankCode are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        result = await makeMonoRequest(
          `/lookup/account-number?account_number=${body.accountNumber}&bank_code=${body.bankCode}`,
          'GET'
        );
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown lookup type: ${body.type}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: result.statusCode, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MonoTest] Handler error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
