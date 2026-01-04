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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface TestStep {
    name: string;
    input: string;
    aiInput?: string; // Natural language alternative
    expectedStep: string;
    expectedKeywords: string[];
    mustNotContain?: string[];
}

interface TestFlow {
    id: string;
    name: string;
    description: string;
    entityType: 'business' | 'individual' | 'self_employed';
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
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer']
            },
            {
                name: 'Select Business Owner',
                input: '1',
                aiInput: 'I run my own business',
                expectedStep: 'business_stage',
                expectedKeywords: ['Pre-revenue', 'Early stage', 'Growing', 'Established']
            },
            {
                name: 'Select Early Stage',
                input: '2',
                aiInput: 'We just started, getting our first customers',
                expectedStep: 'account_setup',
                expectedKeywords: ['bank accounts', 'Mixed', 'Separate']
            },
            {
                name: 'Select Separate Accounts',
                input: '2',
                aiInput: 'I keep separate accounts for business',
                expectedStep: 'capital_support',
                expectedKeywords: ['funding', 'Family', 'Investors', 'Loan']
            },
            {
                name: 'Select Bootstrapped',
                input: '4',
                aiInput: 'Using my own savings',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly', 'Monthly']
            },
            {
                name: 'Select Weekly Updates',
                input: '2',
                aiInput: 'Weekly updates please',
                expectedStep: 'complete',
                expectedKeywords: ['Onboarding Complete', 'profile', 'upload']
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
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer']
            },
            {
                name: 'Select Employed Individual',
                input: '2',
                aiInput: 'I work for a company and earn a salary',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly'],
                mustNotContain: ['business stage', 'funding']
            },
            {
                name: 'Select Monthly Updates',
                input: '3',
                aiInput: 'Monthly is fine for me',
                expectedStep: 'complete',
                expectedKeywords: ['set', 'salaried', 'payslip']
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
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer']
            },
            {
                name: 'Select Freelancer',
                input: '3',
                aiInput: "I'm a freelancer, I work for myself",
                expectedStep: 'account_setup',
                expectedKeywords: ['freelance income', 'separate', 'personal spending'],
                mustNotContain: ['business stage']
            },
            {
                name: 'Select Separate Account',
                input: '1',
                aiInput: 'Yes, I have a separate work account',
                expectedStep: 'preferences',
                expectedKeywords: ['insights', 'Daily', 'Weekly'],
                mustNotContain: ['funding', 'capital']
            },
            {
                name: 'Select Weekly Updates',
                input: '2',
                aiInput: 'Give me weekly summaries',
                expectedStep: 'complete',
                expectedKeywords: ['Freelancer Mode', 'Activated', 'client payments']
            }
        ]
    },
    {
        id: 'freelancer-mixed-account',
        name: 'Freelancer with Mixed Account',
        description: 'Freelancer who uses one account for everything',
        entityType: 'self_employed',
        icon: Laptop,
        steps: [
            {
                name: 'Welcome & Entity Type',
                input: 'start',
                aiInput: 'Hello',
                expectedStep: 'entity_type',
                expectedKeywords: ['Business Owner', 'Employed', 'Freelancer']
            },
            {
                name: 'Select Freelancer',
                input: '3',
                aiInput: 'I do freelance work',
                expectedStep: 'account_setup',
                expectedKeywords: ['freelance income', 'separate']
            },
            {
                name: 'Select Mixed Account (No)',
                input: '2',
                aiInput: 'No, everything goes into one account',
                expectedStep: 'preferences',
                expectedKeywords: ['insights']
            },
            {
                name: 'Select Daily Updates',
                input: '1',
                aiInput: 'Daily updates please, I want to stay on top of things',
                expectedStep: 'complete',
                expectedKeywords: ['Freelancer Mode', 'daily']
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
                expectedKeywords: ['Business Owner']
            },
            {
                name: 'Business Owner (Pidgin)',
                input: '1',
                aiInput: 'Na business I dey run o',
                expectedStep: 'business_stage',
                expectedKeywords: ['stage']
            },
            {
                name: 'Growing Business (Pidgin)',
                input: '3',
                aiInput: 'We dey grow, money dey enter small small',
                expectedStep: 'account_setup',
                expectedKeywords: ['account']
            },
            {
                name: 'Mixed Account (Pidgin)',
                input: '1',
                aiInput: 'Everything dey one account, I no separate am',
                expectedStep: 'capital_support',
                expectedKeywords: ['funding']
            },
            {
                name: 'Family Funding (Pidgin)',
                input: '1',
                aiInput: 'Na family money, my uncle support me',
                expectedStep: 'preferences',
                expectedKeywords: ['insights']
            },
            {
                name: 'Weekly (Pidgin)',
                input: '2',
                aiInput: 'Once a week is ok',
                expectedStep: 'complete',
                expectedKeywords: ['Complete']
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

        const sendMessage = useCallback(async (message: string, userId: string): Promise<{ response: string; metadata?: Record<string, unknown> }> => {
            console.log(`[OnboardingTest] Sending message to ${GATEWAY_URL}/chat:`, { message, userId });
            try {
                const response = await fetch(`${GATEWAY_URL}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId,
                        platform: 'simulator',
                        message,
                        idempotencyKey: `test-${Date.now()}-${Math.random()}`,
                        metadata: { isTest: true, aiMode }
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

            // Check expected keywords
            for (const keyword of step.expectedKeywords) {
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
                        const { response, metadata } = await sendMessage(input, testUserId);
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
                setAllResults(prev => [...prev, testResult]);

                console.log(`[OnboardingTest] Test flow completed:`, {
                    flow: flow.name,
                    passed: testResult.passed,
                    stepsPassed: `${results.filter(r => r.passed).length}/${results.length}`,
                    totalDuration: testResult.duration
                });

                toast({
                    title: testResult.passed ? 'Test Passed' : 'Test Failed',
                    description: `${results.filter(r => r.passed).length}/${results.length} steps passed`,
                    variant: testResult.passed ? 'default' : 'destructive'
                });

            } finally {
                setIsRunning(false);
                setCurrentStepIndex(-1);
            }
        };

        const runAllTests = async () => {
            setAllResults([]);
            for (const flow of TEST_FLOWS) {
                await runTest(flow);
                // Delay between flows
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
                gatewayConnected,
                summary: {
                    total: allResults.length,
                    passed: allResults.filter(r => r.passed).length,
                    failed: allResults.filter(r => !r.passed).length
                },
                results: allResults.map(r => ({
                    flowId: r.flow.id,
                    flowName: r.flow.name,
                    entityType: r.flow.entityType,
                    passed: r.passed,
                    duration: r.duration,
                    steps: r.steps.map(s => ({
                        name: s.step.name,
                        input: aiMode ? s.step.aiInput : s.step.input,
                        passed: s.passed,
                        duration: s.duration,
                        response: s.response,
                        error: s.error,
                        aiConfidence: s.aiConfidence
                    }))
                }))
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `onboarding-test-results-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({
                title: 'Results Exported',
                description: 'Test results have been downloaded as JSON.',
            });
        };

        const toggleFlowExpanded = (flowId: string) => {
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

        const passedCount = allResults.filter(r => r.passed).length;
        const totalCount = allResults.length;

        return (
            <div ref={ref} className="space-y-6">
                {/* Gateway Status */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-3">
                        {isCheckingConnection ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        ) : gatewayConnected ? (
                            <Wifi className="w-4 h-4 text-green-500" />
                        ) : (
                            <WifiOff className="w-4 h-4 text-destructive" />
                        )}
                        <div>
                            <span className={cn(
                                "text-sm font-medium",
                                gatewayConnected ? "text-green-500" : gatewayConnected === false ? "text-destructive" : "text-muted-foreground"
                            )}>
                                Gateway: {isCheckingConnection ? 'Checking...' : gatewayConnected ? 'Connected' : 'Disconnected'}
                            </span>
                            <span className="text-xs text-muted-foreground ml-2">({GATEWAY_URL})</span>
                        </div>
                    </div>
                    <button
                        onClick={checkGatewayHealth}
                        disabled={isCheckingConnection}
                        className="text-xs px-2 py-1 bg-muted hover:bg-accent rounded transition-colors disabled:opacity-50"
                    >
                        {isCheckingConnection ? 'Checking...' : 'Test Connection'}
                    </button>
                </div>

                {/* Header Controls */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h3 className="text-lg font-medium text-foreground">Onboarding Flow Tests</h3>
                        
                        {/* AI Mode Toggle */}
                        <button
                            onClick={() => setAiMode(!aiMode)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                                aiMode 
                                    ? "bg-primary text-primary-foreground" 
                                    : "bg-muted text-muted-foreground hover:bg-accent"
                            )}
                        >
                            {aiMode ? <Brain className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                            {aiMode ? 'AI Mode' : 'Strict Mode'}
                        </button>
                    </div>

                    <div className="flex items-center gap-2">
                        {allResults.length > 0 && (
                            <button
                                onClick={exportResults}
                                className="flex items-center gap-2 px-3 py-2 bg-muted text-foreground rounded-lg hover:bg-accent"
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        )}
                        <button
                            onClick={runAllTests}
                            disabled={isRunning || !gatewayConnected}
                            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Run All Tests
                        </button>
                        <button
                            onClick={resetTests}
                            disabled={isRunning}
                            className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-accent disabled:opacity-50"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Reset
                        </button>
                    </div>
                </div>

                {/* Mode Description */}
                <div className={cn(
                    "p-3 rounded-lg text-sm",
                    aiMode ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                    {aiMode ? (
                        <>
                            <Brain className="w-4 h-4 inline mr-2" />
                            <strong>AI Mode:</strong> Uses natural language inputs (e.g., "I'm a freelancer") to test the AI extraction system. Tests real-world conversational responses.
                        </>
                    ) : (
                        <>
                            <Zap className="w-4 h-4 inline mr-2" />
                            <strong>Strict Mode:</strong> Uses number inputs (1, 2, 3) to test basic pattern matching. Faster and more deterministic.
                        </>
                    )}
                </div>

                {/* Summary Bar */}
                {allResults.length > 0 && (
                    <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-lg">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Results:</span>
                            <span className={cn(
                                "font-medium",
                                passedCount === totalCount ? "text-green-500" : "text-destructive"
                            )}>
                                {passedCount}/{totalCount} passed
                            </span>
                        </div>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                                className={cn(
                                    "h-full transition-all",
                                    passedCount === totalCount ? "bg-green-500" : "bg-destructive"
                                )}
                                style={{ width: `${(passedCount / totalCount) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Test Flows */}
                <div className="space-y-3">
                    {TEST_FLOWS.map((flow) => {
                        const result = allResults.find(r => r.flow.id === flow.id);
                        const isExpanded = expandedFlows.has(flow.id);
                        const isActive = selectedFlow?.id === flow.id;
                        const FlowIcon = flow.icon;

                        return (
                            <div
                                key={flow.id}
                                className={cn(
                                    "border rounded-xl overflow-hidden transition-colors",
                                    isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                                )}
                            >
                                {/* Flow Header */}
                                <div className="flex items-center gap-3 p-4">
                                    <button
                                        onClick={() => toggleFlowExpanded(flow.id)}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                    </button>
                                    
                                    <FlowIcon className={cn(
                                        "w-5 h-5",
                                        flow.entityType === 'business' ? "text-blue-500" :
                                        flow.entityType === 'individual' ? "text-green-500" : "text-purple-500"
                                    )} />
                                    
                                    <div className="flex-1">
                                        <h4 className="font-medium text-foreground">{flow.name}</h4>
                                        <p className="text-xs text-muted-foreground">{flow.description}</p>
                                    </div>

                                    {/* Status Badge */}
                                    {result && (
                                        <div className={cn(
                                            "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                                            result.passed ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"
                                        )}>
                                            {result.passed ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                            {result.passed ? 'Passed' : 'Failed'}
                                        </div>
                                    )}

                                    {/* Run Button */}
                                    <button
                                        onClick={() => runTest(flow)}
                                        disabled={isRunning || !gatewayConnected}
                                        className={cn(
                                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors",
                                            isActive && isRunning
                                                ? "bg-primary/20 text-primary"
                                                : "bg-muted hover:bg-accent text-foreground disabled:opacity-50"
                                        )}
                                    >
                                        {isActive && isRunning ? (
                                            <>
                                                <Square className="w-3 h-3" />
                                                Running...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="w-3 h-3" />
                                                Run
                                            </>
                                        )}
                                    </button>
                                </div>

                                {/* Expanded Steps */}
                                {isExpanded && (
                                    <div className="border-t border-border p-4 space-y-2">
                                        {flow.steps.map((step, index) => {
                                            const stepResult = isActive ? stepResults[index] : result?.steps[index];
                                            const isCurrent = isActive && isRunning && currentStepIndex === index;

                                            return (
                                                <div
                                                    key={index}
                                                    className={cn(
                                                        "flex items-start gap-3 p-3 rounded-lg",
                                                        isCurrent ? "bg-primary/10" :
                                                        stepResult?.passed ? "bg-green-500/5" :
                                                        stepResult?.passed === false ? "bg-destructive/5" : "bg-muted/50"
                                                    )}
                                                >
                                                    {/* Status Icon */}
                                                    <div className="mt-0.5">
                                                        {isCurrent ? (
                                                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                                                        ) : stepResult?.passed ? (
                                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                        ) : stepResult?.passed === false ? (
                                                            <XCircle className="w-4 h-4 text-destructive" />
                                                        ) : (
                                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                                        )}
                                                    </div>

                                                    {/* Step Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium text-sm text-foreground">{step.name}</span>
                                                            {stepResult && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {stepResult.duration}ms
                                                                </span>
                                                            )}
                                                            {stepResult?.aiConfidence !== undefined && (
                                                                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                                                    AI: {(stepResult.aiConfidence * 100).toFixed(0)}%
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground mt-1">
                                                            Input: <code className="px-1 py-0.5 bg-muted rounded">{aiMode && step.aiInput ? step.aiInput : step.input}</code>
                                                        </div>
                                                        {stepResult?.error && (
                                                            <div className="text-xs text-destructive mt-1">
                                                                {stepResult.error}
                                                            </div>
                                                        )}
                                                        {stepResult?.response && (
                                                            <details className="mt-2">
                                                                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                                                                    View Response
                                                                </summary>
                                                                <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-x-auto max-h-32">
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
            </div>
        );
    }
);
