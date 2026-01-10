# PRISM Compliance Knowledge Management System (CKMS)

## System Overview

Transform the compliance menu from a document repository into an **intelligent, versioned, AI-readable knowledge base** that powers PRISM's tax advisory capabilities.

---

## I. DATABASE SCHEMA

### Table: `regulatory_bodies`
```sql
CREATE TABLE regulatory_bodies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL, -- 'NRS', 'CBN', 'JRB', 'SEC', 'CAC', 'NDPR'
  full_name TEXT NOT NULL,
  previous_names TEXT[], -- ['FIRS'] for NRS, ['JTB'] for JRB
  website_url TEXT,
  jurisdiction TEXT, -- 'federal', 'state', 'local'
  authority_scope TEXT[], -- ['income_tax', 'vat', 'duties']
  contact_info JSONB,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO regulatory_bodies (code, full_name, previous_names, jurisdiction, authority_scope) VALUES
('NRS', 'Nigeria Revenue Service', ARRAY['FIRS', 'Federal Inland Revenue Service'], 'federal', ARRAY['income_tax', 'vat', 'cgt', 'ppt', 'emtl']),
('CBN', 'Central Bank of Nigeria', NULL, 'federal', ARRAY['monetary_policy', 'banking', 'forex']),
('JRB', 'Joint Revenue Board', ARRAY['JTB', 'Joint Tax Board'], 'federal', ARRAY['tax_coordination', 'dispute_resolution']),
('SEC', 'Securities and Exchange Commission', NULL, 'federal', ARRAY['capital_markets', 'securities']),
('CAC', 'Corporate Affairs Commission', NULL, 'federal', ARRAY['company_registration', 'corporate_governance']),
('NDPR', 'Nigeria Data Protection Commission', NULL, 'federal', ARRAY['data_protection', 'privacy']);
```

### Table: `legal_documents`
```sql
CREATE TABLE legal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  
  -- Document Metadata
  document_type TEXT NOT NULL, -- 'act', 'regulation', 'circular', 'practice_note', 'court_ruling', 'treaty', 'guideline'
  title TEXT NOT NULL,
  official_reference TEXT, -- 'Nigeria Tax Act 2025', 'CBN/PSM/DIR/PUB/01/001'
  
  -- Version Control
  version TEXT NOT NULL, -- '1.0', '2.0', '2.1-amendment'
  supersedes_id UUID REFERENCES legal_documents(id), -- Previous version
  superseded_by_id UUID REFERENCES legal_documents(id), -- Next version
  
  -- Status & Lifecycle
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'active', 'amended', 'repealed', 'historical'
  effective_date DATE, -- When it takes effect
  publication_date DATE, -- When it was published
  repeal_date DATE, -- When it was repealed (if applicable)
  
  -- Content Storage
  original_file_url TEXT, -- S3/Supabase Storage URL for PDF/DOC
  extracted_text TEXT, -- Full text extraction
  structured_content JSONB, -- Parsed sections, articles, schedules
  
  -- AI Processing
  embedding VECTOR(1536), -- OpenAI embeddings for semantic search
  summary TEXT, -- AI-generated summary
  key_provisions TEXT[], -- Extracted key points
  affected_taxpayers TEXT[], -- 'individuals', 'companies', 'smes', 'non-residents'
  tax_types TEXT[], -- 'pit', 'cit', 'vat', 'cgt', 'emtl', 'wht'
  
  -- Relationships
  amends_documents UUID[], -- Array of document IDs this amends
  related_documents UUID[], -- Array of related document IDs
  
  -- Metadata
  source_url TEXT, -- Official government URL
  language TEXT DEFAULT 'en',
  tags TEXT[],
  notes TEXT, -- Admin notes
  
  -- Audit
  uploaded_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  review_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  review_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_legal_docs_status ON legal_documents(status, effective_date);
CREATE INDEX idx_legal_docs_body ON legal_documents(regulatory_body_id);
CREATE INDEX idx_legal_docs_type ON legal_documents(document_type);
CREATE INDEX idx_legal_docs_tax_types ON legal_documents USING GIN(tax_types);
CREATE INDEX idx_legal_docs_embedding ON legal_documents USING ivfflat(embedding vector_cosine_ops);
```

### Table: `legal_provisions`
```sql
CREATE TABLE legal_provisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
  
  -- Provision Identification
  section_number TEXT, -- 'Section 12', 'Article 4.5', 'Schedule 2 Part A'
  title TEXT,
  provision_text TEXT NOT NULL,
  
  -- Classification
  provision_type TEXT, -- 'definition', 'rate', 'exemption', 'penalty', 'procedure', 'threshold'
  applies_to TEXT[], -- 'individuals', 'companies', 'all'
  tax_impact TEXT, -- 'increases_liability', 'decreases_liability', 'neutral', 'procedural'
  
  -- AI Understanding
  plain_language_summary TEXT, -- Human-readable explanation
  examples JSONB[], -- Practical examples
  computation_formula TEXT, -- If it's a rate/calculation
  
  -- Effective Dates (can differ from parent document)
  effective_from DATE,
  effective_to DATE,
  
  -- Relationships
  supersedes_provision_id UUID REFERENCES legal_provisions(id),
  related_provisions UUID[],
  
  -- Flags
  frequently_applicable BOOLEAN DEFAULT false, -- Mark common provisions
  requires_expert_review BOOLEAN DEFAULT false, -- Complex provisions
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_provisions_document ON legal_provisions(document_id);
CREATE INDEX idx_provisions_type ON legal_provisions(provision_type);
```

### Table: `compliance_rules`
```sql
-- Translated provisions into machine-actionable rules
CREATE TABLE compliance_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provision_id UUID REFERENCES legal_provisions(id),
  
  -- Rule Definition
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL, -- 'tax_rate', 'threshold', 'exemption', 'filing_deadline', 'penalty'
  
  -- Conditions (JSON logic)
  conditions JSONB, -- { "and": [{"income": {">=": 800000}}, {"status": "resident"}] }
  
  -- Actions/Outcomes
  outcome JSONB, -- { "tax_rate": 0, "message": "Tax-free threshold" }
  
  -- Application Context
  applies_to_transactions BOOLEAN DEFAULT false,
  applies_to_filing BOOLEAN DEFAULT false,
  applies_to_reporting BOOLEAN DEFAULT false,
  
  -- Priority & Conflict Resolution
  priority INTEGER DEFAULT 100, -- Higher number = higher priority
  conflicts_with UUID[], -- Array of conflicting rule IDs
  
  -- Validation
  test_cases JSONB[], -- Unit tests for the rule
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending',
  
  -- Lifecycle
  active BOOLEAN DEFAULT true,
  effective_from DATE,
  effective_to DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_compliance_rules_type ON compliance_rules(rule_type, active);
```

### Table: `compliance_change_log`
```sql
CREATE TABLE compliance_change_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- What Changed
  change_type TEXT NOT NULL, -- 'new_document', 'amendment', 'repeal', 'rate_change', 'threshold_change'
  regulatory_body_id UUID REFERENCES regulatory_bodies(id),
  document_id UUID REFERENCES legal_documents(id),
  
  -- Change Details
  summary TEXT NOT NULL,
  detailed_changes JSONB, -- Structured change data
  impact_assessment TEXT, -- Who/what is affected
  
  -- User Communication
  notification_sent BOOLEAN DEFAULT false,
  notification_sent_at TIMESTAMPTZ,
  affected_user_count INTEGER,
  
  -- AI Model Updates
  model_update_required BOOLEAN DEFAULT false,
  model_updated_at TIMESTAMPTZ,
  
  -- Metadata
  detected_by TEXT, -- 'manual', 'automated_scraper', 'user_report'
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_change_log_date ON compliance_change_log(created_at DESC);
```

### Table: `regulation_relationships`
```sql
-- Track complex relationships between regulations
CREATE TABLE regulation_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  source_document_id UUID REFERENCES legal_documents(id),
  target_document_id UUID REFERENCES legal_documents(id),
  
  relationship_type TEXT NOT NULL, 
  -- 'amends', 'repeals', 'implements', 'interprets', 'conflicts_with', 
  -- 'clarifies', 'references', 'subordinate_to', 'treaty_overrides'
  
  description TEXT,
  effective_date DATE,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_relationships_source ON regulation_relationships(source_document_id);
CREATE INDEX idx_relationships_type ON regulation_relationships(relationship_type);
```

---

## II. ADMIN INTERFACE FEATURES

### A. Dashboard Overview

```
┌─────────────────────────────────────────────────────────┐
│ 📋 COMPLIANCE KNOWLEDGE MANAGEMENT SYSTEM               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Active Regulations:      247                           │
│ Pending Review:          12                            │
│ Recently Updated:        8 (last 30 days)              │
│ Last Model Sync:         Jan 4, 2026 2:30 PM          │
│                                                         │
│ ⚠️ URGENT ACTIONS NEEDED:                              │
│ • 3 new NRS circulars awaiting upload                  │
│ • 2 regulations need expert review                     │
│ • 1 amendment has conflicting rules                    │
│                                                         │
│ [View Pending] [Add New Regulation] [Sync AI Model]   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ REGULATORY BODIES                                       │
├─────────────────────────────────────────────────────────┤
│ 🏛️ NRS (formerly FIRS)           Active Docs: 89      │
│ 🏦 CBN                             Active Docs: 45      │
│ ⚖️ JRB (formerly JTB)             Active Docs: 23      │
│ 📊 SEC                             Active Docs: 34      │
│ 🏢 CAC                             Active Docs: 28      │
│ 🔒 NDPR                            Active Docs: 18      │
│ 📜 Court Rulings (All)             Active Docs: 10      │
└─────────────────────────────────────────────────────────┘
```

### B. Upload & Processing Workflow

**Step 1: Document Upload**
```
┌─────────────────────────────────────────────────────────┐
│ ➕ Add New Regulation                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Regulatory Body: [NRS ▼]                               │
│                                                         │
│ Document Type:                                          │
│ ○ Primary Legislation (Act)                            │
│ ● Secondary Legislation (Regulation/Circular)          │
│ ○ Practice Note/Guideline                              │
│ ○ Court Ruling                                          │
│ ○ International Treaty                                  │
│                                                         │
│ Official Reference: [CBN/PSM/DIR/PUB/01/044]          │
│ Title: [Guidelines on Electronic Money Transfer Levy] │
│ Publication Date: [Jan 1, 2026]                        │
│ Effective Date: [Jan 1, 2026]                          │
│                                                         │
│ Upload Document:                                        │
│ [Drag & Drop or Click to Upload]                       │
│ Supported: PDF, DOCX, TXT                              │
│                                                         │
│ ☑ This document amends/supersedes existing regulation  │
│   Previous Document: [Select... ▼]                     │
│                                                         │
│ ☑ This is an emergency/urgent update                   │
│                                                         │
│ [Cancel] [Upload & Process]                            │
└─────────────────────────────────────────────────────────┘
```

**Step 2: Automatic Processing (Backend)**
```typescript
async function processLegalDocument(fileUrl: string, metadata: DocumentMetadata) {
  // 1. Extract text from PDF/DOCX
  const extractedText = await extractTextFromDocument(fileUrl);
  
  // 2. Structure the document with Claude
  const structuredContent = await structureWithClaude(extractedText);
  
  // 3. Extract key provisions
  const provisions = await extractProvisions(structuredContent);
  
  // 4. Generate embeddings
  const embedding = await generateEmbedding(extractedText);
  
  // 5. Identify affected taxpayers and tax types
  const classification = await classifyDocument(extractedText);
  
  // 6. Detect relationships with existing regulations
  const relationships = await findRelationships(structuredContent);
  
  // 7. Generate plain language summary
  const summary = await generateSummary(extractedText, provisions);
  
  // 8. Create compliance rules
  const rules = await generateComplianceRules(provisions);
  
  // 9. Flag for human review if complex
  const needsReview = detectComplexity(provisions, rules);
  
  return {
    structuredContent,
    provisions,
    embedding,
    classification,
    relationships,
    summary,
    rules,
    needsReview
  };
}
```

**Step 3: Human Review Interface**
```
┌─────────────────────────────────────────────────────────┐
│ 📝 Review: CBN EMTL Guidelines 2026                     │
├─────────────────────────────────────────────────────────┤
│ Status: Pending Expert Review                           │
│ Uploaded: Jan 4, 2026 by Admin User                    │
│                                                         │
│ AI-Generated Summary:                                   │
│ This circular clarifies the application of EMTL on     │
│ electronic transfers, specifically addressing exemptions│
│ for intra-account transfers and government payments.   │
│                                                         │
│ Key Provisions Extracted: (8 found)                    │
│                                                         │
│ 1. Section 2.1 - EMTL Rate                             │
│    "₦50 per transfer of ₦10,000 or more"               │
│    Classification: rate ✓                               │
│    Affected: all taxpayers ✓                            │
│    [✓ Approve] [✗ Reject] [✏️ Edit]                    │
│                                                         │
│ 2. Section 2.3 - Exemptions                            │
│    "Transfers between accounts of same customer..."    │
│    Classification: exemption ✓                          │
│    Affected: all taxpayers ✓                            │
│    ⚠️ Conflicts with previous NRS Circular 2024/08     │
│    [✓ Approve] [✗ Reject] [✏️ Edit] [Resolve Conflict]│
│                                                         │
│ Generated Compliance Rules: (4 found)                  │
│                                                         │
│ Rule 1: EMTL_CALCULATION_2026                          │
│ IF transaction.amount >= 10000                         │
│    AND transaction.type == 'electronic_transfer'       │
│    AND NOT exemption_applies                           │
│ THEN charge = 50                                        │
│                                                         │
│ Test Cases:                                             │
│ • ₦15,000 transfer → ₦50 EMTL ✓ Pass                  │
│ • ₦9,999 transfer → ₦0 EMTL ✓ Pass                    │
│ • ₦50,000 same account → ₦0 EMTL ✓ Pass              │
│                                                         │
│ [Run All Tests] [✓ Approve All] [Request Changes]     │
│                                                         │
│ Expert Review Notes:                                    │
│ [Text area for reviewer comments]                      │
│                                                         │
│ [❌ Reject Document] [⏸️ Save Draft] [✅ Approve & Activate] │
└─────────────────────────────────────────────────────────┘
```

### C. Version History & Timeline

```
┌─────────────────────────────────────────────────────────┐
│ 📚 Document: Electronic Money Transfer Levy            │
│    Version History                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ● CBN/PSM/DIR/PUB/01/044 (v3.0) - ACTIVE              │
│   Effective: Jan 1, 2026 - Present                     │
│   Changes: Clarified exemptions, added digital wallets │
│   [View Document] [View Changes] [View Impact]         │
│                                                         │
│ ○ CBN/PSM/DIR/PUB/01/032 (v2.1) - SUPERSEDED          │
│   Effective: Jun 1, 2024 - Dec 31, 2025               │
│   Changes: Rate increased from ₦20 to ₦50             │
│   Still applicable to: Transactions before Jan 1, 2026 │
│   [View Document] [View Historical Context]            │
│                                                         │
│ ○ CBN Circular 2022/15 (v2.0) - REPEALED              │
│   Effective: Jan 1, 2022 - May 31, 2024               │
│   [View Document] [Archive]                            │
│                                                         │
│ ○ BOFIA 2004 Section 104 (v1.0) - REPEALED            │
│   Effective: 2004 - Dec 31, 2021                       │
│   [View Document] [Archive]                            │
│                                                         │
│ [Timeline View] [Export History] [Compare Versions]    │
└─────────────────────────────────────────────────────────┘
```

### D. Search & Query Interface

```
┌─────────────────────────────────────────────────────────┐
│ 🔍 Search Compliance Knowledge Base                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [Search for regulations, provisions, rates...]         │
│                                                         │
│ Filters:                                                │
│ Regulatory Body: [All ▼]                               │
│ Status: [✓ Active] [✓ Amended] [ ] Historical         │
│ Tax Type: [All ▼]                                      │
│ Applies To: [All ▼]                                    │
│ Effective Date: [From: ___] [To: ___]                 │
│                                                         │
│ Advanced Search:                                        │
│ [ ] Semantic Search (AI-powered)                       │
│ [ ] Show only provisions needing review                │
│ [ ] Show conflicting regulations                       │
│                                                         │
└─────────────────────────────────────────────────────────┘

Search: "capital gains tax on cryptocurrency"

Results: 4 documents, 12 provisions

┌─────────────────────────────────────────────────────────┐
│ 📄 Nigeria Tax Act 2025 - Section 25                   │
│    Relevance: 95% ⭐⭐⭐⭐⭐                              │
│                                                         │
│    "Capital gains from disposal of virtual assets..."  │
│                                                         │
│    Effective: Jan 1, 2026                              │
│    Tax Type: Capital Gains Tax (CGT)                   │
│    Rate: 30% for companies, PIT rate for individuals   │
│                                                         │
│    Related Provisions:                                  │
│    • NRS Practice Note PN-2026/03 (Crypto valuation)   │
│    • SEC Guidelines on Digital Assets                   │
│                                                         │
│    [View Full Document] [View Compliance Rules]        │
└─────────────────────────────────────────────────────────┘
```

---

## III. AI INTEGRATION ARCHITECTURE

### Approach: Hybrid RAG + Fine-Tuning

**A. Retrieval Augmented Generation (RAG) - PRIMARY**

```typescript
// When user asks a tax question
async function answerTaxQuestion(userQuery: string, userContext: UserContext) {
  // 1. Generate query embedding
  const queryEmbedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: userQuery
  });
  
  // 2. Vector search for relevant regulations (using pgvector)
  const { data: relevantDocs } = await supabase.rpc('search_legal_documents', {
    query_embedding: queryEmbedding.data[0].embedding,
    match_threshold: 0.7,
    match_count: 10,
    filter_status: 'active',
    filter_effective_date: userContext.transactionDate || new Date()
  });
  
  // 3. Retrieve associated compliance rules
  const applicableRules = await fetchApplicableRules(relevantDocs, userContext);
  
  // 4. Build context-rich prompt
  const systemPrompt = `
You are PRISM, a Nigerian tax compliance assistant with expert knowledge.

CURRENT REGULATIONS (effective ${new Date().toISOString().split('T')[0]}):
${relevantDocs.map(doc => `
## ${doc.title}
${doc.summary}

Key Provisions:
${doc.key_provisions.join('\n')}
`).join('\n\n')}

APPLICABLE COMPLIANCE RULES:
${JSON.stringify(applicableRules, null, 2)}

USER CONTEXT:
- Work Status: ${userContext.workStatus}
- Income Type: ${userContext.incomeType}
- Transaction Date: ${userContext.transactionDate}

CRITICAL INSTRUCTIONS:
1. Base your answer ONLY on the provided regulations
2. If regulations conflict, explain the conflict clearly
3. If unsure, say so and recommend consulting a tax professional
4. Always cite the specific regulation (e.g., "Per Nigeria Tax Act 2025 Section 12...")
5. Consider the transaction date for historical regulations
6. Provide calculations when applicable
7. Explain in simple terms, then provide legal reference
`;

  // 5. Call Claude with augmented context
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: userQuery
    }]
  });
  
  // 6. Log for audit trail
  await logAIResponse({
    userId: userContext.userId,
    query: userQuery,
    response: response.content[0].text,
    regulationsUsed: relevantDocs.map(d => d.id),
    rulesApplied: applicableRules.map(r => r.id)
  });
  
  return {
    answer: response.content[0].text,
    sources: relevantDocs,
    confidence: calculateConfidence(relevantDocs)
  };
}
```

**B. Compliance Rule Engine**

```typescript
// Evaluate transactions against compliance rules
async function evaluateTransaction(transaction: Transaction) {
  // 1. Fetch active rules for transaction date
  const { data: rules } = await supabase
    .from('compliance_rules')
    .select('*')
    .eq('active', true)
    .eq('applies_to_transactions', true)
    .lte('effective_from', transaction.date)
    .or(`effective_to.is.null,effective_to.gte.${transaction.date}`)
    .order('priority', { ascending: false });
  
  const results = [];
  
  // 2. Evaluate each rule
  for (const rule of rules) {
    const matches = evaluateConditions(rule.conditions, transaction);
    
    if (matches) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.rule_name,
        outcome: rule.outcome,
        provision: await getProvision(rule.provision_id),
        priority: rule.priority
      });
    }
  }
  
  // 3. Resolve conflicts (highest priority wins)
  const resolvedResults = resolveConflicts(results);
  
  return {
    taxImpact: calculateTaxImpact(resolvedResults),
    applicableRules: resolvedResults,
    warnings: checkForAnomalies(transaction, resolvedResults)
  };
}

function evaluateConditions(conditions: any, transaction: Transaction): boolean {
  // JSON Logic implementation
  // Example: { "and": [{"amount": {">=": 10000}}, {"type": "transfer"}] }
  return jsonLogic.apply(conditions, transaction);
}
```

**C. Periodic Model Updates (Optional Fine-Tuning)**

```typescript
// Run monthly to fine-tune on common queries
async function updateAIModel() {
  // 1. Collect validated Q&A pairs from logs
  const { data: interactions } = await supabase
    .from('ai_response_logs')
    .select('*')
    .eq('user_feedback', 'positive')
    .gte('created_at', oneMonthAgo);
  
  // 2. Format for fine-tuning
  const trainingData = interactions.map(i => ({
    messages: [
      { role: 'system', content: TAX_EXPERT_SYSTEM_PROMPT },
      { role: 'user', content: i.query },
      { role: 'assistant', content: i.response }
    ]
  }));
  
  // 3. Upload to Anthropic (if doing fine-tuning)
  // NOTE: For tax/legal, RAG is preferred over fine-tuning
  // Fine-tuning should only be for style/tone, not factual content
  
  // 4. Update system prompts instead
  await updateSystemPrompts(interactions);
  
  // 5. Refresh embeddings for updated regulations
  await refreshEmbeddings();
}
```

---

## IV. AUTOMATED MONITORING & UPDATES

### A. Regulatory Website Scrapers

```typescript
// Scheduled cron job: Daily at 6 AM
async function monitorRegulatoryWebsites() {
  const sources = [
    {
      name: 'NRS',
      url: 'https://nrs.gov.ng/publications',
      selector: '.publication-item',
      lastChecked: await getLastCheckTime('NRS')
    },
    {
      name: 'CBN',
      url: 'https://www.cbn.gov.ng/documents/',
      selector: '.document-list-item',
      lastChecked: await getLastCheckTime('CBN')
    },
    {
      name: 'JRB',
      url: 'https://jtb.gov.ng/circulars', // hypothetical
      selector: '.circular-item',
      lastChecked: await getLastCheckTime('JRB')
    }
  ];
  
  for (const source of sources) {
    try {
      // 1. Fetch latest documents
      const newDocuments = await scrapeWebsite(source);
      
      // 2. Check for new publications
      const unseenDocs = newDocuments.filter(doc => 
        new Date(doc.publicationDate) > source.lastChecked
      );
      
      if (unseenDocs.length > 0) {
        // 3. Send alert to admin
        await notifyAdmins({
          type: 'new_regulation_detected',
          source: source.name,
          count: unseenDocs.length,
          documents: unseenDocs,
          urgency: checkUrgency(unseenDocs)
        });
        
        // 4. Auto-download if possible
        for (const doc of unseenDocs) {
          if (doc.downloadUrl) {
            await autoDownloadAndQueue(doc, source.name);
          }
        }
        
        // 5. Create pending tasks
        await createAdminTasks(unseenDocs, source.name);
      }
      
      // 6. Update last check time
      await updateLastCheckTime(source.name);
      
    } catch (error) {
      await logScraperError(source.name, error);
    }
  }
}

async function autoDownloadAndQueue(doc: ScrapedDocument, source: string) {
  // 1. Download file
  const fileBuffer = await downloadFile(doc.downloadUrl);
  
  // 2. Upload to storage
  const { data: upload } = await supabase.storage
    .from('pending-regulations')
    .upload(`${source}/${doc.reference}.pdf`, fileBuffer);
  
  // 3. Create pending review record
  await supabase.from('legal_documents').insert({
    regulatory_body_id: await getBodyId(source),
    document_type: doc.type,
    title: doc.title,
    official_reference: doc.reference,
    status: 'draft',
    original_file_url: upload.path,
    source_url: doc.originalUrl,
    review_status: 'pending',
    notes: `Auto-detected on ${new Date().toISOString()}`
  });
  
  // 4. Queue for AI processing
  await queueForProcessing(upload.path);
}
```

### B. Admin Notification System

```typescript
async function notifyAdmins(alert: RegulationAlert) {
  const adminUsers = await getAdminUsers(['compliance_manager', 'super_admin']);
  
  const message = `
🚨 NEW REGULATION DETECTED

Source: ${alert.source}
Count: ${alert.count} new document(s)
Urgency: ${alert.urgency}

Documents:
${alert.documents.map((doc, i) => `
${i + 1}. ${doc.title}
   Ref: ${doc.reference}
   Date: ${doc.publicationDate}
   URL: ${doc.originalUrl}
`).join('\n')}

Action Required:
${alert.urgency === 'high' ? '⚠️ URGENT - Review within 24 hours' : 'Review within 7 days'}

[Review Now] [Dismiss]
`;

  // Send via multiple channels
  await Promise.all([
    // Email
    sendEmail({
      to: adminUsers.map(u => u.email),
      subject: `[PRISM] New ${alert.source} Regulation Detected`,
      body: message
    }),
    
    // In-app notification
    createNotification({
      users: adminUsers.map(u => u.id),
      type: 'new_regulation',
      title: 'New Regulation Detected',
      message,
      priority: alert.urgency === 'high' ? 'urgent' : 'normal',
      actionUrl: '/admin/compliance/pending'
    }),
    
    // Slack (if integrated)
    postToSlack({
      channel: '#prism-compliance',
      message,
      urgency: alert.urgency
    })
  ]);
}

function checkUrgency(documents: ScrapedDocument[]): 'high' | 'normal' {
  // Check for urgent keywords
  const urgentKeywords = [
    'immediate effect',
    'emergency',
    'urgent',
    'deadline',
    'penalty increase',
    'rate change',
    'effective immediately'
  ];
  
  for (const doc of documents) {
    const text = `${doc.title} ${doc.description}`.toLowerCase();
    if (urgentKeywords.some(keyword => text.includes(keyword))) {
      return 'high';
    }
  }
  
  return 'normal';
}
```

---

## V. CONFLICT RESOLUTION SYSTEM

### A. Automatic Conflict Detection

```typescript
async function detectConflicts(newDocument: LegalDocument) {
  const conflicts: Conflict[] = [];
  
  // 1. Check for direct supersession conflicts
  if (newDocument.supersedes_id) {
    const oldDoc = await getDocument(newDocument.supersedes_id);
    
    // Ensure effective dates don't overlap
    if (newDocument.effective_date <= oldDoc.effective_date) {
      conflicts.push({
        type: 'date_conflict',
        severity: 'high',
        description: 'New document effective date is before superseded document',
        documents: [newDocument.id, oldDoc.id]
      });
    }
  }
  
  // 2. Check for rate conflicts
  const rateProvisions = await supabase
    .from('legal_provisions')
    .select('*')
    .eq('document_id', newDocument.id)
    .eq('provision_type', 'rate');
  
  for (const provision of rateProvisions) {
    // Find other active rate provisions for same tax type
    const { data: existingRates } = await supabase
      .from('legal_provisions')
      .select('*, legal_documents(*)')
      .eq('provision_type', 'rate')
      .neq('document_id', newDocument.id)
      .overlaps('applies_to', provision.applies_to);
    
    for (const existingRate of existingRates) {
      // Check if dates overlap
      const hasOverlap = checkDateOverlap(
        provision.effective_from,
        provision.effective_to,
        existingRate.effective_from,
        existingRate.effective_to
      );
      
      if (hasOverlap) {
        conflicts.push({
          type: 'rate_conflict',
          severity: 'critical',
          description: `Conflicting rates for same tax: ${provision.computation_formula} vs ${existingRate.computation_formula}`,
          provisions: [provision.id, existingRate.id],
          resolution: 'manual_review_required'
        });
      }
    }
  }
  
  // 3. Check for threshold conflicts
  // Similar logic for thresholds, exemptions, etc.
  
  // 4. Check for rule conflicts in compliance_rules
  const newRules = await supabase
    .from('compliance_rules')
    .select('*')
    .eq('provision_id', rateProvisions[0]?.id);
  
  for (const rule of newRules) {
    const conflictingRules = await findConflictingRules(rule);
    
    if (conflictingRules.length > 0) {
      conflicts.push({
        type: 'rule_conflict',
        severity: 'high',
        description: 'Multiple rules apply to same conditions',
        rules: [rule.id, ...conflictingRules.map(r => r.id)],
        resolution: 'priority_based' // Use priority field to resolve
      });
    }
  }
  
  // 5. Store conflicts
  if (conflicts.length > 0) {
    await supabase.from('regulation_conflicts').insert(
      conflicts.map(c => ({
        ...c,
        detected_at: new Date(),
        status: 'unresolved'
      }))
    );
    
    // Alert admin
    await notifyConflicts(conflicts);
  }
  
  return conflicts;
}
```

### B. Conflict Resolution Interface

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️ CONFLICT RESOLUTION CENTER                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Unresolved Conflicts: 2                                │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ 🔴 CRITICAL: Rate Conflict                             │
│                                                         │
│ Conflict Details:                                       │
│ Two active regulations define different CGT rates      │
│ for individuals on cryptocurrency gains.               │
│                                                         │
│ Document A: Nigeria Tax Act 2025, Section 25          │
│ "CGT on virtual assets taxed at PIT rate"             │
│ Effective: Jan 1, 2026 - Present                      │
│                                                         │
│ Document B: SEC Digital Assets Guidelines 2025         │
│ "Digital asset gains taxed at flat 15%"               │
│ Effective: Jan 1, 2026 - Present                      │
│                                                         │
│ Impact Analysis:                                        │
│ • Affects 1,247 users with crypto transactions         │
│ • Potential tax difference: 0-10% per user             │
│ • Both documents currently marked "active"              │
│                                                         │
│ AI Recommendation:                                      │
│ Nigeria Tax Act takes precedence (primary legislation  │
│ overrides secondary guidelines). Suggest marking SEC   │
│ guidelines as "clarification" not "rate-setting".      │
│                                                         │
│ Resolution Options:                                     │
│ ○ Mark Document B as subordinate to Document A         │
│ ○ Update Document B effective date (delay it)          │
│ ○ Create relationship: "B clarifies A" (not conflicts) │
│ ● Flag for legal expert review                         │
│                                                         │
│ Reviewer Notes:                                         │
│ [Contacted NRS for clarification - awaiting response]  │
│                                                         │
│ [Escalate to Legal] [Resolve] [Dismiss as Non-Issue]  │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ 🟡 WARNING: Threshold Overlap                          │
│                                                         │
│ [View Details] [Resolve]                               │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## VI. USER IMPACT ANALYSIS

### A. Impact Assessment on Document Upload

```typescript
async function assessUserImpact(newDocument: LegalDocument) {
  const impact = {
    totalUsers: 0,
    affectedUsers: [] as string[],
    impactByCategory: {} as Record<string, number>,
    estimatedTaxChange: 0,
    actionRequired: [] as string[]
  };
  
  // 1. Determine who is affected
  const affectedCategories = newDocument.affected_taxpayers; // ['individuals', 'smes']
  const taxTypes = newDocument.tax_types; // ['pit', 'vat']
  
  // 2. Query users matching criteria
  const { data: users } = await supabase
    .from('users')
    .select('id, work_status, income_type')
    .in('work_status', affectedCategories);
  
  impact.totalUsers = users.length;
  
  // 3. Check recent transactions for impact
  for (const user of users) {
    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .gte('date', thirtyDaysAgo)
      .in('tax_type', taxTypes);
    
    if (recentTransactions.length > 0) {
      impact.affectedUsers.push(user.id);
      
      // Calculate estimated tax change
      const oldTax = calculateTaxUnderOldRules(recentTransactions);
      const newTax = calculateTaxUnderNewRules(recentTransactions, newDocument);
      impact.estimatedTaxChange += (newTax - oldTax);
      
      // Categorize impact
      const category = user.work_status;
      impact.impactByCategory[category] = (impact.impactByCategory[category] || 0) + 1;
    }
  }
  
  // 4. Determine required actions
  if (impact.affectedUsers.length > 0) {
    impact.actionRequired.push('Send notification to affected users');
    
    if (Math.abs(impact.estimatedTaxChange) > 100000) {
      impact.actionRequired.push('Schedule webinar to explain changes');
    }
    
    if (newDocument.document_type === 'act') {
      impact.actionRequired.push('Update all tax calculators');
      impact.actionRequired.push('Regenerate affected tax reports');
    }
  }
  
  // 5. Store assessment
  await supabase.from('impact_assessments').insert({
    document_id: newDocument.id,
    total_users: impact.totalUsers,
    affected_user_ids: impact.affectedUsers,
    impact_by_category: impact.impactByCategory,
    estimated_tax_change: impact.estimatedTaxChange,
    action_required: impact.actionRequired,
    assessed_at: new Date()
  });
  
  return impact;
}
```

### B. User Notification on Regulatory Changes

```typescript
async function notifyAffectedUsers(document: LegalDocument, impact: ImpactAssessment) {
  for (const userId of impact.affected_user_ids) {
    const user = await getUser(userId);
    
    const message = generateUserNotification(document, user);
    
    // Send via Telegram
    await bot.sendMessage(user.telegram_id, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '📄 Read Full Changes', url: `${APP_URL}/regulations/${document.id}` },
          { text: '💬 Ask PRISM AI', callback_data: `ask_about:${document.id}` }
        ]]
      }
    });
    
    // Log notification
    await logNotification(userId, document.id);
  }
}

function generateUserNotification(doc: LegalDocument, user: User): string {
  const summary = doc.summary;
  const impact = calculatePersonalImpact(doc, user);
  
  return `
🔔 *Important Tax Update*

*${doc.title}*

📅 Effective: ${formatDate(doc.effective_date)}

📝 Summary:
${summary}

💰 Impact on You:
${impact.description}

${impact.taxChange > 0 ? '⬆️' : '⬇️'} Estimated tax change: ₦${Math.abs(impact.taxChange).toLocaleString()}

What you need to do:
${impact.actions.map(a => `• ${a}`).join('\n')}

Have questions? Ask PRISM AI for personalized guidance!
`;
}
```

---

## VII. QUALITY ASSURANCE & VALIDATION

### A. Automated Testing Framework

```typescript
// Test compliance rules against known scenarios
async function runComplianceTests() {
  const testSuites = await supabase
    .from('compliance_test_suites')
    .select('*, test_cases(*)');
  
  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: [] as TestError[]
  };
  
  for (const suite of testSuites) {
    for (const testCase of suite.test_cases) {
      results.total++;
      
      try {
        // Execute test
        const actual = await evaluateTransaction(testCase.input);
        const expected = testCase.expected_output;
        
        // Compare results
        if (deepEqual(actual.taxImpact, expected.taxImpact)) {
          results.passed++;
        } else {
          results.failed++;
          results.errors.push({
            testCase: testCase.name,
            expected: expected.taxImpact,
            actual: actual.taxImpact,
            rule: testCase.rule_id
          });
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          testCase: testCase.name,
          error: error.message
        });
      }
    }
  }
  
  // Store results
  await supabase.from('test_runs').insert({
    suite_ids: testSuites.map(s => s.id),
    results,
    passed: results.passed === results.total,
    run_at: new Date()
  });
  
  // Alert if critical tests fail
  if (results.failed > 0) {
    await alertAdminsTestFailure(results);
  }
  
  return results;
}

// Example test cases
const TEST_CASES = [
  {
    name: 'EMTL on ₦15,000 transfer',
    input: {
      type: 'debit',
      amount: 15000,
      description: 'Transfer to John Doe',
      category: 'transfer',
      date: '2026-01-05'
    },
    expected_output: {
      taxImpact: {
        emtl: 50,
        vat: 0,
        total: 50
      }
    }
  },
  {
    name: 'No EMTL on ₦9,999 transfer',
    input: {
      type: 'debit',
      amount: 9999,
      description: 'Transfer to Jane Doe',
      category: 'transfer',
      date: '2026-01-05'
    },
    expected_output: {
      taxImpact: {
        emtl: 0,
        vat: 0,
        total: 0
      }
    }
  },
  {
    name: 'VAT on ₦2,000 airtime',
    input: {
      type: 'debit',
      amount: 2000,
      description: 'Airtime Purchase - MTN',
      category: 'airtime',
      date: '2026-01-05'
    },
    expected_output: {
      taxImpact: {
        emtl: 0,
        vat: 139.53, // 2000 / 1.075 * 0.075
        total: 139.53
      }
    }
  },
  {
    name: 'PIT on ₦1.5M income for resident',
    input: {
      type: 'credit',
      amount: 1500000,
      description: 'Salary Payment',
      category: 'income',
      date: '2026-01-05',
      userContext: {
        workStatus: 'employed',
        residencyStatus: 'resident'
      }
    },
    expected_output: {
      taxImpact: {
        pit: calculatePIT(1500000), // Based on graduated rates
        total: calculatePIT(1500000)
      }
    }
  }
];
```

### B. Expert Review Workflow

```
┌─────────────────────────────────────────────────────────┐
│ 👨‍⚖️ EXPERT REVIEW QUEUE                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Documents Pending Expert Review: 3                     │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ 🔴 HIGH PRIORITY                                        │
│                                                         │
│ Nigeria Tax Act 2025 - Amendment 1                     │
│ Uploaded: Jan 3, 2026 | Due: Jan 6, 2026              │
│                                                         │
│ AI Processing Status:                                   │
│ ✅ Text extraction complete                            │
│ ✅ Provisions identified (24 found)                    │
│ ✅ Embeddings generated                                │
│ ⚠️ 3 conflicting rules detected                        │
│ ⚠️ 2 provisions flagged as complex                     │
│                                                         │
│ Assigned To: [Select Tax Expert ▼]                    │
│                                                         │
│ [Start Review] [Delegate] [Mark Non-Urgent]           │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ 🟡 NORMAL PRIORITY                                      │
│                                                         │
│ CBN Circular on Foreign Exchange...                    │
│ [View Details]                                          │
│                                                         │
│ SEC Guidelines on Investment Taxation...                │
│ [View Details]                                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## VIII. REPORTING & ANALYTICS

### A. Admin Dashboard - Compliance Metrics

```
┌─────────────────────────────────────────────────────────┐
│ 📊 COMPLIANCE KNOWLEDGE BASE - ANALYTICS                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Knowledge Base Health Score: 92/100                    │
│                                                         │
│ ████████████████████░░  92%                            │
│                                                         │
│ Breakdown:                                              │
│ • Coverage: 95% (excellent)                            │
│ • Recency: 88% (good - 12% regulations > 6 months old) │
│ • Completeness: 94% (good)                             │
│ • Conflict-free: 90% (2 unresolved conflicts)          │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ Document Statistics:                                    │
│                                                         │
│ Total Documents: 247                                    │
│ │                                                       │
│ ├─ Active: 235 (95%)                                   │
│ ├─ Pending Review: 12 (5%)                             │
│ ├─ Historical: 89                                       │
│ └─ Repealed: 34                                         │
│                                                         │
│ By Regulatory Body:                                     │
│ NRS:  ██████████████████░░  89 docs                    │
│ CBN:  ███████████░░░░░░░░░  45 docs                    │
│ SEC:  ████████░░░░░░░░░░░░  34 docs                    │
│ CAC:  ███████░░░░░░░░░░░░░  28 docs                    │
│ JRB:  ██████░░░░░░░░░░░░░░  23 docs                    │
│ NDPR: █████░░░░░░░░░░░░░░░  18 docs                    │
│ Other: ███░░░░░░░░░░░░░░░░  10 docs                    │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ Recent Activity (Last 30 Days):                        │
│                                                         │
│ 📄 8 new documents added                               │
│ ✏️ 15 documents updated                                │
│ 🔍 3 conflicts resolved                                │
│ ✅ 142 expert reviews completed                        │
│ 🤖 1,247 AI queries using this knowledge base          │
│                                                         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                                         │
│ AI Performance Metrics:                                 │
│                                                         │
│ Query Success Rate: 94%                                │
│ Average Confidence Score: 87%                          │
│ User Satisfaction (thumbs up): 91%                     │
│ Escalations to Human: 6%                               │
│                                                         │
│ Top Queried Topics:                                     │
│ 1. EMTL calculations (234 queries)                     │
│ 2. PIT brackets (189 queries)                          │
│ 3. VAT on digital services (156 queries)               │
│ 4. CGT on crypto (98 queries)                          │
│ 5. Small company exemptions (87 queries)               │
│                                                         │
│ [View Full Report] [Export Data] [Schedule Report]    │
└─────────────────────────────────────────────────────────┘
```

### B. Regulatory Change Timeline

```
┌─────────────────────────────────────────────────────────┐
│ 📅 REGULATORY CHANGE TIMELINE                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [2024] [2025] [2026 ▼] [All Time]                     │
│                                                         │
│ January 2026                                            │
│ ├─ Jan 1: Nigeria Tax Act 2025 takes effect 🔴       │
│ │         • PIT brackets changed                        │
│ │         • Small company threshold raised              │
│ │         • CGT rate increased                          │
│ │         Impact: 45,000 users                          │
│ │                                                       │
│ ├─ Jan 1: CBN EMTL Guidelines updated                  │
│ │         • Clarified exemptions                        │
│ │         Impact: 12,000 users                          │
│ │                                                       │
│ └─ Jan 15: NRS Practice Note on Crypto (expected)      │
│            Status: Pending publication                  │
│                                                         │
│ December 2025                                           │
│ ├─ Dec 15: SEC Digital Asset Guidelines               │
│ └─ Dec 1: CAC Registration Fee Update                  │
│                                                         │
│ November 2025                                           │
│ └─ Nov 1: JRB Revenue Sharing Formula                  │
│                                                         │
│ [View Earlier] [Export Timeline]                       │
└─────────────────────────────────────────────────────────┘
```

---

## IX. SECURITY & COMPLIANCE

### A. Access Control

```sql
-- Role-based access control
CREATE TYPE admin_role AS ENUM (
  'super_admin',
  'compliance_manager',
  'tax_expert',
  'content_reviewer',
  'readonly_analyst'
);

CREATE TABLE admin_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  role admin_role NOT NULL,
  regulatory_bodies TEXT[], -- Which bodies they can manage
  permissions JSONB, -- Granular permissions
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policy: Users can only access documents for their assigned bodies
CREATE POLICY "Admins access assigned regulatory bodies"
ON legal_documents FOR ALL
USING (
  regulatory_body_id IN (
    SELECT UNNEST(regulatory_bodies)
    FROM admin_users
    WHERE id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM admin_users
    WHERE id = auth.uid() AND role = 'super_admin'
  )
);
```

### B. Audit Trail

```sql
-- Comprehensive audit logging
CREATE TABLE compliance_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Who
  user_id UUID REFERENCES auth.users(id),
  user_role admin_role,
  
  -- What
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'approve', 'reject', 'publish'
  entity_type TEXT NOT NULL, -- 'document', 'provision', 'rule', 'relationship'
  entity_id UUID NOT NULL,
  
  -- Details
  old_value JSONB,
  new_value JSONB,
  changes JSONB, -- Structured diff
  
  -- Context
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON compliance_audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON compliance_audit_log(entity_type, entity_id);
```

---

## X. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1-2)
- ✅ Set up database schema
- ✅ Build basic admin UI (list, upload, view)
- ✅ Implement document storage (Supabase Storage)
- ✅ Create regulatory body management

### Phase 2: AI Integration (Week 3-4)
- ✅ Implement text extraction pipeline
- ✅ Build Claude-powered structuring
- ✅ Create embeddings generation
- ✅ Set up vector search (pgvector)
- ✅ Build RAG query system

### Phase 3: Compliance Rules (Week 5-6)
- ✅ Implement provision extraction
- ✅ Build rule engine
- ✅ Create test framework
- ✅ Implement conflict detection

### Phase 4: Automation (Week 7-8)
- ✅ Build web scrapers
- ✅ Create notification system
- ✅ Implement auto-download
- ✅ Set up cron jobs

### Phase 5: Quality & Review (Week 9-10)
- ✅ Build expert review interface
- ✅ Implement version control
- ✅ Create impact assessment
- ✅ Set up user notifications

### Phase 6: Analytics & Monitoring (Week 11-12)
- ✅ Build admin analytics dashboard
- ✅ Create compliance metrics
- ✅ Implement audit logging
- ✅ Set up alerts and monitoring

---

## XI. SUCCESS METRICS

### A. System Health Metrics
- **Coverage**: % of known regulations in system (Target: >95%)
- **Recency**: Average age of active documents (Target: <6 months)
- **Completeness**: % of documents with all metadata (Target: >90%)
- **Conflict Rate**: # unresolved conflicts (Target: <5)
- **Review Backlog**: # documents pending review (Target: <20)

### B. AI Performance Metrics
- **Query Success Rate**: % queries answered satisfactorily (Target: >90%)
- **Confidence Score**: Average AI confidence (Target: >85%)
- **User Satisfaction**: Thumbs up rate (Target: >85%)
- **Hallucination Rate**: % incorrect legal citations (Target: <2%)
- **Escalation Rate**: % queries requiring human expert (Target: <10%)

### C. Operational Metrics
- **Time to Publish**: Days from detection to activation (Target: <7 days)
- **Expert Review Time**: Hours per document (Target: <4 hours)
- **Scraper Success Rate**: % successful automated checks (Target: >95%)
- **User Impact Response**: % affected users notified within 24hrs (Target: >90%)

---

## XII. COST ESTIMATION

### Monthly Operational Costs:

**AI & Processing:**
- OpenAI Embeddings: ~$50-100/month (depends on volume)
- Claude API (RAG queries): ~$200-500/month (depends on users)
- Document OCR: ~$20-50/month

**Infrastructure:**
- Supabase (Pro plan): $25/month
- Storage (documents): ~$10-20/month
- Monitoring tools: ~$30/month

**Human Resources:**
- Compliance Manager (part-time): $1,500/month
- Tax Expert Reviews (contract): $500-1,000/month

**Total: ~$2,335-2,725/month** (scales with user base)

---

## XIII. LEGAL DISCLAIMER SYSTEM

```typescript
// Every AI response must include disclaimer
const LEGAL_DISCLAIMER = `
⚠️ **Important Legal Disclaimer**

This information is based on our interpretation of Nigerian tax laws as of ${new Date().toISOString().split('T')[0]}. Tax laws are complex and subject to change.

This is NOT legal or professional tax advice. For specific situations:
• Consult a qualified Nigerian tax professional
• Contact the Nigeria Revenue Service (NRS) directly
• Seek legal counsel for complex matters

PRISM and its operators are not liable for decisions made based on this information.
`;

// Require explicit user acknowledgment for high-stakes queries
async function requireDisclaimerAcknowledgment(userId: string, queryType: string) {
  if (['tax_filing', 'penalty_dispute', 'large_transaction'].includes(queryType)) {
    const acknowledged = await checkAcknowledgment(userId, 'legal_disclaimer');
    
    if (!acknowledged) {
      return {
        requireAcknowledgment: true,
        message: `${LEGAL_DISCLAIMER}

Do you understand and agree to these terms?`,
        buttons: [
          { text: 'I Understand & Agree', callback_data: 'accept_disclaimer' },
          { text: 'Cancel', callback_data: 'cancel' }
        ]
      };
    }
  }
  
  return { requireAcknowledgment: false };
}
```

---

## CONCLUSION

This Compliance Knowledge Management System transforms your initial concept from a **simple document repository** into a **sophisticated, AI-powered regulatory intelligence platform**.

### Key Improvements Over Original Idea:

1. **✅ Technical Clarity**: Explicit RAG architecture, not vague "ML feeding"
2. **✅ Automation**: Web scrapers + notifications reduce human bottleneck
3. **✅ Structure**: Provisions → Rules → Tests pipeline ensures accuracy
4. **✅ Versioning**: Temporal system handles complex regulatory timelines
5. **✅ Relationships**: Knowledge graph approach connects regulations
6. **✅ Validation**: Automated testing prevents bad advice
7. **✅ Legal Protection**: Disclaimers + expert review reduce liability
8. **✅ User Impact**: Proactive notifications keep users informed
9. **✅ Quality Metrics**: Measurable targets for system health
10. **✅ Scalability**: Designed for growth from 100 to 100,000 users

### Critical Success Factors:

- ⚡ **Hire a Compliance Manager** - Someone monitors regulatory changes daily
- 👨‍⚖️ **Retain Tax Experts** - For complex document review (contract basis)
- 🤖 **Invest in AI Infrastructure** - RAG is not optional, it's foundational
- 📊 **Monitor Metrics Religiously** - Track hallucinations, conflicts, user satisfaction
- ⚖️ **Legal Review** - Have a lawyer review your disclaimer language

This is no longer just a "compliance menu" - it's a **competitive moat** that most tax software companies don't have!