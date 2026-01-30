import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";


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
    console.log('[cbn-rate-fetcher] Fetching rates using Firecrawl...');

    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://www.cbn.gov.ng/rates/ExchRateByCurrency.html',
        formats: ['html'],
        waitFor: 8000, // Wait 8 seconds for Kendo grid to load
        onlyMainContent: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[cbn-rate-fetcher] Firecrawl API error:', response.status, errorText);
      return { rates: [] };
    }

    const data = await response.json();
    const html = data.data?.html || data.html || '';

    if (!html) {
      console.error('[cbn-rate-fetcher] No HTML content received from Firecrawl');
      return { rates: [] };
    }

    console.log('[cbn-rate-fetcher] Received HTML length:', html.length);

    // Parse the Kendo grid table
    const rates = parseKendoGridRates(html);

    return { rates, rawHtml: html.substring(0, 2000) };

  } catch (error) {
    console.error('[cbn-rate-fetcher] Firecrawl fetch error:', error);
    return { rates: [] };
  }
}

// Parse rates from the Kendo UI grid HTML structure
function parseKendoGridRates(html: string): CBNRate[] {
  const rates: CBNRate[] = [];

  // Look for table rows in the Kendo grid
  const rowPatterns = [
    /<tr[^>]*class="[^"]*k-(?:table-row|master-row)[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi,
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi,
  ];

  let matchCount = 0;
  for (const rowPattern of rowPatterns) {
    let rowMatch;
    rowPattern.lastIndex = 0;

    while ((rowMatch = rowPattern.exec(html)) !== null) {
      const rowContent = rowMatch[1];
      const cells: string[] = [];

      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let cellMatch;

      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        cells.push(cellText);
      }

      if (cells.length >= 5) {
        const currencyName = cells[0].toUpperCase().trim();
        const isoCode = CURRENCY_MAP[currencyName];

        if (isoCode) {
          const dateStr = cells[1].trim();
          const buying = parseFloat(cells[2].replace(/[^0-9.]/g, ''));
          const central = parseFloat(cells[3].replace(/[^0-9.]/g, ''));
          const selling = parseFloat(cells[4].replace(/[^0-9.]/g, ''));

          if (central > 1 && central < 10000 && !isNaN(central)) {
            let rateDate = new Date().toISOString().split('T')[0];

            if (dateStr) {
              const dateMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (dateMatch) {
                rateDate = dateStr;
              } else {
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
            matchCount++;
          }
        }
      }
    }

    if (rates.length > 0) break;
  }

  console.log(`[cbn-rate-fetcher] Total rates parsed: ${rates.length}`);
  return rates;
}

// Manual fallback rates
function getFallbackRates(): CBNRate[] {
  const today = new Date().toISOString().split('T')[0];
  return [
    { currency: 'USD', buyingRate: 1429.85, centralRate: 1430.35, sellingRate: 1430.85, date: today },
    { currency: 'GBP', buyingRate: 1924.43, centralRate: 1925.11, sellingRate: 1925.78, date: today },
    { currency: 'EUR', buyingRate: 1677.07, centralRate: 1677.66, sellingRate: 1678.24, date: today },
    { currency: 'CHF', buyingRate: 1803.09, centralRate: 1803.72, sellingRate: 1804.35, date: today },
    { currency: 'JPY', buyingRate: 9.11, centralRate: 9.12, sellingRate: 9.12, date: today },
    { currency: 'CNY', buyingRate: 204.43, centralRate: 204.50, sellingRate: 204.57, date: today },
    { currency: 'ZAR', buyingRate: 86.60, centralRate: 86.63, sellingRate: 86.66, date: today },
    { currency: 'SAR', buyingRate: 381.25, centralRate: 381.39, sellingRate: 381.52, date: today },
    { currency: 'DKK', buyingRate: 224.50, centralRate: 224.58, sellingRate: 224.65, date: today },
    { currency: 'XOF', buyingRate: 2.57, centralRate: 2.58, sellingRate: 2.59, date: today },
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

    const today = new Date().toISOString().split('T')[0];

    // Parse options
    let forceRefresh = false;
    try {
      if (req.method === 'POST') {
        const body = await req.json();
        forceRefresh = body.force_refresh === true;
      }
    } catch { }

    console.log(`[cbn-rate-fetcher] Starting fetch (forceRefresh=${forceRefresh})`);

    let rates: CBNRate[] = [];
    let source = '';
    let errorMessages: string[] = [];
    let rawResponse: Record<string, unknown> = {};

    // Step 1: Try Firecrawl
    const firecrawlResult = await fetchFromCBNWithFirecrawl();

    if (firecrawlResult.rates.length > 0) {
      rates = firecrawlResult.rates;
      source = 'cbn_firecrawl';
      rawResponse = {
        rates_found: rates.length,
        currencies: rates.map(r => r.currency),
        html_preview: firecrawlResult.rawHtml,
      };
      console.log(`[cbn-rate-fetcher] Success via Firecrawl: ${rates.length} rates`);
    } else {
      errorMessages.push('Firecrawl fetch failed (no rates found)');

      // Step 2: DB Cache (unless forced)
      if (!forceRefresh) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const { data: recentRates } = await supabase
          .from('cbn_exchange_rates')
          .select('*')
          .gte('rate_date', yesterday)
          .order('rate_date', { ascending: false });

        if (recentRates && recentRates.length > 0) {
          source = 'database_cache';
          rates = recentRates.map(r => ({
            currency: r.currency,
            buyingRate: r.rate * 0.995,
            centralRate: r.rate,
            sellingRate: r.rate * 1.005,
            date: today,
          }));
          console.log(`[cbn-rate-fetcher] Using DB cache: ${rates.length} rates`);
        }
      }

      if (rates.length === 0) {
        // Step 3: Fallback
        rates = getFallbackRates();
        source = 'fallback';
        errorMessages.push('Using hardcoded fallback');
      }
    }

    const errorMessage = errorMessages.length > 0 ? errorMessages.join('; ') : null;

    await supabase.from('cbn_rate_logs').insert({
      fetch_date: today,
      currencies_updated: rates.length,
      source,
      success: source === 'cbn_firecrawl',
      error_message: errorMessage,
      raw_response: rawResponse,
    });

    if (rates.length === 0) {
      return jsonResponse({ success: false, error: 'All fetch sources failed' }, 500);
    }

    let updatedCount = 0;
    for (const rate of rates) {
      const { error: upsertError } = await supabase
        .from('cbn_exchange_rates')
        .upsert({
          currency: rate.currency,
          rate: rate.centralRate,
          rate_date: rate.date,
          source,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'currency,rate_date',
        });

      if (!upsertError) updatedCount++;
    }

    return jsonResponse({
      success: true,
      message: `Updated ${updatedCount} rates from ${source}`,
      source,
      rates_count: updatedCount
    });

  } catch (error) {
    console.error('[cbn-rate-fetcher] Fatal error:', error);
    return jsonResponse({ success: false, error: String(error) }, 500);
  }
});
