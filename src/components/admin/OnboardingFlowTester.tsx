import React, { useState, useCallback, useEffect, forwardRef } from 'react';
import {
    Play,
    Square,
    RotateCcw,
    CheckCircle2,
    XCircle,
    Clock,
    Brain,
    Zap,
    ChevronDown,
    ChevronRight,
    Loader2,
    User,
    Briefcase,
    Laptop,
    Download,
    Wifi,
    WifiOff,
    ExternalLink,
    RefreshCw,
    Heart,
    GraduationCap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TestStep {
    name: string;
    input: string;
    aiInput?: string; // Natural language alternative
    expectedStep: string;
    expectedKeywords: string[];
    aiExpectedKeywords?: string[]; // Keywords to check in AI mode
    mustNotContain?: string[];
}

interface TestFlow {
    id: string;
    name: string;
    description: string;
    entityType: 'business' | 'individual' | 'self_employed' | 'retiree' | 'student' | 'corper';
    icon: typeof User;
    steps: TestStep[];
}

interface StepResult {
    step: TestStep;
    passed: boolean;
    response: string;
    duration: number;
    aiConfidence?: number;
    error?: string;
}

interface TestResult {
    flow: TestFlow;
    steps: StepResult[];
    passed: boolean;
    duration: number;
}

const TEST_FLOWS: TestFlow[] = [
    {
        id: 'business-happy-path',
        name: 'Business Owner Full Path',
        description: 'Complete onboarding for a business owner with all questions',
        entityType: 'business',
        icon: Briefcase,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'Hi, I want to get started',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer', 'Student', 'Retiree'],
                aiExpectedKeywords: ['business', 'living', 'yourself']
            },
            {
                name: 'Select Business Owner',
                input: '1',
                aiInput: 'I run my own business',
                expectedStep: 'business_stage',
                expectedKeywords: ['Pre-revenue', 'Early stage', 'Growing', 'Established'],
                aiExpectedKeywords: ['stage', 'business']
            },
            {
                name: 'Select Early Stage',
                input: '2',
                aiInput: 'We just started, getting our first customers',
                expectedStep: 'account_setup',
                expectedKeywords: ['bank accounts', 'Mixed', 'Separate'],
                aiExpectedKeywords: ['account', 'bank']
            },
            {
                name: 'Select Separate Accounts',
                input: '2',
                aiInput: 'I keep separate accounts for business',
                expectedStep: 'capital_support',
                expectedKeywords: ['funding', 'Family', 'Investors', 'Loan'],
                aiExpectedKeywords: ['funding', 'business']
            },
            {
                name: 'Select Bootstrapped',
                input: '4',
                aiInput: 'Using my own savings',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly', 'Monthly'],
                aiExpectedKeywords: ['insights', 'often']
            },
            {
                name: 'Select Weekly Updates',
                input: '2',
                aiInput: 'Weekly updates please',
                expectedStep: 'complete',
                expectedKeywords: ['Complete', 'profile', 'upload'],
                aiExpectedKeywords: ['complete', 'started']
            }
        ]
    },
    {
        id: 'individual-quick-path',
        name: 'Employed Individual Quick Path',
        description: 'Simplified onboarding for salaried individuals (skips business questions)',
        entityType: 'individual',
        icon: User,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'Hello there',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer'],
                aiExpectedKeywords: ['business', 'living', 'yourself']
            },
            {
                name: 'Select Employed Individual',
                input: '2',
                aiInput: 'I work for a company and earn a salary',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly'],
                aiExpectedKeywords: ['insights', 'often'],
                mustNotContain: ['business stage', 'funding']
            },
            {
                name: 'Select Monthly Updates',
                input: '3',
                aiInput: 'Monthly is fine for me',
                expectedStep: 'complete',
                expectedKeywords: ['set', 'salaried', 'payslip'],
                aiExpectedKeywords: ['set', 'salaried']
            }
        ]
    },
    {
        id: 'freelancer-path',
        name: 'Self-Employed / Freelancer Path',
        description: 'Simplified flow for freelancers with freelance-specific questions',
        entityType: 'self_employed',
        icon: Laptop,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'start',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer'],
                aiExpectedKeywords: ['business', 'living']
            },
            {
                name: 'Select Freelancer',
                input: '3',
                aiInput: "I'm a freelancer, I work for myself",
                expectedStep: 'account_setup',
                expectedKeywords: ['freelance income', 'separate', 'personal spending'],
                aiExpectedKeywords: ['income', 'separate'],
                mustNotContain: ['business stage']
            },
            {
                name: 'Select Separate Account',
                input: '1',
                aiInput: 'Yes, I have a separate work account',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly'],
                aiExpectedKeywords: ['insights', 'often'],
                mustNotContain: ['funding', 'capital']
            },
            {
                name: 'Select Weekly Updates',
                input: '2',
                aiInput: 'Give me weekly summaries',
                expectedStep: 'complete',
                expectedKeywords: ['Freelancer Mode', 'Activated', 'client payments'],
                aiExpectedKeywords: ['freelancer', 'activated']
            }
        ]
    },
    {
        id: 'retiree-path',
        name: 'Retiree with Multiple Income',
        description: 'Retired user with pension and rental income',
        entityType: 'retiree',
        icon: Heart,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'I retired last year from my job',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer', 'Retiree'],
                aiExpectedKeywords: ['business', 'living', 'retiree']
            },
            {
                name: 'Select Retiree',
                input: '5',
                aiInput: 'I am retired',
                expectedStep: 'retiree_other_income',
                expectedKeywords: ['pension', 'Rental', 'Investment', 'consulting'],
                aiExpectedKeywords: ['pension', 'income']
            },
            {
                name: 'Select Rental Income',
                input: '1',
                aiInput: 'I also receive annual rent from my tenants',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly'],
                aiExpectedKeywords: ['insights', 'often']
            },
            {
                name: 'Select Weekly Updates',
                input: '2',
                aiInput: 'Weekly is fine',
                expectedStep: 'complete',
                expectedKeywords: ['Retirement Mode', 'pension', 'rental'],
                aiExpectedKeywords: ['retirement', 'pension']
            }
        ]
    },
    {
        id: 'student-path',
        name: 'Student with Side Hustle',
        description: 'Student who does freelance work on the side',
        entityType: 'student',
        icon: GraduationCap,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'I am a university student',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer', 'Student'],
                aiExpectedKeywords: ['business', 'living', 'student']
            },
            {
                name: 'Select Student',
                input: '4',
                aiInput: 'I am still in school',
                expectedStep: 'student_side_income',
                expectedKeywords: ['work', 'part-time', 'freelance', 'studies'],
                aiExpectedKeywords: ['work', 'studying']
            },
            {
                name: 'Select Freelance Work',
                input: '2',
                aiInput: 'Yes, I do some freelance graphic design',
                expectedStep: 'complete',
                expectedKeywords: ['set', 'student', 'income'],
                aiExpectedKeywords: ['set', 'student']
            }
        ]
    },
    {
        id: 'nigerian-slang-test',
        name: 'Nigerian Slang / Pidgin Test',
        description: 'Test AI mode with Nigerian expressions and pidgin',
        entityType: 'business',
        icon: Brain,
        steps: [
            {
                name: 'Greeting',
                input: 'start',
                aiInput: 'Wetin dey happen? I wan start',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner'],
                aiExpectedKeywords: ['business', 'living']
            },
            {
                name: 'Business Owner (Pidgin)',
                input: '1',
                aiInput: 'Na business I dey run o',
                expectedStep: 'business_stage',
                expectedKeywords: ['stage'],
                aiExpectedKeywords: ['stage', 'business']
            },
            {
                name: 'Growing Business (Pidgin)',
                input: '3',
                aiInput: 'We dey grow, money dey enter small small',
                expectedStep: 'account_setup',
                expectedKeywords: ['account'],
                aiExpectedKeywords: ['account', 'bank']
            },
            {
                name: 'Mixed Account (Pidgin)',
                input: '1',
                aiInput: 'Everything dey one account, I no separate am',
                expectedStep: 'capital_support',
                expectedKeywords: ['funding'],
                aiExpectedKeywords: ['funding', 'business']
            },
            {
                name: 'Family Funding (Pidgin)',
                input: '1',
                aiInput: 'Na family money, my uncle support me',
                expectedStep: 'preferences',
                expectedKeywords: ['insights'],
                aiExpectedKeywords: ['insights', 'often']
            },
            {
                name: 'Weekly (Pidgin)',
                input: '2',
                aiInput: 'Once a week is ok',
                expectedStep: 'complete',
                expectedKeywords: ['Complete'],
                aiExpectedKeywords: ['complete', 'started']
            }
        ]
    }
];

interface OnboardingFlowTesterProps {
    gatewayUrl?: string;
}

export const OnboardingFlowTester = forwardRef<HTMLDivElement, OnboardingFlowTesterProps>(
    function OnboardingFlowTester({ gatewayUrl }, ref) {
        const [selectedFlow, setSelectedFlow] = useState<TestFlow | null>(null);
        const [isRunning, setIsRunning] = useState(false);
        const [currentStepIndex, setCurrentStepIndex] = useState(-1);
        const [stepResults, setStepResults] = useState<StepResult[]>([]);
        const [aiMode, setAiMode] = useState(false);
        const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
        const [allResults, setAllResults] = useState<TestResult[]>([]);
        const [gatewayConnected, setGatewayConnected] = useState<boolean | null>(null);
        const [isCheckingConnection, setIsCheckingConnection] = useState(false);
        const { toast } = useToast();

        // Gateway URL with fallback
        const GATEWAY_URL = gatewayUrl || import.meta.env.VITE_RAILWAY_GATEWAY_URL || 'http://localhost:3001';

        // Check Gateway health
        const checkGatewayHealth = useCallback(async (): Promise<boolean> => {
            console.log(`[OnboardingTest] Checking gateway health at ${GATEWAY_URL}/health`);
            setIsCheckingConnection(true);
            try {
                const response = await fetch(`${GATEWAY_URL}/health`, {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000)
                });
                const isOk = response.ok;
                console.log(`[OnboardingTest] Gateway health check: ${isOk ? 'OK' : 'FAILED'}`);
                setGatewayConnected(isOk);
                return isOk;
            } catch (error) {
                console.error('[OnboardingTest] Gateway health check failed:', error);
                setGatewayConnected(false);
                return false;
            } finally {
                setIsCheckingConnection(false);
            }
        }, [GATEWAY_URL]);

        // Check connection on mount
        useEffect(() => {
            checkGatewayHealth();
        }, [checkGatewayHealth]);

        const sendMessage = useCallback(async (
            message: string, 
            userId: string,
            stepIndex: number = 0
        ): Promise<{ response: string; metadata?: Record<string, unknown> }> => {
            // First step should trigger onboarding
            const isFirstStep = stepIndex === 0;
            
            console.log(`[OnboardingTest] Step ${stepIndex + 1}: Sending to ${GATEWAY_URL}/chat`);
            console.log(`[OnboardingTest] Message: "${message}", isFirstStep: ${isFirstStep}, aiMode: ${aiMode}`);
            
            try {
                const response = await fetch(`${GATEWAY_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        platform: 'simulator',
                        message,
                        idempotencyKey: `test-${Date.now()}-${Math.random()}`,
                        metadata: { 
                            isTest: true, 
                            aiMode,  // Pass aiMode in metadata
                            needsOnboarding: isFirstStep,
                            isNewUser: isFirstStep
                        }
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[OnboardingTest] Gateway error ${response.status}:`, errorText);
                    throw new Error(`Gateway error: ${response.status} - ${errorText}`);
                }

                const data = await response.json();
                console.log('[OnboardingTest] Response received:', data);
                return {
                    response: data.message || '',
                    metadata: data.metadata
                };
            } catch (error) {
                console.error('[OnboardingTest] Request failed:', error);
                throw error;
            }
        }, [GATEWAY_URL, aiMode]);

        const validateStep = (response: string, step: TestStep): { passed: boolean; errors: string[] } => {
            const errors: string[] = [];
            const responseLower = response.toLowerCase();

            // Use AI keywords if in AI mode and they exist, otherwise use standard keywords
            const keywords = aiMode && step.aiExpectedKeywords 
                ? step.aiExpectedKeywords 
                : step.expectedKeywords;

            // Check expected keywords
            for (const keyword of keywords) {
                if (!responseLower.includes(keyword.toLowerCase())) {
                    errors.push(`Missing expected keyword: "${keyword}"`);
                }
            }

            // Check must-not-contain
            if (step.mustNotContain) {
                for (const phrase of step.mustNotContain) {
                    if (responseLower.includes(phrase.toLowerCase())) {
                        errors.push(`Unexpected phrase found: "${phrase}"`);
                    }
                }
            }

            return { passed: errors.length === 0, errors };
        };

        const runTest = async (flow: TestFlow) => {
            // Check gateway connection first
            if (!gatewayConnected) {
                const isHealthy = await checkGatewayHealth();
                if (!isHealthy) {
                    toast({
                        title: 'Gateway Unreachable',
                        description: `Cannot connect to Gateway at ${GATEWAY_URL}. Please check if it's running.`,
                        variant: 'destructive'
                    });
                    return;
                }
            }

            setSelectedFlow(flow);
            setIsRunning(true);
            setStepResults([]);
            setCurrentStepIndex(0);

            const testUserId = `test-${flow.id}-${Date.now()}`;
            const results: StepResult[] = [];

            console.log(`[OnboardingTest] Starting test flow: ${flow.name} (${flow.id})`);
            console.log(`[OnboardingTest] Mode: ${aiMode ? 'AI' : 'Strict'}, User ID: ${testUserId}`);

            try {
                for (let i = 0; i < flow.steps.length; i++) {
                    const step = flow.steps[i];
                    setCurrentStepIndex(i);

                    const startTime = Date.now();
                    const input = aiMode && step.aiInput ? step.aiInput : step.input;

                    console.log(`[OnboardingTest] Step ${i + 1}/${flow.steps.length}: "${step.name}"`);
                    console.log(`[OnboardingTest] Sending input: "${input}"`);

                    try {
                        const { response, metadata } = await sendMessage(input, testUserId, i);
                        const duration = Date.now() - startTime;
                        const validation = validateStep(response, step);

                        console.log(`[OnboardingTest] Step ${i + 1} result:`, {
                            passed: validation.passed,
                            duration,
                            errors: validation.errors,
                            aiConfidence: metadata?.confidence
                        });

                        const result: StepResult = {
                            step,
                            passed: validation.passed,
                            response,
                            duration,
                            aiConfidence: metadata?.confidence as number | undefined,
                            error: validation.errors.length > 0 ? validation.errors.join('; ') : undefined
                        };

                        results.push(result);
                        setStepResults([...results]);

                        // Small delay between steps
                        await new Promise(resolve => setTimeout(resolve, 300));

                    } catch (error) {
                        console.error(`[OnboardingTest] Step ${i + 1} failed:`, error);
                        results.push({
                            step,
                            passed: false,
                            response: '',
                            duration: Date.now() - startTime,
                            error: error instanceof Error ? error.message : 'Request failed'
                        });
                        setStepResults([...results]);
                        break;
                    }
                }

                // Store result
                const testResult: TestResult = {
                    flow,
                    steps: results,
                    passed: results.every(r => r.passed),
                    duration: results.reduce((sum, r) => sum + r.duration, 0)
                };
                setAllResults(prev => [...prev.filter(r => r.flow.id !== flow.id), testResult]);

            } finally {
                setIsRunning(false);
                setCurrentStepIndex(-1);
            }
        };

        const runAllTests = async () => {
            for (const flow of TEST_FLOWS) {
                await runTest(flow);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        };

        const resetTests = () => {
            setSelectedFlow(null);
            setStepResults([]);
            setCurrentStepIndex(-1);
            setAllResults([]);
        };

        const exportResults = () => {
            const exportData = {
                timestamp: new Date().toISOString(),
                mode: aiMode ? 'AI' : 'Strict',
                gatewayUrl: GATEWAY_URL,
                results: allResults.map(r => ({
                    flowId: r.flow.id,
                    flowName: r.flow.name,
                    passed: r.passed,
                    duration: r.duration,
                    steps: r.steps.map(s => ({
                        name: s.step.name,
                        input: aiMode && s.step.aiInput ? s.step.aiInput : s.step.input,
                        passed: s.passed,
                        duration: s.duration,
                        error: s.error,
                        aiConfidence: s.aiConfidence,
                        response: s.response.substring(0, 200) + (s.response.length > 200 ? '...' : '')
                    }))
                }))
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `onboarding-test-results-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        const toggleFlowExpand = (flowId: string) => {
            setExpandedFlows(prev => {
                const next = new Set(prev);
                if (next.has(flowId)) {
                    next.delete(flowId);
                } else {
                    next.add(flowId);
                }
                return next;
            });
        };

        const getFlowResult = (flowId: string) => allResults.find(r => r.flow.id === flowId);

        return (
            <div ref={ref} className="space-y-6">
                {/* Header with Controls */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-semibold">Onboarding Flow Tester</h3>
                        
                        {/* Gateway Status */}
                        <div className="flex items-center gap-2 text-sm">
                            {isCheckingConnection ? (
                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                            ) : gatewayConnected ? (
                                <Wifi className="w-4 h-4 text-green-500" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-destructive" />
                            )}
                            <span className={gatewayConnected ? 'text-green-600' : 'text-destructive'}>
                                {gatewayConnected ? 'Gateway Connected' : 'Gateway Offline'}
                            </span>
                            <button
                                onClick={() => checkGatewayHealth()}
                                className="p-1 hover:bg-muted rounded"
                                title="Refresh connection"
                            >
                                <RefreshCw className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* AI Mode Toggle */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setAiMode(false)}
                                className={cn(
                                    "px-3 py-1.5 rounded-l-md text-sm font-medium transition-colors",
                                    !aiMode
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                            >
                                <Zap className="w-4 h-4 inline mr-1" />
                                Strict
                            </button>
                            <button
                                onClick={() => setAiMode(true)}
                                className={cn(
                                    "px-3 py-1.5 rounded-r-md text-sm font-medium transition-colors",
                                    aiMode
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                                )}
                            >
                                <Brain className="w-4 h-4 inline mr-1" />
                                AI Mode
                            </button>
                        </div>

                        {/* Action Buttons */}
                        <button
                            onClick={runAllTests}
                            disabled={isRunning || !gatewayConnected}
                            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Play className="w-4 h-4" />
                            Run All Tests
                        </button>

                        <button
                            onClick={resetTests}
                            disabled={isRunning}
                            className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 disabled:opacity-50 flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Reset
                        </button>

                        {allResults.length > 0 && (
                            <button
                                onClick={exportResults}
                                className="px-4 py-2 bg-muted text-muted-foreground rounded-md hover:bg-muted/80 flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        )}
                    </div>
                </div>

                {/* Test Flows Grid */}
                <div className="grid gap-4">
                    {TEST_FLOWS.map(flow => {
                        const result = getFlowResult(flow.id);
                        const isExpanded = expandedFlows.has(flow.id);
                        const isCurrentFlow = selectedFlow?.id === flow.id;
                        const FlowIcon = flow.icon;

                        return (
                            <div
                                key={flow.id}
                                className={cn(
                                    "border rounded-lg overflow-hidden transition-all",
                                    result?.passed === true && "border-green-500/50 bg-green-500/5",
                                    result?.passed === false && "border-destructive/50 bg-destructive/5",
                                    isCurrentFlow && isRunning && "border-primary ring-2 ring-primary/20"
                                )}
                            >
                                {/* Flow Header */}
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
                                    onClick={() => toggleFlowExpand(flow.id)}
                                >
                                    <div className="flex items-center gap-3">
                                        <FlowIcon className="w-5 h-5 text-muted-foreground" />
                                        <div>
                                            <h4 className="font-medium">{flow.name}</h4>
                                            <p className="text-sm text-muted-foreground">{flow.description}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Status Indicator */}
                                        {result ? (
                                            <div className="flex items-center gap-2">
                                                {result.passed ? (
                                                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                                                ) : (
                                                    <XCircle className="w-5 h-5 text-destructive" />
                                                )}
                                                <span className="text-sm text-muted-foreground">
                                                    {result.duration}ms
                                                </span>
                                            </div>
                                        ) : isCurrentFlow && isRunning ? (
                                            <Loader2 className="w-5 h-5 animate-spin text-primary" />
                                        ) : null}

                                        {/* Run Button */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                runTest(flow);
                                            }}
                                            disabled={isRunning || !gatewayConnected}
                                            className="px-3 py-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 disabled:opacity-50 text-sm"
                                        >
                                            {isCurrentFlow && isRunning ? 'Running...' : 'Run'}
                                        </button>

                                        {/* Expand Icon */}
                                        {isExpanded ? (
                                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                        ) : (
                                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                        )}
                                    </div>
                                </div>

                                {/* Expanded Steps */}
                                {isExpanded && (
                                    <div className="border-t bg-muted/30 p-4 space-y-3">
                                        {flow.steps.map((step, idx) => {
                                            const stepResult = isCurrentFlow ? stepResults[idx] : result?.steps[idx];
                                            const isCurrentStep = isCurrentFlow && isRunning && idx === currentStepIndex;

                                            return (
                                                <div
                                                    key={idx}
                                                    className={cn(
                                                        "flex items-start gap-3 p-3 rounded-md bg-background border",
                                                        stepResult?.passed === true && "border-green-500/50",
                                                        stepResult?.passed === false && "border-destructive/50",
                                                        isCurrentStep && "ring-2 ring-primary/50"
                                                    )}
                                                >
                                                    {/* Step Number */}
                                                    <div className={cn(
                                                        "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0",
                                                        stepResult?.passed === true && "bg-green-500 text-white",
                                                        stepResult?.passed === false && "bg-destructive text-white",
                                                        !stepResult && "bg-muted text-muted-foreground"
                                                    )}>
                                                        {isCurrentStep ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : stepResult?.passed === true ? (
                                                            <CheckCircle2 className="w-3 h-3" />
                                                        ) : stepResult?.passed === false ? (
                                                            <XCircle className="w-3 h-3" />
                                                        ) : (
                                                            idx + 1
                                                        )}
                                                    </div>

                                                    {/* Step Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-sm">{step.name}</span>
                                                            {stepResult && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {stepResult.duration}ms
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            Input: <code className="bg-muted px-1 rounded">
                                                                {aiMode && step.aiInput ? step.aiInput : step.input}
                                                            </code>
                                                        </div>
                                                        {stepResult?.error && (
                                                            <div className="text-xs text-destructive mt-1">
                                                                ❌ {stepResult.error}
                                                            </div>
                                                        )}
                                                        {stepResult?.response && (
                                                            <details className="mt-2">
                                                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                                    View Response
                                                                </summary>
                                                                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-40">
                                                                    {stepResult.response}
                                                                </pre>
                                                            </details>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Summary */}
                {allResults.length > 0 && (
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-medium">
                                Test Summary ({aiMode ? 'AI Mode' : 'Strict Mode'})
                            </span>
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                <span className="text-sm">{allResults.filter(r => r.passed).length} passed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <XCircle className="w-4 h-4 text-destructive" />
                                <span className="text-sm">{allResults.filter(r => !r.passed).length} failed</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            Total: {allResults.reduce((sum, r) => sum + r.duration, 0)}ms
                        </div>
                    </div>
                )}
            </div>
        );
    }
);

export default OnboardingFlowTester;
