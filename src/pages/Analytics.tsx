import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BarChart3,
    TrendingUp,
    TrendingDown,
    PieChart,
    Calendar,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MonthlyData {
    month: string;
    label: string;
    income: number;
    expenses: number;
    net: number;
    emtl: number;
    transactionCount: number;
}

interface CategoryData {
    category: string;
    amount: number;
    count: number;
    percentage: number;
}

export default function Analytics() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
    const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
    const [totals, setTotals] = useState({
        income: 0,
        expenses: 0,
        net: 0,
        emtl: 0,
        avgMonthlyIncome: 0,
        avgMonthlyExpenses: 0,
    });

    useEffect(() => {
        fetchAnalytics();
    }, [selectedYear]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                navigate('/auth');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('auth_id', user.id)
                .single();

            if (!userData) {
                setLoading(false);
                return;
            }

            const year = parseInt(selectedYear);
            const startDate = `${year}-01-01`;
            const endDate = `${year}-12-31`;

            const { data: transactions } = await supabase
                .from('bank_transactions')
                .select('*')
                .eq('user_id', userData.id)
                .gte('transaction_date', startDate)
                .lte('transaction_date', endDate)
                .order('transaction_date', { ascending: true });

            if (!transactions || transactions.length === 0) {
                setMonthlyData([]);
                setCategoryData([]);
                setTotals({ income: 0, expenses: 0, net: 0, emtl: 0, avgMonthlyIncome: 0, avgMonthlyExpenses: 0 });
                setLoading(false);
                return;
            }

            // Build monthly aggregates
            const monthMap = new Map<string, MonthlyData>();
            const categoryMap = new Map<string, { amount: number; count: number }>();
            let totalIncome = 0;
            let totalExpenses = 0;
            let totalEmtl = 0;

            // Initialize all months
            for (let i = 0; i < 12; i++) {
                const monthKey = `${year}-${String(i + 1).padStart(2, '0')}`;
                const date = new Date(year, i, 1);
                monthMap.set(monthKey, {
                    month: monthKey,
                    label: date.toLocaleDateString('en-US', { month: 'short' }),
                    income: 0,
                    expenses: 0,
                    net: 0,
                    emtl: 0,
                    transactionCount: 0,
                });
            }

            // Process transactions
            for (const txn of transactions) {
                const monthKey = txn.transaction_date?.substring(0, 7);
                if (!monthKey || !monthMap.has(monthKey)) continue;

                const data = monthMap.get(monthKey)!;
                const credit = txn.credit || 0;
                const debit = txn.debit || 0;

                data.income += credit;
                data.expenses += debit;
                data.transactionCount++;
                totalIncome += credit;
                totalExpenses += debit;

                // EMTL detection
                const flags = txn.nigerian_flags as Record<string, boolean> | null;
                if (flags?.isEmtl) {
                    data.emtl += 50;
                    totalEmtl += 50;
                }

                // Category aggregation
                const category = txn.classification || txn.category || 'uncategorized';
                const existing = categoryMap.get(category) || { amount: 0, count: 0 };
                existing.amount += debit || credit;
                existing.count++;
                categoryMap.set(category, existing);
            }

            // Calculate net for each month
            monthMap.forEach(data => {
                data.net = data.income - data.expenses;
            });

            // Build category array with percentages
            const totalAmount = Array.from(categoryMap.values()).reduce((s, c) => s + c.amount, 0);
            const categories: CategoryData[] = Array.from(categoryMap.entries())
                .map(([category, data]) => ({
                    category,
                    amount: data.amount,
                    count: data.count,
                    percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
                }))
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 8);

            const monthsWithData = Array.from(monthMap.values()).filter(m => m.transactionCount > 0).length;

            setMonthlyData(Array.from(monthMap.values()));
            setCategoryData(categories);
            setTotals({
                income: totalIncome,
                expenses: totalExpenses,
                net: totalIncome - totalExpenses,
                emtl: totalEmtl,
                avgMonthlyIncome: monthsWithData > 0 ? totalIncome / monthsWithData : 0,
                avgMonthlyExpenses: monthsWithData > 0 ? totalExpenses / monthsWithData : 0,
            });

        } catch (error) {
            console.error('Error fetching analytics:', error);
            toast({
                title: 'Error',
                description: 'Failed to load analytics',
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

    const getMaxValue = () => {
        return Math.max(
            ...monthlyData.map(d => Math.max(d.income, d.expenses)),
            1
        );
    };

    const getCategoryColor = (index: number) => {
        const colors = [
            'bg-indigo-500',
            'bg-green-500',
            'bg-blue-500',
            'bg-purple-500',
            'bg-orange-500',
            'bg-pink-500',
            'bg-cyan-500',
            'bg-amber-500',
        ];
        return colors[index % colors.length];
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
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
                            <BarChart3 className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <Select value={selectedYear} onValueChange={setSelectedYear}>
                                <SelectTrigger className="w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="2026">2026</SelectItem>
                                    <SelectItem value="2025">2025</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="ghost" size="sm" onClick={() => navigate('/tax-dashboard')}>
                                Tax Dashboard
                            </Button>
                            <Button variant="outline" onClick={() => navigate('/dashboard')}>
                                Back to Dashboard
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <ArrowUpRight className="h-3 w-3 text-green-500" />
                                Total Income
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(totals.income)}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Avg: {formatCurrency(totals.avgMonthlyIncome)}/mo
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <ArrowDownRight className="h-3 w-3 text-red-500" />
                                Total Expenses
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-red-500">{formatCurrency(totals.expenses)}</p>
                            <p className="text-xs text-gray-500 mt-1">
                                Avg: {formatCurrency(totals.avgMonthlyExpenses)}/mo
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription className="flex items-center gap-1">
                                <TrendingUp className="h-3 w-3" />
                                Net Position
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className={`text-2xl font-bold ${totals.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {formatCurrency(totals.net)}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>EMTL Paid</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-2xl font-bold text-blue-600">{formatCurrency(totals.emtl)}</p>
                        </CardContent>
                    </Card>
                </div>

                {/* Monthly Chart */}
                <Card className="mb-8">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="h-5 w-5" />
                            Monthly Income vs Expenses
                        </CardTitle>
                        <CardDescription>{selectedYear} breakdown</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {monthlyData.every(m => m.transactionCount === 0) ? (
                            <div className="text-center py-12 text-gray-500">
                                <PieChart className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                <p>No transaction data for {selectedYear}</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Bar Chart */}
                                <div className="flex items-end gap-2 h-52 border-b border-l border-gray-200 p-4">
                                    {monthlyData.map((data) => {
                                        const maxVal = getMaxValue();
                                        const incomeHeight = maxVal > 0 ? (data.income / maxVal) * 100 : 0;
                                        const expenseHeight = maxVal > 0 ? (data.expenses / maxVal) * 100 : 0;

                                        return (
                                            <div key={data.month} className="flex-1 flex flex-col items-center gap-1">
                                                <div className="flex gap-0.5 items-end h-40 w-full justify-center">
                                                    <div
                                                        className="w-3 bg-green-500 rounded-t transition-all hover:bg-green-600"
                                                        style={{ height: `${incomeHeight}%` }}
                                                        title={`Income: ${formatCurrency(data.income)}`}
                                                    />
                                                    <div
                                                        className="w-3 bg-red-400 rounded-t transition-all hover:bg-red-500"
                                                        style={{ height: `${expenseHeight}%` }}
                                                        title={`Expenses: ${formatCurrency(data.expenses)}`}
                                                    />
                                                </div>
                                                <span className="text-xs text-gray-500">{data.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Legend */}
                                <div className="flex gap-6 justify-center text-sm">
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 bg-green-500 rounded" />
                                        <span>Income</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="h-3 w-3 bg-red-400 rounded" />
                                        <span>Expenses</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Category Breakdown */}
                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <PieChart className="h-5 w-5" />
                                Spending by Category
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {categoryData.length === 0 ? (
                                <p className="text-center text-gray-500 py-8">No categorized transactions</p>
                            ) : (
                                <div className="space-y-3">
                                    {categoryData.map((cat, idx) => (
                                        <div key={cat.category} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="capitalize font-medium">{cat.category.replace('_', ' ')}</span>
                                                <span className="text-gray-500">{formatCurrency(cat.amount)}</span>
                                            </div>
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${getCategoryColor(idx)} rounded-full transition-all`}
                                                    style={{ width: `${cat.percentage}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Monthly Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5" />
                                Monthly Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2 max-h-72 overflow-y-auto">
                                {monthlyData.filter(m => m.transactionCount > 0).reverse().map((data) => (
                                    <div key={data.month} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                        <div>
                                            <p className="font-medium text-sm">
                                                {new Date(data.month + '-01').toLocaleDateString('en-US', { month: 'long' })}
                                            </p>
                                            <p className="text-xs text-gray-500">{data.transactionCount} transactions</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-semibold text-sm ${data.net >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                                {data.net >= 0 ? '+' : ''}{formatCurrency(data.net)}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {monthlyData.every(m => m.transactionCount === 0) && (
                                    <p className="text-center text-gray-500 py-4">No data</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
}
