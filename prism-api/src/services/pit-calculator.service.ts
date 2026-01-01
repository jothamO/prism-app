/**
 * Personal Income Tax (PIT) Calculator
 * Tax Act 2025 - Section 58 & Fourth Schedule
 * 
 * Graduated tax rates from 0% to 25% based on chargeable income
 */

interface TaxBracket {
    limit: number;
    rate: number;
    previousLimit: number;
}

interface TaxBreakdown {
    bracket: string;
    amount: number;
    rate: number;
    tax: number;
}

interface PITDeductions {
    pensionContributions?: number;
    nhfContributions?: number;
    nhisContributions?: number;
    annualRent?: number;
    lifeInsurance?: number;
    housingLoanInterest?: number;
}

interface PITCalculation {
    grossIncome: number;
    totalDeductions: number;
    chargeableIncome: number;
    totalTax: number;
    effectiveRate: number;
    marginalRate: number;
    breakdown: TaxBreakdown[];
}

export class PITCalculatorService {
    /**
     * Tax brackets per Fourth Schedule (Section 58)
     * Graduated rates from 0% to 25%
     */
    private readonly brackets: TaxBracket[] = [
        { limit: 800_000, rate: 0, previousLimit: 0 },
        { limit: 3_000_000, rate: 0.15, previousLimit: 800_000 },
        { limit: 12_000_000, rate: 0.18, previousLimit: 3_000_000 },
        { limit: 25_000_000, rate: 0.21, previousLimit: 12_000_000 },
        { limit: 50_000_000, rate: 0.23, previousLimit: 25_000_000 },
        { limit: Infinity, rate: 0.25, previousLimit: 50_000_000 }
    ];

    /**
     * Calculate Personal Income Tax based on graduated rates
     * 
     * @param grossIncome - Total annual income before deductions
     * @param deductions - Eligible deductions (pension, rent, etc.)
     * @returns Detailed tax calculation
     */
    calculate(grossIncome: number, deductions: PITDeductions = {}): PITCalculation {
        // Calculate total eligible deductions
        const totalDeductions = this.calculateDeductions(deductions);

        // Chargeable income = Gross income - Deductions
        const chargeableIncome = Math.max(0, grossIncome - totalDeductions);

        // Calculate tax using graduated brackets
        let totalTax = 0;
        const breakdown: TaxBreakdown[] = [];
        let marginalRate = 0;

        for (const bracket of this.brackets) {
            if (chargeableIncome <= bracket.previousLimit) {
                break; // No income in this bracket
            }

            // Calculate taxable amount in this bracket
            const taxableInBracket = Math.min(
                chargeableIncome - bracket.previousLimit,
                bracket.limit - bracket.previousLimit
            );

            const taxInBracket = taxableInBracket * bracket.rate;
            totalTax += taxInBracket;
            marginalRate = bracket.rate;

            // Add to breakdown if there's tax
            if (taxInBracket > 0 || (taxableInBracket > 0 && bracket.rate === 0)) {
                breakdown.push({
                    bracket: bracket.limit === Infinity
                        ? `Above ₦${bracket.previousLimit.toLocaleString()}`
                        : `₦${bracket.previousLimit.toLocaleString()} - ₦${bracket.limit.toLocaleString()}`,
                    amount: taxableInBracket,
                    rate: bracket.rate * 100,
                    tax: taxInBracket
                });
            }
        }

        const effectiveRate = chargeableIncome > 0 ? (totalTax / chargeableIncome) * 100 : 0;

        return {
            grossIncome,
            totalDeductions,
            chargeableIncome,
            totalTax,
            effectiveRate,
            marginalRate: marginalRate * 100,
            breakdown
        };
    }

    /**
     * Calculate eligible deductions (Section 30)
     * 
     * Allowed deductions:
     * - Pension contributions (approved schemes)
     * - NHF contributions
     * - NHIS contributions  
     * - Rent relief: 20% of annual rent, max ₦500,000
     * - Life insurance premiums
     * - Housing loan interest (owner-occupied)
     */
    calculateDeductions(input: PITDeductions): number {
        let total = 0;

        // Pension contributions (Pension Reform Act approved schemes)
        if (input.pensionContributions) {
            total += input.pensionContributions;
        }

        // National Housing Fund (NHF) contributions
        if (input.nhfContributions) {
            total += input.nhfContributions;
        }

        // National Health Insurance Scheme (NHIS) contributions
        if (input.nhisContributions) {
            total += input.nhisContributions;
        }

        // Rent relief: 20% of annual rent, maximum ₦500,000
        if (input.annualRent) {
            const rentRelief = Math.min(
                input.annualRent * 0.20,
                500_000
            );
            total += rentRelief;
        }

        // Life insurance premiums (for self or spouse)
        if (input.lifeInsurance) {
            total += input.lifeInsurance;
        }

        // Interest on housing loan (owner-occupied residential property)
        if (input.housingLoanInterest) {
            total += input.housingLoanInterest;
        }

        return total;
    }

    /**
     * Quick tax estimate (no deductions)
     */
    quickEstimate(grossIncome: number): number {
        return this.calculate(grossIncome).totalTax;
    }

    /**
     * Calculate monthly tax (for PAYE)
     */
    calculateMonthly(annualIncome: number, deductions: PITDeductions = {}): number {
        const annualTax = this.calculate(annualIncome, deductions).totalTax;
        return annualTax / 12;
    }

    /**
     * Get tax saving from deductions
     */
    getTaxSaving(grossIncome: number, deductions: PITDeductions): {
        withoutDeductions: number;
        withDeductions: number;
        saving: number;
        savingPercentage: number;
    } {
        const withoutDeductions = this.calculate(grossIncome).totalTax;
        const withDeductions = this.calculate(grossIncome, deductions).totalTax;
        const saving = withoutDeductions - withDeductions;
        const savingPercentage = withoutDeductions > 0
            ? (saving / withoutDeductions) * 100
            : 0;

        return {
            withoutDeductions,
            withDeductions,
            saving,
            savingPercentage
        };
    }

    /**
     * Check if income qualifies for minimum wage exemption
     * Section 58: National minimum wage earners exempt from income tax
     * Updated to ₦70,000/month per 2024 National Minimum Wage Act
     */
    isMinimumWageExempt(annualIncome: number, minimumWage: number = 70_000): boolean {
        const annualMinimumWage = minimumWage * 12; // ₦70,000/month = ₦840,000/year
        return annualIncome <= annualMinimumWage;
    }

    /**
     * Check if income is pension exempt (Section 163)
     * Pension, gratuity and retirement benefits under Pension Reform Act are fully exempt
     */
    isPensionExempt(incomeType: 'employment' | 'pension' | 'business' | 'mixed'): boolean {
        return incomeType === 'pension';
    }

    /**
     * Calculate tax for pensioner (fully exempt under Section 163)
     */
    calculatePensionerTax(grossPension: number): PITCalculation {
        return {
            grossIncome: grossPension,
            totalDeductions: 0,
            chargeableIncome: 0,
            totalTax: 0,
            effectiveRate: 0,
            marginalRate: 0,
            breakdown: [{
                bracket: 'Pension Exemption (Section 163)',
                amount: grossPension,
                rate: 0,
                tax: 0
            }]
        };
    }

    /**
     * Calculate tax for mixed income (pension + other)
     * Only the non-pension portion is taxable
     */
    calculateMixedIncome(totalIncome: number, pensionAmount: number, deductions: PITDeductions = {}): PITCalculation & { pensionExemption: number } {
        const taxableIncome = Math.max(0, totalIncome - pensionAmount);
        const result = this.calculate(taxableIncome, deductions);
        
        return {
            ...result,
            grossIncome: totalIncome,
            pensionExemption: pensionAmount
        };
    }
}

export const pitCalculatorService = new PITCalculatorService();
