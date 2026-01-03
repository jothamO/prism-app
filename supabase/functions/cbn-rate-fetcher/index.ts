import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CBNRate {
  currency: string;
  buyingRate: number;
  centralRate: number;
  sellingRate: number;
  date: string;
}

function parseRatesFromHTML(html: string): CBNRate[] {
  const rates: CBNRate[] = [];
  
  // Parse the CBN rates table - they use a specific format
  // Look for table rows containing currency data
  const tableMatch = html.match(/<table[^>]*class="[^"]*datatable[^"]*"[^>]*>([\s\S]*?)<\/table>/i);
  
  if (!tableMatch) {
    console.log('No datatable found, trying alternative parsing...');
    // Alternative: look for any table with rate data
    const altMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/gi);
    if (altMatch) {
      for (const table of altMatch) {
        const parsed = parseTableRows(table);
        if (parsed.length > 0) {
          rates.push(...parsed);
          break;
        }
      }
    }
  } else {
    rates.push(...parseTableRows(tableMatch[1]));
  }
  
  return rates;
}

function parseTableRows(tableContent: string): CBNRate[] {
  const rates: CBNRate[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  // Match table rows
  const rowMatches = tableContent.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  
  for (const rowMatch of rowMatches) {
    const row = rowMatch[1];
    // Extract cell values
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => 
      m[1].replace(/<[^>]*>/g, '').trim()
    );
    
    if (cells.length >= 4) {
      // Look for currency codes (3 letters)
      const currencyMatch = cells[0].match(/^([A-Z]{3})$/);
      if (currencyMatch) {
        const buyingRate = parseFloat(cells[1]?.replace(/,/g, '') || '0');
        const centralRate = parseFloat(cells[2]?.replace(/,/g, '') || '0');
        const sellingRate = parseFloat(cells[3]?.replace(/,/g, '') || '0');
        
        if (centralRate > 0 || sellingRate > 0 || buyingRate > 0) {
          rates.push({
            currency: currencyMatch[1],
            buyingRate,
            centralRate,
            sellingRate: sellingRate || centralRate,
            date: today
          });
        }
      }
    }
  }
  
  // Also try to parse from structured data or API-like responses
  if (rates.length === 0) {
    // Look for USD specifically with rate patterns
    const usdPatterns = [
      /USD[^0-9]*([0-9,]+\.?[0-9]*)/i,
      /Dollar[^0-9]*([0-9,]+\.?[0-9]*)/i,
      /\$[^0-9]*([0-9,]+\.?[0-9]*)/i
    ];
    
    for (const pattern of usdPatterns) {
      const match = tableContent.match(pattern);
      if (match) {
        const rate = parseFloat(match[1].replace(/,/g, ''));
        if (rate > 100 && rate < 5000) { // Reasonable NGN/USD range
          rates.push({
            currency: 'USD',
            buyingRate: rate * 0.99,
            centralRate: rate,
            sellingRate: rate * 1.01,
            date: today
          });
          break;
        }
      }
    }
  }
  
  return rates;
}

async function fetchCBNRates(): Promise<{ rates: CBNRate[]; rawHtml?: string; error?: string }> {
  const CBN_URL = 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.html';
  
  try {
    console.log('Fetching CBN rates from:', CBN_URL);
    
    const response = await fetch(CBN_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('Received HTML length:', html.length);
    
    const rates = parseRatesFromHTML(html);
    console.log('Parsed rates:', rates);
    
    return { rates, rawHtml: html.substring(0, 5000) }; // Store first 5KB for debugging
  } catch (error) {
    console.error('Error fetching CBN rates:', error);
    return { rates: [], error: String(error) };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting CBN rate fetch...');
    
    const { rates, rawHtml, error } = await fetchCBNRates();
    const today = new Date().toISOString().split('T')[0];
    
    if (error || rates.length === 0) {
      // Log failure
      await supabase.from('cbn_rate_logs').insert({
        fetch_date: today,
        currencies_updated: 0,
        source: 'cbn_scrape',
        success: false,
        error_message: error || 'No rates parsed from HTML',
        raw_response: { html_preview: rawHtml?.substring(0, 2000) }
      });
      
      // Return existing rates as fallback
      const { data: existingRates } = await supabase
        .from('cbn_exchange_rates')
        .select('*')
        .order('rate_date', { ascending: false })
        .limit(10);
      
      return new Response(JSON.stringify({
        success: false,
        message: error || 'Failed to parse rates',
        fallback_rates: existingRates || []
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    // Upsert rates
    let updatedCount = 0;
    for (const rate of rates) {
      const { error: upsertError } = await supabase
        .from('cbn_exchange_rates')
        .upsert({
          currency: rate.currency,
          rate: rate.sellingRate || rate.centralRate, // Use selling rate as default
          rate_date: rate.date,
          source: 'cbn_scrape',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'currency,rate_date'
        });
      
      if (!upsertError) {
        updatedCount++;
      } else {
        console.error('Upsert error for', rate.currency, ':', upsertError);
      }
    }
    
    // Log success
    await supabase.from('cbn_rate_logs').insert({
      fetch_date: today,
      currencies_updated: updatedCount,
      source: 'cbn_scrape',
      success: true,
      raw_response: { 
        rates_found: rates.length,
        rates_updated: updatedCount,
        currencies: rates.map(r => r.currency)
      }
    });
    
    // Fetch updated rates to return
    const { data: currentRates } = await supabase
      .from('cbn_exchange_rates')
      .select('*')
      .eq('rate_date', today)
      .order('currency');
    
    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${updatedCount} exchange rates`,
      rates: currentRates || [],
      parsed_rates: rates
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});