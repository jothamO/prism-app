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

// Map full currency names from CBN to ISO codes
const CURRENCY_MAP: Record<string, string> = {
  'US DOLLAR': 'USD',
  'POUNDS STERLING': 'GBP',
  'EURO': 'EUR',
  'SWISS FRANC': 'CHF',
  'YEN': 'JPY',
  'YUAN/RENMINBI': 'CNY',
  'SOUTH AFRICAN RAND': 'ZAR',
  'RIYAL': 'SAR',
  'DANISH KRONA': 'DKK',
  'CFA': 'XOF',
  'SDR': 'XDR',
  'WAUA': 'XWA',
};

// Use Firecrawl to scrape the official CBN exchange rates page
async function fetchFromCBNWithFirecrawl(): Promise<{ rates: CBNRate[]; rawHtml?: string }> {
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlApiKey) {
    console.error('FIRECRAWL_API_KEY not configured');
    return { rates: [] };
  }

  try {
    console.log('Fetching CBN rates using Firecrawl...');
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.asp',
        formats: ['html'],
        waitFor: 5000, // Wait 5 seconds for Kendo grid to load
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Firecrawl API error:', response.status, errorText);
      return { rates: [] };
    }

    const data = await response.json();
    const html = data.data?.html || data.html || '';
    
    if (!html) {
      console.error('No HTML content received from Firecrawl');
      return { rates: [] };
    }

    console.log('Received HTML from Firecrawl, length:', html.length);
    
    // Parse the Kendo grid table
    const rates = parseKendoGridRates(html);
    
    return { rates, rawHtml: html.substring(0, 2000) }; // Store first 2000 chars for debugging
    
  } catch (error) {
    console.error('Firecrawl fetch error:', error);
    return { rates: [] };
  }
}

// Parse rates from the Kendo UI grid HTML structure
function parseKendoGridRates(html: string): CBNRate[] {
  const rates: CBNRate[] = [];
  
  // The Kendo grid renders rows with class "k-table-row" or "k-master-row"
  // Each row has: Currency Name | Date | Buying Rate | Central Rate | Selling Rate
  
  // Look for table rows in the Kendo grid
  const rowPatterns = [
    /<tr[^>]*class="[^"]*k-(?:table-row|master-row)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi, // Fallback to all table rows
  ];
  
  for (const rowPattern of rowPatterns) {
    let rowMatch;
    rowPattern.lastIndex = 0;
    
    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowContent = rowMatch[1];
      const cells: string[] = [];
      
      // Extract cell contents - handle both td and th
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        // Clean the cell content - remove tags and trim
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        cells.push(cellText);
      }
      
      // We expect 5 cells: Currency Name, Date, Buying, Central, Selling
      if (cells.length >= 5) {
        const currencyName = cells[0].toUpperCase().trim();
        const isoCode = CURRENCY_MAP[currencyName];
        
        if (isoCode) {
          const dateStr = cells[1].trim();
          const buying = parseFloat(cells[2].replace(/[^0-9.]/g, ''));
          const central = parseFloat(cells[3].replace(/[^0-9.]/g, ''));
          const selling = parseFloat(cells[4].replace(/[^0-9.]/g, ''));
          
          // Validate rates are reasonable for NGN (between 1 and 10000)
          if (central > 1 && central < 10000 && !isNaN(central)) {
            // Parse the date - format is typically "2026-01-02" or "1/2/2026"
            let rateDate = new Date().toISOString().split('T')[0];
            
            // Try to parse the date from the cell
            if (dateStr) {
              const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (dateMatch) {
                rateDate = dateStr;
              } else {
                // Try other date formats
                const parsedDate = new Date(dateStr);
                if (!isNaN(parsedDate.getTime())) {
                  rateDate = parsedDate.toISOString().split('T')[0];
                }
              }
            }
            
            rates.push({
              currency: isoCode,
              buyingRate: buying || central * 0.995,
              centralRate: central,
              sellingRate: selling || central * 1.005,
              date: rateDate,
            });
            
            console.log(`Parsed rate: ${currencyName} (${isoCode}) = ${central}`);
          }
        }
      }
    }
    
    // If we found rates, stop trying other patterns
    if (rates.length > 0) {
      break;
    }
  }
  
  console.log(`Total rates parsed: ${rates.length}`);
  return rates;
}

// Manual fallback rates (updated periodically)
function getFallbackRates(): CBNRate[] {
  const today = new Date().toISOString().split('T')[0];
  
  // Fallback rates - should be updated manually as a last resort
  return [
    { currency: 'USD', buyingRate: 1429.85, centralRate: 1430.35, sellingRate: 1430.85, date: today },
    { currency: 'GBP', buyingRate: 1803.06, centralRate: 1803.56, sellingRate: 1804.06, date: today },
    { currency: 'EUR', buyingRate: 1479.51, centralRate: 1480.01, sellingRate: 1480.51, date: today },
    { currency: 'CHF', buyingRate: 1588.18, centralRate: 1588.68, sellingRate: 1589.18, date: today },
    { currency: 'JPY', buyingRate: 9.06, centralRate: 9.07, sellingRate: 9.08, date: today },
    { currency: 'CNY', buyingRate: 195.65, centralRate: 195.75, sellingRate: 195.85, date: today },
    { currency: 'ZAR', buyingRate: 77.64, centralRate: 77.74, sellingRate: 77.84, date: today },
    { currency: 'SAR', buyingRate: 381.21, centralRate: 381.31, sellingRate: 381.41, date: today },
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

    console.log('Starting CBN rate fetch with Firecrawl...');
    const today = new Date().toISOString().split('T')[0];
    
    let rates: CBNRate[] = [];
    let source = '';
    let errorMessages: string[] = [];
    let rawResponse: Record<string, unknown> = {};
    
    // Step 1: Try Firecrawl to scrape official CBN page
    console.log('Step 1: Fetching from CBN via Firecrawl...');
    const firecrawlResult = await fetchFromCBNWithFirecrawl();
    
    if (firecrawlResult.rates.length > 0) {
      rates = firecrawlResult.rates;
      source = 'cbn_firecrawl';
      rawResponse = {
        rates_found: rates.length,
        currencies: rates.map(r => r.currency),
        html_preview: firecrawlResult.rawHtml,
      };
      console.log(`Got ${rates.length} rates from CBN via Firecrawl`);
    } else {
      errorMessages.push('Firecrawl CBN scrape failed or returned no data');
      
      // Step 2: Check database for recent rates (within 24 hours)
      console.log('Step 2: Checking database cache...');
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
          date: today,
        }));
        rawResponse = {
          cached_rates: recentRates.length,
          cache_date: recentRates[0]?.rate_date,
        };
      } else {
        errorMessages.push('No recent database cache');
        
        // Step 3: Use hardcoded fallback
        console.log('Step 3: Using fallback rates');
        rates = getFallbackRates();
        source = 'fallback';
        rawResponse = {
          fallback_reason: 'All other sources failed',
          errors: errorMessages,
        };
      }
    }
    
    const errorMessage = errorMessages.length > 0 ? errorMessages.join('; ') : null;
    
    // Log the attempt
    await supabase.from('cbn_rate_logs').insert({
      fetch_date: today,
      currencies_updated: rates.length,
      source,
      success: rates.length > 0 && source === 'cbn_firecrawl',
      error_message: errorMessage,
      raw_response: rawResponse,
    });
    
    if (rates.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Failed to fetch rates from all sources',
        error: errorMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }
    
    // Upsert rates - use the central rate as the main rate
    let updatedCount = 0;
    for (const rate of rates) {
      const { error: upsertError } = await supabase
        .from('cbn_exchange_rates')
        .upsert({
          currency: rate.currency,
          rate: rate.centralRate, // Use central rate as the main rate
          rate_date: rate.date,
          source,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'currency,rate_date',
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
      warning: source !== 'cbn_firecrawl' ? `Using ${source} instead of official CBN data` : null,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Critical error in CBN rate fetcher:', error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
