import { useState } from 'react';
import {
  FlaskConical,
  Play,
  Download,
  Loader2,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Smartphone,
  Globe,
  Building2,
  Banknote,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ClassificationResult {
  classification: string;
  category: string | null;
  confidence: number;
  reason: string;
  tier: string;
  needsConfirmation: boolean;
  nigerianFlags: {
    isPosTransaction: boolean;
    isUssdTransaction: boolean;
    isMobileMoney: boolean;
    isNigerianBankCharge: boolean;
    isForeignCurrency: boolean;
    isEmtl: boolean;
    isStampDuty: boolean;
  };
  taxImplications: {
    vatApplicable: boolean;
    whtApplicable: boolean;
    emtlCharged: boolean;
    stampDutyCharged: boolean;
    deductible: boolean;
  };
}

interface BulkResult {
  narration: string;
  amount: number;
  result: ClassificationResult | null;
  error: string | null;
}

const sampleTransactions = [
  { narration: 'POS PURCHASE AT SHOPRITE LAGOS', amount: 15000, isCredit: false },
  { narration: 'USSD AIRTIME RECHARGE MTN', amount: 2000, isCredit: false },
  { narration: 'TRF FROM JOHN DOE PAYMENT FOR CONSULTING', amount: 500000, isCredit: true },
  { narration: 'VAT CHARGE', amount: 750, isCredit: false },
  { narration: 'SMS ALERT CHARGE DEC 2025', amount: 52.5, isCredit: false },
  { narration: 'OPAY WALLET TRANSFER', amount: 10000, isCredit: false },
  { narration: 'CAPITAL INJECTION FOUNDER', amount: 5000000, isCredit: true },
  { narration: 'USD INWARD TRF FOREIGN CLIENT', amount: 1500000, isCredit: true },
  { narration: 'EMTL CHARGE', amount: 50, isCredit: false },
  { narration: 'STAMP DUTY CHG', amount: 50, isCredit: false },
];

export default function AdminClassificationTesting() {
  const { toast } = useToast();
  
  // Single test state
  const [narration, setNarration] = useState('');
  const [amount, setAmount] = useState('');
  const [isCredit, setIsCredit] = useState(false);
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ClassificationResult | null>(null);
  
  // Bulk test state
  const [bulkInput, setBulkInput] = useState('');
  const [bulkTesting, setBulkTesting] = useState(false);
  const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);

  const handleSingleTest = async () => {
    if (!narration.trim() || !amount) {
      toast({ title: 'Missing fields', description: 'Please enter narration and amount', variant: 'destructive' });
      return;
    }

    try {
      setTesting(true);
      setResult(null);

      const { data, error } = await supabase.functions.invoke('classify-transaction', {
        body: {
          narration,
          amount: parseFloat(amount),
          type: isCredit ? 'credit' : 'debit',
          date: testDate,
        },
      });

      if (error) throw error;

      setResult(data);
    } catch (err) {
      toast({
        title: 'Classification Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleBulkTest = async () => {
    if (!bulkInput.trim()) {
      toast({ title: 'No input', description: 'Please enter transactions to test', variant: 'destructive' });
      return;
    }

    try {
      setBulkTesting(true);
      setBulkResults([]);

      const lines = bulkInput.trim().split('\n').filter(l => l.trim());
      const results: BulkResult[] = [];

      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim());
        const txNarration = parts[0] || '';
        const txAmount = parseFloat(parts[1]) || 0;
        const txIsCredit = parts[2]?.toLowerCase() === 'credit';

        try {
          const { data, error } = await supabase.functions.invoke('classify-transaction', {
            body: {
              narration: txNarration,
              amount: txAmount,
              type: txIsCredit ? 'credit' : 'debit',
              date: testDate,
            },
          });

          if (error) throw error;

          results.push({ narration: txNarration, amount: txAmount, result: data, error: null });
        } catch (err) {
          results.push({ 
            narration: txNarration, 
            amount: txAmount, 
            result: null, 
            error: err instanceof Error ? err.message : 'Unknown error' 
          });
        }
      }

      setBulkResults(results);
    } catch (err) {
      toast({
        title: 'Bulk Test Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBulkTesting(false);
    }
  };

  const exportResults = () => {
    if (bulkResults.length === 0) return;

    const headers = ['Narration', 'Amount', 'Classification', 'Category', 'Confidence', 'Tier', 'Tax Relevant', 'VAT'];
    const rows = bulkResults.map(r => [
      r.narration,
      r.amount,
      r.result?.classification || 'ERROR',
      r.result?.category || '',
      r.result?.confidence?.toFixed(2) || '',
      r.result?.tier || '',
      r.result?.taxImplications?.deductible ? 'Yes' : 'No',
      r.result?.taxImplications?.vatApplicable ? 'Yes' : 'No',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `classification-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSample = (sample: typeof sampleTransactions[0]) => {
    setNarration(sample.narration);
    setAmount(sample.amount.toString());
    setIsCredit(sample.isCredit);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Classification Testing</h1>
          <p className="text-muted-foreground">Test the transaction classification edge function</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Single Transaction Tester */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              Single Transaction Test
            </CardTitle>
            <CardDescription>Test classification for a single transaction</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Narration</Label>
              <Input
                placeholder="e.g., POS PURCHASE AT SHOPRITE LAGOS"
                value={narration}
                onChange={e => setNarration(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount (₦)</Label>
                <Input
                  type="number"
                  placeholder="15000"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={testDate}
                  onChange={e => setTestDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant={!isCredit ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsCredit(false)}
              >
                Debit
              </Button>
              <Button
                variant={isCredit ? 'default' : 'outline'}
                size="sm"
                onClick={() => setIsCredit(true)}
              >
                Credit
              </Button>
            </div>

            <Button onClick={handleSingleTest} disabled={testing} className="w-full">
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Classify Transaction
            </Button>

            {/* Result Display */}
            {result && (
              <div className="mt-4 p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Classification</span>
                  <Badge>{result.classification}</Badge>
                </div>
                
                {result.category && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Category</span>
                    <span className="text-sm">{result.category}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Confidence</span>
                  <span className="text-sm font-mono">{(result.confidence * 100).toFixed(1)}%</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Source</span>
                  <Badge variant="outline">{result.tier}</Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Reason</span>
                  <span className="text-sm text-right max-w-[200px]">{result.reason}</span>
                </div>

                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Tax Implications</p>
                  <div className="flex flex-wrap gap-2">
                    {result.taxImplications?.vatApplicable && <Badge className="bg-emerald-500/10 text-emerald-600">VAT Applicable</Badge>}
                    {result.taxImplications?.deductible && <Badge className="bg-amber-500/10 text-amber-600">Deductible</Badge>}
                    {result.taxImplications?.emtlCharged && <Badge variant="secondary">EMTL</Badge>}
                    {result.taxImplications?.stampDutyCharged && <Badge variant="secondary">Stamp Duty</Badge>}
                    {result.needsConfirmation && <Badge variant="outline" className="border-destructive/50 text-destructive">Needs Confirmation</Badge>}
                  </div>
                </div>

                <div className="border-t border-border pt-3 mt-3">
                  <p className="text-sm font-medium mb-2">Nigerian Flags</p>
                  <div className="flex flex-wrap gap-2">
                    {result.nigerianFlags?.isPosTransaction && (
                      <Badge variant="outline" className="gap-1">
                        <CreditCard className="h-3 w-3" /> POS
                      </Badge>
                    )}
                    {result.nigerianFlags?.isUssdTransaction && (
                      <Badge variant="outline" className="gap-1">
                        <Smartphone className="h-3 w-3" /> USSD
                      </Badge>
                    )}
                    {result.nigerianFlags?.isMobileMoney && (
                      <Badge variant="outline" className="gap-1">
                        <Smartphone className="h-3 w-3" /> Mobile Money
                      </Badge>
                    )}
                    {result.nigerianFlags?.isNigerianBankCharge && (
                      <Badge variant="outline" className="gap-1">
                        <Building2 className="h-3 w-3" /> Bank Charge
                      </Badge>
                    )}
                    {result.nigerianFlags?.isForeignCurrency && (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="h-3 w-3" /> Foreign Currency
                      </Badge>
                    )}
                    {result.nigerianFlags?.isEmtl && (
                      <Badge variant="outline">EMTL</Badge>
                    )}
                    {result.nigerianFlags?.isStampDuty && (
                      <Badge variant="outline">Stamp Duty</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sample Transactions Panel */}
        <Card>
          <CardHeader>
            <CardTitle>Sample Nigerian Transactions</CardTitle>
            <CardDescription>Click to load a sample transaction</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sampleTransactions.map((sample, i) => (
                <button
                  key={i}
                  onClick={() => loadSample(sample)}
                  className="w-full text-left p-3 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate flex-1">{sample.narration}</span>
                    <Badge variant={sample.isCredit ? 'default' : 'secondary'} className="ml-2 shrink-0">
                      {sample.isCredit ? '+' : '-'}₦{sample.amount.toLocaleString()}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Testing */}
      <Card>
        <CardHeader>
          <CardTitle>Bulk Transaction Testing</CardTitle>
          <CardDescription>
            Test multiple transactions at once. Enter one per line: narration, amount, credit/debit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="POS PURCHASE AT SHOPRITE, 15000, debit
TRF FROM CLIENT PAYMENT, 500000, credit
USSD AIRTIME MTN, 2000, debit"
            rows={6}
            value={bulkInput}
            onChange={e => setBulkInput(e.target.value)}
          />

          <div className="flex gap-2">
            <Button onClick={handleBulkTest} disabled={bulkTesting}>
              {bulkTesting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Run Bulk Test
            </Button>
            {bulkResults.length > 0 && (
              <Button variant="outline" onClick={exportResults}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>

          {/* Bulk Results Table */}
          {bulkResults.length > 0 && (
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium">Narration</th>
                    <th className="text-right py-2 px-3 font-medium">Amount</th>
                    <th className="text-left py-2 px-3 font-medium">Classification</th>
                    <th className="text-right py-2 px-3 font-medium">Confidence</th>
                    <th className="text-left py-2 px-3 font-medium">Source</th>
                    <th className="text-center py-2 px-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {bulkResults.map((row, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 px-3 max-w-[200px] truncate">{row.narration}</td>
                      <td className="py-2 px-3 text-right font-mono">₦{row.amount.toLocaleString()}</td>
                      <td className="py-2 px-3">
                        {row.result ? (
                          <Badge variant="outline">{row.result.classification}</Badge>
                        ) : (
                          <span className="text-destructive">Error</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {row.result ? `${(row.result.confidence * 100).toFixed(0)}%` : '-'}
                      </td>
                      <td className="py-2 px-3">
                        {row.result?.tier && <Badge variant="secondary">{row.result.tier}</Badge>}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {row.error ? (
                          <AlertCircle className="h-4 w-4 text-destructive inline" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
