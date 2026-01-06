import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Receipt,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    ArrowRight,
    BarChart3,
    PieChart,
    FileText,
    Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TaxMetrics {
    totalIncome: number;
    totalExpenses: number;
    emtlPaid: number;
    emtlCount: number;
    vatPaid: number;
    vatCount: number;
    taxableIncome: number;
    potentialDeductions: number;
    uncategorizedCount: number;
    complianceScore: number;
}

interface MonthlyData {
    month: string;
    income: number;
    expenses: number;
    emtl: number;
    vat: number;
}

export default function TaxDashboard() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<TaxMetrics>({
        totalIncome: 0,
        totalExpenses: 0,
        emtlPaid: 0,
        emtlCount: 0,
        vatPaid: 0,
        vatCount: 0,
        taxableIncome: 0,
        potentialDeductions: 0,
        uncategorizedCount: 0,
        complianceScore: 0,
    });
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
    const [selectedPeriod, setSelectedPeriod] = useState<'month' | 'quarter' | 'year'>('month');

    useEffect(() => {
        fetchTaxData();
    }, [selectedPeriod]);

    const fetchTaxData = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            // Get user's bank transactions
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_id', user.id)
                .single();

            if (!userData) {
                setLoading(false);
                return;
            }

            // Calculate date range based on selected period
            const now = new Date();
            let startDate: Date;
            if (selectedPeriod === 'month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (selectedPeriod === 'quarter') {
                startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            } else {
                startDate = new Date(now.getFullYear(), 0, 1);
            }

            // Fetch transactions
            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('*')
                .eq('user_id', userData.id)
                .gte('transaction_date', startDate.toISOString().split('T')[0]);

            if (!transactions) {
                setLoading(false);
                return;
            }

            // Calculate metrics
            let totalIncome = 0;
            let totalExpenses = 0;
            let emtlPaid = 0;
            let emtlCount = 0;
            let vatPaid = 0;
            let vatCount = 0;
            let uncategorizedCount = 0;
            let potentialDeductions = 0;

            const monthlyMap = new Map<string, MonthlyData>();

            for (const txn of transactions) {
                const monthKey = txn.transaction_date?.substring(0, 7) || 'Unknown';
                if (!monthlyMap.has(monthKey)) {
                    monthlyMap.set(monthKey, { month: monthKey, income: 0, expenses: 0, emtl: 0, vat: 0 });
                }
                const monthData = monthlyMap.get(monthKey)!;

                const credit = txn.credit || 0;
                const debit = txn.debit || 0;

                if (credit > 0) {
                    totalIncome += credit;
                    monthData.income += credit;
                }
                if (debit > 0) {
                    totalExpenses += debit;
                    monthData.expenses += debit;
                }

                // Check Nigerian flags for EMTL/VAT
                const flags = txn.nigerian_flags as Record<string, boolean> | null;
                const taxImpl = txn.tax_implications as Record<string, boolean> | null;

                if (flags?.isEmtl) {
                    emtlPaid += 50; // Standard EMTL is ₦50
                    emtlCount++;
                    monthData.emtl += 50;
                }

                if (taxImpl?.vatApplicable && credit > 0) {
                    const vatAmount = credit * 0.075;
                    vatPaid += vatAmount;
                    vatCount++;
                    monthData.vat += vatAmount;
                }

                if (taxImpl?.deductible) {
                    potentialDeductions += debit;
                }

                if (!txn.classification || txn.classification === 'needs_review') {
                    uncategorizedCount++;
                }
            }

            // Calculate compliance score
            const transactionCount = transactions.length;
            let score = 50; // Base score

            // +20 for having connected accounts
            score += 20;

            // +20 for categorization (penalize uncategorized)
            if (transactionCount > 0) {
                const categorizedPct = (transactionCount - uncategorizedCount) / transactionCount;
                score += Math.round(categorizedPct * 20);
            }

            // +10 for regular syncs (assume active if we have recent data)
            if (transactions.length > 0) {
                score += 10;
            }

            // Cap at 100
            score = Math.min(score, 100);

            setMetrics({
                totalIncome,
                totalExpenses,
                emtlPaid,
                emtlCount,
                vatPaid,
                vatCount,
                taxableIncome: totalIncome - potentialDeductions,
                potentialDeductions,
                uncategorizedCount,
                complianceScore: score,
            });

            // Sort monthly data
            const sortedMonthly = Array.from(monthlyMap.values())
                .sort((a, b) => a.month.localeCompare(b.month));
            setMonthlyData(sortedMonthly);

        } catch (error) {
            console.error('Error fetching tax data:', error);
            toast({
                title: 'Error',
                description: 'Failed to load tax data',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getScoreBgColor = (score: number) => {
        if (score >= 80) return 'bg-green-500';
        if (score >= 60) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    const getMaxValue = () => {
        return Math.max(
            ...monthlyData.map(d => Math.max(d.income, d.expenses)),
            1
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <Receipt className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Tax Dashboard</h1>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Period Selector */}
                <div className="flex gap-2 mb-6">
                    {(['month', 'quarter', 'year'] as const).map((period) => (
                        <Button
                            key={period}
                            variant={selectedPeriod === period ? 'default' : 'outline'}
                            onClick={() => setSelectedPeriod(period)}
                            size="sm"
                        >
                            This {period.charAt(0).toUpperCase() + period.slice(1)}
                        </Button>
                    ))}
                </div>

                {/* Compliance Score Card */}
                <Card className="mb-6 bg-gradient-to-br from-indigo-600 to-purple-700 text-white">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Target className="h-5 w-5" />
                                    <h2 className="text-lg font-semibold">Tax Compliance Score</h2>
                                </div>
                                <div className="flex items-baseline gap-3">
                                    <span className="text-5xl font-bold">{metrics.complianceScore}</span>
                                    <span className="text-xl opacity-80">/100</span>
                                </div>
                                <Progress
                                    value={metrics.complianceScore}
                                    className="mt-4 h-3 bg-white/20"
                                />
                            </div>
                            <div className="text-right space-y-1 text-sm opacity-90">
                                <div className="flex items-center gap-2 justify-end">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>Bank connected</span>
                                </div>
                                <div className="flex items-center gap-2 justify-end">
                                    <CheckCircle2 className="h-4 w-4" />
                                    <span>Transactions synced</span>
                                </div>
                                {metrics.uncategorizedCount > 0 && (
                                    <div className="flex items-center gap-2 justify-end text-yellow-300">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span>{metrics.uncategorizedCount} need review</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tax Summary Cards - 4 Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {/* EMTL Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                EMTL Paid
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.emtlPaid)}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                {metrics.emtlCount} charge{metrics.emtlCount !== 1 ? 's' : ''}
                            </p>
                        </CardContent>
                    </Card>

                    {/* VAT Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-green-500"></div>
                                VAT Collected
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.vatPaid)}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                {metrics.vatCount} item{metrics.vatCount !== 1 ? 's' : ''}
                            </p>
                        </CardContent>
                    </Card>

                    {/* Taxable Income Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-purple-500"></div>
                                Taxable Income
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.taxableIncome)}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                After deductions
                            </p>
                        </CardContent>
                    </Card>

                    {/* Deductions Card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-orange-500"></div>
                                Potential Deductions
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-gray-900">
                                {formatCurrency(metrics.potentialDeductions)}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Tax savings available
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Monthly Breakdown Chart */}
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Monthly Breakdown
                        </CardTitle>
                        <CardDescription>
                            Income vs Expenses with Tax Items
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {monthlyData.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No transaction data available</p>
                                <p className="text-sm mt-1">Connect a bank account to see your tax breakdown</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Simple Bar Chart */}
                                <div className="flex items-end gap-4 h-48 border-b border-l border-gray-200 p-4">
                                    {monthlyData.slice(-6).map((data, index) => {
                                        const maxVal = getMaxValue();
                                        const incomeHeight = (data.income / maxVal) * 100;
                                        const expenseHeight = (data.expenses / maxVal) * 100;

                                        return (
                                            <div key={data.month} className="flex-1 flex flex-col items-center gap-1">
                                                <div className="flex gap-1 items-end h-36">
                                                    <div
                                                        className="w-6 bg-green-500 rounded-t transition-all"
                                                        style={{ height: `${incomeHeight}%` }}
                                                        title={`Income: ${formatCurrency(data.income)}`}
                                                    ></div>
                                                    <div
                                                        className="w-6 bg-red-400 rounded-t transition-all"
                                                        style={{ height: `${expenseHeight}%` }}
                                                        title={`Expenses: ${formatCurrency(data.expenses)}`}
                                                    ></div>
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(data.month + '-01').toLocaleDateString('en-US', { month: 'short' })}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Legend */}
                                <div className="flex gap-6 justify-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 bg-green-500 rounded"></div>
                                        <span>Income</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 bg-red-400 rounded"></div>
                                        <span>Expenses</span>
                                    </div>
                                </div>

                                {/* Monthly Details Table */}
                                <div className="mt-6 overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b text-left text-gray-500">
                                                <th className="pb-2">Month</th>
                                                <th className="pb-2 text-right">Income</th>
                                                <th className="pb-2 text-right">Expenses</th>
                                                <th className="pb-2 text-right">EMTL</th>
                                                <th className="pb-2 text-right">VAT</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {monthlyData.slice(-6).reverse().map((data) => (
                                                <tr key={data.month} className="border-b">
                                                    <td className="py-2 font-medium">
                                                        {new Date(data.month + '-01').toLocaleDateString('en-US', {
                                                            month: 'long',
                                                            year: 'numeric'
                                                        })}
                                                    </td>
                                                    <td className="py-2 text-right text-green-600">
                                                        {formatCurrency(data.income)}
                                                    </td>
                                                    <td className="py-2 text-right text-red-500">
                                                        {formatCurrency(data.expenses)}
                                                    </td>
                                                    <td className="py-2 text-right text-blue-600">
                                                        {formatCurrency(data.emtl)}
                                                    </td>
                                                    <td className="py-2 text-right text-purple-600">
                                                        {formatCurrency(data.vat)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Action Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Items Needing Review */}
                    {metrics.uncategorizedCount > 0 && (
                        <Card className="border-yellow-200 bg-yellow-50">
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <AlertTriangle className="h-8 w-8 text-yellow-600" />
                                        <div>
                                            <p className="font-semibold text-gray-900">
                                                {metrics.uncategorizedCount} Transactions Need Review
                                            </p>
                                            <p className="text-sm text-gray-600">
                                                Categorize these for accurate tax reporting
                                            </p>
                                        </div>
                                    </div>
                                    <Button variant="outline" size="sm" onClick={() => navigate('/transactions?filter=needs_review')}>
                                        Review <ArrowRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Generate Report */}
                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <FileText className="h-8 w-8 text-indigo-600" />
                                    <div>
                                        <p className="font-semibold text-gray-900">Generate Tax Report</p>
                                        <p className="text-sm text-gray-600">
                                            Download PDF or CSV summary
                                        </p>
                                    </div>
                                </div>
                                <Button size="sm" onClick={() => navigate('/reports')}>
                                    Generate <ArrowRight className="h-4 w-4 ml-1" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Tax Calendar Preview */}
                <Card className="mt-6">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Upcoming Deadlines
                        </CardTitle>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/tax-calendar')}>
                            View All
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                                        <span className="text-sm font-bold text-indigo-600">21</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">VAT Monthly Return</p>
                                        <p className="text-sm text-gray-500">Due 21st of every month</p>
                                    </div>
                                </div>
                                <Badge variant="outline">Recurring</Badge>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                                        <span className="text-sm font-bold text-purple-600">30</span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">Annual Returns (Self-Employed)</p>
                                        <p className="text-sm text-gray-500">Due March 31, 2026</p>
                                    </div>
                                </div>
                                <Badge>84 days left</Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
