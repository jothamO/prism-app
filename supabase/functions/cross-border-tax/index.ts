import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, handleCors } from "../_shared/cors.ts";

// WHT Rates per Nigeria Tax Act 2025
const WHT_RATES: Record<string, number> = {
  technical: 0.10,      // Technical/Management services
  management: 0.10,
  royalty: 0.10,
  interest: 0.10,
  dividend: 0.10,
  rent: 0.10,
  commission: 0.10,
  consultancy: 0.05,    // Consulting might be lower in some cases
};

// VAT on imported services - Section 151
const VAT_RATE = 0.075;

// Small company threshold - Section 56
const SMALL_COMPANY_TURNOVER_THRESHOLD = 50_000_000;
const SMALL_COMPANY_ASSETS_THRESHOLD = 50_000_000;

// Professional services that don't qualify for small company status
const PROFESSIONAL_SERVICES = ['legal', 'accounting', 'consulting', 'engineering', 'architecture', 'medical', 'dental'];

interface ForeignPayment {
  recipient: string;
  country: string;
  monthlyAmount: number;
  serviceType: string;
  annualTotal?: number;
}

interface CrossBorderInput {
  businessId?: string;
  annualTurnover: number;
  fixedAssets?: number;
  businessType?: string;
  isLabelledStartup?: boolean;
  isProfessionalService?: boolean;
  isAgricultural?: boolean;
  agricultureYearsActive?: number;
  inputVATClaimable?: number;
  estimatedExpenses?: number;
  whtDeductedByClients?: number;
  foreignPayments: ForeignPayment[];
}

interface PaymentBreakdown {
  recipient: string;
  country: string;
  monthlyGross: number;
  monthlyVAT: number;
  monthlyWHT: number;
  monthlyNetToRecipient: number;
  monthlyRemittance: number;
  annualGross: number;
  annualVAT: number;
  annualWHT: number;
  annualRemittance: number;
  whtRate: number;
  serviceType: string;
}

interface CompanyClassification {
  status: 'small' | 'medium' | 'large';
  taxRate: number;
  reason: string;
  qualifiesForZeroTax: boolean;
}

interface ProfessionalServicesTaxBreakdown {
  grossIncome: number;
  allowableExpenses: number;
  taxableProfit: number;
  grossCompanyTax: number;
  whtCreditAvailable: number;
  netTaxPayable: number;
  vatCollected: number;
  inputVAT: number;
  netVATPayable: number;
  section57Exclusion: boolean;
}

interface AgriculturalTaxBreakdown {
  isAgricultural: boolean;
  yearsActive: number;
  yearsRemaining: number;
  exemptionActive: boolean;
  grossIncome: number;
  allowableExpenses: number;
  taxableProfit: number;
  taxWithoutExemption: number;
  taxWithExemption: number;
  taxSavings: number;
  vatCollected: number;
  inputVATClaimable: number;
  vatRefundDue: number;
  products: Array<{ name: string; amount: number; vatTreatment: string }>;
}

interface CrossBorderResult {
  success: boolean;
  companyClassification: CompanyClassification;
  isLabelledStartup: boolean;
  isProfessionalService: boolean;
  isAgricultural: boolean;
  startupBenefits: string[];
  paymentBreakdowns: PaymentBreakdown[];
  professionalServicesTax?: ProfessionalServicesTaxBreakdown;
  agriculturalTax?: AgriculturalTaxBreakdown;
  annualSummary: {
    totalForeignPayments: number;
    totalVATOnImports: number;
    totalWHTRemitted: number;
    totalRemittance: number;
    companyTax: number;
    netTaxPayable?: number;
    vatCollected?: number;
    netVATPayable?: number;
    vatRefundDue?: number;
  };
  complianceChecklist: string[];
  actReferences: string[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse body with error handling for empty requests
    let input: CrossBorderInput;
    try {
      const bodyText = await req.text();
      if (!bodyText || bodyText.trim() === '') {
        throw new Error('Request body is empty');
      }
      input = JSON.parse(bodyText);
    } catch (parseError) {
      console.error('[cross-border-tax] JSON parse error:', parseError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request body. Expected JSON with annualTurnover, foreignPayments, etc.'
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[cross-border-tax] Processing request:', JSON.stringify(input, null, 2));

    const {
      annualTurnover,
      fixedAssets = 0,
      businessType = 'technology',
      isLabelledStartup = false,
      isProfessionalService = false,
      isAgricultural = false,
      agricultureYearsActive = 0,
      inputVATClaimable = 0,
      estimatedExpenses = 0,
      whtDeductedByClients = 0,
      foreignPayments = [],
    } = input;

    // 1. Determine company classification - Section 56, 57, & Thirteenth Schedule
    const isProfessionalServices = isProfessionalService || PROFESSIONAL_SERVICES.includes(businessType.toLowerCase());
    let classification: CompanyClassification;

    // Agricultural businesses get special treatment under Thirteenth Schedule
    if (isAgricultural && agricultureYearsActive > 0 && agricultureYearsActive <= 5) {
      classification = {
        status: 'small', // Classification for reporting purposes
        taxRate: 0,
        reason: `Agricultural exemption active (Year ${agricultureYearsActive} of 5) - Thirteenth Schedule`,
        qualifiesForZeroTax: true,
      };
    } else if (isProfessionalServices) {
      classification = {
        status: 'large',
        taxRate: 30,
        reason: 'Professional services excluded from Small Company status (Section 56)',
        qualifiesForZeroTax: false,
      };
    } else if (annualTurnover <= SMALL_COMPANY_TURNOVER_THRESHOLD && fixedAssets <= SMALL_COMPANY_ASSETS_THRESHOLD) {
      classification = {
        status: 'small',
        taxRate: 0,
        reason: `Turnover ₦${annualTurnover.toLocaleString()} ≤ ₦50M threshold (Section 56)`,
        qualifiesForZeroTax: true,
      };
    } else if (annualTurnover <= 100_000_000) {
      classification = {
        status: 'medium',
        taxRate: 20,
        reason: `Turnover ₦${annualTurnover.toLocaleString()} exceeds small company threshold`,
        qualifiesForZeroTax: false,
      };
    } else {
      classification = {
        status: 'large',
        taxRate: 30,
        reason: `Turnover ₦${annualTurnover.toLocaleString()} in large company bracket`,
        qualifiesForZeroTax: false,
      };
    }

    // 2. Calculate cross-border payment obligations
    const paymentBreakdowns: PaymentBreakdown[] = foreignPayments.map(payment => {
      const whtRate = WHT_RATES[payment.serviceType.toLowerCase()] || WHT_RATES.technical;
      const monthlyGross = payment.monthlyAmount;
      const monthlyWHT = monthlyGross * whtRate;
      const monthlyVAT = monthlyGross * VAT_RATE;  // Self-assess VAT on imported services
      const monthlyNetToRecipient = monthlyGross - monthlyWHT;
      const monthlyRemittance = monthlyWHT + monthlyVAT;

      const annualGross = payment.annualTotal || monthlyGross * 12;
      const annualWHT = annualGross * whtRate;
      const annualVAT = annualGross * VAT_RATE;
      const annualRemittance = annualWHT + annualVAT;

      return {
        recipient: payment.recipient,
        country: payment.country,
        monthlyGross,
        monthlyVAT,
        monthlyWHT,
        monthlyNetToRecipient,
        monthlyRemittance,
        annualGross,
        annualVAT,
        annualWHT,
        annualRemittance,
        whtRate: whtRate * 100,
        serviceType: payment.serviceType,
      };
    });

    // 3. Calculate professional services tax breakdown if applicable
    let professionalServicesTax: ProfessionalServicesTaxBreakdown | undefined;

    if (isProfessionalServices && !classification.qualifiesForZeroTax) {
      const taxableProfit = annualTurnover - estimatedExpenses;
      const grossCompanyTax = taxableProfit * (classification.taxRate / 100);
      const netTaxPayable = Math.max(0, grossCompanyTax - whtDeductedByClients);
      const vatCollected = annualTurnover * VAT_RATE;
      const inputVAT = estimatedExpenses * VAT_RATE * 0.1; // Assume ~10% of expenses have VAT
      const netVATPayable = vatCollected - inputVAT;

      professionalServicesTax = {
        grossIncome: annualTurnover,
        allowableExpenses: estimatedExpenses,
        taxableProfit,
        grossCompanyTax,
        whtCreditAvailable: whtDeductedByClients,
        netTaxPayable,
        vatCollected,
        inputVAT,
        netVATPayable,
        section57Exclusion: true,
      };
    }

    // 3b. Calculate agricultural tax breakdown if applicable
    let agriculturalTax: AgriculturalTaxBreakdown | undefined;

    if (isAgricultural) {
      const taxableProfit = annualTurnover - estimatedExpenses;
      const yearsRemaining = Math.max(0, 5 - agricultureYearsActive);
      const exemptionActive = agricultureYearsActive > 0 && agricultureYearsActive <= 5;

      // Tax that would apply without agricultural exemption
      let taxRateWithoutExemption = 30; // Default to large company rate
      if (annualTurnover <= SMALL_COMPANY_TURNOVER_THRESHOLD && fixedAssets <= SMALL_COMPANY_ASSETS_THRESHOLD) {
        taxRateWithoutExemption = 0;
      } else if (annualTurnover <= 100_000_000) {
        taxRateWithoutExemption = 20;
      }
      const taxWithoutExemption = taxableProfit * (taxRateWithoutExemption / 100);
      const taxWithExemption = exemptionActive ? 0 : taxWithoutExemption;
      const taxSavings = taxWithoutExemption - taxWithExemption;

      // Zero-rated VAT for agricultural products (Section 187)
      const vatCollected = 0; // Zero-rated supplies
      const vatRefundDue = inputVATClaimable; // Input VAT is refundable for zero-rated suppliers

      // Product breakdown (typical for cattle ranching)
      const products = [
        { name: 'Live Cattle Sales', amount: annualTurnover * 0.8125, vatTreatment: 'Zero-rated (Section 187)' },
        { name: 'Fresh Milk Sales', amount: annualTurnover * 0.1875, vatTreatment: 'Zero-rated (Section 187)' },
      ];

      agriculturalTax = {
        isAgricultural: true,
        yearsActive: agricultureYearsActive,
        yearsRemaining,
        exemptionActive,
        grossIncome: annualTurnover,
        allowableExpenses: estimatedExpenses,
        taxableProfit,
        taxWithoutExemption,
        taxWithExemption,
        taxSavings,
        vatCollected,
        inputVATClaimable,
        vatRefundDue,
        products,
      };
    }

    // 4. Calculate annual summary
    const annualSummary = {
      totalForeignPayments: paymentBreakdowns.reduce((sum, p) => sum + p.annualGross, 0),
      totalVATOnImports: paymentBreakdowns.reduce((sum, p) => sum + p.annualVAT, 0),
      totalWHTRemitted: paymentBreakdowns.reduce((sum, p) => sum + p.annualWHT, 0),
      totalRemittance: paymentBreakdowns.reduce((sum, p) => sum + p.annualRemittance, 0),
      companyTax: agriculturalTax
        ? agriculturalTax.taxWithExemption
        : professionalServicesTax
          ? professionalServicesTax.grossCompanyTax
          : (classification.qualifiesForZeroTax ? 0 : annualTurnover * (classification.taxRate / 100) * 0.3),
      netTaxPayable: agriculturalTax ? 0 : professionalServicesTax?.netTaxPayable,
      vatCollected: agriculturalTax ? 0 : professionalServicesTax?.vatCollected,
      netVATPayable: agriculturalTax ? -(agriculturalTax.vatRefundDue) : professionalServicesTax?.netVATPayable,
      vatRefundDue: agriculturalTax?.vatRefundDue,
    };

    // 5. Startup benefits
    const startupBenefits: string[] = [];
    if (isLabelledStartup) {
      startupBenefits.push('Investors holding equity 24+ months qualify for CGT exemption on disposal');
      startupBenefits.push('R&D expenses deductible up to 5% of turnover (Section 165)');
      startupBenefits.push('May qualify for Pioneer Status incentives');
      startupBenefits.push('Potential tax holiday on profits reinvested in R&D');
    }

    // 6. Compliance checklist
    const complianceChecklist: string[] = [];

    if (isAgricultural && agriculturalTax?.exemptionActive) {
      complianceChecklist.push(`✓ Section 163(1)(p): Agricultural income exemption active (Year ${agricultureYearsActive} of 5)`);
      complianceChecklist.push('✓ Thirteenth Schedule: Livestock/dairy production qualifies');
      complianceChecklist.push(`💰 Tax savings this year: ₦${agriculturalTax.taxSavings.toLocaleString()}`);
      complianceChecklist.push(`📅 Exemption expires in ${agriculturalTax.yearsRemaining} years`);
      complianceChecklist.push('✓ Section 187: All supplies zero-rated (live cattle, fresh milk)');
      if (inputVATClaimable > 0) {
        complianceChecklist.push(`💵 Section 156: Input VAT refund claim eligible: ₦${inputVATClaimable.toLocaleString()}`);
      }
      complianceChecklist.push('📄 Keep detailed records of agricultural production');
      complianceChecklist.push('📄 Maintain proof of primary production status');
    } else if (isProfessionalServices) {
      complianceChecklist.push('⚠ Section 57: Professional services EXCLUDED from Small Company status');
      complianceChecklist.push(`⚠ Company tax at ${classification.taxRate}% applies regardless of turnover`);
      if (whtDeductedByClients > 0) {
        complianceChecklist.push(`✓ WHT Credit: ₦${whtDeductedByClients.toLocaleString()} deducted by clients available as credit`);
      }
      complianceChecklist.push('📅 Quarterly VAT filing required for professional services');
      complianceChecklist.push('📄 Annual company income tax return with audited accounts');
    } else if (classification.qualifiesForZeroTax) {
      complianceChecklist.push('✓ Section 56: Small Company status verified - 0% company tax');
    } else {
      complianceChecklist.push(`⚠ Section 56: Company tax at ${classification.taxRate}%`);
    }

    if (foreignPayments.length > 0) {
      complianceChecklist.push('⚠ Section 151: VAT self-assessment required on imported services');
      complianceChecklist.push('⚠ WHT: Withhold and remit tax on foreign payments');
      complianceChecklist.push('📅 Remittance deadline: 21st of following month');
      complianceChecklist.push('📄 File WHT returns with FIRS monthly');
    }

    if (isLabelledStartup) {
      complianceChecklist.push('✓ Nigeria Startup Act: Label benefits apply');
    }

    // 7. Act references
    const actReferences: string[] = [];

    if (isAgricultural) {
      actReferences.push('Section 163(1)(p): Agricultural income exemption');
      actReferences.push('Thirteenth Schedule: Exempt agricultural activities');
      actReferences.push('Section 187: Zero-rated VAT on agricultural products');
      actReferences.push('Section 156: Input VAT credit for zero-rated suppliers');
    }

    if (isProfessionalServices) {
      actReferences.push('Section 57: Professional services exclusion');
      actReferences.push('Section 30: Allowable deductions for businesses');
      actReferences.push('Section 148: VAT at 7.5% on services');
    }

    actReferences.push('Section 56: Small Company classification');

    if (foreignPayments.length > 0) {
      actReferences.push('Section 151: VAT on imported services');
      actReferences.push('Section 79: Withholding Tax on payments to non-residents');
    }

    if (isLabelledStartup) {
      actReferences.push('Nigeria Startup Act 2022: Labelled Startup benefits');
      actReferences.push('Section 165: R&D deductions');
    }

    const result: CrossBorderResult = {
      success: true,
      companyClassification: classification,
      isLabelledStartup,
      isProfessionalService: isProfessionalServices,
      isAgricultural,
      startupBenefits,
      paymentBreakdowns,
      professionalServicesTax,
      agriculturalTax,
      annualSummary,
      complianceChecklist,
      actReferences,
    };

    console.log('[cross-border-tax] Result:', JSON.stringify(result, null, 2));

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[cross-border-tax] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
