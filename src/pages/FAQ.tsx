import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Shield,
    Building2,
    Bot,
    MessageSquare,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useFAQItems, groupFAQByCategory, type FAQItem } from '@/hooks/useFAQItems';

const CATEGORY_CONFIG: Record<string, { title: string; icon: typeof HelpCircle }> = {
    general: { title: 'About PRISM', icon: HelpCircle },
    security: { title: 'Bank Sync & Security', icon: Shield },
    tax: { title: 'Tax & Compliance', icon: Building2 },
    ai: { title: 'AI & Accuracy', icon: Bot },
    support: { title: 'Support', icon: MessageSquare },
};

// Fallback FAQ data
const FALLBACK_FAQ: Record<string, FAQItem[]> = {
    general: [
        { id: '1', category: 'general', question: 'What is PRISM?', answer: 'PRISM is an AI-powered tax automation platform for Nigerian individuals and businesses.', display_order: 1, is_published: true, updated_at: '' },
        { id: '2', category: 'general', question: 'Who is PRISM for?', answer: 'PRISM is designed for freelancers, small business owners, employed professionals, and anyone who wants to simplify their Nigerian tax obligations.', display_order: 2, is_published: true, updated_at: '' },
    ],
    security: [
        { id: '3', category: 'security', question: 'Is my banking data secure?', answer: 'Yes. PRISM uses Mono (a CBN-licensed provider) for bank connections. We never store your bank login credentials.', display_order: 1, is_published: true, updated_at: '' },
    ],
    tax: [
        { id: '4', category: 'tax', question: 'When do I need to file taxes?', answer: 'VAT returns are due by the 21st of each month. PAYE is due by the 10th. Annual income tax returns are due by March 31st.', display_order: 1, is_published: true, updated_at: '' },
    ],
};

export default function FAQ() {
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
    const { data: faqItems, isLoading } = useFAQItems();

    const groupedFAQ = useMemo(() => {
        if (faqItems && faqItems.length > 0) {
            return groupFAQByCategory(faqItems);
        }
        return FALLBACK_FAQ;
    }, [faqItems]);

    const toggleItem = (categoryId: string, index: number) => {
        const key = `${categoryId}-${index}`;
        setExpandedItems(prev => ({
            ...prev,
            [key]: !prev[key],
        }));
    };

    const isExpanded = (categoryId: string, index: number) => {
        return expandedItems[`${categoryId}-${index}`] || false;
    };

    const categories = Object.keys(groupedFAQ).sort((a, b) => {
        const order = ['general', 'security', 'tax', 'ai', 'support'];
        return order.indexOf(a) - order.indexOf(b);
    });

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center gap-3">
                            <Link to="/" className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                    <span className="text-white font-bold">P</span>
                                </div>
                                <span className="text-xl font-bold">PRISM</span>
                            </Link>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                        </div>
                        <Link to="/dashboard">
                            <Button variant="outline">Dashboard</Button>
                        </Link>
                    </div>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                {/* Page Title */}
                <div className="text-center mb-12">
                    <HelpCircle className="h-12 w-12 mx-auto text-indigo-600 mb-4" />
                    <h1 className="text-3xl font-bold text-gray-900 mb-3">
                        Frequently Asked Questions
                    </h1>
                    <p className="text-gray-600 max-w-2xl mx-auto">
                        Find answers to common questions about PRISM, bank connections, tax compliance, and more.
                    </p>
                </div>

                {/* FAQ Categories */}
                <div className="space-y-8">
                    {categories.map((categoryId) => {
                        const config = CATEGORY_CONFIG[categoryId] || { title: categoryId, icon: HelpCircle };
                        const Icon = config.icon;
                        const items = groupedFAQ[categoryId] || [];

                        return (
                            <Card key={categoryId}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Icon className="h-5 w-5 text-indigo-600" />
                                        {config.title}
                                        <Badge variant="secondary" className="ml-2">
                                            {items.length} questions
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="divide-y">
                                        {items.map((item, index) => (
                                            <div key={item.id} className="py-4">
                                                <button
                                                    onClick={() => toggleItem(categoryId, index)}
                                                    className="w-full flex items-start justify-between text-left"
                                                >
                                                    <span className="font-medium text-gray-900 pr-4">
                                                        {item.question}
                                                    </span>
                                                    {isExpanded(categoryId, index) ? (
                                                        <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                                    ) : (
                                                        <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                                    )}
                                                </button>
                                                {isExpanded(categoryId, index) && (
                                                    <p className="mt-3 text-gray-600 text-sm leading-relaxed">
                                                        {item.answer}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {/* Contact CTA */}
                <Card className="mt-12 bg-indigo-50 border-indigo-200">
                    <CardContent className="p-6 text-center">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Still have questions?
                        </h3>
                        <p className="text-gray-600 mb-4">
                            Our support team is here to help you with any questions.
                        </p>
                        <Link to="/contact">
                            <Button>Contact Support</Button>
                        </Link>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
