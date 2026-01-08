import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    BookOpen,
    ChevronRight,
    GraduationCap,
    FileText,
    Calculator,
    Building2,
    Receipt,
    DollarSign,
    HelpCircle,
    Search,
    ExternalLink,
    Calendar,
    Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useEducationArticles, type EducationArticle } from '@/hooks/useEducationArticles';

const CATEGORY_ICONS: Record<string, typeof Receipt> = {
    basics: HelpCircle,
    vat: Receipt,
    paye: Calculator,
    business: Building2,
    deductions: FileText,
    compliance: GraduationCap,
};

const CATEGORIES = [
    { id: 'all', label: 'All', icon: BookOpen },
    { id: 'basics', label: 'Basics', icon: HelpCircle },
    { id: 'vat', label: 'VAT', icon: Receipt },
    { id: 'paye', label: 'PAYE', icon: Calculator },
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'deductions', label: 'Deductions', icon: FileText },
    { id: 'compliance', label: 'Compliance', icon: GraduationCap },
];

// Fallback articles
const FALLBACK_ARTICLES: EducationArticle[] = [
    {
        id: 'what-is-vat',
        slug: 'what-is-vat',
        title: 'Understanding VAT in Nigeria',
        description: 'Learn how Value Added Tax works under the Nigeria Tax Act 2025',
        category: 'vat',
        read_time: '5 min',
        content: '## What is VAT?\n\nValue Added Tax (VAT) is a consumption tax levied at 7.5% on goods and services in Nigeria.',
        is_published: true,
        version: 1,
        updated_at: '',
    },
    {
        id: 'what-is-emtl',
        slug: 'what-is-emtl',
        title: 'Electronic Money Transfer Levy (EMTL)',
        description: 'Understanding the ₦50 charge on bank transfers',
        category: 'basics',
        read_time: '3 min',
        content: '## What is EMTL?\n\nElectronic Money Transfer Levy is a ₦50 flat charge on electronic fund transfers of ₦10,000 or more.',
        is_published: true,
        version: 1,
        updated_at: '',
    },
];

export default function EducationCenter() {
    const navigate = useNavigate();
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedArticle, setSelectedArticle] = useState<EducationArticle | null>(null);

    const { data: dbArticles, isLoading } = useEducationArticles();

    const articles = useMemo(() => {
        if (dbArticles && dbArticles.length > 0) {
            return dbArticles;
        }
        return FALLBACK_ARTICLES;
    }, [dbArticles]);

    const filteredArticles = articles.filter(article => {
        const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
        const matchesSearch = searchQuery === '' ||
            article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (article.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        return matchesCategory && matchesSearch;
    });

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'vat': return 'bg-green-100 text-green-700';
            case 'paye': return 'bg-blue-100 text-blue-700';
            case 'business': return 'bg-purple-100 text-purple-700';
            case 'deductions': return 'bg-orange-100 text-orange-700';
            case 'compliance': return 'bg-indigo-100 text-indigo-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (selectedArticle) {
        return (
            <div className="min-h-screen bg-gray-50">
                <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex justify-between items-center h-16">
                            <Button variant="ghost" onClick={() => setSelectedArticle(null)}>
                                ← Back to Articles
                            </Button>
                        </div>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-2 mb-2">
                                <Badge variant="secondary" className={getCategoryColor(selectedArticle.category)}>
                                    {selectedArticle.category.toUpperCase()}
                                </Badge>
                                <span className="text-sm text-gray-500">{selectedArticle.read_time} read</span>
                            </div>
                            <CardTitle className="text-2xl">{selectedArticle.title}</CardTitle>
                            <CardDescription>{selectedArticle.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="prose prose-sm max-w-none">
                                {selectedArticle.content.split('\n').map((line, i) => {
                                    if (line.startsWith('## ')) {
                                        return <h2 key={i} className="text-xl font-bold mt-6 mb-3">{line.replace('## ', '')}</h2>;
                                    }
                                    if (line.startsWith('### ')) {
                                        return <h3 key={i} className="text-lg font-semibold mt-4 mb-2">{line.replace('### ', '')}</h3>;
                                    }
                                    if (line.startsWith('- ')) {
                                        return <li key={i} className="ml-4">{line.replace('- ', '')}</li>;
                                    }
                                    if (line.startsWith('| ')) {
                                        return null; // Skip table lines for simple rendering
                                    }
                                    if (line.trim() === '') {
                                        return <br key={i} />;
                                    }
                                    return <p key={i} className="mb-2">{line}</p>;
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </main>
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
                            <BookOpen className="h-8 w-8 text-indigo-600" />
                            <h1 className="text-xl font-bold text-gray-900">Education Center</h1>
                            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
                        </div>
                        <Button variant="outline" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Search */}
                <div className="relative mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                        placeholder="Search articles..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 max-w-md"
                    />
                </div>

                {/* Categories */}
                <div className="flex flex-wrap gap-2 mb-8">
                    {CATEGORIES.map(cat => (
                        <Button
                            key={cat.id}
                            variant={selectedCategory === cat.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory(cat.id)}
                        >
                            <cat.icon className="h-4 w-4 mr-1" />
                            {cat.label}
                        </Button>
                    ))}
                </div>

                {/* Articles Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredArticles.map(article => {
                        const Icon = CATEGORY_ICONS[article.category] || BookOpen;
                        return (
                            <Card
                                key={article.id}
                                className="hover:border-indigo-300 cursor-pointer transition-all hover:shadow-md"
                                onClick={() => setSelectedArticle(article)}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="p-2 rounded-lg bg-indigo-50">
                                            <Icon className="h-5 w-5 text-indigo-600" />
                                        </div>
                                        <Badge variant="secondary" className={getCategoryColor(article.category)}>
                                            {article.category}
                                        </Badge>
                                    </div>
                                    <CardTitle className="text-base mt-3">{article.title}</CardTitle>
                                    <CardDescription className="text-sm">{article.description}</CardDescription>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-gray-500">{article.read_time}</span>
                                        <div className="flex items-center text-indigo-600">
                                            Read <ChevronRight className="h-4 w-4 ml-1" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>

                {filteredArticles.length === 0 && (
                    <div className="text-center py-12">
                        <BookOpen className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500">No articles found</p>
                    </div>
                )}

                {/* External Resources */}
                <Card className="mt-8">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <ExternalLink className="h-5 w-5" />
                            Official Resources
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid sm:grid-cols-3 gap-4">
                            <button
                                onClick={() => navigate('/tax-calendar')}
                                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors text-left"
                            >
                                <Calendar className="h-5 w-5 text-indigo-600" />
                                <div>
                                    <p className="font-medium text-sm">Tax Calendar</p>
                                    <p className="text-xs text-gray-500">View upcoming deadlines</p>
                                </div>
                            </button>
                            <a
                                href="https://taxpromax.firs.gov.ng"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                            >
                                <Building2 className="h-5 w-5 text-gray-600" />
                                <div>
                                    <p className="font-medium text-sm">FIRS TaxPro Max</p>
                                    <p className="text-xs text-gray-500">Official tax filing portal</p>
                                </div>
                            </a>
                            <a
                                href="https://www.firs.gov.ng"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                            >
                                <FileText className="h-5 w-5 text-gray-600" />
                                <div>
                                    <p className="font-medium text-sm">FIRS Website</p>
                                    <p className="text-xs text-gray-500">Official resources</p>
                                </div>
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
