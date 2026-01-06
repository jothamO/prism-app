import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Receipt,
    Search,
    Filter,
    CheckCircle2,
    AlertTriangle,
    ArrowUpRight,
    ArrowDownRight,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Tag,
    X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = [
    { value: 'income', label: 'Income', color: 'bg-green-100 text-green-700' },
    { value: 'salary', label: 'Salary', color: 'bg-green-100 text-green-700' },
    { value: 'expense', label: 'Expense', color: 'bg-red-100 text-red-700' },
    { value: 'transfer', label: 'Transfer', color: 'bg-blue-100 text-blue-700' },
    { value: 'utilities', label: 'Utilities', color: 'bg-purple-100 text-purple-700' },
    { value: 'rent', label: 'Rent', color: 'bg-orange-100 text-orange-700' },
    { value: 'food', label: 'Food & Dining', color: 'bg-amber-100 text-amber-700' },
    { value: 'transport', label: 'Transport', color: 'bg-cyan-100 text-cyan-700' },
    { value: 'business', label: 'Business', color: 'bg-indigo-100 text-indigo-700' },
    { value: 'personal', label: 'Personal', color: 'bg-pink-100 text-pink-700' },
    { value: 'tax', label: 'Tax Payment', color: 'bg-gray-100 text-gray-700' },
    { value: 'bank_charges', label: 'Bank Charges', color: 'bg-slate-100 text-slate-700' },
];

interface Transaction {
    id: string;
    description: string;
    credit: number | null;
    debit: number | null;
    transaction_date: string;
    classification: string | null;
    category: string | null;
    nigerian_flags: Record<string, boolean> | null;
    tax_implications: Record<string, boolean> | null;
    confidence_score: number | null;
    needs_review: boolean | null;
}

export default function Transactions() {
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'review'>('all');
    const [page, setPage] = useState(1);
    const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
    const [saving, setSaving] = useState(false);
    const pageSize = 20;

    useEffect(() => {
        fetchTransactions();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [transactions, searchQuery, filterType]);

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

            const { data, error } = await supabase
                .from('bank_transactions')
                .select('*')
                .eq('user_id', userData.id)
                .gte('transaction_date', '2026-01-01') // Nigeria Tax Act 2025 effective date
                .order('transaction_date', { ascending: false })
                .limit(500);

            if (error) throw error;
            setTransactions((data || []) as Transaction[]);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            toast({
                title: 'Error',
                description: 'Failed to load transactions',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let result = [...transactions];

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.description?.toLowerCase().includes(query) ||
                t.classification?.toLowerCase().includes(query) ||
                t.category?.toLowerCase().includes(query)
            );
        }

        // Type filter
        if (filterType === 'income') {
            result = result.filter(t => t.credit && t.credit > 0);
        } else if (filterType === 'expense') {
            result = result.filter(t => t.debit && t.debit > 0);
        } else if (filterType === 'review') {
            result = result.filter(t => t.needs_review || !t.classification || t.classification === 'needs_review');
        }

        setFilteredTransactions(result);
        setPage(1);
    };

    const formatCurrency = (amount: number | null) => {
        if (!amount) return '-';
        return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-NG', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getCategoryBadge = (category: string | null) => {
        const cat = CATEGORIES.find(c => c.value === category);
        if (!cat) return null;
        return (
            <Badge variant="secondary" className={cat.color}>
                {cat.label}
            </Badge>
        );
    };

    const updateCategory = async (txnId: string, category: string) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('bank_transactions')
                .update({
                    classification: category,
                    category: category,
                    needs_review: false,
                })
                .eq('id', txnId);

            if (error) throw error;

            // Update local state
            setTransactions(prev =>
                prev.map(t =>
                    t.id === txnId
                        ? { ...t, classification: category, category: category, needs_review: false }
                        : t
                )
            );

            toast({
                title: 'Category Updated',
                description: 'Transaction has been categorized',
            });

            setSelectedTxn(null);
        } catch (error) {
            console.error('Error updating category:', error);
            toast({
                title: 'Error',
                description: 'Failed to update category',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const paginatedTransactions = filteredTransactions.slice(
        (page - 1) * pageSize,
        page * pageSize
    );

    const totalPages = Math.ceil(filteredTransactions.length / pageSize);
    const needsReviewCount = transactions.filter(t => t.needs_review || !t.classification).length;

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
                            <Receipt className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
                            {needsReviewCount > 0 && (
                                <Badge variant="destructive">
                                    {needsReviewCount} need review
                                </Badge>
                            )}
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3 mb-6">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search transactions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <Select value={filterType} onValueChange={(v: 'all' | 'income' | 'expense' | 'review') => setFilterType(v)}>
                        <SelectTrigger className="w-40">
                            <Filter className="h-4 w-4 mr-2" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="income">Income Only</SelectItem>
                            <SelectItem value="expense">Expenses Only</SelectItem>
                            <SelectItem value="review">Needs Review</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Transaction List */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>Transactions</CardTitle>
                                <CardDescription>
                                    {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {paginatedTransactions.length === 0 ? (
                            <div className="p-8 text-center text-gray-500">
                                <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                                <p>No transactions found</p>
                            </div>
                        ) : (
                            <div className="divide-y">
                                {paginatedTransactions.map((txn) => (
                                    <div
                                        key={txn.id}
                                        className="flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                                        onClick={() => setSelectedTxn(txn)}
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <div className={`p-2 rounded-full ${txn.credit ? 'bg-green-100' : 'bg-red-100'}`}>
                                                {txn.credit ? (
                                                    <ArrowUpRight className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <ArrowDownRight className="h-4 w-4 text-red-600" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 truncate">
                                                    {txn.description}
                                                </p>
                                                <p className="text-sm text-gray-500">{formatDate(txn.transaction_date)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className={`font-semibold ${txn.credit ? 'text-green-600' : 'text-red-600'}`}>
                                                    {txn.credit ? '+' : ''}{formatCurrency(txn.credit || txn.debit)}
                                                </p>
                                                <div className="mt-1">
                                                    {txn.needs_review || !txn.classification ? (
                                                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                                            Review
                                                        </Badge>
                                                    ) : (
                                                        getCategoryBadge(txn.classification)
                                                    )}
                                                </div>
                                            </div>
                                            <ChevronRight className="h-4 w-4 text-gray-400" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <span className="text-sm text-gray-500">
                            Page {page} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                )}
            </main>

            {/* Category Dialog */}
            <Dialog open={!!selectedTxn} onOpenChange={() => setSelectedTxn(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Categorize Transaction</DialogTitle>
                        <DialogDescription>
                            Select a category for this transaction
                        </DialogDescription>
                    </DialogHeader>
                    {selectedTxn && (
                        <div className="space-y-4">
                            {/* Transaction Details */}
                            <div className="p-3 bg-gray-50 rounded-lg">
                                <p className="font-medium">{selectedTxn.description}</p>
                                <p className="text-sm text-gray-500 mt-1">
                                    {formatDate(selectedTxn.transaction_date)}
                                </p>
                                <p className={`text-lg font-bold mt-2 ${selectedTxn.credit ? 'text-green-600' : 'text-red-600'}`}>
                                    {selectedTxn.credit ? '+' : ''}{formatCurrency(selectedTxn.credit || selectedTxn.debit)}
                                </p>
                            </div>

                            {/* Nigerian Flags */}
                            {selectedTxn.nigerian_flags && Object.entries(selectedTxn.nigerian_flags).some(([, v]) => v) && (
                                <div className="flex flex-wrap gap-2">
                                    {selectedTxn.nigerian_flags.isEmtl && (
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">EMTL</Badge>
                                    )}
                                    {selectedTxn.nigerian_flags.isPOS && (
                                        <Badge variant="secondary" className="bg-purple-100 text-purple-700">POS</Badge>
                                    )}
                                    {selectedTxn.nigerian_flags.isUSSD && (
                                        <Badge variant="secondary" className="bg-orange-100 text-orange-700">USSD</Badge>
                                    )}
                                    {selectedTxn.nigerian_flags.isBankCharge && (
                                        <Badge variant="secondary" className="bg-gray-100 text-gray-700">Bank Charge</Badge>
                                    )}
                                </div>
                            )}

                            {/* AI Suggestion */}
                            {selectedTxn.classification && selectedTxn.confidence_score && (
                                <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                                    <p className="text-sm text-indigo-700">
                                        <Tag className="h-4 w-4 inline mr-1" />
                                        AI Suggests: <strong>{selectedTxn.classification}</strong>
                                        {' '}({Math.round((selectedTxn.confidence_score || 0) * 100)}% confident)
                                    </p>
                                </div>
                            )}

                            {/* Category Grid */}
                            <div className="grid grid-cols-3 gap-2">
                                {CATEGORIES.map((cat) => (
                                    <Button
                                        key={cat.value}
                                        variant={selectedTxn.classification === cat.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => updateCategory(selectedTxn.id, cat.value)}
                                        disabled={saving}
                                        className="h-auto py-2"
                                    >
                                        {saving && selectedTxn.classification === cat.value ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            cat.label
                                        )}
                                    </Button>
                                ))}
                            </div>

                            {/* Current Status */}
                            {selectedTxn.classification && (
                                <div className="flex items-center gap-2 text-sm text-green-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                    Currently categorized as: {getCategoryBadge(selectedTxn.classification)}
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
