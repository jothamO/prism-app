import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    HelpCircle,
    ChevronDown,
    ChevronUp,
    Shield,
    Building2,
    Calculator,
    Bot,
    MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface FAQItem {
    question: string;
    answer: string;
}

interface FAQCategory {
    id: string;
    title: string;
    icon: typeof HelpCircle;
    items: FAQItem[];
}

const FAQ_DATA: FAQCategory[] = [
    {
        id: 'general',
        title: 'About PRISM',
        icon: HelpCircle,
        items: [
            {
                question: 'What is PRISM?',
                answer: 'PRISM is an AI-powered tax automation platform for Nigerian individuals and businesses. It connects to your bank accounts, automatically categorizes transactions, calculates VAT/EMTL, and helps you stay compliant with the Nigeria Tax Act 2025.',
            },
            {
                question: 'Who is PRISM for?',
                answer: 'PRISM is designed for freelancers, small business owners, employed professionals, and anyone who wants to simplify their Nigerian tax obligations. Whether you need to track VAT, monitor EMTL charges, or prepare for tax filing, PRISM can help.',
            },
            {
                question: 'Is PRISM free?',
                answer: 'PRISM offers a free tier with basic features including bank connection, transaction categorization, and tax insights. Premium features like advanced reports and priority support are available on paid plans.',
            },
            {
                question: 'How do I get started?',
                answer: 'Sign up with your email, verify your identity, connect your bank account via Mono, and PRISM starts analyzing your transactions automatically. The whole process takes less than 5 minutes.',
            },
        ],
    },
    {
        id: 'security',
        title: 'Bank Sync & Security',
        icon: Shield,
        items: [
            {
                question: 'How often should I sync my account?',
                answer: 'PRISM syncs automatically every few hours. You can manually sync anytime from your dashboard. We recommend syncing at least once daily for the most accurate insights and tax calculations.',
            },
            {
                question: 'Is my banking data secure?',
                answer: 'Yes. PRISM uses Mono (a CBN-licensed provider) for bank connections. We never store your bank login credentials. All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption.',
            },
            {
                question: 'Can PRISM access my bank password?',
                answer: 'No. We use secure OAuth connections through Mono. Your bank credentials are never shared with us or stored on our servers. You authenticate directly with your bank.',
            },
            {
                question: 'What banks are supported?',
                answer: 'We support all major Nigerian banks that integrate with Mono, including GTBank, Access Bank, Zenith Bank, UBA, First Bank, Kuda, OPay, Wema Bank, Stanbic IBTC, and many more.',
            },
        ],
    },
    {
        id: 'tax',
        title: 'Tax & Compliance',
        icon: Building2,
        items: [
            {
                question: 'What transactions are tax-deductible?',
                answer: 'Business expenses like office supplies, professional services, utilities, rent, and transportation are typically deductible. PRISM automatically flags potential deductions based on your transaction categories and Nigerian tax law.',
            },
            {
                question: 'When do I need to file taxes?',
                answer: 'VAT returns are due by the 21st of each month. PAYE is due by the 10th. Annual income tax returns are due by March 31st. PRISM sends you reminders before each deadline so you never miss a filing.',
            },
            {
                question: 'Does PRISM file taxes for me?',
                answer: 'PRISM prepares all the data and generates reports you can use for filing. The actual submission to FIRS TaxPro Max is done by you or your tax advisor. We provide export functionality to make this process seamless.',
            },
            {
                question: 'What is EMTL?',
                answer: 'Electronic Money Transfer Levy (EMTL) is a ₦50 charge on bank transfers of ₦10,000 or more in Nigeria. PRISM automatically tracks your EMTL payments and includes them in your tax reports.',
            },
        ],
    },
    {
        id: 'ai',
        title: 'AI & Accuracy',
        icon: Bot,
        items: [
            {
                question: 'How accurate are the AI predictions?',
                answer: 'Our AI classification achieves 85-95% accuracy depending on transaction clarity. Transactions with low confidence scores are automatically flagged for your review. The system learns from your corrections over time.',
            },
            {
                question: 'Can I correct the AI\'s categorization?',
                answer: 'Yes! Simply click any transaction to see suggested categories and select the correct one. Your corrections help train the system for better future predictions on similar transactions.',
            },
            {
                question: 'What AI does PRISM use?',
                answer: 'PRISM uses Claude by Anthropic for intelligent tax assistance and transaction analysis. Our document OCR uses advanced computer vision. All AI processing follows Nigerian tax law guidelines from the Nigeria Tax Act 2025.',
            },
        ],
    },
    {
        id: 'support',
        title: 'Support',
        icon: MessageSquare,
        items: [
            {
                question: 'How do I get help?',
                answer: 'Use the AI chat widget in your dashboard to ask PRISM questions about your taxes. For account issues or technical support, email support@prism.ng or connect with us on WhatsApp.',
            },
            {
                question: 'Is there a mobile app?',
                answer: 'PRISM is a mobile-first web app that works great on any smartphone browser. No app download is required - just visit prism.ng on your phone and you\'re ready to go.',
            },
        ],
    },
];

export default function FAQ() {
    const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

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
                    {FAQ_DATA.map((category) => {
                        const Icon = category.icon;
                        return (
                            <Card key={category.id}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Icon className="h-5 w-5 text-indigo-600" />
                                        {category.title}
                                        <Badge variant="secondary" className="ml-2">
                                            {category.items.length} questions
                                        </Badge>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="divide-y">
                                        {category.items.map((item, index) => (
                                            <div key={index} className="py-4">
                                                <button
                                                    onClick={() => toggleItem(category.id, index)}
                                                    className="w-full flex items-start justify-between text-left"
                                                >
                                                    <span className="font-medium text-gray-900 pr-4">
                                                        {item.question}
                                                    </span>
                                                    {isExpanded(category.id, index) ? (
                                                        <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                                    ) : (
                                                        <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
                                                    )}
                                                </button>
                                                {isExpanded(category.id, index) && (
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
