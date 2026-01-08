-- Phase 7: Create tax_deadlines table
CREATE TABLE public.tax_deadlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deadline_type VARCHAR(50) NOT NULL, -- 'vat', 'paye', 'annual', 'emtl', 'other'
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recurrence VARCHAR(20), -- 'monthly', 'quarterly', 'annual', 'one_time'
    day_of_month INTEGER,
    month_of_year INTEGER,
    specific_date DATE,
    source_rule_id UUID REFERENCES compliance_rules(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 8: Create education_articles table
CREATE TABLE public.education_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL, -- 'basics', 'vat', 'paye', 'business', 'deductions', 'compliance'
    content TEXT NOT NULL,
    read_time VARCHAR(20),
    source_provisions UUID[], -- Links to legal_provisions
    is_published BOOLEAN DEFAULT false,
    needs_review BOOLEAN DEFAULT false,
    review_notes TEXT,
    suggested_by_ai BOOLEAN DEFAULT false,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Phase 9: Create faq_items table
CREATE TABLE public.faq_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL, -- 'general', 'security', 'tax', 'ai', 'support'
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_rules UUID[], -- Links to compliance_rules
    is_published BOOLEAN DEFAULT true,
    needs_review BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.tax_deadlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_items ENABLE ROW LEVEL SECURITY;

-- Public read policies (anyone can view published content)
CREATE POLICY "Anyone can view active deadlines" ON public.tax_deadlines FOR SELECT USING (is_active = true);
CREATE POLICY "Anyone can view published articles" ON public.education_articles FOR SELECT USING (is_published = true);
CREATE POLICY "Anyone can view published FAQs" ON public.faq_items FOR SELECT USING (is_published = true);

-- Admin write policies
CREATE POLICY "Admins can manage deadlines" ON public.tax_deadlines FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage articles" ON public.education_articles FOR ALL USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage FAQs" ON public.faq_items FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at triggers
CREATE TRIGGER update_tax_deadlines_updated_at BEFORE UPDATE ON public.tax_deadlines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_education_articles_updated_at BEFORE UPDATE ON public.education_articles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_faq_items_updated_at BEFORE UPDATE ON public.faq_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial tax deadlines from compliance rules
INSERT INTO public.tax_deadlines (deadline_type, title, description, recurrence, day_of_month, month_of_year, source_rule_id)
SELECT 
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'vat'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'paye'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'annual'
    END,
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'VAT Return'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'PAYE Remittance'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'Annual Tax Return'
    END,
    CASE 
        WHEN rule_code = 'DEADLINE_VAT' THEN 'Monthly VAT filing due to FIRS'
        WHEN rule_code = 'DEADLINE_PAYE' THEN 'Monthly PAYE tax remittance'
        WHEN rule_code = 'DEADLINE_ANNUAL' THEN 'Personal/Corporate income tax filing'
    END,
    CASE 
        WHEN rule_code IN ('DEADLINE_VAT', 'DEADLINE_PAYE') THEN 'monthly'
        ELSE 'annual'
    END,
    (parameters->>'day')::INTEGER,
    (parameters->>'month')::INTEGER,
    id
FROM compliance_rules 
WHERE rule_code IN ('DEADLINE_VAT', 'DEADLINE_PAYE', 'DEADLINE_ANNUAL') AND is_active = true;

-- Seed initial education articles
INSERT INTO public.education_articles (slug, title, description, category, content, read_time, is_published) VALUES
('what-is-vat', 'Understanding VAT in Nigeria', 'Learn how Value Added Tax works under the Nigeria Tax Act 2025', 'vat', 
'## What is VAT?

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
VAT = ₦100,000 × 7.5% = **₦7,500**', '5 min', true),

('what-is-emtl', 'Electronic Money Transfer Levy (EMTL)', 'Understanding the ₦50 charge on bank transfers', 'basics',
'## What is EMTL?

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
- Salary payments (employer to employee)', '3 min', true),

('paye-explained', 'PAYE Tax System Explained', 'How Pay As You Earn tax works for employees', 'paye',
'## What is PAYE?

Pay As You Earn (PAYE) is a method of paying income tax where your employer deducts tax from your salary before paying you.

### Tax Bands (Nigeria Tax Act 2025):
| Taxable Income | Rate |
|----------------|------|
| First ₦800,000 | 0% |
| ₦800,001 - ₦3,000,000 | 15% |
| ₦3,000,001 - ₦12,000,000 | 18% |
| ₦12,000,001 - ₦25,000,000 | 21% |
| ₦25,000,001 - ₦50,000,000 | 23% |
| Above ₦50,000,000 | 25% |

### Allowable Deductions:
- Pension: 8% of gross income
- National Housing Fund (NHF): 2.5%
- Life Insurance Premium
- National Health Insurance (NHIS)', '6 min', true),

('business-taxes', 'Taxes for Small Businesses', 'A guide to business taxation in Nigeria', 'business',
'## Business Taxes in Nigeria

### Types of Business Taxes:

1. **Company Income Tax (CIT)**
   - Standard rate: 30%
   - Medium companies: 20%
   - Small companies (turnover < ₦50M): 0%

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
Keep all invoices, receipts, and bank statements for at least 6 years.', '7 min', true),

('tax-deductions', 'Maximizing Your Tax Deductions', 'Legal ways to reduce your tax burden', 'deductions',
'## Tax Deductions and Allowances

### Automatic Deductions:
1. **Pension Contribution**: 8% of basic salary
2. **NHF**: 2.5% of basic salary

### Additional Allowances:
1. **Consolidated Relief Allowance (CRA)**
   - Higher of: ₦200,000 OR 1% of gross income
   - PLUS 20% of gross income

2. **Life Insurance Premium**
   - Fully deductible

3. **Housing Loan Interest**
   - Interest on mortgage is deductible', '5 min', true),

('filing-returns', 'How to File Your Tax Returns', 'Step-by-step guide to filing with FIRS', 'compliance',
'## Filing Tax Returns in Nigeria

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
- ₦5,000 each subsequent month', '4 min', true);

-- Seed initial FAQ items
INSERT INTO public.faq_items (category, question, answer, display_order) VALUES
('general', 'What is PRISM?', 'PRISM is an AI-powered tax automation platform for Nigerian individuals and businesses. It connects to your bank accounts, automatically categorizes transactions, calculates VAT/EMTL, and helps you stay compliant with the Nigeria Tax Act 2025.', 1),
('general', 'Who is PRISM for?', 'PRISM is designed for freelancers, small business owners, employed professionals, and anyone who wants to simplify their Nigerian tax obligations. Whether you need to track VAT, monitor EMTL charges, or prepare for tax filing, PRISM can help.', 2),
('general', 'Is PRISM free?', 'PRISM offers a free tier with basic features including bank connection, transaction categorization, and tax insights. Premium features like advanced reports and priority support are available on paid plans.', 3),
('general', 'How do I get started?', 'Sign up with your email, verify your identity, connect your bank account via Mono, and PRISM starts analyzing your transactions automatically. The whole process takes less than 5 minutes.', 4),
('security', 'How often should I sync my account?', 'PRISM syncs automatically every few hours. You can manually sync anytime from your dashboard. We recommend syncing at least once daily for the most accurate insights and tax calculations.', 1),
('security', 'Is my banking data secure?', 'Yes. PRISM uses Mono (a CBN-licensed provider) for bank connections. We never store your bank login credentials. All data is encrypted in transit using TLS 1.3 and at rest using AES-256 encryption.', 2),
('security', 'Can PRISM access my bank password?', 'No. We use secure OAuth connections through Mono. Your bank credentials are never shared with us or stored on our servers. You authenticate directly with your bank.', 3),
('security', 'What banks are supported?', 'We support all major Nigerian banks that integrate with Mono, including GTBank, Access Bank, Zenith Bank, UBA, First Bank, Kuda, OPay, Wema Bank, Stanbic IBTC, and many more.', 4),
('tax', 'What transactions are tax-deductible?', 'Business expenses like office supplies, professional services, utilities, rent, and transportation are typically deductible. PRISM automatically flags potential deductions based on your transaction categories and Nigerian tax law.', 1),
('tax', 'When do I need to file taxes?', 'VAT returns are due by the 21st of each month. PAYE is due by the 10th. Annual income tax returns are due by March 31st. PRISM sends you reminders before each deadline so you never miss a filing.', 2),
('tax', 'Does PRISM file taxes for me?', 'PRISM prepares all the data and generates reports you can use for filing. The actual submission to FIRS TaxPro Max is done by you or your tax advisor. We provide export functionality to make this process seamless.', 3),
('tax', 'What is EMTL?', 'Electronic Money Transfer Levy (EMTL) is a ₦50 charge on bank transfers of ₦10,000 or more in Nigeria. PRISM automatically tracks your EMTL payments and includes them in your tax reports.', 4),
('ai', 'How accurate are the AI predictions?', 'Our AI classification achieves 85-95% accuracy depending on transaction clarity. Transactions with low confidence scores are automatically flagged for your review. The system learns from your corrections over time.', 1),
('ai', 'Can I correct the AI''s categorization?', 'Yes! Simply click any transaction to see suggested categories and select the correct one. Your corrections help train the system for better future predictions on similar transactions.', 2),
('ai', 'What AI does PRISM use?', 'PRISM uses Claude by Anthropic for intelligent tax assistance and transaction analysis. Our document OCR uses advanced computer vision. All AI processing follows Nigerian tax law guidelines from the Nigeria Tax Act 2025.', 3),
('support', 'How do I get help?', 'Use the AI chat widget in your dashboard to ask PRISM questions about your taxes. For account issues or technical support, email support@prism.ng or connect with us on WhatsApp.', 1),
('support', 'Is there a mobile app?', 'PRISM is a mobile-first web app that works great on any smartphone browser. No app download is required - just visit prism.ng on your phone and you''re ready to go.', 2);