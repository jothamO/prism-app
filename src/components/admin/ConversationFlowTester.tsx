import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Play, 
  Square, 
  RotateCcw, 
  Check, 
  X, 
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock
} from "lucide-react";

interface TestStep {
  action: 'send' | 'expect' | 'click' | 'wait';
  message?: string;
  pattern?: RegExp;
  buttonId?: string;
  timeout?: number;
  description?: string;
}

interface TestFlow {
  id: string;
  name: string;
  description: string;
  steps: TestStep[];
}

interface StepResult {
  stepIndex: number;
  passed: boolean;
  message?: string;
  duration?: number;
}

interface ConversationFlowTesterProps {
  onSendMessage: (message: string) => void;
  onClickButton: (buttonId: string) => void;
  lastBotMessage: string | null;
  isTyping: boolean;
}

const TEST_FLOWS: TestFlow[] = [
  // === BUSINESS FLOWS ===
  {
    id: 'registration',
    name: 'Business Registration',
    description: 'New business → TIN → Name → Verified',
    steps: [
      { action: 'send', message: 'hello', description: 'Greet bot' },
      { action: 'wait', timeout: 1000, description: 'Wait for response' },
      { action: 'expect', pattern: /Welcome|PRISM|Get started|Test environment/i, description: 'Expect welcome' },
      { action: 'send', message: 'help', description: 'Request help' },
      { action: 'wait', timeout: 1000, description: 'Wait for help menu' },
      { action: 'expect', pattern: /Available commands|vat|tax|pension|Business Tax|Project Funds/i, description: 'Expect commands list' },
    ]
  },
  {
    id: 'vat_calculation',
    name: 'VAT Calculation',
    description: 'Calculate VAT on goods',
    steps: [
      { action: 'send', message: 'vat 50000 electronics', description: 'Request VAT calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /VAT|7\.5%|Classification/i, description: 'Expect VAT result' },
    ]
  },
  {
    id: 'income_tax',
    name: 'Business Income Tax',
    description: 'Calculate business tax',
    steps: [
      { action: 'send', message: 'tax 5000000', description: 'Request tax calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Tax|Income|Section|Breakdown/i, description: 'Expect tax breakdown' },
    ]
  },
  {
    id: 'freelancer_tax',
    name: 'Freelancer Tax',
    description: 'Calculate freelancer tax with expenses',
    steps: [
      { action: 'send', message: 'freelance 7200000 expenses 1800000', description: 'Request freelancer calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Freelancer|Business Expenses|Section 20/i, description: 'Expect freelancer result' },
    ]
  },
  {
    id: 'project_funds',
    name: 'Project Funds Flow',
    description: 'Create project → Add expense → Check balance',
    steps: [
      { action: 'send', message: 'new project TestProject 1000000 from Uncle John', description: 'Create project' },
      { action: 'wait', timeout: 2000, description: 'Wait for creation' },
      { action: 'expect', pattern: /Project|Created|Budget|Fund/i, description: 'Expect project created' },
      { action: 'send', message: 'project expense 50000 materials', description: 'Add expense' },
      { action: 'wait', timeout: 2000, description: 'Wait for expense' },
      { action: 'expect', pattern: /Expense|Recorded|Remaining/i, description: 'Expect expense recorded' },
      { action: 'send', message: 'project balance', description: 'Check balance' },
      { action: 'wait', timeout: 1000, description: 'Wait for balance' },
      { action: 'expect', pattern: /Balance|Budget|Spent/i, description: 'Expect balance shown' },
    ]
  },
  
  // === INDIVIDUAL FLOWS ===
  {
    id: 'employee_paye',
    name: 'Employee PAYE',
    description: 'Calculate PAYE with monthly salary',
    steps: [
      { action: 'send', message: 'salary 450000', description: 'Request salary calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Salary|PAYE|Tax|Monthly|Net Pay/i, description: 'Expect PAYE result' },
    ]
  },
  {
    id: 'minimum_wage',
    name: 'Minimum Wage Exemption',
    description: 'Verify minimum wage tax exemption',
    steps: [
      { action: 'send', message: 'salary 70000', description: 'Minimum wage salary' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /MINIMUM WAGE|EXEMPT|₦0|70,000/i, description: 'Expect exemption' },
    ]
  },
  {
    id: 'landlord_rental',
    name: 'Landlord Rental Income',
    description: 'Calculate WHT on rental income',
    steps: [
      { action: 'send', message: 'rental income 2400000', description: 'Request rental calc' },
      { action: 'wait', timeout: 1500, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Rental|WHT|10%|Withholding/i, description: 'Expect WHT result' },
    ]
  },
  {
    id: 'personal_reliefs',
    name: 'Personal Reliefs Flow',
    description: 'View and apply personal tax reliefs',
    steps: [
      { action: 'send', message: 'reliefs', description: 'Request reliefs list' },
      { action: 'wait', timeout: 1500, description: 'Wait for list' },
      { action: 'expect', pattern: /Relief|Pension|NHF|NHIS/i, description: 'Expect relief options' },
    ]
  },
  {
    id: 'side_hustle',
    name: 'Side Hustle Income',
    description: 'Gig economy income declaration',
    steps: [
      { action: 'send', message: 'side hustle 150000', description: 'Request side income calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Side Hustle|Tax|Monthly|Net/i, description: 'Expect side income result' },
    ]
  },
  {
    id: 'pension_tax',
    name: 'Pension Tax Exemption',
    description: 'Verify pension exemption',
    steps: [
      { action: 'send', message: 'pension 2400000', description: 'Request pension calc' },
      { action: 'wait', timeout: 2000, description: 'Wait for calculation' },
      { action: 'expect', pattern: /Pension|Exempt|Section 163/i, description: 'Expect exemption' },
    ]
  },
  {
    id: 'min_wage_check',
    name: 'Minimum Wage Check',
    description: 'Check minimum wage threshold info',
    steps: [
      { action: 'send', message: 'minimum wage check', description: 'Check threshold' },
      { action: 'wait', timeout: 1000, description: 'Wait for info' },
      { action: 'expect', pattern: /Minimum Wage|70,000|840,000|EXEMPT/i, description: 'Expect threshold info' },
    ]
  }
];

export const ConversationFlowTester = ({ 
  onSendMessage, 
  onClickButton, 
  lastBotMessage, 
  isTyping 
}: ConversationFlowTesterProps) => {
  const [selectedFlow, setSelectedFlow] = useState<TestFlow | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(-1);
  const [stepResults, setStepResults] = useState<StepResult[]>([]);
  const [expanded, setExpanded] = useState(true);
  const abortRef = useRef(false);
  const lastMessageRef = useRef<string | null>(null);

  // Track last bot message changes
  useEffect(() => {
    lastMessageRef.current = lastBotMessage;
  }, [lastBotMessage]);

  const runTest = async (flow: TestFlow) => {
    setSelectedFlow(flow);
    setIsRunning(true);
    setStepResults([]);
    abortRef.current = false;

    for (let i = 0; i < flow.steps.length; i++) {
      if (abortRef.current) break;
      
      setCurrentStepIndex(i);
      const step = flow.steps[i];
      const startTime = Date.now();
      let passed = false;
      let resultMessage = '';

      try {
        switch (step.action) {
          case 'send':
            if (step.message) {
              onSendMessage(step.message);
              passed = true;
              resultMessage = `Sent: "${step.message}"`;
            }
            break;

          case 'wait':
            await new Promise(resolve => setTimeout(resolve, step.timeout || 500));
            // Also wait for typing to finish
            while (isTyping && !abortRef.current) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            passed = true;
            resultMessage = `Waited ${step.timeout || 500}ms`;
            break;

          case 'expect':
            // Wait a bit for message to arrive
            await new Promise(resolve => setTimeout(resolve, 300));
            
            if (step.pattern && lastMessageRef.current) {
              passed = step.pattern.test(lastMessageRef.current);
              resultMessage = passed 
                ? `Found pattern: ${step.pattern.source}`
                : `Pattern not found: ${step.pattern.source}`;
            } else if (!lastMessageRef.current) {
              resultMessage = 'No bot message to check';
            }
            break;

          case 'click':
            if (step.buttonId) {
              onClickButton(step.buttonId);
              passed = true;
              resultMessage = `Clicked: "${step.buttonId}"`;
            }
            break;
        }
      } catch (error) {
        resultMessage = `Error: ${error instanceof Error ? error.message : 'Unknown'}`;
      }

      const duration = Date.now() - startTime;
      setStepResults(prev => [...prev, { 
        stepIndex: i, 
        passed, 
        message: resultMessage,
        duration 
      }]);

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setCurrentStepIndex(-1);
    setIsRunning(false);
  };

  const stopTest = () => {
    abortRef.current = true;
    setIsRunning(false);
    setCurrentStepIndex(-1);
  };

  const resetTest = () => {
    setSelectedFlow(null);
    setStepResults([]);
    setCurrentStepIndex(-1);
  };

  const passedCount = stepResults.filter(r => r.passed).length;
  const failedCount = stepResults.filter(r => !r.passed).length;

  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            Flow Tester
          </span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CardTitle>
      </CardHeader>
      
      {expanded && (
        <CardContent className="space-y-3">
          {/* Flow Selection */}
          {!selectedFlow && !isRunning && (
            <div className="space-y-2">
              {TEST_FLOWS.map(flow => (
                <Button
                  key={flow.id}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start text-left h-auto py-2"
                  onClick={() => runTest(flow)}
                >
                  <div>
                    <div className="font-medium text-xs">{flow.name}</div>
                    <div className="text-xs text-muted-foreground">{flow.description}</div>
                  </div>
                </Button>
              ))}
            </div>
          )}

          {/* Running Test UI */}
          {selectedFlow && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{selectedFlow.name}</span>
                <div className="flex gap-1">
                  {isRunning ? (
                    <Button variant="destructive" size="icon" className="h-6 w-6" onClick={stopTest}>
                      <Square className="w-3 h-3" />
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={resetTest}>
                        <RotateCcw className="w-3 h-3" />
                      </Button>
                      <Button variant="default" size="icon" className="h-6 w-6" onClick={() => runTest(selectedFlow)}>
                        <Play className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Steps List */}
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {selectedFlow.steps.map((step, idx) => {
                  const result = stepResults.find(r => r.stepIndex === idx);
                  const isCurrent = currentStepIndex === idx;
                  
                  return (
                    <div 
                      key={idx}
                      className={`flex items-center gap-2 p-1.5 rounded text-xs ${
                        isCurrent ? 'bg-primary/10' : result ? (result.passed ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20') : 'bg-muted/50'
                      }`}
                    >
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        {isCurrent ? (
                          <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        ) : result ? (
                          result.passed ? (
                            <Check className="w-3 h-3 text-green-600" />
                          ) : (
                            <X className="w-3 h-3 text-red-600" />
                          )
                        ) : (
                          <Clock className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-muted-foreground">[{step.action}]</span>{' '}
                        <span className="truncate">{step.description || step.message || step.pattern?.source}</span>
                      </div>
                      {result?.duration && (
                        <span className="text-muted-foreground text-[10px]">{result.duration}ms</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Results Summary */}
              {stepResults.length > 0 && !isRunning && (
                <div className="flex gap-2 text-xs">
                  <span className="text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {passedCount} passed
                  </span>
                  {failedCount > 0 && (
                    <span className="text-red-600 flex items-center gap-1">
                      <X className="w-3 h-3" /> {failedCount} failed
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default ConversationFlowTester;
