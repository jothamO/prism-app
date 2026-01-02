import { useState } from "react";
import { ChevronDown, ChevronUp, Brain, Cpu, AlertTriangle, Check, Zap } from "lucide-react";
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

interface NLUDebugPanelProps {
  intent: NLUIntent | null;
  source: 'ai' | 'fallback' | null;
  isLoading?: boolean;
  artificialCheck?: ArtificialTransactionCheck | null;
  onTestIntent?: (message: string) => void;
}

// Quick test messages for each intent
const QUICK_TESTS: Array<{ intent: string; message: string; emoji: string }> = [
  { intent: 'get_transaction_summary', message: 'Show my transactions from last month', emoji: '📊' },
  { intent: 'get_tax_relief_info', message: 'What deductions can I claim for my children?', emoji: '💡' },
  { intent: 'upload_receipt', message: 'I want to upload a receipt', emoji: '📤' },
  { intent: 'categorize_expense', message: 'Is this a business expense?', emoji: '🏷️' },
  { intent: 'get_tax_calculation', message: 'Calculate VAT on 150000', emoji: '🧮' },
  { intent: 'set_reminder', message: 'Remind me about VAT filing deadline', emoji: '⏰' },
  { intent: 'connect_bank', message: 'Connect my GTBank account', emoji: '🏦' },
  { intent: 'verify_identity', message: 'Verify my TIN 1234567890', emoji: '✅' },
  { intent: 'general_query', message: 'Hello, what can you help me with?', emoji: '💬' },
];

export function NLUDebugPanel({
  intent,
  source,
  isLoading = false,
  artificialCheck,
  onTestIntent
}: NLUDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showQuickTests, setShowQuickTests] = useState(false);

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500 bg-green-500/10';
    if (confidence >= 0.6) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
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

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm">NLU Debug</span>
          {source && (
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-medium",
              source === 'ai' 
                ? "bg-primary/20 text-primary" 
                : "bg-muted text-muted-foreground"
            )}>
              {source === 'ai' ? 'AI' : 'Fallback'}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border">
          {/* Loading State */}
          {isLoading && (
            <div className="px-4 py-6 flex items-center justify-center gap-2 text-muted-foreground">
              <Cpu className="w-4 h-4 animate-pulse" />
              <span className="text-sm">Classifying intent...</span>
            </div>
          )}

          {/* No Intent State */}
          {!isLoading && !intent && (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">
              Send a message to see NLU classification
            </div>
          )}

          {/* Intent Display */}
          {!isLoading && intent && (
            <div className="p-4 space-y-4">
              {/* Intent Badge */}
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-semibold border",
                  getIntentColor(intent.name)
                )}>
                  {intent.name}
                </span>
              </div>

              {/* Confidence Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Confidence</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    getConfidenceColor(intent.confidence)
                  )}>
                    {(intent.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      intent.confidence >= 0.8 ? "bg-green-500" :
                      intent.confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"
                    )}
                    style={{ width: `${intent.confidence * 100}%` }}
                  />
                </div>
              </div>

              {/* Entities */}
              {Object.keys(intent.entities).length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Extracted Entities
                  </span>
                  <div className="bg-muted/50 rounded-lg p-3 font-mono text-xs overflow-x-auto">
                    <pre className="text-foreground">
                      {JSON.stringify(intent.entities, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* AI Reasoning */}
              {intent.reasoning && (
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    AI Reasoning
                  </span>
                  <p className="text-sm text-foreground/80 bg-muted/30 rounded-lg p-3">
                    {intent.reasoning}
                  </p>
                </div>
              )}

              {/* Artificial Transaction Warning */}
              {artificialCheck?.isSuspicious && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-sm font-semibold">Section 191 Alert</span>
                  </div>
                  <p className="text-sm text-destructive/80">
                    {artificialCheck.warning}
                  </p>
                  {artificialCheck.actReference && (
                    <p className="text-xs text-muted-foreground">
                      Reference: {artificialCheck.actReference}
                    </p>
                  )}
                </div>
              )}

              {artificialCheck && !artificialCheck.isSuspicious && (
                <div className="flex items-center gap-2 text-green-500 text-sm">
                  <Check className="w-4 h-4" />
                  <span>No Section 191 concerns detected</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Test Buttons */}
          {onTestIntent && (
            <div className="border-t border-border">
              <button
                onClick={() => setShowQuickTests(!showQuickTests)}
                className="w-full px-4 py-2 flex items-center justify-between text-sm text-muted-foreground hover:bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3 h-3" />
                  Quick Intent Tests
                </div>
                {showQuickTests ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </button>

              {showQuickTests && (
                <div className="px-4 pb-4 grid grid-cols-1 gap-2">
                  {QUICK_TESTS.map((test) => (
                    <button
                      key={test.intent}
                      onClick={() => onTestIntent(test.message)}
                      className="text-left text-xs px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <span className="mr-2">{test.emoji}</span>
                      <span className="text-muted-foreground">{test.message}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
