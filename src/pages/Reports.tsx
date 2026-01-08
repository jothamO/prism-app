import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    Download,
    Calendar,
    PieChart,
    TrendingUp,
    Receipt,
    Loader2,
    FileDown,
    ChevronRight,
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
import { useEMTLRate, useVATRate } from '@/hooks/useActiveRules';

interface Report {
    id: string;
    type: 'tax_summary' | 'transactions' | 'vat_reconciliation' | 'income_tax';
    title: string;
    description: string;
    icon: typeof FileText;
    generated?: string;
}

const REPORT_TYPES: Report[] = [
    {
        id: 'tax_summary',
        type: 'tax_summary',
        title: 'Tax Summary Report',
        description: "Overview of income, expenses, EMTL, VAT, and compliance status",
        icon: PieChart,
    },
    {
        id: 'transactions',
        type: 'transactions',
        title: 'Transaction Export',
        description: 'Export all transactions with categories and tax implications',
        icon: Receipt,
    },
    {
        id: 'vat_reconciliation',
        type: 'vat_reconciliation',
        title: 'VAT Reconciliation',
        description: 'Input VAT vs Output VAT breakdown for filing',
        icon: TrendingUp,
    },
    {
        id: 'income_tax',
        type: 'income_tax',
        title: 'Income Tax Computation',
        description: 'Progressive tax calculation with deductions applied',
        icon: FileText,
    },
];

export default function Reports() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('this_month');
    const [transactions, setTransactions] = useState<any[]>([]);

    // Use dynamic rates from the rules engine
    const { emtlRate } = useEMTLRate();
    const { vatRate } = useVATRate();

    useEffect(() => {
        fetchTransactions();
    }, [selectedPeriod]);

    const fetchTransactions = async () => {
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

            // Calculate date range
            const now = new Date();
            let startDate: Date;
            if (selectedPeriod === 'this_month') {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            } else if (selectedPeriod === 'last_month') {
                startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            } else if (selectedPeriod === 'this_quarter') {
                startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            } else if (selectedPeriod === 'this_year') {
                startDate = new Date(now.getFullYear(), 0, 1);
            } else {
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            }

            // Date floor: Nigeria Tax Act 2025 effective Jan 1, 2026
            const dateFloor = new Date('2026-01-01');
            if (startDate < dateFloor) {
                startDate = dateFloor;
            }

            const { data } = await supabase
                .from('bank_transactions')
                .select('*')
                .eq('user_id', userData.id)
                .gte('transaction_date', startDate.toISOString().split('T')[0])
                .order('transaction_date', { ascending: false });

            setTransactions(data || []);
        } catch (error) {
            console.error('Error fetching transactions:', error);
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

    const getPeriodLabel = () => {
        const now = new Date();
        switch (selectedPeriod) {
            case 'this_month':
                return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            case 'last_month':
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                return lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            case 'this_quarter':
                const quarter = Math.floor(now.getMonth() / 3) + 1;
                return `Q${quarter} ${now.getFullYear()}`;
            case 'this_year':
                return now.getFullYear().toString();
            default:
                return 'Selected Period';
        }
    };

    const generateCSV = (reportType: string) => {
        let csvContent = '';
        const filename = `prism_${reportType}_${selectedPeriod}_${new Date().toISOString().split('T')[0]}.csv`;

        if (reportType === 'transactions') {
            // Transaction export
            csvContent = 'Date,Description,Credit,Debit,Category,Classification,Tax Impact\n';
            transactions.forEach(txn => {
                const row = [
                    txn.transaction_date,
                    `"${(txn.description || '').replace(/"/g, '""')}"`,
                    txn.credit || '',
                    txn.debit || '',
                    txn.category || '',
                    txn.classification || '',
                    txn.tax_implications ? 'Yes' : 'No',
                ].join(',');
                csvContent += row + '\n';
            });
        } else if (reportType === 'tax_summary') {
            // Tax summary
            let totalIncome = 0;
            let totalExpenses = 0;
            let emtlPaid = 0;
            let vatPaid = 0;

            transactions.forEach(txn => {
                if (txn.credit) totalIncome += txn.credit;
                if (txn.debit) totalExpenses += txn.debit;
                const flags = txn.nigerian_flags as Record<string, boolean> | null;
                if (flags?.isEmtl) emtlPaid += emtlRate.amount; // Dynamic EMTL
                const taxImpl = txn.tax_implications as Record<string, boolean> | null;
                if (taxImpl?.vatApplicable && txn.credit) vatPaid += txn.credit * vatRate; // Dynamic VAT
            });

            csvContent = 'Metric,Amount\n';
            csvContent += `Total Income,${totalIncome}\n`;
            csvContent += `Total Expenses,${totalExpenses}\n`;
            csvContent += `Net Position,${totalIncome - totalExpenses}\n`;
            csvContent += `EMTL Paid,${emtlPaid}\n`;
            csvContent += `VAT Collected,${vatPaid}\n`;
            csvContent += `Report Period,${getPeriodLabel()}\n`;
            csvContent += `Generated,${new Date().toISOString()}\n`;
        }

        // Download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();

        toast({
            title: 'CSV Downloaded',
            description: `${filename} has been saved`,
        });
    };

    const generatePDF = async (reportType: string) => {
        setGenerating(reportType);
        try {
            // Calculate metrics
            let totalIncome = 0;
            let totalExpenses = 0;
            let emtlPaid = 0;
            let vatPaid = 0;

            transactions.forEach(txn => {
                if (txn.credit) totalIncome += txn.credit;
                if (txn.debit) totalExpenses += txn.debit;
                const flags = txn.nigerian_flags as Record<string, boolean> | null;
                if (flags?.isEmtl) emtlPaid += emtlRate.amount; // Dynamic EMTL
                const taxImpl = txn.tax_implications as Record<string, boolean> | null;
                if (taxImpl?.vatApplicable && txn.credit) vatPaid += txn.credit * vatRate; // Dynamic VAT
            });

            const inputVAT = totalExpenses * vatRate; // Dynamic VAT rate

            let reportData: any = {};

            if (reportType === 'income_tax') {
                reportData = {
                    reportType: 'income_tax',
                    data: {
                        grossIncome: totalIncome,
                        period: 'annual',
                        deductions: {
                            pension: totalIncome * 0.08,
                            nhf: Math.min(totalIncome * 0.025, 50000),
                            nhis: 0,
                            rentRelief: 0,
                            lifeInsurance: 0,
                            housingLoanInterest: 0,
                            total: totalIncome * 0.08 + Math.min(totalIncome * 0.025, 50000),
                        },
                        chargeableIncome: totalIncome - (totalIncome * 0.08),
                        taxBreakdown: [
                            { band: 'First ₦800,000', taxableInBand: Math.min(800000, totalIncome), rate: 0, taxInBand: 0 },
                            { band: 'Next ₦2,200,000', taxableInBand: Math.max(0, Math.min(2200000, totalIncome - 800000)), rate: 0.15, taxInBand: Math.max(0, Math.min(2200000, totalIncome - 800000)) * 0.15 },
                        ],
                        totalTax: totalIncome > 3000000 ? (totalIncome - 3000000) * 0.25 + 330000 : 0,
                        effectiveRate: totalIncome > 0 ? ((totalIncome > 3000000 ? (totalIncome - 3000000) * 0.25 + 330000 : 0) / totalIncome) * 100 : 0,
                        netIncome: totalIncome - (totalIncome > 3000000 ? (totalIncome - 3000000) * 0.25 + 330000 : 0),
                        monthlyTax: (totalIncome > 3000000 ? (totalIncome - 3000000) * 0.25 + 330000 : 0) / 12,
                        monthlyNetIncome: (totalIncome - (totalIncome > 3000000 ? (totalIncome - 3000000) * 0.25 + 330000 : 0)) / 12,
                        isMinimumWageExempt: totalIncome <= 420000,
                        actReference: 'Nigeria Tax Act 2025, Section 58',
                    },
                };
            } else if (reportType === 'vat_reconciliation') {
                reportData = {
                    reportType: 'reconciliation',
                    data: {
                        period: getPeriodLabel(),
                        businessName: 'User Business',
                        tin: 'Not Provided',
                        outputVAT: vatPaid,
                        outputVATInvoicesCount: transactions.filter(t => t.credit).length,
                        inputVAT: inputVAT,
                        inputVATExpensesCount: transactions.filter(t => t.debit).length,
                        creditBroughtForward: 0,
                        netVAT: vatPaid - inputVAT,
                        creditCarriedForward: Math.max(0, inputVAT - vatPaid),
                        status: vatPaid >= inputVAT ? 'remit' : 'credit',
                    },
                    },
                };
            } else {
                // Default bank statement analysis
                reportData = {
                    reportType: 'bank_statement_analysis',
                    data: {
                        bank: 'Connected Bank',
                        accountName: 'User Account',
                        accountNumber: '****',
                        period: getPeriodLabel(),
                        generatedAt: new Date().toISOString(),
                        categories: {
                            sales: { count: transactions.filter(t => t.credit && t.classification === 'income').length, total: transactions.filter(t => t.credit && t.classification === 'income').reduce((s, t) => s + (t.credit || 0), 0) },
                            transfers_in: { count: transactions.filter(t => t.credit && t.classification === 'transfer').length, total: transactions.filter(t => t.credit && t.classification === 'transfer').reduce((s, t) => s + (t.credit || 0), 0) },
                            expenses: { count: transactions.filter(t => t.debit && t.classification === 'expense').length, total: transactions.filter(t => t.debit && t.classification === 'expense').reduce((s, t) => s + (t.debit || 0), 0) },
                            utilities: { count: 0, total: 0 },
                            salaries: { count: 0, total: 0 },
                            other: { count: transactions.filter(t => !t.classification).length, total: 0 },
                        },
                        transactions: transactions.slice(0, 50).map(t => ({
                            date: t.transaction_date,
                            description: t.description,
                            credit: t.credit,
                            debit: t.debit,
                            category: t.classification,
                        })),
                        totals: {
                            credits: totalIncome,
                            debits: totalExpenses,
                            outputVAT: vatPaid,
                            inputVAT: inputVAT,
                            netVAT: vatPaid - inputVAT,
                        },
                        reviewItemsCount: transactions.filter(t => t.classification === 'needs_review').length,
                    },
                };
            }

            const { data, error } = await supabase.functions.invoke('generate-pdf-report', {
                body: reportData,
            });

            if (error) {
                throw error;
            }

            // Open HTML report in new window for printing/saving
            const reportWindow = window.open('', '_blank');
            if (reportWindow) {
                reportWindow.document.write(data.html);
                reportWindow.document.close();
                toast({
                    title: 'Report Generated',
                    description: 'Use Ctrl+P (or Cmd+P) to print or save as PDF',
                });
            }

        } catch (error) {
            console.error('Error generating report:', error);
            toast({
                title: 'Error',
                description: 'Failed to generate report',
                variant: 'destructive',
            });
        } finally {
            setGenerating(null);
        }
    };

    const totalIncome = transactions.reduce((sum, t) => sum + (t.credit || 0), 0);
    const totalExpenses = transactions.reduce((sum, t) => sum + (t.debit || 0), 0);

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <FileText className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Reports</h1>
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Period Selector */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-gray-500" />
                        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="this_month">This Month</SelectItem>
                                <SelectItem value="last_month">Last Month</SelectItem>
                                <SelectItem value="this_quarter">This Quarter</SelectItem>
                                <SelectItem value="this_year">This Year</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Badge variant="secondary">
                        {transactions.length} transactions
                    </Badge>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">Total Income</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(totalIncome)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">Total Expenses</p>
                            <p className="text-2xl font-bold text-red-500">{formatCurrency(totalExpenses)}</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="p-4">
                            <p className="text-sm text-gray-500">Net Position</p>
                            <p className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {formatCurrency(totalIncome - totalExpenses)}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Report Types */}
                <h2 className="text-lg font-semibold mb-4">Generate Reports</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {REPORT_TYPES.map((report) => {
                        const Icon = report.icon;
                        return (
                            <Card key={report.id} className="hover:border-indigo-300 transition-colors">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-indigo-100">
                                                <Icon className="h-5 w-5 text-indigo-600" />
                                            </div>
                                            <div>
                                                <CardTitle className="text-base">{report.title}</CardTitle>
                                                <CardDescription className="text-sm mt-1">
                                                    {report.description}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => generateCSV(report.type)}
                                            disabled={transactions.length === 0}
                                        >
                                            <FileDown className="h-4 w-4 mr-1" />
                                            CSV
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => generatePDF(report.type)}
                                            disabled={generating === report.type || transactions.length === 0}
                                        >
                                            {generating === report.type ? (
                                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                            ) : (
                                                <Download className="h-4 w-4 mr-1" />
                                            )}
                                            PDF Report
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* No Data Message */}
                {transactions.length === 0 && !loading && (
                    <Card className="mt-6">
                        <CardContent className="p-8 text-center">
                            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-500 mb-4">No transactions found for {getPeriodLabel()}</p>
                            <Button variant="outline" onClick={() => navigate('/dashboard')}>
                                Connect a Bank Account
                                <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </main>
        </div>
    );
}
