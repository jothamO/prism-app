/**
 * PRISM Currency Service
 * 
 * Centralized exchange rate provider for PRISM.
 * Fetches from cbn_exchange_rates table populated by cbn-rate-fetcher.
 */

import { getSupabaseAdmin } from './supabase.ts';

export interface ExchangeRate {
    currency: string;
    rate: number;
    date: string;
    source: string;
}

/**
 * Get the latest rates for all supported currencies.
 */
export async function getCurrentRates(): Promise<ExchangeRate[]> {
    const supabase = getSupabaseAdmin();

    // Get the most recent date from the table
    const { data: latestDateRow } = await supabase
        .from('cbn_exchange_rates')
        .select('rate_date')
        .order('rate_date', { ascending: false })
        .limit(1)
        .single();

    if (!latestDateRow) return [];

    const { data, error } = await supabase
        .from('cbn_exchange_rates')
        .select('currency, rate, rate_date, source')
        .eq('rate_date', latestDateRow.rate_date)
        .order('currency');

    if (error) {
        console.error('[currency-service] Error fetching rates:', error);
        return [];
    }

    return (data || []).map((r: { currency: string; rate: number; rate_date: string; source: string }) => ({
        currency: r.currency,
        rate: r.rate,
        date: r.rate_date,
        source: r.source
    }));
}

/**
 * Get latest USD to Naira rate.
 */
export async function getCurrentUSDToNaira(): Promise<number | null> {
    const rates = await getCurrentRates();
    const usd = rates.find(r => r.currency === 'USD');
    return usd ? usd.rate : null;
}

/**
 * Convert an amount between two currencies using latest CBN rates.
 */
export async function convertCurrency(
    amount: number,
    from: string,
    to: string = 'NGN'
): Promise<number | null> {
    const rates = await getCurrentRates();

    // For now, we assume all stored rates are relative to NGN (e.g., 1 USD = X NGN)
    if (to === 'NGN') {
        const rate = rates.find(r => r.currency === from);
        return rate ? amount * rate.rate : null;
    }

    if (from === 'NGN') {
        const rate = rates.find(r => r.currency === to);
        return rate ? amount / rate.rate : null;
    }

    // Cross-currency (e.g. USD to GBP)
    const fromRate = rates.find(r => r.currency === from);
    const toRate = rates.find(r => r.currency === to);

    if (fromRate && toRate) {
        const amountInNgn = amount * fromRate.rate;
        return amountInNgn / toRate.rate;
    }

    return null;
}

/**
 * Formats a summary of current exchange rates for AI context.
 */
export async function getExchangeRatePromptSnippet(): Promise<string> {
    const rates = await getCurrentRates();
    if (rates.length === 0) {
        return "\n\nCURRENT CBN EXCHANGE RATES: Information temporarily unavailable in DB. Please use fallback knowledge or advise user to check CBN website.";
    }

    const date = rates[0].date;
    const list = rates
        .map(r => `• ${r.currency}: ₦${r.rate.toLocaleString()}`)
        .join('\n');

    return `\n\nCURRENT CBN EXCHANGE RATES (as of ${date}):\n${list}\nSource: Official Central Bank of Nigeria`;
}
