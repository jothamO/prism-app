/**
 * Tax Service Client
 * Provides Gateway access to central tax-calculate edge function
 * Ensures consistent calculations and logging across all interfaces
 */

import { supabase, config } from '../config';
import { logger } from './logger';

// Tax calculation types matching tax-calculate edge function
type TaxType = 'pit' | 'cit' | 'vat' | 'wht' | 'cgt' | 'stamp' | 'levy' | 'metr';

interface TaxCalculationRequest {
    tax_type: TaxType;
    params: Record<string, unknown>;
    user_id?: string;
}

interface TaxCalculationResult {
    success: boolean;
    tax_type: string;
    result: Record<string, unknown>;
    metadata: {
        calculated_at: string;
        rules_version: string;
    };
}

// ==================== WHT TYPES ====================
export interface WHTParams {
    amount: number;
    payment_type: 'dividend' | 'interest' | 'royalty' | 'rent' | 'contract' | 'professional' | 'director' | 'commission' | 'consultancy';
    payee_type?: 'individual' | 'company';
    is_resident?: boolean;
}

export interface WHTResult {
    gross_amount: number;
    payment_type: string;
    payee_type: string;
    is_resident: boolean;
    wht_rate: number;
    wht_amount: number;
    net_amount: number;
}

// ==================== CGT TYPES ====================
export interface CGTParams {
    proceeds: number;
    cost_basis: number;
    expenses?: number;
    asset_type?: 'shares' | 'property' | 'business' | 'other';
}

export interface CGTResult {
    proceeds: number;
    cost_basis: number;
    expenses: number;
    gross_gain: number;
    taxable_gain: number;
    cgt_rate: number;
    cgt: number;
    asset_type: string;
    is_loss: boolean;
}

// ==================== CIT TYPES ====================
export interface CITParams {
    profits: number;
    turnover?: number;
    assets?: number;
}

export interface CITResult {
    taxable_profits: number;
    turnover: number;
    is_small_company: boolean;
    cit_rate: number;
    cit: number;
    tertiary_education_tax: number;
    development_levy: number;
    police_education_tax: number;
    total_tax: number;
    effective_rate: number;
}

// ==================== VAT TYPES ====================
export interface VATParams {
    amount: number;
    is_vatable?: boolean;
    supply_type?: 'goods' | 'services' | 'exports';
}

export interface VATResult {
    base_amount: number;
    vat_rate: number;
    vat_amount: number;
    total_amount: number;
    note?: string;
}

// ==================== STAMP TYPES ====================
export interface StampDutyParams {
    amount: number;
    instrument_type: 'transfer' | 'lease' | 'deed' | 'receipt' | 'policy';
}

export interface StampDutyResult {
    amount: number;
    instrument_type: string;
    rate: number;
    stamp_duty: number;
}

// ==================== METR TYPES ====================
export interface METRParams {
    profits: number;
    losses_brought_forward?: number;
    turnover?: number;
}

export interface METRResult {
    profits: number;
    losses_brought_forward: number;
    adjusted_profits: number;
    turnover: number;
    is_large_company: boolean;
    minimum_etr: number;
    minimum_tax: number;
    note: string;
}

// ==================== MAIN SERVICE ====================

class TaxService {
    private supabaseUrl: string;
    private serviceKey: string;

    constructor() {
        this.supabaseUrl = config.supabase.url;
        this.serviceKey = config.supabase.serviceKey;
    }

    /**
     * Call tax-calculate edge function
     */
    private async callTaxCalculate<T>(
        taxType: TaxType,
        params: Record<string, unknown>,
        userId?: string
    ): Promise<T> {
        const startTime = Date.now();

        try {
            const { data, error } = await supabase.functions.invoke('tax-calculate', {
                body: {
                    tax_type: taxType,
                    params,
                    user_id: userId
                } as TaxCalculationRequest
            });

            if (error) {
                logger.error('[TaxService] Edge function error:', error);
                throw new Error(`Tax calculation failed: ${error.message}`);
            }

            const responseData = data as TaxCalculationResult;

            if (!responseData.success) {
                throw new Error('Tax calculation returned unsuccessful');
            }

            logger.info('[TaxService] Calculation complete', {
                taxType,
                durationMs: Date.now() - startTime,
                rulesVersion: responseData.metadata.rules_version
            });

            return responseData.result as T;
        } catch (error) {
            logger.error('[TaxService] Calculation error:', { taxType, error });
            throw error;
        }
    }

    /**
     * Calculate Withholding Tax
     */
    async calculateWHT(params: WHTParams, userId?: string): Promise<WHTResult> {
        return this.callTaxCalculate<WHTResult>('wht', params as Record<string, unknown>, userId);
    }

    /**
     * Calculate Capital Gains Tax
     */
    async calculateCGT(params: CGTParams, userId?: string): Promise<CGTResult> {
        return this.callTaxCalculate<CGTResult>('cgt', params as Record<string, unknown>, userId);
    }

    /**
     * Calculate Corporate Income Tax
     */
    async calculateCIT(params: CITParams, userId?: string): Promise<CITResult> {
        return this.callTaxCalculate<CITResult>('cit', params as Record<string, unknown>, userId);
    }

    /**
     * Calculate VAT
     */
    async calculateVAT(params: VATParams, userId?: string): Promise<VATResult> {
        return this.callTaxCalculate<VATResult>('vat', params as Record<string, unknown>, userId);
    }

    /**
     * Calculate Stamp Duty
     */
    async calculateStampDuty(params: StampDutyParams, userId?: string): Promise<StampDutyResult> {
        return this.callTaxCalculate<StampDutyResult>('stamp', params as Record<string, unknown>, userId);
    }

    /**
     * Calculate Minimum ETR
     */
    async calculateMETR(params: METRParams, userId?: string): Promise<METRResult> {
        return this.callTaxCalculate<METRResult>('metr', params as Record<string, unknown>, userId);
    }
}

// Export singleton
export const taxService = new TaxService();
