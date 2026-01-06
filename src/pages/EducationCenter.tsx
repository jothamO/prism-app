import { useState } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface Article {
    id: string;
    title: string;
    description: string;
    category: 'basics' | 'vat' | 'paye' | 'business' | 'deductions' | 'compliance';
    readTime: string;
    icon: typeof Receipt;
    content: string;
}

const ARTICLES: Article[] = [
    {
        id: 'what-is-vat',
        title: 'Understanding VAT in Nigeria',
        description: 'Learn how Value Added Tax works under the Nigeria Tax Act 2025',
        category: 'vat',
        readTime: '5 min',
        icon: Receipt,
        content: `
## What is VAT?

Value Added Tax (VAT) is a consumption tax levied at 7.5% on goods and services in Nigeria. 

### Key Points:
- Standard rate: **7.5%**
- Administered by FIRS (Federal Inland Revenue Service)
- Monthly returns due by the **21st** of each month

### Exempt Items:
- Basic food items (unprocessed grains, tubers, fruits)
- Medical and pharmaceutical products
- Educational materials

### Zero-Rated Items:
- Exports of goods
- Goods and services purchased by diplomats

### How to Calculate:
VAT = Sale Amount × 7.5%

For example, if you sell goods for ₦100,000:
VAT = ₦100,000 × 7.5% = **₦7,500**
    `,
    },
    {
        id: 'what-is-emtl',
        title: 'Electronic Money Transfer Levy (EMTL)',
        description: 'Understanding the ₦50 charge on bank transfers',
        category: 'basics',
        readTime: '3 min',
        icon: DollarSign,
        content: `
## What is EMTL?

Electronic Money Transfer Levy is a ₦50 flat charge on electronic fund transfers of ₦10,000 or more.

### Key Facts:
- Amount: **₦50 flat fee**
- Applies to transfers: **₦10,000 and above**
- Collected by: Banks and financial institutions
- Goes to: State governments

### Tips to Minimize EMTL:
1. Consolidate smaller transfers into one larger transfer
2. Use cash for small transactions where practical
3. Plan your transfers to reduce frequency

### Exceptions:
- Transfers below ₦10,000
- Intra-bank transfers (same account)
- Salary payments (employer to employee)
    `,
    },
    {
        id: 'paye-explained',
        title: 'PAYE Tax System Explained',
        description: 'How Pay As You Earn tax works for employees',
        category: 'paye',
        readTime: '6 min',
        icon: Calculator,
        content: `
## What is PAYE?

Pay As You Earn (PAYE) is a method of paying income tax where your employer deducts tax from your salary before paying you.

### Tax Bands (Nigeria Tax Act 2025):
| Taxable Income | Rate |
|----------------|------|
| First ₦800,000 | 0% |
| Next ₦2,200,000 (₦800,001 - ₦3,000,000) | 15% |
| Next ₦2,600,000 (₦3,000,001 - ₦5,600,000) | 19% |
| Next ₦5,600,000 (₦5,600,001 - ₦11,200,000) | 21% |
| Above ₦11,200,000 | 24% |

### Allowable Deductions:
- Pension: 8% of gross income
- National Housing Fund (NHF): 2.5%
- Life Insurance Premium
- National Health Insurance (NHIS)

### Example:
For ₦5,000,000 annual salary:
- First ₦800,000 @ 0% = ₦0
- Next ₦2,200,000 @ 15% = ₦330,000
- Next ₦2,000,000 @ 19% = ₦380,000
- **Total Tax: ₦710,000**
    `,
    },
    {
        id: 'business-taxes',
        title: 'Taxes for Small Businesses',
        description: 'A guide to business taxation in Nigeria',
        category: 'business',
        readTime: '7 min',
        icon: Building2,
        content: `
## Business Taxes in Nigeria

### Types of Business Taxes:

1. **Company Income Tax (CIT)**
   - Standard rate: 30%
   - Medium companies: 20%
   - Small companies (turnover < ₦25M): 0%

2. **VAT (if registered)**
   - Rate: 7.5%
   - Registration threshold: ₦25M turnover

3. **Withholding Tax (WHT)**
   - Construction: 5%
   - Professional services: 10%
   - Rent: 10%

### Important Deadlines:
- VAT Returns: 21st of each month
- Annual Returns: March 31st
- CIT Payment: Based on accounting period

### Record Keeping:
Keep all invoices, receipts, and bank statements for at least 6 years.
    `,
    },
    {
        id: 'tax-deductions',
        title: 'Maximizing Your Tax Deductions',
        description: 'Legal ways to reduce your tax burden',
        category: 'deductions',
        readTime: '5 min',
        icon: FileText,
        content: `
## Tax Deductions and Allowances

### Automatic Deductions:
1. **Pension Contribution**: 8% of basic salary
2. **NHF**: 2.5% of basic salary (max ₦50,000)

### Additional Allowances:
1. **Consolidated Relief Allowance (CRA)**
   - Higher of: ₦200,000 OR 1% of gross income
   - PLUS 20% of gross income

2. **Life Insurance Premium**
   - Fully deductible

3. **Housing Loan Interest**
   - Interest on mortgage is deductible

### Example Calculation:
Gross Income: ₦6,000,000
- CRA: ₦200,000 + (20% × ₦6M) = ₦1,400,000
- Pension: 8% × ₦6M = ₦480,000
- NHF: 2.5% × ₦6M = ₦150,000 (capped at ₦50,000)

**Total Deductions: ₦1,930,000**
    `,
    },
    {
        id: 'filing-returns',
        title: 'How to File Your Tax Returns',
        description: 'Step-by-step guide to filing with FIRS',
        category: 'compliance',
        readTime: '4 min',
        icon: GraduationCap,
        content: `
## Filing Tax Returns in Nigeria

### For Employees (PAYE):
Your employer handles monthly PAYE remittance. You may need to file annual returns if you have additional income.

### For Self-Employed/Businesses:

**Step 1: Register with FIRS**
- Get your Tax Identification Number (TIN)
- Register on the FIRS TaxPro Max portal

**Step 2: Prepare Documents**
- Financial statements
- Payment receipts
- Bank statements
- Invoices

**Step 3: File Online**
- Log in to taxpromax.firs.gov.ng
- Select return type
- Fill in the forms
- Submit and pay

### Key Deadlines:
- VAT: 21st of following month
- PAYE: 10th of following month
- Annual Returns: March 31st

### Penalties for Late Filing:
- ₦25,000 first month
- ₦5,000 each subsequent month
    `,
    },
];

const CATEGORIES = [
    { id: 'all', label: 'All', icon: BookOpen },
    { id: 'basics', label: 'Basics', icon: HelpCircle },
    { id: 'vat', label: 'VAT', icon: Receipt },
    { id: 'paye', label: 'PAYE', icon: Calculator },
    { id: 'business', label: 'Business', icon: Building2 },
    { id: 'deductions', label: 'Deductions', icon: FileText },
    { id: 'compliance', label: 'Compliance', icon: GraduationCap },
];

export default function EducationCenter() {
    const navigate = useNavigate();
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

    const filteredArticles = ARTICLES.filter(article => {
        const matchesCategory = selectedCategory === 'all' || article.category === selectedCategory;
        const matchesSearch = searchQuery === '' ||
            article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            article.description.toLowerCase().includes(searchQuery.toLowerCase());
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
                                <span className="text-sm text-gray-500">{selectedArticle.readTime} read</span>
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
                        const Icon = article.icon;
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
                                        <span className="text-gray-500">{article.readTime}</span>
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
                                    <p className="text-xs text-gray-500">Federal Inland Revenue Service</p>
                                </div>
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </main>
        </div>
    );
}
