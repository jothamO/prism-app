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

// Try multiple CBN endpoints
async function fetchFromCBNAPI(): Promise<CBNRate[]> {
  const endpoints = [
    'https://www.cbn.gov.ng/rates/ExchRateByCurrency.asp',
    'https://www.cbn.gov.ng/Functions/ExportRates.asp',
  ];
  
  for (const endpoint of endpoints) {
    try {
      console.log('Trying CBN endpoint:', endpoint);
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/html, */*',
        }
      });
      
      if (!response.ok) {
        console.log(`Endpoint ${endpoint} returned status ${response.status}`);
        continue;
      }
      
      const contentType = response.headers.get('content-type');
      
      // Try JSON first
      if (contentType?.includes('json')) {
        const data = await response.json();
        const rates = parseJSONRates(data);
        if (rates.length > 0) return rates;
      } else {
        // Try HTML
        const html = await response.text();
        const rates = parseHTMLRates(html);
        if (rates.length > 0) return rates;
      }
    } catch (error) {
      console.error(`Failed to fetch from ${endpoint}:`, error);
    }
  }
  
  return [];
}

function parseJSONRates(data: any): CBNRate[] {
  const rates: CBNRate[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Handle different JSON structures
    const ratesArray = Array.isArray(data) ? data : 
                      data.rates ? data.rates : 
                      data.data ? data.data : [];
    
    for (const item of ratesArray) {
      if (item.currency && (item.rate || item.sellingRate || item.centralRate)) {
        const rate = parseFloat(item.centralRate || item.central || item.rate || '0');
        // Validate rate is reasonable for NGN (between 100 and 5000)
        if (rate > 100 && rate < 5000) {
          rates.push({
            currency: item.currency.toUpperCase(),
            buyingRate: parseFloat(item.buyingRate || item.buying || String(rate * 0.995)),
            centralRate: rate,
            sellingRate: parseFloat(item.sellingRate || item.selling || String(rate * 1.005)),
            date: item.date || today
          });
        }
      }
    }
  } catch (error) {
    console.error('Error parsing JSON rates:', error);
  }
  
  return rates;
}

function parseHTMLRates(html: string): CBNRate[] {
  const rates: CBNRate[] = [];
  const today = new Date().toISOString().split('T')[0];
  
  // Look for table rows with currency data
  const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
  
  let rowMatch;
  while ((rowMatch = rowPattern.exec(html)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    
    const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellText = cellMatch[1]
        .replace(/<[^>]+>/g, '') // Remove nested tags
        .trim();
      cells.push(cellText);
    }
    
    // Need at least 4 cells: Currency, Buying, Central, Selling
    if (cells.length >= 4) {
      const currencyMatch = cells[0].match(/^([A-Z]{3})$/);
      if (currencyMatch) {
        const currency = currencyMatch[1];
        const buying = parseFloat(cells[1].replace(/[^0-9.]/g, ''));
        const central = parseFloat(cells[2].replace(/[^0-9.]/g, ''));
        const selling = parseFloat(cells[3].replace(/[^0-9.]/g, ''));
        
        // Validate rate is reasonable for NGN
        if (central > 100 && central < 5000) {
          rates.push({
            currency,
            buyingRate: buying || central * 0.995,
            centralRate: central,
            sellingRate: selling || central * 1.005,
            date: today
          });
        }
      }
    }
  }
  
  return rates;
}

// Alternative: Use external API with exchange rate data
async function fetchFromThirdPartyAPI(): Promise<CBNRate[]> {
  const today = new Date().toISOString().split('T')[0];
  
  // Try free exchange rate APIs
  const apis = [
    {
      name: 'Open Exchange Rates (free)',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse: (data: any) => {
        const rates: CBNRate[] = [];
        if (data.rates && data.rates.NGN) {
          const ngnPerUsd = data.rates.NGN;
          // Add major currencies
          const currencies = ['USD', 'GBP', 'EUR', 'CAD', 'CHF', 'JPY', 'CNY'];
          for (const curr of currencies) {
            if (curr === 'USD') {
              rates.push({
                currency: 'USD',
                buyingRate: ngnPerUsd * 0.995,
                centralRate: ngnPerUsd,
                sellingRate: ngnPerUsd * 1.005,
                date: today
              });
            } else if (data.rates[curr]) {
              const currPerUsd = data.rates[curr];
              const ngnPerCurr = ngnPerUsd / currPerUsd;
              rates.push({
                currency: curr,
                buyingRate: ngnPerCurr * 0.995,
                centralRate: ngnPerCurr,
                sellingRate: ngnPerCurr * 1.005,
                date: today
              });
            }
          }
        }
        return rates;
      }
    }
  ];
  
  for (const api of apis) {
    try {
      console.log(`Trying ${api.name}...`);
      const response = await fetch(api.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });
      if (response.ok) {
        const data = await response.json();
        const rates = api.parse(data);
        if (rates.length > 0) {
          console.log(`Successfully got ${rates.length} rates from ${api.name}`);
          return rates;
        }
      }
    } catch (error) {
      console.error(`${api.name} failed:`, error);
    }
  }
  
  return [];
}

// Manual fallback rates (updated periodically)
function getFallbackRates(): CBNRate[] {
  const today = new Date().toISOString().split('T')[0];
  
  // These should be updated manually as a last resort
  return [
    { currency: 'USD', buyingRate: 1490, centralRate: 1500, sellingRate: 1510, date: today },
    { currency: 'GBP', buyingRate: 1890, centralRate: 1900, sellingRate: 1910, date: today },
    { currency: 'EUR', buyingRate: 1640, centralRate: 1650, sellingRate: 1660, date: today },
    { currency: 'CAD', buyingRate: 1050, centralRate: 1060, sellingRate: 1070, date: today },
    { currency: 'CHF', buyingRate: 1680, centralRate: 1690, sellingRate: 1700, date: today },
  ];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting CBN rate fetch cascade...');
    const today = new Date().toISOString().split('T')[0];
    
    let rates: CBNRate[] = [];
    let source = '';
    let errorMessages: string[] = [];
    
    // Try sources in order of preference
    // 1. CBN Official
    console.log('Step 1: Trying CBN official endpoints...');
    rates = await fetchFromCBNAPI();
    if (rates.length > 0) {
      source = 'cbn_official';
      console.log(`Got ${rates.length} rates from CBN official`);
    } else {
      errorMessages.push('CBN official endpoints failed');
      
      // 2. Third-party APIs
      console.log('Step 2: Trying third-party APIs...');
      rates = await fetchFromThirdPartyAPI();
      if (rates.length > 0) {
        source = 'third_party_api';
        console.log(`Got ${rates.length} rates from third-party API`);
      } else {
        errorMessages.push('Third-party APIs failed');
        
        // 3. Check database for recent rates (within 24 hours)
        console.log('Step 3: Checking database cache...');
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data: recentRates } = await supabase
          .from('cbn_exchange_rates')
          .select('*')
          .gte('rate_date', yesterday)
          .order('rate_date', { ascending: false });
        
        if (recentRates && recentRates.length > 0) {
          console.log(`Found ${recentRates.length} cached rates from database`);
          source = 'database_cache';
          rates = recentRates.map(r => ({
            currency: r.currency,
            buyingRate: r.rate * 0.995,
            centralRate: r.rate,
            sellingRate: r.rate * 1.005,
            date: today
          }));
        } else {
          errorMessages.push('No recent database cache');
          
          // 4. Use hardcoded fallback
          console.log('Step 4: Using fallback rates');
          rates = getFallbackRates();
          source = 'fallback';
        }
      }
    }
    
    const errorMessage = errorMessages.length > 0 ? errorMessages.join('; ') : null;
    
    // Log the attempt
    await supabase.from('cbn_rate_logs').insert({
      fetch_date: today,
      currencies_updated: rates.length,
      source,
      success: rates.length > 0,
      error_message: errorMessage,
      raw_response: {
        rates_found: rates.length,
        currencies: rates.map(r => r.currency),
        source,
        errors: errorMessages
      }
    });
    
    if (rates.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to fetch rates from all sources',
        error: errorMessage
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      });
    }
    
    // Upsert rates - use the selling rate as the main rate (most commonly used)
    let updatedCount = 0;
    for (const rate of rates) {
      const { error: upsertError } = await supabase
        .from('cbn_exchange_rates')
        .upsert({
          currency: rate.currency,
          rate: rate.sellingRate, // Use selling rate as the main rate
          rate_date: rate.date,
          source,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'currency,rate_date'
        });
      
      if (!upsertError) {
        updatedCount++;
      } else {
        console.error(`Failed to upsert ${rate.currency}:`, upsertError);
      }
    }
    
    // Fetch current rates to return
    const { data: currentRates } = await supabase
      .from('cbn_exchange_rates')
      .select('*')
      .eq('rate_date', today)
      .order('currency');
    
    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${updatedCount} rates from ${source}`,
      rates: currentRates || [],
      source,
      warning: source !== 'cbn_official' ? `Using ${source} instead of official CBN data` : null
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Critical error in CBN rate fetcher:', error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
