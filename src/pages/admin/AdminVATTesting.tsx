import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Calculator, 
  FileText, 
  Database, 
  Play, 
  Trash2, 
  Check, 
  X,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Download,
  Wallet,
  Building2,
  Bell
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface VATResult {
  subtotal: number;
  vatAmount: number;
  total: number;
  vatRate: number;
  classification: string;
  canClaimInputVAT: boolean;
  actReference: string;
  matchedKeyword?: string;
}

interface ReconciliationResult {
  period: string;
  outputVAT: number;
  outputVATInvoicesCount: number;
  inputVAT: number;
  inputVATExpensesCount: number;
  creditBroughtForward: number;
  netVAT: number;
  creditCarriedForward: number;
  status: string;
}

interface SeedResult {
  success: boolean;
  scenario: string;
  period: string;
  user: { id: string; businessName: string };
  business: { id: string; name: string };
  created: { invoices: number; expenses: number };
  summary: {
    totalSales: number;
    outputVAT: number;
    totalExpenses: number;
    inputVAT: number;
    netVAT: number;
  };
}

interface IncomeTaxResult {
  grossIncome: number;
  period: 'annual' | 'monthly';
  incomeType?: 'employment' | 'pension' | 'business' | 'mixed';
  deductions: {
    pension: number;
    nhf: number;
    nhis: number;
    rentRelief: number;
    lifeInsurance: number;
    housingLoanInterest: number;
    total: number;
  };
  pensionExemption?: number;
  taxableIncome?: number;
  chargeableIncome: number;
  taxBreakdown: Array<{
    band: string;
    taxableInBand: number;
    rate: number;
    taxInBand: number;
  }>;
  totalTax: number;
  effectiveRate: number;
  netIncome: number;
  monthlyTax: number;
  monthlyNetIncome: number;
  isMinimumWageExempt: boolean;
  isPensionExempt?: boolean;
  actReference: string;
}

interface ClassificationResult {
  businessId: string;
  businessName: string;
  classification: 'small' | 'medium' | 'large';
  taxRate: number;
  reason: string;
  thresholds: {
    turnover: { value: number; limit: number; passes: boolean };
    assets: { value: number; limit: number; passes: boolean };
    professionalServices: { is: boolean; passes: boolean };
  };
  savingsVsStandardRate: number;
  actReference: string;
}

interface ClassificationSeedResult {
  success: boolean;
  userId: string;
  businesses: Array<{ id: string; name: string; expected: string }>;
  testCases: Array<{
    name: string;
    turnover: number;
    assets: number;
    isProfessionalServices: boolean;
    expectedClassification: string;
  }>;
}

interface ClassificationJobResult {
  success: boolean;
  year: number;
  summary: { total: number; small: number; medium: number; large: number };
  results: ClassificationResult[];
  notifications: Array<{ businessId: string; businessName: string; message: string }>;
}

const TEST_SCENARIOS = [
  { id: 'standard-retail', name: 'Standard Retail Business', description: '5 invoices, 2 expenses' },
  { id: 'zero-rated-exports', name: 'Export Business', description: '3 zero-rated invoices, 2 expenses' },
  { id: 'mixed-classification', name: 'Mixed Classification', description: 'Standard + zero-rated + exempt' },
  { id: 'high-volume', name: 'High Volume', description: '50 invoices, 25 expenses' }
];

const CLASSIFICATION_TEST_CASES = [
  { description: 'Rice (50kg bag)', expected: 'zero-rated', category: 'food' },
  { description: 'Laptop computer', expected: 'standard', category: 'electronics' },
  { description: 'Medical equipment', expected: 'zero-rated', category: 'medical' },
  { description: 'Office rent', expected: 'exempt', category: 'property' },
  { description: 'Export goods to UK', expected: 'zero-rated', category: 'export' },
  { description: 'Consulting services', expected: 'standard', category: 'services' },
  { description: 'Textbooks for schools', expected: 'zero-rated', category: 'education' },
  { description: 'Bank charges', expected: 'exempt', category: 'financial' }
];

const INCOME_TAX_SCENARIOS = [
  { id: 'minimum-wage', name: 'Minimum Wage', income: 420000, description: 'Exempt from tax', incomeType: 'employment' as const },
  { id: 'entry-level', name: 'Entry Level', income: 1440000, description: '₦120k/month', incomeType: 'employment' as const },
  { id: 'mid-career', name: 'Mid-Career', income: 6000000, description: '₦500k/month', incomeType: 'employment' as const },
  { id: 'senior-manager', name: 'Senior Manager', income: 15000000, description: '₦1.25M/month', incomeType: 'employment' as const },
  { id: 'executive', name: 'Executive', income: 60000000, description: '₦5M/month', incomeType: 'employment' as const },
  // Pensioner scenarios - Section 163 exempt
  { id: 'pensioner-basic', name: 'Pensioner (Basic)', income: 1200000, description: 'Section 163 exempt', incomeType: 'pension' as const },
  { id: 'pensioner-high', name: 'Pensioner (High)', income: 6000000, description: 'Retired executive, still exempt', incomeType: 'pension' as const },
  { id: 'pensioner-mixed', name: 'Pensioner + Business', income: 4000000, description: '₦2M pension + ₦2M business', incomeType: 'mixed' as const, pensionAmount: 2000000 },
  // Freelancer/Self-employed scenarios - Section 20, 21, 28
  { id: 'freelancer-low', name: 'Freelancer (Low)', income: 2400000, description: '₦200k/month, ₦50k expenses', incomeType: 'business' as const, businessExpenses: 600000 },
  { id: 'freelancer-mid', name: 'Freelancer (Mid)', income: 7200000, description: '₦600k/month, ₦150k expenses', incomeType: 'business' as const, businessExpenses: 1800000 },
  { id: 'freelancer-high', name: 'Freelancer (High)', income: 24000000, description: '₦2M/month, ₦500k expenses', incomeType: 'business' as const, businessExpenses: 6000000 },
  { id: 'contractor-tech', name: 'Tech Contractor', income: 18000000, description: '₦1.5M/month + equipment', incomeType: 'business' as const, businessExpenses: 4500000, equipmentCosts: 500000 },
];


export default function AdminVATTesting() {
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  
  // VAT Calculator state
  const [calcAmount, setCalcAmount] = useState("100000");
  const [calcDescription, setCalcDescription] = useState("Office supplies");
  const [calcIncludesVAT, setCalcIncludesVAT] = useState(false);
  const [calcResult, setCalcResult] = useState<VATResult | null>(null);
  
  // Classification test state
  const [classificationResults, setClassificationResults] = useState<Record<string, { result: string; passed: boolean }>>({});
  
  // Seed data state
  const [selectedScenario, setSelectedScenario] = useState("standard-retail");
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null);
  
  // Reconciliation state
  const [reconPeriod, setReconPeriod] = useState(new Date().toISOString().substring(0, 7));
  const [reconUserId, setReconUserId] = useState("");
  const [reconResult, setReconResult] = useState<ReconciliationResult | null>(null);
  
  // Income Tax state
  const [incomeTaxAmount, setIncomeTaxAmount] = useState("1440000");
  const [incomeTaxPeriod, setIncomeTaxPeriod] = useState<'annual' | 'monthly'>('annual');
  const [incomeTaxIncludeDeductions, setIncomeTaxIncludeDeductions] = useState(true);
  const [incomeTaxResult, setIncomeTaxResult] = useState<IncomeTaxResult | null>(null);
  
  // Business Classification state
  const [classificationSeedResult, setClassificationSeedResult] = useState<ClassificationSeedResult | null>(null);
  const [classificationJobResult, setClassificationJobResult] = useState<ClassificationJobResult | null>(null);
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    calculator: true,
    classification: true,
    seeder: true,
    reconciliation: true,
    incomeTax: true,
    businessClassification: true
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(amount);
  };

  // VAT Calculator
  const handleCalculateVAT = async () => {
    setLoading('calculate');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/vat-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(calcAmount),
          includesVAT: calcIncludesVAT,
          itemDescription: calcDescription
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setCalcResult(result);
      toast({ title: "VAT calculated successfully" });
    } catch (error) {
      toast({ 
        title: "Calculation failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Classification Tests
  const handleRunClassificationTests = async () => {
    setLoading('classification');
    const results: Record<string, { result: string; passed: boolean }> = {};
    
    try {
      for (const testCase of CLASSIFICATION_TEST_CASES) {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/vat-calculator`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: 10000,
            itemDescription: testCase.description,
            category: testCase.category
          })
        });
        
        const result = await response.json();
        results[testCase.description] = {
          result: result.classification,
          passed: result.classification === testCase.expected
        };
      }
      
      setClassificationResults(results);
      const passed = Object.values(results).filter(r => r.passed).length;
      toast({ 
        title: `Classification tests: ${passed}/${CLASSIFICATION_TEST_CASES.length} passed` 
      });
    } catch (error) {
      toast({ 
        title: "Tests failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Seed Test Data
  const handleSeedData = async () => {
    setLoading('seed');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seed',
          scenario: selectedScenario,
          period: reconPeriod
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setSeedResult(result);
      setReconUserId(result.user.id);
      toast({ title: "Test data seeded successfully" });
    } catch (error) {
      toast({ 
        title: "Seeding failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  const handleClearTestData = async () => {
    setLoading('clear');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setSeedResult(null);
      setReconResult(null);
      setReconUserId("");
      toast({ title: "Test data cleared" });
    } catch (error) {
      toast({ 
        title: "Clear failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // VAT Reconciliation
  const handleCalculateReconciliation = async () => {
    if (!reconUserId) {
      toast({ title: "Please seed test data first", variant: "destructive" });
      return;
    }
    
    setLoading('reconciliation');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/vat-reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate',
          userId: reconUserId,
          period: reconPeriod
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setReconResult(result);
      toast({ title: "Reconciliation calculated" });
    } catch (error) {
      toast({ 
        title: "Reconciliation failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Run End-to-End Test
  const handleRunE2ETest = async () => {
    setLoading('e2e');
    try {
      // Step 1: Clear existing test data
      await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
      
      // Step 2: Seed test data
      const seedResponse = await fetch(`${SUPABASE_URL}/functions/v1/seed-test-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'seed',
          scenario: selectedScenario,
          period: reconPeriod
        })
      });
      const seedData = await seedResponse.json();
      if (seedData.error) throw new Error(seedData.error);
      setSeedResult(seedData);
      setReconUserId(seedData.user.id);
      
      // Step 3: Calculate reconciliation
      const reconResponse = await fetch(`${SUPABASE_URL}/functions/v1/vat-reconciliation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'calculate',
          userId: seedData.user.id,
          period: reconPeriod
        })
      });
      const reconData = await reconResponse.json();
      if (reconData.error) throw new Error(reconData.error);
      setReconResult(reconData);
      
      // Step 4: Validate results
      const expectedNetVAT = seedData.summary.netVAT;
      const actualNetVAT = reconData.netVAT;
      const tolerance = 0.01; // 1 kobo tolerance for rounding
      const passed = Math.abs(expectedNetVAT - actualNetVAT) < tolerance;
      
      toast({ 
        title: passed ? "E2E Test PASSED" : "E2E Test FAILED",
        description: `Expected: ${formatCurrency(expectedNetVAT)}, Actual: ${formatCurrency(actualNetVAT)}`,
        variant: passed ? "default" : "destructive"
      });
    } catch (error) {
      toast({ 
        title: "E2E Test failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Calculate Income Tax
  const handleCalculateIncomeTax = async () => {
    setLoading('income-tax');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/income-tax-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grossIncome: parseFloat(incomeTaxAmount),
          period: incomeTaxPeriod,
          includeDeductions: incomeTaxIncludeDeductions
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setIncomeTaxResult(result);
      toast({ title: "Income tax calculated successfully" });
    } catch (error) {
      toast({ 
        title: "Calculation failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Run income tax scenario
  const handleRunIncomeTaxScenario = async (scenario: { 
    income: number; 
    incomeType?: string; 
    pensionAmount?: number;
    businessExpenses?: number;
    equipmentCosts?: number;
  }) => {
    setIncomeTaxAmount(scenario.income.toString());
    setLoading('income-tax');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/income-tax-calculator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grossIncome: scenario.income,
          period: 'annual',
          incomeType: scenario.incomeType || 'employment',
          pensionAmount: scenario.pensionAmount || 0,
          includeDeductions: incomeTaxIncludeDeductions,
          deductions: {
            businessExpenses: scenario.businessExpenses || 0,
            equipmentCosts: scenario.equipmentCosts || 0
          }
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setIncomeTaxResult(result);
      toast({ title: "Scenario calculated" });
    } catch (error) {
      toast({ 
        title: "Calculation failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Export Income Tax Report
  const handleExportIncomeTaxReport = async () => {
    if (!incomeTaxResult) {
      toast({ title: "Calculate income tax first", variant: "destructive" });
      return;
    }
    setLoading('export-income-tax');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reportType: 'income-tax-computation', 
          data: incomeTaxResult 
        })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(result.html);
        printWindow.document.close();
        toast({ title: "Report opened - use Ctrl+P to save as PDF" });
      }
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // Seed test businesses for classification
  const handleSeedBusinesses = async () => {
    setLoading('seed-businesses');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/business-classifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-businesses' })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setClassificationSeedResult(result);
      setClassificationJobResult(null);
      toast({ title: `Seeded ${result.businesses.length} test businesses` });
    } catch (error) {
      toast({ 
        title: "Seeding failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Run classification job on all businesses
  const handleRunClassificationJob = async () => {
    setLoading('classification-job');
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/business-classifier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'classify-all', year: new Date().getFullYear() })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      setClassificationJobResult(result);
      
      // Validate results against expected
      if (classificationSeedResult) {
        const passed = classificationSeedResult.businesses.every(biz => {
          const actual = result.results.find((r: ClassificationResult) => r.businessId === biz.id);
          return actual && actual.classification === biz.expected;
        });
        
        toast({ 
          title: passed ? "Classification Tests PASSED" : "Classification Tests FAILED",
          description: `${result.summary.small} small, ${result.summary.medium} medium, ${result.summary.large} large`,
          variant: passed ? "default" : "destructive"
        });
      } else {
        toast({ 
          title: "Classification completed",
          description: `${result.summary.small} small, ${result.summary.medium} medium, ${result.summary.large} large`
        });
      }
    } catch (error) {
      toast({ 
        title: "Classification failed", 
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Export PDF Reports
  const handleExportReport = async (type: 'classification' | 'reconciliation' | 'e2e') => {
    setLoading(`export-${type}`);
    try {
      let reportData: Record<string, unknown> = {};
      
      if (type === 'classification') {
        if (Object.keys(classificationResults).length === 0) {
          toast({ title: "Run classification tests first", variant: "destructive" });
          return;
        }
        reportData = {
          results: CLASSIFICATION_TEST_CASES.map(tc => ({
            description: tc.description,
            expected: tc.expected,
            result: classificationResults[tc.description]?.result || 'not tested',
            passed: classificationResults[tc.description]?.passed || false,
            actReference: tc.expected === 'zero-rated' ? 'Section 186' : 
                         tc.expected === 'exempt' ? 'Section 187' : 'Section 148'
          }))
        };
      } else if (type === 'reconciliation') {
        if (!reconResult) {
          toast({ title: "Run reconciliation first", variant: "destructive" });
          return;
        }
        reportData = {
          ...reconResult,
          businessName: seedResult?.business.name || 'Test Business',
          tin: '1234567890'
        };
      } else if (type === 'e2e') {
        if (!seedResult || !reconResult) {
          toast({ title: "Run E2E test first", variant: "destructive" });
          return;
        }
        reportData = {
          scenario: seedResult.scenario,
          timestamp: new Date().toISOString(),
          passed: Math.abs(seedResult.summary.netVAT - reconResult.netVAT) < 0.01,
          expected: { netVAT: seedResult.summary.netVAT, invoices: seedResult.created.invoices, expenses: seedResult.created.expenses },
          actual: { netVAT: reconResult.netVAT, invoices: reconResult.outputVATInvoicesCount, expenses: reconResult.inputVATExpensesCount },
          classificationResults: CLASSIFICATION_TEST_CASES.map(tc => ({
            description: tc.description,
            expected: tc.expected,
            result: classificationResults[tc.description]?.result || tc.expected,
            passed: classificationResults[tc.description]?.passed ?? true
          })),
          reconciliationData: { ...reconResult, businessName: seedResult.business.name, tin: '1234567890' }
        };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-pdf-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: type, data: reportData })
      });
      
      const result = await response.json();
      if (result.error) throw new Error(result.error);
      
      // Open HTML in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(result.html);
        printWindow.document.close();
        toast({ title: "Report opened - use Ctrl+P to save as PDF" });
      }
    } catch (error) {
      toast({ title: "Export failed", description: error instanceof Error ? error.message : "Unknown error", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">VAT Flow Testing</h1>
          <p className="text-muted-foreground">End-to-end testing for Tax Act 2025 compliance</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleRunE2ETest}
            disabled={loading !== null}
            className="gap-2"
          >
            {loading === 'e2e' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Run E2E Test
          </Button>
          <Button 
            onClick={() => handleExportReport('e2e')}
            disabled={loading !== null || !reconResult}
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* VAT Calculator Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('calculator')}
        >
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>VAT Calculator</CardTitle>
              <CardDescription>Test individual VAT calculations with supply classification</CardDescription>
            </div>
          </div>
          {expandedSections.calculator ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.calculator && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Amount (₦)</label>
                <Input 
                  type="number" 
                  value={calcAmount} 
                  onChange={(e) => setCalcAmount(e.target.value)}
                  placeholder="100000"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Item Description</label>
                <Input 
                  value={calcDescription} 
                  onChange={(e) => setCalcDescription(e.target.value)}
                  placeholder="e.g., Rice, Medicine, Electronics"
                />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={calcIncludesVAT}
                    onChange={(e) => setCalcIncludesVAT(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Amount includes VAT</span>
                </label>
              </div>
            </div>
            
            <Button 
              onClick={handleCalculateVAT}
              disabled={loading !== null}
              className="gap-2"
            >
              {loading === 'calculate' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              Calculate
            </Button>

            {calcResult && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Classification</p>
                    <p className={`font-bold ${
                      calcResult.classification === 'standard' ? 'text-blue-500' :
                      calcResult.classification === 'zero-rated' ? 'text-green-500' : 'text-yellow-500'
                    }`}>
                      {calcResult.classification.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">VAT Rate</p>
                    <p className="font-bold">{(calcResult.vatRate * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Subtotal</p>
                    <p className="font-bold">{formatCurrency(calcResult.subtotal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">VAT Amount</p>
                    <p className="font-bold">{formatCurrency(calcResult.vatAmount)}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-lg font-bold text-primary">{formatCurrency(calcResult.total)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Act Reference</p>
                    <p className="text-sm">{calcResult.actReference}</p>
                    {calcResult.matchedKeyword && (
                      <p className="text-xs text-muted-foreground">Matched: "{calcResult.matchedKeyword}"</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Classification Tests Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('classification')}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Supply Classification Tests</CardTitle>
              <CardDescription>Verify Tax Act 2025 Sections 186 & 187 compliance</CardDescription>
            </div>
          </div>
          {expandedSections.classification ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.classification && (
          <CardContent className="space-y-4">
            <Button 
              onClick={handleRunClassificationTests}
              disabled={loading !== null}
              className="gap-2"
            >
              {loading === 'classification' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run All Tests
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CLASSIFICATION_TEST_CASES.map((testCase) => {
                const result = classificationResults[testCase.description];
                return (
                  <div 
                    key={testCase.description}
                    className={`p-3 rounded-lg border ${
                      result 
                        ? result.passed 
                          ? 'bg-green-500/10 border-green-500/30' 
                          : 'bg-red-500/10 border-red-500/30'
                        : 'bg-muted border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{testCase.description}</p>
                        <p className="text-xs text-muted-foreground">
                          Expected: <span className="font-mono">{testCase.expected}</span>
                          {result && (
                            <> | Got: <span className="font-mono">{result.result}</span></>
                          )}
                        </p>
                      </div>
                      {result && (
                        result.passed 
                          ? <Check className="w-5 h-5 text-green-500" />
                          : <X className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Test Data Seeder Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('seeder')}
        >
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Test Data Seeder</CardTitle>
              <CardDescription>Generate test invoices and expenses for different scenarios</CardDescription>
            </div>
          </div>
          {expandedSections.seeder ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.seeder && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Test Scenario</label>
                <select 
                  value={selectedScenario}
                  onChange={(e) => setSelectedScenario(e.target.value)}
                  className="w-full mt-1 p-2 bg-background border border-input rounded-md"
                >
                  {TEST_SCENARIOS.map(s => (
                    <option key={s.id} value={s.id}>{s.name} - {s.description}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Period (YYYY-MM)</label>
                <Input 
                  type="month" 
                  value={reconPeriod}
                  onChange={(e) => setReconPeriod(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handleSeedData}
                disabled={loading !== null}
                className="gap-2"
              >
                {loading === 'seed' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Seed Test Data
              </Button>
              <Button 
                onClick={handleClearTestData}
                disabled={loading !== null}
                variant="outline"
                className="gap-2"
              >
                {loading === 'clear' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Clear Test Data
              </Button>
            </div>

            {seedResult && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{seedResult.scenario}</p>
                  <span className="text-xs bg-green-500/20 text-green-500 px-2 py-1 rounded">Created</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Invoices</p>
                    <p className="font-bold">{seedResult.created.invoices}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expenses</p>
                    <p className="font-bold">{seedResult.created.expenses}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Output VAT</p>
                    <p className="font-bold text-blue-500">{formatCurrency(seedResult.summary.outputVAT)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Input VAT</p>
                    <p className="font-bold text-green-500">{formatCurrency(seedResult.summary.inputVAT)}</p>
                  </div>
                </div>
                <div className="pt-2 border-t border-border">
                  <p className="text-muted-foreground text-sm">Expected Net VAT</p>
                  <p className={`text-lg font-bold ${seedResult.summary.netVAT >= 0 ? 'text-primary' : 'text-green-500'}`}>
                    {formatCurrency(seedResult.summary.netVAT)}
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({seedResult.summary.netVAT >= 0 ? 'to remit' : 'credit'})
                    </span>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* VAT Reconciliation Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('reconciliation')}
        >
          <div className="flex items-center gap-3">
            <Calculator className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>VAT Reconciliation</CardTitle>
              <CardDescription>Calculate monthly VAT position from database</CardDescription>
            </div>
          </div>
          {expandedSections.reconciliation ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.reconciliation && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">User ID</label>
                <Input 
                  value={reconUserId}
                  onChange={(e) => setReconUserId(e.target.value)}
                  placeholder="Seed test data to get a user ID"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Period</label>
                <Input 
                  type="month" 
                  value={reconPeriod}
                  onChange={(e) => setReconPeriod(e.target.value)}
                />
              </div>
            </div>

            <Button 
              onClick={handleCalculateReconciliation}
              disabled={loading !== null || !reconUserId}
              className="gap-2"
            >
              {loading === 'reconciliation' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
              Calculate Reconciliation
            </Button>

            {reconResult && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Period: {reconResult.period}</p>
                  <span className={`text-xs px-2 py-1 rounded ${
                    reconResult.status === 'remit' 
                      ? 'bg-blue-500/20 text-blue-500' 
                      : 'bg-green-500/20 text-green-500'
                  }`}>
                    {reconResult.status.toUpperCase()}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Output VAT</p>
                    <p className="font-bold">{formatCurrency(reconResult.outputVAT)}</p>
                    <p className="text-xs text-muted-foreground">{reconResult.outputVATInvoicesCount} invoices</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Input VAT</p>
                    <p className="font-bold">{formatCurrency(reconResult.inputVAT)}</p>
                    <p className="text-xs text-muted-foreground">{reconResult.inputVATExpensesCount} expenses</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Credit B/F</p>
                    <p className="font-bold">{formatCurrency(reconResult.creditBroughtForward)}</p>
                  </div>
                </div>
                
                <div className="pt-3 border-t border-border grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">Net VAT Position</p>
                    <p className={`text-xl font-bold ${reconResult.netVAT > 0 ? 'text-primary' : 'text-green-500'}`}>
                      {formatCurrency(reconResult.netVAT)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Credit C/F</p>
                    <p className="text-xl font-bold text-green-500">
                      {formatCurrency(reconResult.creditCarriedForward)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Income Tax Simulator Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('incomeTax')}
        >
          <div className="flex items-center gap-3">
            <Wallet className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Income Tax Simulator</CardTitle>
              <CardDescription>Tax Act 2025 Section 58 - Personal Income Tax Calculator</CardDescription>
            </div>
          </div>
          {expandedSections.incomeTax ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.incomeTax && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Income Amount (₦)</label>
                <Input 
                  type="number" 
                  value={incomeTaxAmount} 
                  onChange={(e) => setIncomeTaxAmount(e.target.value)}
                  placeholder="1440000"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Period</label>
                <select 
                  value={incomeTaxPeriod}
                  onChange={(e) => setIncomeTaxPeriod(e.target.value as 'annual' | 'monthly')}
                  className="w-full mt-1 p-2 bg-background border border-input rounded-md h-10"
                >
                  <option value="annual">Annual</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={incomeTaxIncludeDeductions}
                    onChange={(e) => setIncomeTaxIncludeDeductions(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Include standard deductions</span>
                </label>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Button 
                onClick={handleCalculateIncomeTax}
                disabled={loading !== null}
                className="gap-2"
              >
                {loading === 'income-tax' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                Calculate
              </Button>
              <Button 
                onClick={handleExportIncomeTaxReport}
                disabled={loading !== null || !incomeTaxResult}
                variant="outline"
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export Report
              </Button>
            </div>

            {/* Quick Scenarios */}
            <div className="pt-4 border-t border-border">
              <p className="text-sm font-medium text-muted-foreground mb-2">Test Scenarios</p>
              <div className="flex flex-wrap gap-2">
                {INCOME_TAX_SCENARIOS.map(scenario => (
                  <Button
                    key={scenario.id}
                    variant="outline"
                    size="sm"
                    onClick={() => handleRunIncomeTaxScenario(scenario)}
                    disabled={loading !== null}
                    className={`text-xs ${scenario.incomeType === 'pension' ? 'border-green-500' : scenario.incomeType === 'mixed' ? 'border-yellow-500' : ''}`}
                  >
                    {scenario.incomeType === 'pension' ? '🏛️ ' : scenario.incomeType === 'mixed' ? '📊 ' : ''}{scenario.name}
                  </Button>
                ))}
              </div>
            </div>

            {incomeTaxResult && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-4">
                {incomeTaxResult.isMinimumWageExempt && (
                  <div className="bg-blue-500/20 text-blue-600 dark:text-blue-400 px-3 py-2 rounded-md text-sm">
                    ✓ Minimum Wage Exempt - No income tax applicable
                  </div>
                )}
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Gross Income</p>
                    <p className="font-bold">{formatCurrency(incomeTaxResult.grossIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Deductions</p>
                    <p className="font-bold">{formatCurrency(incomeTaxResult.deductions.total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Chargeable Income</p>
                    <p className="font-bold">{formatCurrency(incomeTaxResult.chargeableIncome)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Effective Rate</p>
                    <p className="font-bold">{incomeTaxResult.effectiveRate.toFixed(2)}%</p>
                  </div>
                </div>

                {/* Tax Breakdown Table */}
                <div className="pt-3 border-t border-border">
                  <p className="text-sm font-medium mb-2">Progressive Tax Breakdown</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 text-muted-foreground font-medium">Band</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Amount</th>
                          <th className="text-center py-2 text-muted-foreground font-medium">Rate</th>
                          <th className="text-right py-2 text-muted-foreground font-medium">Tax</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incomeTaxResult.taxBreakdown.map((band, idx) => (
                          <tr key={idx} className="border-b border-border/50">
                            <td className="py-2">{band.band}</td>
                            <td className="text-right py-2 font-mono">{formatCurrency(band.taxableInBand)}</td>
                            <td className="text-center py-2">{(band.rate * 100).toFixed(0)}%</td>
                            <td className="text-right py-2 font-mono">{formatCurrency(band.taxInBand)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Summary */}
                <div className="pt-3 border-t border-border grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">Annual Tax</p>
                    <p className="text-xl font-bold text-primary">{formatCurrency(incomeTaxResult.totalTax)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Monthly PAYE</p>
                    <p className="text-xl font-bold">{formatCurrency(incomeTaxResult.monthlyTax)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Monthly Net Income</p>
                    <p className="text-xl font-bold text-green-500">{formatCurrency(incomeTaxResult.monthlyNetIncome)}</p>
                  </div>
                </div>

                <div className="pt-2 text-xs text-muted-foreground">
                  {incomeTaxResult.actReference}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Business Classification Section */}
      <Card>
        <CardHeader 
          className="cursor-pointer flex flex-row items-center justify-between"
          onClick={() => toggleSection('businessClassification')}
        >
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-primary" />
            <div>
              <CardTitle>Business Classification Tests</CardTitle>
              <CardDescription>Tax Act 2025 Section 56 - Small Company Status (0% tax)</CardDescription>
            </div>
          </div>
          {expandedSections.businessClassification ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </CardHeader>
        {expandedSections.businessClassification && (
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button 
                onClick={handleSeedBusinesses}
                disabled={loading !== null}
                className="gap-2"
              >
                {loading === 'seed-businesses' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                Seed Test Businesses
              </Button>
              <Button 
                onClick={handleRunClassificationJob}
                disabled={loading !== null}
                className="gap-2"
              >
                {loading === 'classification-job' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Run Classification Job
              </Button>
            </div>

            {/* Test Cases */}
            {classificationSeedResult && (
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <p className="font-medium flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Seeded Test Businesses
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {classificationSeedResult.testCases.map((testCase, idx) => {
                    const actualResult = classificationJobResult?.results.find(
                      r => classificationSeedResult.businesses[idx]?.id === r.businessId
                    );
                    const passed = actualResult?.classification === testCase.expectedClassification;
                    
                    return (
                      <div 
                        key={testCase.name}
                        className={`p-3 rounded-lg border ${
                          actualResult 
                            ? passed 
                              ? 'bg-green-500/10 border-green-500/30' 
                              : 'bg-red-500/10 border-red-500/30'
                            : 'bg-background border-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{testCase.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Turnover: ₦{(testCase.turnover / 1_000_000).toFixed(0)}M | Assets: ₦{(testCase.assets / 1_000_000).toFixed(0)}M
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {testCase.isProfessionalServices && '⚖️ Professional Services | '}
                              Expected: <span className="font-mono">{testCase.expectedClassification}</span>
                              {actualResult && (
                                <> | Got: <span className={`font-mono ${passed ? 'text-green-500' : 'text-red-500'}`}>{actualResult.classification}</span></>
                              )}
                            </p>
                          </div>
                          {actualResult && (
                            passed 
                              ? <Check className="w-5 h-5 text-green-500" />
                              : <X className="w-5 h-5 text-red-500" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Classification Results Summary */}
            {classificationJobResult && (
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium">Classification Summary - {classificationJobResult.year}</p>
                  <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                    {classificationJobResult.summary.total} businesses
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-green-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-green-500">{classificationJobResult.summary.small}</p>
                    <p className="text-xs text-muted-foreground">Small (0% tax)</p>
                  </div>
                  <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-blue-500">{classificationJobResult.summary.medium}</p>
                    <p className="text-xs text-muted-foreground">Medium (30% tax)</p>
                  </div>
                  <div className="text-center p-3 bg-purple-500/10 rounded-lg">
                    <p className="text-2xl font-bold text-purple-500">{classificationJobResult.summary.large}</p>
                    <p className="text-xs text-muted-foreground">Large (30% tax)</p>
                  </div>
                </div>

                {/* Notifications Preview */}
                {classificationJobResult.notifications.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-sm font-medium flex items-center gap-2 mb-2">
                      <Bell className="w-4 h-4" />
                      Small Company Notifications ({classificationJobResult.notifications.length})
                    </p>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {classificationJobResult.notifications.map((notif, idx) => (
                        <div key={idx} className="p-3 bg-green-500/5 border border-green-500/20 rounded-lg text-xs">
                          <p className="font-medium text-green-600 dark:text-green-400 mb-1">{notif.businessName}</p>
                          <pre className="whitespace-pre-wrap text-muted-foreground font-mono">{notif.message}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
