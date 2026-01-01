import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calculator, Building2, User, Users, TrendingUp, TrendingDown } from "lucide-react";

interface TaxComparison {
  structure: string;
  grossIncome: number;
  taxableIncome: number;
  taxAmount: number;
  effectiveRate: number;
  netIncome: number;
  advantages: string[];
  disadvantages: string[];
}

interface ComparisonResult {
  soleProprietor: TaxComparison;
  limitedCompany: TaxComparison;
  partnership: TaxComparison;
  bestOption: string;
  annualSavings: number;
}

// Progressive PIT bands (Nigeria Tax Act 2025)
const PIT_BANDS = [
  { min: 0, max: 800000, rate: 0 },
  { min: 800000, max: 2400000, rate: 0.15 },
  { min: 2400000, max: 4000000, rate: 0.19 },
  { min: 4000000, max: 6400000, rate: 0.21 },
  { min: 6400000, max: 11200000, rate: 0.23 },
  { min: 11200000, max: Infinity, rate: 0.24 },
];

// Company tax rates
const COMPANY_TAX_RATES = {
  small: 0, // Turnover ≤ ₦50M
  medium: 0.20, // Turnover > ₦50M & ≤ ₦200M
  large: 0.30, // Turnover > ₦200M
};

const calculateProgressiveTax = (income: number): number => {
  let tax = 0;
  let remaining = income;

  for (const band of PIT_BANDS) {
    if (remaining <= 0) break;
    const bandWidth = band.max - band.min;
    const taxableInBand = Math.min(remaining, bandWidth);
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
  }

  return tax;
};

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount);
};

export default function TaxComparisonDashboard() {
  const [grossIncome, setGrossIncome] = useState("24000000"); // ₦24M default
  const [businessExpenses, setBusinessExpenses] = useState("6000000"); // 25% expenses
  const [partnerCount, setPartnerCount] = useState("2");
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  const handleCalculateComparison = () => {
    const income = parseFloat(grossIncome);
    const expenses = parseFloat(businessExpenses);
    const partners = parseInt(partnerCount);
    const profit = income - expenses;

    // 1. Sole Proprietor (Individual PIT)
    const spTax = calculateProgressiveTax(profit);
    const soleProprietor: TaxComparison = {
      structure: "Sole Proprietor",
      grossIncome: income,
      taxableIncome: profit,
      taxAmount: spTax,
      effectiveRate: (spTax / profit) * 100,
      netIncome: profit - spTax,
      advantages: [
        "Simple setup and compliance",
        "No corporate formalities",
        "Full control of business",
        "Direct access to profits",
      ],
      disadvantages: [
        "Unlimited personal liability",
        "Progressive tax rates up to 24%",
        "Limited growth options",
        "No liability protection",
      ],
    };

    // 2. Limited Company
    let companyTaxRate = COMPANY_TAX_RATES.small;
    let companyStatus = "Small Company (0% CIT)";
    if (income > 200000000) {
      companyTaxRate = COMPANY_TAX_RATES.large;
      companyStatus = "Large Company (30% CIT)";
    } else if (income > 50000000) {
      companyTaxRate = COMPANY_TAX_RATES.medium;
      companyStatus = "Medium Company (20% CIT)";
    }

    const companyTax = profit * companyTaxRate;
    // Dividend withholding tax (10%) on distribution
    const profitAfterCIT = profit - companyTax;
    const dividendWHT = profitAfterCIT * 0.10;
    const totalLtdTax = companyTax + dividendWHT;

    const limitedCompany: TaxComparison = {
      structure: `Limited Company (${companyStatus})`,
      grossIncome: income,
      taxableIncome: profit,
      taxAmount: totalLtdTax,
      effectiveRate: (totalLtdTax / profit) * 100,
      netIncome: profit - totalLtdTax,
      advantages: [
        "Limited liability protection",
        income <= 50000000 ? "0% Company Income Tax (Small Company)" : `${companyTaxRate * 100}% CIT rate`,
        "Professional credibility",
        "Easier to raise capital",
        "Perpetual existence",
      ],
      disadvantages: [
        "10% Dividend WHT on distributions",
        "Higher compliance costs",
        "Annual returns required",
        "Audit requirements",
      ],
    };

    // 3. Partnership (Split income among partners)
    const incomePerPartner = profit / partners;
    const taxPerPartner = calculateProgressiveTax(incomePerPartner);
    const totalPartnershipTax = taxPerPartner * partners;

    const partnership: TaxComparison = {
      structure: `Partnership (${partners} partners)`,
      grossIncome: income,
      taxableIncome: profit,
      taxAmount: totalPartnershipTax,
      effectiveRate: (totalPartnershipTax / profit) * 100,
      netIncome: profit - totalPartnershipTax,
      advantages: [
        "Income split among partners",
        "Lower individual tax brackets",
        "Shared expertise & resources",
        "Simple profit distribution",
      ],
      disadvantages: [
        "Joint and several liability",
        "Potential partner disputes",
        "Limited life span",
        "Shared decision making",
      ],
    };

    // Determine best option
    const options = [
      { name: "Sole Proprietor", tax: spTax },
      { name: "Limited Company", tax: totalLtdTax },
      { name: "Partnership", tax: totalPartnershipTax },
    ];
    options.sort((a, b) => a.tax - b.tax);
    const bestOption = options[0].name;
    const worstOption = options[options.length - 1];
    const annualSavings = worstOption.tax - options[0].tax;

    setComparisonResult({
      soleProprietor,
      limitedCompany,
      partnership,
      bestOption,
      annualSavings,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Tax Comparison Dashboard</CardTitle>
        </div>
        <CardDescription>
          Compare tax obligations under different business structures
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
          <div>
            <label className="text-sm font-medium">Annual Gross Income</label>
            <Input
              type="number"
              value={grossIncome}
              onChange={(e) => setGrossIncome(e.target.value)}
              placeholder="₦24,000,000"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Business Expenses</label>
            <Input
              type="number"
              value={businessExpenses}
              onChange={(e) => setBusinessExpenses(e.target.value)}
              placeholder="₦6,000,000"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Partners (for Partnership)</label>
            <Input
              type="number"
              min="2"
              max="10"
              value={partnerCount}
              onChange={(e) => setPartnerCount(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        <Button onClick={handleCalculateComparison} className="w-full">
          <Calculator className="h-4 w-4 mr-2" />
          Compare Business Structures
        </Button>

        {/* Results */}
        {comparisonResult && (
          <div className="space-y-4">
            {/* Best Option Banner */}
            <div className="p-4 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-primary" />
                <span className="font-bold text-primary">Lowest Tax Option: {comparisonResult.bestOption}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Annual savings of {formatCurrency(comparisonResult.annualSavings)} compared to highest tax option
              </p>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Sole Proprietor */}
              <ComparisonCard
                comparison={comparisonResult.soleProprietor}
                icon={<User className="h-5 w-5" />}
                isBest={comparisonResult.bestOption === "Sole Proprietor"}
              />

              {/* Limited Company */}
              <ComparisonCard
                comparison={comparisonResult.limitedCompany}
                icon={<Building2 className="h-5 w-5" />}
                isBest={comparisonResult.bestOption === "Limited Company"}
              />

              {/* Partnership */}
              <ComparisonCard
                comparison={comparisonResult.partnership}
                icon={<Users className="h-5 w-5" />}
                isBest={comparisonResult.bestOption === "Partnership"}
              />
            </div>

            {/* Tax Rate Reference */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium text-sm mb-3">📖 Nigeria Tax Act 2025 Reference</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="font-medium mb-1">Personal Income Tax (Section 58)</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• ₦0 - ₦800,000: 0%</li>
                    <li>• ₦800,001 - ₦2,400,000: 15%</li>
                    <li>• ₦2,400,001 - ₦4,000,000: 19%</li>
                    <li>• ₦4,000,001 - ₦6,400,000: 21%</li>
                    <li>• ₦6,400,001 - ₦11,200,000: 23%</li>
                    <li>• Above ₦11,200,000: 24%</li>
                  </ul>
                </div>
                <div>
                  <p className="font-medium mb-1">Company Income Tax (Section 56)</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Turnover ≤ ₦50M: 0% (Small Company)</li>
                    <li>• Turnover ₦50M - ₦200M: 20% (Medium)</li>
                    <li>• Turnover &gt; ₦200M: 30% (Large)</li>
                    <li className="mt-2 text-yellow-600">• Dividend WHT: 10%</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComparisonCard({ comparison, icon, isBest }: { comparison: TaxComparison; icon: React.ReactNode; isBest: boolean }) {
  return (
    <div className={`p-4 rounded-lg border-2 ${isBest ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={isBest ? 'text-primary' : 'text-muted-foreground'}>{icon}</div>
        <h4 className="font-medium text-sm">{comparison.structure}</h4>
        {isBest && (
          <span className="ml-auto text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">BEST</span>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Taxable Income</span>
          <span className="font-mono">{formatCurrency(comparison.taxableIncome)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total Tax</span>
          <span className="font-mono text-red-500">{formatCurrency(comparison.taxAmount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Effective Rate</span>
          <span className="font-mono">{comparison.effectiveRate.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between font-medium pt-2 border-t">
          <span>Net Income</span>
          <span className="font-mono text-green-600">{formatCurrency(comparison.netIncome)}</span>
        </div>
      </div>

      {/* Pros & Cons */}
      <div className="mt-4 space-y-2">
        <div>
          <p className="text-xs font-medium text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Advantages
          </p>
          <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
            {comparison.advantages.slice(0, 3).map((adv, i) => (
              <li key={i}>• {adv}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-red-500 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" /> Disadvantages
          </p>
          <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
            {comparison.disadvantages.slice(0, 3).map((dis, i) => (
              <li key={i}>• {dis}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
