import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Nigeria Tax Act 2025 - Section 58 Progressive Tax Rates
 * Fourth Schedule - Personal Income Tax Rates
 */
const TAX_BANDS = [
  { min: 0, max: 800000, rate: 0, label: 'First ₦800,000' },
  { min: 800000, max: 3000000, rate: 0.15, label: 'Next ₦2,200,000' },
  { min: 3000000, max: 12000000, rate: 0.18, label: 'Next ₦9,000,000' },
  { min: 12000000, max: 25000000, rate: 0.21, label: 'Next ₦13,000,000' },
  { min: 25000000, max: 50000000, rate: 0.23, label: 'Next ₦25,000,000' },
  { min: 50000000, max: Infinity, rate: 0.25, label: 'Above ₦50,000,000' },
];

// National Minimum Wage exemption threshold (Section 58)
const MINIMUM_WAGE_ANNUAL = 420000; // ₦35,000/month × 12

/**
 * Income types for Section 163 exemptions
 */
type IncomeType = 'employment' | 'pension' | 'business' | 'mixed';

interface DeductionsInput {
  pension?: number; // Percentage or fixed amount
  nhf?: number; // National Housing Fund (2.5% of basic salary)
  nhis?: number; // National Health Insurance
  rentPaid?: number; // Annual rent for relief
  lifeInsurance?: number; // Premium paid
  housingLoanInterest?: number; // Interest on housing loan
  // Freelancer/Business deductions (Section 20)
  businessExpenses?: number; // Office rent, utilities, internet
  equipmentCosts?: number; // Computer, phone, software
  professionalFees?: number; // Accounting, legal fees
  advertisingMarketing?: number; // Business promotion
  travelExpenses?: number; // Business travel
}

interface TaxBandBreakdown {
  band: string;
  taxableInBand: number;
  rate: number;
  taxInBand: number;
}

interface IncomeTaxResult {
  grossIncome: number;
  period: 'annual' | 'monthly';
  incomeType?: IncomeType;
  deductions: {
    pension: number;
    nhf: number;
    nhis: number;
    rentRelief: number;
    lifeInsurance: number;
    housingLoanInterest: number;
    businessExpenses: number;
    total: number;
  };
  businessExpensesBreakdown?: {
    businessExpenses: number;
    equipmentCosts: number;
    professionalFees: number;
    advertisingMarketing: number;
    travelExpenses: number;
    total: number;
  };
  pensionExemption?: number;
  taxableIncome?: number;
  netBusinessIncome?: number;
  chargeableIncome: number;
  taxBreakdown: TaxBandBreakdown[];
  totalTax: number;
  effectiveRate: number;
  netIncome: number;
  monthlyTax: number;
  monthlyNetIncome: number;
  isMinimumWageExempt: boolean;
  isPensionExempt?: boolean;
  isFreelancer?: boolean;
  freelancerTips?: string[];
  actReference: string;
}

function calculateBusinessExpenses(deductions: DeductionsInput): {
  businessExpenses: number;
  equipmentCosts: number;
  professionalFees: number;
  advertisingMarketing: number;
  travelExpenses: number;
  total: number;
} {
  const businessExpenses = deductions.businessExpenses ?? 0;
  const equipmentCosts = deductions.equipmentCosts ?? 0;
  const professionalFees = deductions.professionalFees ?? 0;
  const advertisingMarketing = deductions.advertisingMarketing ?? 0;
  const travelExpenses = deductions.travelExpenses ?? 0;
  
  const total = businessExpenses + equipmentCosts + professionalFees + advertisingMarketing + travelExpenses;
  
  return { businessExpenses, equipmentCosts, professionalFees, advertisingMarketing, travelExpenses, total };
}

function calculateDeductions(
  grossIncome: number,
  deductions: DeductionsInput,
  incomeType: IncomeType = 'employment'
): { pension: number; nhf: number; nhis: number; rentRelief: number; lifeInsurance: number; housingLoanInterest: number; businessExpenses: number; total: number } {
  // For freelancers/business income, pension/NHF/NHIS are optional (not automatic)
  const isFreelancer = incomeType === 'business';
  
  // Pension contribution (typically 8% of basic + housing + transport, max 18% employer+employee)
  // Freelancers don't have automatic pension unless they opt-in
  const pension = isFreelancer ? (deductions.pension ?? 0) : (deductions.pension ?? (grossIncome * 0.08));
  
  // National Housing Fund (2.5% of basic salary) - employees only
  const nhf = isFreelancer ? (deductions.nhf ?? 0) : (deductions.nhf ?? (grossIncome * 0.025));
  
  // NHIS contribution (typically 5% of basic salary, 3.25% employee portion) - employees only
  const nhis = isFreelancer ? (deductions.nhis ?? 0) : (deductions.nhis ?? (grossIncome * 0.0325));
  
  // Rent relief - 50% of rent paid or 25% of total income, whichever is less
  let rentRelief = 0;
  if (deductions.rentPaid) {
    rentRelief = Math.min(deductions.rentPaid * 0.5, grossIncome * 0.25);
  }
  
  // Life insurance premium deduction
  const lifeInsurance = deductions.lifeInsurance ?? 0;
  
  // Housing loan interest (first ₦500,000 is deductible)
  const housingLoanInterest = Math.min(deductions.housingLoanInterest ?? 0, 500000);
  
  // Business expenses (Section 20) - for freelancers
  const bizExpenses = calculateBusinessExpenses(deductions);
  const businessExpenses = bizExpenses.total;
  
  const total = pension + nhf + nhis + rentRelief + lifeInsurance + housingLoanInterest + businessExpenses;
  
  return { pension, nhf, nhis, rentRelief, lifeInsurance, housingLoanInterest, businessExpenses, total };
}

function calculateProgressiveTax(chargeableIncome: number): { breakdown: TaxBandBreakdown[]; totalTax: number } {
  const breakdown: TaxBandBreakdown[] = [];
  let totalTax = 0;
  let remainingIncome = chargeableIncome;
  
  for (const band of TAX_BANDS) {
    if (remainingIncome <= 0) break;
    
    const bandWidth = band.max === Infinity ? Infinity : band.max - band.min;
    const taxableInBand = Math.min(remainingIncome, bandWidth);
    const taxInBand = taxableInBand * band.rate;
    
    breakdown.push({
      band: band.label,
      taxableInBand,
      rate: band.rate,
      taxInBand,
    });
    
    totalTax += taxInBand;
    remainingIncome -= taxableInBand;
  }
  
  return { breakdown, totalTax };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // ===== AUTHENTICATION CHECK =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('[income-tax-calculator] Missing authorization header');
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create client with user's token for auth check
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      console.log('[income-tax-calculator] Invalid token:', authError?.message);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[income-tax-calculator] User authenticated:', user.id);
    // ===== END AUTHENTICATION CHECK =====

    const body = await req.json();
    const {
      grossIncome: inputIncome,
      period = 'annual',
      incomeType = 'employment',
      pensionAmount = 0,
      deductions: inputDeductions = {},
      includeDeductions = true
    } = body;

    console.log('Income Tax Calculator Request:', { inputIncome, period, incomeType, pensionAmount, inputDeductions, includeDeductions });

    // Convert to annual if monthly
    const grossIncome = period === 'monthly' ? inputIncome * 12 : inputIncome;
    const annualPensionAmount = period === 'monthly' ? pensionAmount * 12 : pensionAmount;

    // Check for pension exemption (Section 163)
    // "pension, gratuity or retirement benefits under Pension Reform Act are fully exempt"
    if (incomeType === 'pension') {
      const result: IncomeTaxResult = {
        grossIncome,
        period,
        incomeType,
        deductions: {
          pension: 0,
          nhf: 0,
          nhis: 0,
          rentRelief: 0,
          lifeInsurance: 0,
          housingLoanInterest: 0,
          businessExpenses: 0,
          total: 0,
        },
        pensionExemption: grossIncome,
        taxableIncome: 0,
        chargeableIncome: 0,
        taxBreakdown: [{
          band: 'Pension Exemption (Section 163)',
          taxableInBand: grossIncome,
          rate: 0,
          taxInBand: 0,
        }],
        totalTax: 0,
        effectiveRate: 0,
        netIncome: grossIncome,
        monthlyTax: 0,
        monthlyNetIncome: grossIncome / 12,
        isMinimumWageExempt: false,
        isPensionExempt: true,
        actReference: 'Section 163 - Pension under Pension Reform Act fully exempt from income tax',
      };

      console.log('Pension exempt result:', result);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle mixed income (pension + other income)
    let taxableIncome = grossIncome;
    let pensionExemption = 0;
    
    if (incomeType === 'mixed' && annualPensionAmount > 0) {
      pensionExemption = annualPensionAmount;
      taxableIncome = Math.max(0, grossIncome - annualPensionAmount);
    }

    // Check minimum wage exemption
    if (taxableIncome <= MINIMUM_WAGE_ANNUAL) {
      const result: IncomeTaxResult = {
        grossIncome,
        period,
        incomeType,
        deductions: {
          pension: 0,
          nhf: 0,
          nhis: 0,
          rentRelief: 0,
          lifeInsurance: 0,
          housingLoanInterest: 0,
          businessExpenses: 0,
          total: 0,
        },
        pensionExemption: pensionExemption > 0 ? pensionExemption : undefined,
        taxableIncome: taxableIncome,
        chargeableIncome: taxableIncome,
        taxBreakdown: [{
          band: pensionExemption > 0 ? 'Pension Exempt + Minimum Wage' : 'Minimum Wage Exemption',
          taxableInBand: taxableIncome,
          rate: 0,
          taxInBand: 0,
        }],
        totalTax: 0,
        effectiveRate: 0,
        netIncome: grossIncome,
        monthlyTax: 0,
        monthlyNetIncome: grossIncome / 12,
        isMinimumWageExempt: true,
        actReference: pensionExemption > 0 
          ? 'Section 163 (Pension Exempt) + Section 58 (Minimum Wage Exempt)' 
          : 'Section 58 - Minimum wage earners exempt from income tax',
      };

      console.log('Minimum wage exempt:', result);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate business expenses for freelancers (Section 20)
    const isFreelancer = incomeType === 'business';
    const businessExpensesBreakdown = isFreelancer ? calculateBusinessExpenses(inputDeductions) : undefined;
    
    // For freelancers, net business income = gross - business expenses
    let netBusinessIncome = taxableIncome;
    if (isFreelancer && businessExpensesBreakdown) {
      netBusinessIncome = Math.max(0, taxableIncome - businessExpensesBreakdown.total);
    }

    // Calculate deductions based on net business income (for freelancers) or taxable income (for employees)
    const incomeForDeductions = isFreelancer ? netBusinessIncome : taxableIncome;
    const deductions = includeDeductions
      ? calculateDeductions(incomeForDeductions, inputDeductions, incomeType)
      : { pension: 0, nhf: 0, nhis: 0, rentRelief: 0, lifeInsurance: 0, housingLoanInterest: 0, businessExpenses: 0, total: 0 };

    // Calculate chargeable income (already includes business expenses for freelancers via deductions)
    const chargeableIncome = isFreelancer 
      ? Math.max(0, netBusinessIncome - (deductions.total - deductions.businessExpenses)) // Avoid double-counting biz expenses
      : Math.max(0, taxableIncome - deductions.total);

    // Calculate progressive tax
    const { breakdown, totalTax } = calculateProgressiveTax(chargeableIncome);

    // Calculate final values
    const effectiveRate = grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0;
    const netIncome = grossIncome - totalTax - (isFreelancer ? (businessExpensesBreakdown?.total || 0) : deductions.total);
    const monthlyTax = totalTax / 12;
    const monthlyNetIncome = netIncome / 12;

    // Freelancer tips
    const freelancerTips = isFreelancer ? [
      'Register as Small Company for 0% rate if turnover ≤₦50M (Section 56)',
      'Keep receipts for all business expenses (Section 32)',
      'R&D expenses get additional deduction (Section 165)',
      'Consider voluntary pension contributions for tax relief'
    ] : undefined;

    const result: IncomeTaxResult = {
      grossIncome,
      period,
      incomeType,
      deductions,
      businessExpensesBreakdown,
      pensionExemption: pensionExemption > 0 ? pensionExemption : undefined,
      taxableIncome: pensionExemption > 0 || isFreelancer ? taxableIncome : undefined,
      netBusinessIncome: isFreelancer ? netBusinessIncome : undefined,
      chargeableIncome,
      taxBreakdown: breakdown,
      totalTax,
      effectiveRate,
      netIncome,
      monthlyTax,
      monthlyNetIncome,
      isMinimumWageExempt: false,
      isPensionExempt: false,
      isFreelancer,
      freelancerTips,
      actReference: isFreelancer 
        ? 'Section 20, 21, 28 - Business Income; Section 58 - Progressive Rates'
        : pensionExemption > 0 
          ? 'Section 163 (Pension Exempt) + Section 58 (Progressive Rates)'
          : 'Section 58, Fourth Schedule - Personal Income Tax Rates',
    };

    console.log('Income Tax Calculation Result:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error calculating income tax:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});