import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Brain, Send, AlertTriangle, Check, Loader2, Zap, FileText, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface NLUIntent {
  name: string;
  confidence: number;
  entities: Record<string, any>;
  reasoning?: string;
}

interface ArtificialTransactionCheck {
  isSuspicious: boolean;
  warning?: string;
  actReference?: string;
}

interface ClassificationResult {
  intent: NLUIntent;
  source: 'ai' | 'fallback';
  model?: string;
  artificialTransactionCheck?: ArtificialTransactionCheck | null;
}

// All available intents with descriptions
const INTENT_REFERENCE = [
  { name: 'get_transaction_summary', description: 'View transaction history, spending summary, or bank activity', examples: ['show my transactions', 'what did I spend last month', 'summary'] },
  { name: 'get_tax_relief_info', description: 'Tax deductions, exemptions, reliefs, or allowances', examples: ['what deductions can I claim', 'tax relief for children', 'am I exempt'] },
  { name: 'upload_receipt', description: 'Upload or submit a receipt or invoice for processing', examples: ['I want to upload a receipt', "here's my invoice", 'submit expense'] },
  { name: 'categorize_expense', description: 'Classify or categorize a transaction or expense', examples: ['categorize this as transport', 'is this a business expense', 'classify my purchase'] },
  { name: 'get_tax_calculation', description: 'Calculate VAT, income tax, or any tax amount', examples: ['calculate VAT on 50000', 'how much tax do I owe', "what's my tax bill"] },
  { name: 'set_reminder', description: 'Set up a reminder for tax filing or payment deadlines', examples: ['remind me to file VAT', 'set deadline reminder', 'when is my tax due'] },
  { name: 'connect_bank', description: 'Link a bank account for automatic transaction tracking', examples: ['connect my bank', 'link account', 'add my GTBank'] },
  { name: 'verify_identity', description: 'Verify NIN, TIN, or CAC registration', examples: ['verify my TIN', 'check my NIN', 'validate my CAC number'] },
  { name: 'general_query', description: 'General questions that don\'t fit other intents', examples: ['hello', 'what can you do', 'help me understand VAT'] },
];

const AdminNLUTesting = () => {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<ClassificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Artificial Transaction Checker state
  const [itemDescription, setItemDescription] = useState("");
  const [category, setCategory] = useState("business");
  const [artificialResult, setArtificialResult] = useState<ArtificialTransactionCheck | null>(null);
  const [isCheckingArtificial, setIsCheckingArtificial] = useState(false);

  // Bulk testing state
  const [bulkMessages, setBulkMessages] = useState("");
  const [bulkResults, setBulkResults] = useState<Array<{ message: string; result: ClassificationResult }>>([]);
  const [isBulkTesting, setIsBulkTesting] = useState(false);

  const classifyIntent = async () => {
    if (!message.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      // Parse context if provided
      let contextArray: any[] = [];
      if (context.trim()) {
        try {
          contextArray = JSON.parse(context);
        } catch {
          toast({ title: "Invalid context JSON", variant: "destructive" });
          setIsLoading(false);
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke('simulate-nlu', {
        body: { message, context: contextArray }
      });

      if (error) throw error;

      setResult(data as ClassificationResult);
    } catch (error) {
      console.error('NLU error:', error);
      toast({ title: "Classification failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const checkArtificialTransaction = async () => {
    if (!itemDescription.trim()) {
      toast({ title: "Please enter an item description", variant: "destructive" });
      return;
    }

    setIsCheckingArtificial(true);
    try {
      const { data, error } = await supabase.functions.invoke('simulate-nlu', {
        body: { 
          checkArtificialTransaction: true,
          itemDescription,
          category
        }
      });

      if (error) throw error;

      setArtificialResult(data as ArtificialTransactionCheck);
    } catch (error) {
      console.error('Artificial check error:', error);
      toast({ title: "Check failed", variant: "destructive" });
    } finally {
      setIsCheckingArtificial(false);
    }
  };

  const runBulkTest = async () => {
    const messages = bulkMessages.split('\n').filter(m => m.trim());
    if (messages.length === 0) {
      toast({ title: "Please enter messages (one per line)", variant: "destructive" });
      return;
    }

    setIsBulkTesting(true);
    const results: Array<{ message: string; result: ClassificationResult }> = [];

    for (const msg of messages) {
      try {
        const { data, error } = await supabase.functions.invoke('simulate-nlu', {
          body: { message: msg }
        });

        if (!error && data) {
          results.push({ message: msg, result: data as ClassificationResult });
        }
      } catch {
        // Skip failed ones
      }
    }

    setBulkResults(results);
    setIsBulkTesting(false);
    toast({ title: `Tested ${results.length}/${messages.length} messages` });
  };

  const exportBulkResults = () => {
    const csv = [
      'Message,Intent,Confidence,Source,Entities',
      ...bulkResults.map(r => 
        `"${r.message.replace(/"/g, '""')}","${r.result.intent.name}",${r.result.intent.confidence},"${r.result.source}","${JSON.stringify(r.result.intent.entities).replace(/"/g, '""')}"`
      )
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nlu-test-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getIntentColor = (intentName: string) => {
    const colors: Record<string, string> = {
      get_transaction_summary: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      get_tax_relief_info: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      upload_receipt: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      categorize_expense: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
      get_tax_calculation: 'bg-green-500/20 text-green-400 border-green-500/30',
      set_reminder: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
      connect_bank: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
      verify_identity: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
      general_query: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    };
    return colors[intentName] || colors.general_query;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">NLU Testing</h1>
          <p className="text-muted-foreground">Test intent classification and entity extraction</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Intent Tester */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Intent Classifier
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Message</label>
              <Textarea
                placeholder="Type a message to classify..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Conversation Context (optional JSON)</label>
              <Textarea
                placeholder='[{"role": "user", "content": "previous message"}]'
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                className="font-mono text-sm"
              />
            </div>

            <Button onClick={classifyIntent} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Classify Intent
                </>
              )}
            </Button>

            {/* Result Display */}
            {result && (
              <div className="mt-4 space-y-4 p-4 bg-muted/50 rounded-lg">
                {/* Intent Badge */}
                <div className="flex items-center justify-between">
                  <span className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold border",
                    getIntentColor(result.intent.name)
                  )}>
                    {result.intent.name}
                  </span>
                  <span className={cn(
                    "px-2 py-1 rounded text-sm font-medium",
                    result.source === 'ai' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    {result.source === 'ai' ? `AI (${result.model})` : 'Fallback'}
                  </span>
                </div>

                {/* Confidence Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className={cn("font-bold", getConfidenceColor(result.intent.confidence))}>
                      {(result.intent.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        result.intent.confidence >= 0.8 ? "bg-green-500" :
                        result.intent.confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                      )}
                      style={{ width: `${result.intent.confidence * 100}%` }}
                    />
                  </div>
                </div>

                {/* Entities */}
                {Object.keys(result.intent.entities).length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">Entities</span>
                    <pre className="bg-background p-3 rounded text-xs overflow-x-auto">
                      {JSON.stringify(result.intent.entities, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Reasoning */}
                {result.intent.reasoning && (
                  <div className="space-y-2">
                    <span className="text-sm font-medium">AI Reasoning</span>
                    <p className="text-sm text-muted-foreground bg-background p-3 rounded">
                      {result.intent.reasoning}
                    </p>
                  </div>
                )}

                {/* Artificial Transaction Check */}
                {result.artificialTransactionCheck && (
                  <div className={cn(
                    "p-3 rounded-lg border",
                    result.artificialTransactionCheck.isSuspicious
                      ? "bg-destructive/10 border-destructive/30"
                      : "bg-green-500/10 border-green-500/30"
                  )}>
                    {result.artificialTransactionCheck.isSuspicious ? (
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-destructive">Section 191 Alert</p>
                          <p className="text-sm text-destructive/80">{result.artificialTransactionCheck.warning}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-green-500">
                        <Check className="w-4 h-4" />
                        <span className="text-sm">No Section 191 concerns</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Artificial Transaction Checker */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Section 191 Checker
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Item Description</label>
              <Input
                placeholder="e.g., PlayStation 5 for office"
                value={itemDescription}
                onChange={(e) => setItemDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Claimed Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background"
              >
                <option value="business">Business Expense</option>
                <option value="deductible">Tax Deductible</option>
                <option value="personal">Personal (Non-Deductible)</option>
              </select>
            </div>

            <Button onClick={checkArtificialTransaction} disabled={isCheckingArtificial} className="w-full">
              {isCheckingArtificial ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Zap className="w-4 h-4 mr-2" />
              )}
              Check Compliance
            </Button>

            {artificialResult && (
              <div className={cn(
                "mt-4 p-4 rounded-lg border",
                artificialResult.isSuspicious
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-green-500/10 border-green-500/30"
              )}>
                {artificialResult.isSuspicious ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      <span className="font-bold">SUSPICIOUS TRANSACTION</span>
                    </div>
                    <p className="text-sm">{artificialResult.warning}</p>
                    <p className="text-xs text-muted-foreground">{artificialResult.actReference}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-500">
                    <Check className="w-5 h-5" />
                    <span className="font-semibold">No concerns detected - transaction appears compliant</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Bulk Intent Testing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Messages (one per line)</label>
            <Textarea
              placeholder="Enter test messages, one per line..."
              value={bulkMessages}
              onChange={(e) => setBulkMessages(e.target.value)}
              rows={5}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={runBulkTest} disabled={isBulkTesting}>
              {isBulkTesting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  Run Bulk Test
                </>
              )}
            </Button>
            {bulkResults.length > 0 && (
              <Button variant="outline" onClick={exportBulkResults}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            )}
          </div>

          {/* Bulk Results Table */}
          {bulkResults.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left">Message</th>
                    <th className="px-4 py-2 text-left">Intent</th>
                    <th className="px-4 py-2 text-left">Confidence</th>
                    <th className="px-4 py-2 text-left">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {bulkResults.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      <td className="px-4 py-2 max-w-xs truncate">{r.message}</td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-medium",
                          getIntentColor(r.result.intent.name)
                        )}>
                          {r.result.intent.name}
                        </span>
                      </td>
                      <td className={cn("px-4 py-2 font-medium", getConfidenceColor(r.result.intent.confidence))}>
                        {(r.result.intent.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{r.result.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intent Reference */}
      <Card>
        <CardHeader>
          <CardTitle>Intent Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {INTENT_REFERENCE.map((intent) => (
              <div key={intent.name} className="p-4 border rounded-lg space-y-2">
                <span className={cn(
                  "inline-block px-3 py-1 rounded text-sm font-semibold",
                  getIntentColor(intent.name)
                )}>
                  {intent.name}
                </span>
                <p className="text-sm text-muted-foreground">{intent.description}</p>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">Examples:</span>
                  <ul className="text-xs text-muted-foreground">
                    {intent.examples.map((ex, i) => (
                      <li key={i} className="cursor-pointer hover:text-foreground" onClick={() => setMessage(ex)}>
                        • {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminNLUTesting;
