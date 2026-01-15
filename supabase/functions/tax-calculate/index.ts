/**
 * Central Tax Calculator Edge Function
 * Provides unified tax calculations for all PRISM interfaces
 * Uses the Central Rules Engine for consistent results
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
    getTaxBands,
    getVATRate,
    getThreshold,
    getRuleByCode,
    TaxBand,
} from "../_shared/rules-client.ts";

// ==================== TYPES ====================

interface CalculationRequest {
    tax_type: "pit" | "cit" | "vat" | "wht" | "cgt" | "stamp" | "levy" | "metr";
    params: Record<string, any>;
    api_key_id?: string; // For logging
    user_id?: string; // For logging
}

interface CalculationResult {
    success: boolean;
    tax_type: string;
    result: Record<string, any>;
    metadata: {
        calculated_at: string;
        rules_version: string;
    };
}

// ==================== CALCULATORS ====================

/**
 * PIT (Personal Income Tax) Calculator
 * Progressive tax bands per Nigeria Tax Act 2025
 */
async function calculatePIT(params: {
    gross_income: number;
    annual?: boolean;
    deductions?: number;
}): Promise<Record<string, any>> {
    const grossIncome = params.annual ? params.gross_income : params.gross_income * 12;
    const deductions = params.deductions || 0;
    const chargeableIncome = Math.max(0, grossIncome - deductions);

    // Minimum wage exemption
    const minWage = await getThreshold("MINIMUM_WAGE");
    const minimumWageAnnual = minWage?.annual || 840000;
    if (grossIncome <= minimumWageAnnual) {
        return {
            gross_income: grossIncome,
            chargeable_income: chargeableIncome,
            total_tax: 0,
            effective_rate: 0,
            monthly_tax: 0,
            is_exempt: true,
            exemption_reason: "Below minimum wage threshold",
        };
    }

    // Get tax bands from rules engine
    const taxBands = await getTaxBands();

    // Calculate progressive tax
    let totalTax = 0;
    let remainingIncome = chargeableIncome;
    const breakdown: Array<{ band: string; taxable: number; rate: number; tax: number }> = [];

    for (const band of taxBands) {
        if (remainingIncome <= 0) break;

        const bandMax = band.max === null ? Infinity : band.max;
        const bandWidth = bandMax - band.min;
        const taxableInBand = Math.min(remainingIncome, bandWidth);
        const taxInBand = taxableInBand * band.rate;

        breakdown.push({
            band: band.label,
            taxable: taxableInBand,
            rate: band.rate,
            tax: taxInBand,
        });

        totalTax += taxInBand;
        remainingIncome -= taxableInBand;
    }

    return {
        gross_income: grossIncome,
        chargeable_income: chargeableIncome,
        tax_breakdown: breakdown,
        total_tax: Math.round(totalTax * 100) / 100,
        effective_rate: Math.round((totalTax / grossIncome) * 10000) / 100,
        monthly_tax: Math.round((totalTax / 12) * 100) / 100,
        monthly_net: Math.round(((grossIncome - totalTax) / 12) * 100) / 100,
        is_exempt: false,
    };
}

/**
 * CIT (Corporate Income Tax) Calculator
 * Company tax with small company exemptions
 */
async function calculateCIT(params: {
    profits: number;
    turnover?: number;
    assets?: number;
}): Promise<Record<string, any>> {
    const { profits, turnover = profits * 1.2, assets = 0 } = params;

    // Get thresholds
    const smallCoTurnover = (await getThreshold("SMALL_COMPANY_TURNOVER"))?.limit || 50000000;
    const smallCoAssets = (await getThreshold("SMALL_COMPANY_ASSETS"))?.limit || 250000000;

    // Small company exemption (0% CIT)
    const isSmallCompany = turnover <= smallCoTurnover && assets <= smallCoAssets;

    let citRate = 0.30; // Default 30%
    if (isSmallCompany) {
        citRate = 0;
    } else if (turnover <= 100000000) {
        citRate = 0.20; // Medium company 20%
    }

    const cit = profits * citRate;
    const tertiaryEducationTax = profits * 0.025;
    const devLevy = cit * 0.04; // 4% of CIT
    const policeEducationTax = profits > 0 ? 500000 : 0; // Flat ₦500k for companies with profits

    return {
        taxable_profits: profits,
        turnover,
        is_small_company: isSmallCompany,
        cit_rate: citRate,
        cit: Math.round(cit),
        tertiary_education_tax: Math.round(tertiaryEducationTax),
        development_levy: Math.round(devLevy),
        police_education_tax: policeEducationTax,
        total_tax: Math.round(cit + tertiaryEducationTax + devLevy + policeEducationTax),
        effective_rate: Math.round(((cit + tertiaryEducationTax + devLevy) / profits) * 10000) / 100,
    };
}

/**
 * VAT (Value Added Tax) Calculator
 */
async function calculateVAT(params: {
    amount: number;
    is_vatable?: boolean;
    supply_type?: "goods" | "services" | "exports";
}): Promise<Record<string, any>> {
    const { amount, is_vatable = true, supply_type = "goods" } = params;

    // VAT rate from rules
    const vatRate = await getVATRate();

    // Exports are zero-rated
    if (supply_type === "exports") {
        return {
            base_amount: amount,
            vat_rate: 0,
            vat_amount: 0,
            total_amount: amount,
            note: "Exports are zero-rated for VAT",
        };
    }

    // Non-vatable items
    if (!is_vatable) {
        return {
            base_amount: amount,
            vat_rate: 0,
            vat_amount: 0,
            total_amount: amount,
            note: "Item is VAT-exempt",
        };
    }

    const vatAmount = amount * vatRate;

    return {
        base_amount: amount,
        vat_rate: vatRate,
        vat_amount: Math.round(vatAmount * 100) / 100,
        total_amount: Math.round((amount + vatAmount) * 100) / 100,
    };
}

/**
 * WHT (Withholding Tax) Calculator
 */
async function calculateWHT(params: {
    amount: number;
    payment_type: "dividend" | "interest" | "royalty" | "rent" | "contract" | "professional" | "director";
    payee_type?: "individual" | "company";
    is_resident?: boolean;
}): Promise<Record<string, any>> {
    const { amount, payment_type, payee_type = "individual", is_resident = true } = params;

    // WHT rates by type
    const whtRates: Record<string, { resident: number; nonResident: number }> = {
        dividend: { resident: 0.10, nonResident: 0.10 },
        interest: { resident: 0.10, nonResident: 0.10 },
        royalty: { resident: 0.10, nonResident: 0.10 },
        rent: { resident: 0.10, nonResident: 0.10 },
        contract: { resident: 0.05, nonResident: 0.10 },
        professional: { resident: 0.10, nonResident: 0.10 },
        director: { resident: 0.10, nonResident: 0.10 },
    };

    const rateConfig = whtRates[payment_type] || whtRates.professional;
    const rate = is_resident ? rateConfig.resident : rateConfig.nonResident;
    const whtAmount = amount * rate;

    return {
        gross_amount: amount,
        payment_type,
        payee_type,
        is_resident,
        wht_rate: rate,
        wht_amount: Math.round(whtAmount * 100) / 100,
        net_amount: Math.round((amount - whtAmount) * 100) / 100,
    };
}

/**
 * CGT (Capital Gains Tax) Calculator
 */
async function calculateCGT(params: {
    proceeds: number;
    cost_basis: number;
    expenses?: number;
    asset_type?: "shares" | "property" | "business" | "other";
}): Promise<Record<string, any>> {
    const { proceeds, cost_basis, expenses = 0, asset_type = "other" } = params;

    const gain = proceeds - cost_basis - expenses;

    // Shares are exempt if held for more than 1 year (user should indicate)
    // Property primary residence is typically exempt

    const cgtRate = 0.10; // 10% flat rate in Nigeria
    const taxableGain = Math.max(0, gain);
    const cgt = taxableGain * cgtRate;

    return {
        proceeds,
        cost_basis,
        expenses,
        gross_gain: gain,
        taxable_gain: taxableGain,
        cgt_rate: cgtRate,
        cgt: Math.round(cgt),
        asset_type,
        is_loss: gain < 0,
    };
}

/**
 * Stamp Duty Calculator
 */
async function calculateStampDuty(params: {
    amount: number;
    instrument_type: "transfer" | "lease" | "deed" | "receipt" | "policy";
}): Promise<Record<string, any>> {
    const { amount, instrument_type } = params;

    // Stamp duty rates
    const rates: Record<string, number> = {
        transfer: 0.0075, // 0.75% for transfers
        lease: 0.0025, // 0.25% for leases
        deed: 0.02, // 2% for deeds
        receipt: 0.005, // 0.5% for receipts (capped)
        policy: 0.0025, // 0.25% for insurance
    };

    const rate = rates[instrument_type] || rates.receipt;
    let stampDuty = amount * rate;

    // Cap for receipts
    if (instrument_type === "receipt") {
        stampDuty = Math.min(stampDuty, 500);
    }

    return {
        amount,
        instrument_type,
        rate,
        stamp_duty: Math.round(stampDuty * 100) / 100,
    };
}

/**
 * Development Levy Calculator
 */
async function calculateDevLevy(params: {
    cit_amount: number;
}): Promise<Record<string, any>> {
    const { cit_amount } = params;
    const devLevyRate = 0.04; // 4% of CIT
    const devLevy = cit_amount * devLevyRate;

    // Distribution per Finance Act 2023
    const distribution = [
        { fund: "Tertiary Education Fund", percentage: 0.50, amount: devLevy * 0.50 },
        { fund: "National Health Insurance Fund", percentage: 0.25, amount: devLevy * 0.25 },
        { fund: "National Agency for Science and Engineering Infrastructure", percentage: 0.25, amount: devLevy * 0.25 },
    ];

    return {
        cit_amount,
        dev_levy_rate: devLevyRate,
        dev_levy: Math.round(devLevy),
        distribution: distribution.map(d => ({
            ...d,
            amount: Math.round(d.amount),
        })),
    };
}

/**
 * Minimum ETR Calculator
 */
async function calculateMETR(params: {
    profits: number;
    losses_brought_forward?: number;
    turnover?: number;
}): Promise<Record<string, any>> {
    const { profits, losses_brought_forward = 0, turnover = profits * 1.2 } = params;

    const minimumETR = 0.15; // 15%
    const largeCompanyThreshold = 20000000000; // ₦20B

    const adjustedProfits = profits - losses_brought_forward;
    const isLargeCompany = turnover >= largeCompanyThreshold;

    const minimumTax = adjustedProfits * minimumETR;

    return {
        profits,
        losses_brought_forward,
        adjusted_profits: adjustedProfits,
        turnover,
        is_large_company: isLargeCompany,
        minimum_etr: minimumETR,
        minimum_tax: Math.round(minimumTax),
        note: isLargeCompany ? "Subject to minimum ETR" : "Below large company threshold",
    };
}

// ==================== LOGGING ====================

async function logCalculation(
    supabase: any,
    request: CalculationRequest,
    result: CalculationResult
): Promise<void> {
    try {
        await supabase.from("calculation_logs").insert({
            tax_type: request.tax_type,
            input_params: request.params,
            output_result: result.result,
            api_key_id: request.api_key_id || null,
            user_id: request.user_id || null,
            source: "tax-calculate",
        });
    } catch (error) {
        console.error("Failed to log calculation:", error);
    }
}

// ==================== MAIN HANDLER ====================

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: CalculationRequest = await req.json();
        const { tax_type, params } = request;

        if (!tax_type || !params) {
            return jsonResponse({ error: "Missing tax_type or params" }, 400);
        }

        let result: Record<string, any>;

        switch (tax_type) {
            case "pit":
                result = await calculatePIT(params as { gross_income: number; annual?: boolean; deductions?: number });
                break;
            case "cit":
                result = await calculateCIT(params as { profits: number; turnover?: number; assets?: number });
                break;
            case "vat":
                result = await calculateVAT(params as { amount: number; is_vatable?: boolean; supply_type?: "goods" | "services" | "exports" });
                break;
            case "wht":
                result = await calculateWHT(params as { amount: number; payment_type: "rent" | "dividend" | "interest" | "contract" | "royalty" | "professional" | "director"; payee_type?: "individual" | "company"; is_resident?: boolean });
                break;
            case "cgt":
                result = await calculateCGT(params as { proceeds: number; cost_basis: number; expenses?: number; asset_type?: "property" | "shares" | "business" | "other" });
                break;
            case "stamp":
                result = await calculateStampDuty(params as { amount: number; instrument_type: "receipt" | "transfer" | "lease" | "deed" | "policy" });
                break;
            case "levy":
                result = await calculateDevLevy(params as { cit_amount: number });
                break;
            case "metr":
                result = await calculateMETR(params as { profits: number; losses_brought_forward?: number; turnover?: number });
                break;
            default:
                return jsonResponse({ error: `Unknown tax_type: ${tax_type}` }, 400);
        }

        const response: CalculationResult = {
            success: true,
            tax_type,
            result,
            metadata: {
                calculated_at: new Date().toISOString(),
                rules_version: "2025.1",
            },
        };

        // Log calculation
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await logCalculation(supabase, request, response);

        return jsonResponse(response);
    } catch (error) {
        console.error("Tax calculation error:", error);
        return jsonResponse({ error: "Calculation failed", details: String(error) }, 500);
    }
});
