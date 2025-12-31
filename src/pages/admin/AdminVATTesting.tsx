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
  ChevronUp
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
  
  // Expanded sections
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    calculator: true,
    classification: true,
    seeder: true,
    reconciliation: true
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">VAT Flow Testing</h1>
          <p className="text-muted-foreground">End-to-end testing for Tax Act 2025 compliance</p>
        </div>
        <Button 
          onClick={handleRunE2ETest}
          disabled={loading !== null}
          className="gap-2"
        >
          {loading === 'e2e' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run E2E Test
        </Button>
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
    </div>
  );
}
