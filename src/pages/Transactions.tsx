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
    Sparkles,
    Split,
    MessageSquare,
    Download,
    CheckSquare,
    Square,
    Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
    // Income categories
    { value: 'income', label: 'Income', color: 'bg-green-100 text-green-700' },
    { value: 'salary', label: 'Salary', color: 'bg-green-100 text-green-700' },

    // General expense categories
    { value: 'expense', label: 'Expense', color: 'bg-red-100 text-red-700' },
    { value: 'business', label: 'Business', color: 'bg-indigo-100 text-indigo-700' },
    { value: 'personal', label: 'Personal', color: 'bg-pink-100 text-pink-700' },

    // NTA 2025 deductible categories
    { value: 'medical', label: 'Medical', color: 'bg-rose-100 text-rose-700' },
    { value: 'insurance', label: 'Insurance', color: 'bg-teal-100 text-teal-700' },
    { value: 'education', label: 'Education', color: 'bg-lime-100 text-lime-700' },
    { value: 'donations', label: 'Donations', color: 'bg-yellow-100 text-yellow-700' },

    // Service/subscription categories
    { value: 'professional', label: 'Professional', color: 'bg-violet-100 text-violet-700' },
    { value: 'subscriptions', label: 'Subscriptions', color: 'bg-fuchsia-100 text-fuchsia-700' },

    // Other standard categories
    { value: 'transfer', label: 'Transfer', color: 'bg-blue-100 text-blue-700' },
    { value: 'utilities', label: 'Utilities', color: 'bg-purple-100 text-purple-700' },
    { value: 'rent', label: 'Rent', color: 'bg-orange-100 text-orange-700' },
    { value: 'food', label: 'Food & Dining', color: 'bg-amber-100 text-amber-700' },
    { value: 'transport', label: 'Transport', color: 'bg-cyan-100 text-cyan-700' },
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
    // New fields for enhanced features
    parent_transaction_id?: string | null;
    is_split?: boolean;
    split_note?: string | null;
    user_note?: string | null;
    vat_gross?: number | null;
    vat_net?: number | null;
    vat_amount?: number | null;
    is_recurring?: boolean;
    recurring_pattern?: string | null;
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
    const [userNote, setUserNote] = useState('');
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const [splitPreview, setSplitPreview] = useState<{ category: string; amount: number; note: string }[] | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkCategory, setBulkCategory] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState<string>('');
    const [dateTo, setDateTo] = useState<string>('');
    const pageSize = 20;

    useEffect(() => {
        fetchTransactions();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [transactions, searchQuery, filterType, dateFrom, dateTo]);

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
                .eq('auth_user_id', user.id)
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

        // Date range filter
        if (dateFrom) {
            result = result.filter(t => t.transaction_date >= dateFrom);
        }
        if (dateTo) {
            result = result.filter(t => t.transaction_date <= dateTo);
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

    // Smart reclassification: Parse user note to suggest splits
    const analyzeUserNote = async () => {
        if (!selectedTxn || !userNote.trim()) return;

        setAiAnalyzing(true);
        try {
            const originalAmount = selectedTxn.debit || selectedTxn.credit || 0;
            const splits: { category: string; amount: number; note: string }[] = [];

            // Parse amount mentioned in user note
            const amountMatch = userNote.match(/(\d{1,3}(?:,?\d{3})*(?:\.\d{2})?)/);
            const mentionedAmount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;

            // Detect VAT mention (7.5% or "vat" or "VAT")
            const vatMention = userNote.toLowerCase().includes('vat') || userNote.includes('7.5%');

            // Detect category keywords
            const categoryKeywords: Record<string, string[]> = {
                medical: ['hospital', 'clinic', 'doctor', 'pharmacy', 'medicine', 'health', 'medical'],
                insurance: ['insurance', 'premium', 'policy'],
                education: ['school', 'tuition', 'training', 'course', 'education'],
                donations: ['donation', 'charity', 'tithe', 'offering'],
                professional: ['lawyer', 'accountant', 'consultant', 'professional'],
                utilities: ['nepa', 'phcn', 'electricity', 'water', 'gas'],
                rent: ['rent', 'landlord', 'house'],
                transport: ['uber', 'bolt', 'fuel', 'petrol', 'transport'],
                food: ['food', 'restaurant', 'eat', 'lunch', 'dinner'],
            };

            let detectedCategory = 'expense';
            for (const [cat, keywords] of Object.entries(categoryKeywords)) {
                if (keywords.some(kw => userNote.toLowerCase().includes(kw))) {
                    detectedCategory = cat;
                    break;
                }
            }

            if (mentionedAmount && vatMention) {
                // User mentioned amount with VAT - calculate split
                const vatRate = 0.075;
                const netAmount = mentionedAmount / (1 + vatRate);
                const vatAmount = mentionedAmount - netAmount;

                splits.push({
                    category: detectedCategory,
                    amount: Math.round(netAmount * 100) / 100,
                    note: `Net amount (excl. VAT)`
                });
                splits.push({
                    category: 'input_vat',
                    amount: Math.round(vatAmount * 100) / 100,
                    note: `VAT @ 7.5% (claimable input VAT)`
                });

                // If there's remaining amount
                const remainder = originalAmount - mentionedAmount;
                if (remainder > 0) {
                    splits.push({
                        category: 'personal',
                        amount: Math.round(remainder * 100) / 100,
                        note: 'Remainder (unspecified)'
                    });
                }
            } else if (mentionedAmount) {
                // User mentioned amount without VAT
                splits.push({
                    category: detectedCategory,
                    amount: mentionedAmount,
                    note: userNote
                });

                const remainder = originalAmount - mentionedAmount;
                if (remainder > 0) {
                    splits.push({
                        category: 'personal',
                        amount: Math.round(remainder * 100) / 100,
                        note: 'Remainder'
                    });
                }
            } else {
                // No amount mentioned - just suggest category
                splits.push({
                    category: detectedCategory,
                    amount: originalAmount,
                    note: userNote
                });
            }

            setSplitPreview(splits);

            toast({
                title: 'Analysis Complete',
                description: `Suggested ${splits.length} split${splits.length > 1 ? 's' : ''} for this transaction`,
            });
        } catch (error) {
            console.error('Error analyzing note:', error);
            toast({
                title: 'Analysis Failed',
                description: 'Could not parse your description',
                variant: 'destructive',
            });
        } finally {
            setAiAnalyzing(false);
        }
    };

    // Apply the split preview to create child transactions
    const applySplit = async () => {
        if (!selectedTxn || !splitPreview || splitPreview.length === 0) return;

        setSaving(true);
        try {
            // Mark original as parent
            const { error: updateError } = await supabase
                .from('bank_transactions')
                .update({
                    split_note: userNote,
                    user_note: userNote,
                })
                .eq('id', selectedTxn.id);

            if (updateError) throw updateError;

            // Create child transactions for each split
            for (const split of splitPreview) {
                const { error: insertError } = await supabase
                    .from('bank_transactions')
                    .insert({
                        user_id: selectedTxn.id.split('-')[0], // Will need to get actual user_id
                        description: `[Split] ${selectedTxn.description} - ${split.note}`,
                        debit: selectedTxn.debit ? split.amount : null,
                        credit: selectedTxn.credit ? split.amount : null,
                        transaction_date: selectedTxn.transaction_date,
                        classification: split.category,
                        category: split.category,
                        parent_transaction_id: selectedTxn.id,
                        is_split: true,
                        split_note: split.note,
                        needs_review: false,
                    });

                if (insertError) throw insertError;
            }

            toast({
                title: 'Transaction Split',
                description: `Created ${splitPreview.length} categorized transactions`,
            });

            // Reset and close
            setSplitPreview(null);
            setUserNote('');
            setSelectedTxn(null);
            fetchTransactions(); // Reload to show new splits
        } catch (error) {
            console.error('Error splitting transaction:', error);
            toast({
                title: 'Split Failed',
                description: 'Could not create split transactions',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    // Bulk selection toggles
    const toggleSelection = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const selectAll = () => {
        setSelectedIds(new Set(paginatedTransactions.map(t => t.id)));
    };

    const clearSelection = () => {
        setSelectedIds(new Set());
    };

    // Bulk categorize selected transactions
    const bulkCategorize = async (category: string) => {
        if (selectedIds.size === 0) return;

        setSaving(true);
        try {
            const ids = Array.from(selectedIds);

            const { error } = await supabase
                .from('bank_transactions')
                .update({
                    classification: category,
                    category: category,
                    needs_review: false,
                })
                .in('id', ids);

            if (error) throw error;

            // Update local state
            setTransactions(prev =>
                prev.map(t =>
                    selectedIds.has(t.id)
                        ? { ...t, classification: category, category: category, needs_review: false }
                        : t
                )
            );

            toast({
                title: 'Bulk Update Complete',
                description: `Updated ${ids.length} transaction${ids.length > 1 ? 's' : ''} to "${category}"`,
            });

            clearSelection();
            setBulkCategory(null);
        } catch (error) {
            console.error('Error bulk categorizing:', error);
            toast({
                title: 'Bulk Update Failed',
                description: 'Could not update transactions',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    // Export selected or filtered transactions to CSV
    const exportToCsv = () => {
        const dataToExport = selectedIds.size > 0
            ? filteredTransactions.filter(t => selectedIds.has(t.id))
            : filteredTransactions;

        if (dataToExport.length === 0) {
            toast({
                title: 'Nothing to Export',
                description: 'No transactions match your current selection or filters',
                variant: 'destructive',
            });
            return;
        }

        const headers = ['Date', 'Description', 'Credit', 'Debit', 'Category', 'Needs Review'];
        const rows = dataToExport.map(t => [
            t.transaction_date,
            `"${t.description.replace(/"/g, '""')}"`,
            t.credit || '',
            t.debit || '',
            t.classification || '',
            t.needs_review ? 'Yes' : 'No'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `prism-transactions-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();

        toast({
            title: 'Export Complete',
            description: `Exported ${dataToExport.length} transaction${dataToExport.length > 1 ? 's' : ''} to CSV`,
        });
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
                    <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="w-36"
                            placeholder="From"
                        />
                        <span className="text-gray-400">–</span>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="w-36"
                            placeholder="To"
                        />
                        {(dateFrom || dateTo) && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setDateFrom(''); setDateTo(''); }}
                                className="p-1"
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        )}
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
                    <Button variant="outline" onClick={exportToCsv}>
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                </div>

                {/* Bulk Action Bar */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg mb-4">
                        <div className="flex items-center gap-2">
                            <CheckSquare className="h-4 w-4 text-indigo-600" />
                            <span className="text-sm font-medium text-indigo-900">
                                {selectedIds.size} selected
                            </span>
                        </div>
                        <div className="flex-1" />
                        <Select value={bulkCategory || ''} onValueChange={(v: string) => setBulkCategory(v)}>
                            <SelectTrigger className="w-40 bg-white">
                                <SelectValue placeholder="Bulk categorize..." />
                            </SelectTrigger>
                            <SelectContent>
                                {CATEGORIES.map(cat => (
                                    <SelectItem key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button
                            onClick={() => bulkCategory && bulkCategorize(bulkCategory)}
                            disabled={!bulkCategory || saving}
                            size="sm"
                        >
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={clearSelection}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                )}

                {/* Transaction List */}
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={selectedIds.size === paginatedTransactions.length ? clearSelection : selectAll}
                                    className="p-1"
                                >
                                    {selectedIds.size === paginatedTransactions.length && paginatedTransactions.length > 0 ? (
                                        <CheckSquare className="h-5 w-5 text-indigo-600" />
                                    ) : (
                                        <Square className="h-5 w-5 text-gray-400" />
                                    )}
                                </Button>
                                <div>
                                    <CardTitle>Transactions</CardTitle>
                                    <CardDescription>
                                        {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
                                    </CardDescription>
                                </div>
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
                                        className={`flex items-center justify-between p-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedIds.has(txn.id) ? 'bg-indigo-50' : ''}`}
                                        onClick={() => setSelectedTxn(txn)}
                                    >
                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelection(txn.id);
                                                }}
                                                className="p-1 hover:bg-gray-200 rounded"
                                            >
                                                {selectedIds.has(txn.id) ? (
                                                    <CheckSquare className="h-5 w-5 text-indigo-600" />
                                                ) : (
                                                    <Square className="h-5 w-5 text-gray-400" />
                                                )}
                                            </button>
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
                            <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                {CATEGORIES.map((cat) => (
                                    <Button
                                        key={cat.value}
                                        variant={selectedTxn.classification === cat.value ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => updateCategory(selectedTxn.id, cat.value)}
                                        disabled={saving}
                                        className="h-auto py-2 text-xs"
                                    >
                                        {saving && selectedTxn.classification === cat.value ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            cat.label
                                        )}
                                    </Button>
                                ))}
                            </div>

                            {/* Smart Reclassification Section */}
                            <div className="border-t pt-4 mt-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <MessageSquare className="h-4 w-4 text-indigo-600" />
                                    <span className="text-sm font-medium">Smart Reclassify</span>
                                </div>
                                <Textarea
                                    placeholder="e.g., 'I spent 48500 naira from this on hospital bill, they charged 7.5% VAT'"
                                    value={userNote}
                                    onChange={(e) => setUserNote(e.target.value)}
                                    className="text-sm"
                                    rows={2}
                                />
                                <Button
                                    onClick={analyzeUserNote}
                                    disabled={!userNote.trim() || aiAnalyzing}
                                    className="w-full mt-2"
                                    variant="secondary"
                                >
                                    {aiAnalyzing ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    ) : (
                                        <Sparkles className="h-4 w-4 mr-2" />
                                    )}
                                    Let PRISM Classify
                                </Button>
                            </div>

                            {/* Split Preview */}
                            {splitPreview && splitPreview.length > 0 && (
                                <div className="border-t pt-4 mt-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Split className="h-4 w-4 text-emerald-600" />
                                        <span className="text-sm font-medium">Suggested Splits</span>
                                    </div>
                                    <div className="space-y-2">
                                        {splitPreview.map((split, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="secondary" className={
                                                        CATEGORIES.find(c => c.value === split.category)?.color || 'bg-gray-100'
                                                    }>
                                                        {CATEGORIES.find(c => c.value === split.category)?.label || split.category}
                                                    </Badge>
                                                    <span className="text-xs text-gray-500">{split.note}</span>
                                                </div>
                                                <span className="font-medium text-sm">
                                                    {formatCurrency(split.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <Button
                                        onClick={applySplit}
                                        disabled={saving}
                                        className="w-full mt-3 bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        {saving ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                        )}
                                        Apply Split ({splitPreview.length} transactions)
                                    </Button>
                                </div>
                            )}

                            {/* Current Status */}
                            {selectedTxn.classification && !splitPreview && (
                                <div className="flex items-center gap-2 text-sm text-green-600 pt-2">
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
