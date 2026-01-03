/**
 * CBN Exchange Rate Service
 * Fetches and caches Central Bank of Nigeria official exchange rates
 * Used for foreign currency transaction compliance
 */

import { logger } from '../../../utils/logger';
import { supabase } from '../../../config';

export interface ExchangeRate {
    currency: string;
    rate: number;
    date: string;
    source: 'cbn_api' | 'fallback' | 'cached';
}

export class CBNRateService {
    // Fallback rates (updated manually - last update: Jan 2026)
    private readonly FALLBACK_RATES: Record<string, number> = {
        'USD': 1650,  // ₦1,650/$1
        'GBP': 2100,  // ₦2,100/£1
        'EUR': 1800,  // ₦1,800/€1
        'ZAR': 85,    // ₦85/R1
        'CNY': 230,   // ₦230/¥1
        'JPY': 11,    // ₦11/¥1
        'GHS': 110,   // ₦110/GH₵1
        'XAF': 2.7,   // ₦2.7/FCFA1
        'XOF': 2.7    // ₦2.7/FCFA1
    };

    /**
     * Get exchange rate for a currency on a specific date
     */
    async getRate(currency: string, date: Date = new Date()): Promise<ExchangeRate> {
        try {
            // Try cache first
            const cachedRate = await this.getCachedRate(currency, date);
            if (cachedRate) {
                return cachedRate;
            }

            // Try CBN API (if available)
            // TODO: Implement actual CBN API integration when available
            // const apiRate = await this.fetchFromCBN(currency, date);
            // if (apiRate) {
            //     await this.cacheRate(apiRate);
            //     return apiRate;
            // }

            // Fallback to hardcoded rates
            const fallbackRate = this.getFallbackRate(currency, date);

            // Cache the fallback rate for the day
            await this.cacheRate(fallbackRate);

            return fallbackRate;
        } catch (error) {
            logger.error('[CBNRateService] Failed to get rate:', error);
            return this.getFallbackRate(currency, date);
        }
    }

    /**
     * Get cached rate from database
     */
    private async getCachedRate(
        currency: string,
        date: Date
    ): Promise<ExchangeRate | null> {
        const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

        const { data } = await supabase
            .from('cbn_exchange_rates')
            .select('*')
            .eq('currency', currency)
            .eq('rate_date', dateStr)
            .single();

        if (data) {
            return {
                currency: data.currency,
                rate: data.rate,
                date: data.rate_date,
                source: 'cached'
            };
        }

        return null;
    }

    /**
     * Cache rate in database
     */
    private async cacheRate(rate: ExchangeRate): Promise<void> {
        try {
            await supabase
                .from('cbn_exchange_rates')
                .upsert({
                    currency: rate.currency,
                    rate: rate.rate,
                    rate_date: rate.date,
                    source: rate.source,
                    created_at: new Date().toISOString()
                }, {
                    onConflict: 'currency,rate_date'
                });

            logger.info('[CBNRateService] Rate cached', { currency: rate.currency, rate: rate.rate });
        } catch (error) {
            logger.warn('[CBNRateService] Failed to cache rate:', error);
        }
    }

    /**
     * Get fallback rate (hardcoded)
     */
    private getFallbackRate(currency: string, date: Date): ExchangeRate {
        const rate = this.FALLBACK_RATES[currency] || 0;

        if (rate === 0) {
            logger.warn(`[CBNRateService] No rate available for ${currency}`);
        }

        return {
            currency,
            rate,
            date: date.toISOString().split('T')[0],
            source: 'fallback'
        };
    }

    /**
     * Convert foreign currency to Naira
     */
    async convertToNaira(
        amount: number,
        currency: string,
        date: Date = new Date()
    ): Promise<{
        naira: number;
        rate: number;
        source: string;
    }> {
        const exchangeRate = await this.getRate(currency, date);

        return {
            naira: amount * exchangeRate.rate,
            rate: exchangeRate.rate,
            source: exchangeRate.source
        };
    }

    /**
     * Get rate history for charting
     */
    async getRateHistory(
        currency: string,
        days: number = 30
    ): Promise<Array<{ date: string; rate: number }>> {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data } = await supabase
            .from('cbn_exchange_rates')
            .select('rate_date, rate')
            .eq('currency', currency)
            .gte('rate_date', startDate.toISOString().split('T')[0])
            .lte('rate_date', endDate.toISOString().split('T')[0])
            .order('rate_date', { ascending: true });

        return data || [];
    }

    /**
     * Fetch from CBN API (placeholder for future implementation)
     */
    private async fetchFromCBN(
        currency: string,
        date: Date
    ): Promise<ExchangeRate | null> {
        // TODO: Implement CBN API integration
        // Possible endpoints:
        // - https://www.cbn.gov.ng/rates/exrate.asp
        // - Or use a third-party aggregator

        logger.info('[CBNRateService] CBN API not yet implemented, using fallback');
        return null;
    }

    /**
     * Update fallback rates (manual admin function)
     */
    updateFallbackRates(rates: Record<string, number>): void {
        Object.assign(this.FALLBACK_RATES, rates);
        logger.info('[CBNRateService] Fallback rates updated', rates);
    }

    /**
     * Get all supported currencies
     */
    getSupportedCurrencies(): string[] {
        return Object.keys(this.FALLBACK_RATES);
    }
}
