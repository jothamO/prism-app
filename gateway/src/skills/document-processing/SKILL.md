# Document Processing Skill

## Purpose
Automatically extract, classify, and analyze bank statements for Nigerian tax compliance.

## Capabilities

- **Extract transactions** from PDF/image bank statements
- **Classify transactions** using business patterns + AI
- **Detect Nigerian features**: USSD, OPay, PalmPay, POS, foreign currency
- **Flag compliance issues**: Section 191, mixed accounts, thresholds
- **Learn from corrections**: Build business-specific patterns
- **Generate insights**: Tax savings, spending patterns, anomalies

## Architecture

```
Document Upload (PDF/Image)
    ↓
Extract Transactions (Claude Haiku 4.5)
    ↓
For Each Transaction:
    ├─ Check Business Patterns (instant, free, learned)
    ├─ Apply Rule-Based Classifier (Nigerian-specific)
    └─ AI Classifier if needed (Claude Haiku 4.5)
    ↓
Apply Nigerian Detectors:
    ├─ USSD detection (*737*, *966*, etc.)
    ├─ Mobile Money (OPay, PalmPay, Moniepoint)
    ├─ POS terminals
    └─ Foreign currency
    ↓
Compliance Checks:
    ├─ Section 191 (related party > ₦5M)
    ├─ Mixed account (personal vs business)
    ├─ VAT threshold proximity
    └─ Foreign currency reporting
    ↓
User Review (if confidence < 85% or compliance flags)
    ↓
User Corrections → Learn Patterns → Improve Future Classifications
```

## Integration Points

### Inputs
- Bank statement PDF/image from Telegram/WhatsApp/Web
- User ID + Business ID for personalization
- Existing business patterns from `business_classification_patterns` table

### Outputs
- Classified transactions in `bank_transactions` table
- Summary message to user via bot
- Insights for Tax Savings Advisor
- Compliance alerts to Compliance Alerts skill

### ML Pipeline
```typescript
// Feeds into existing PRISM ML system
await feedbackCollectionService.recordCorrection({
  userId,
  businessId,
  entityType: 'bank_transaction',
  entityId: transaction.id,
  aiPrediction: { classification: 'sale', confidence: 0.75 },
  userCorrection: { classification: 'personal' }
});

// Updates business patterns
await businessPatternService.updatePattern({
  businessId,
  pattern: "transfer to chidi",
  category: "personal",
  confidence: 0.95
});
```

## Nigerian-Specific Features

### 1. USSD Detection
```typescript
const USSD_PATTERNS = [
  /\*\d{3}\*\d+/,           // *737*500
  /ussd/i,
  /quick ?transfer/i,
  /mobile ?transfer/i
];

// Common Nigerian USSD codes:
// *737# - GTBank
// *966# - Zenith
// *894# - First Bank
// *919# - Access Bank
```

### 2. Mobile Money Providers
```typescript
const MOBILE_MONEY = {
  opay: /opay/i,
  palmpay: /palmp(a|)y/i,
  moniepoint: /moniepoint/i,
  kuda: /kuda/i,
  paga: /paga/i,
  carbon: /carbon/i
};
```

### 3. POS Terminal Detection
```typescript
const POS_PATTERNS = [
  /pos( ?terminal)?/i,
  /payment ?terminal/i,
  /card ?payment/i,
  /\bpos\b/i
];
```

### 4. Common Nigerian Bank Codes
```typescript
const NIGERIAN_BANKS = {
  'GTB': 'Guaranty Trust Bank',
  'ZENITH': 'Zenith Bank',
  'ACCESS': 'Access Bank',
  'FIRST': 'First Bank',
  'UBA': 'United Bank for Africa',
  'FCMB': 'First City Monument Bank',
  'FIDELITY': 'Fidelity Bank',
  'UNION': 'Union Bank',
  'STERLING': 'Sterling Bank',
  'STANBIC': 'Stanbic IBTC',
  'WEMA': 'Wema Bank',
  'POLARIS': 'Polaris Bank'
};
```

## Classification Logic

### Tier 1: Business Patterns (Fastest, Most Accurate)
```typescript
// Check if user has learned this pattern before
const pattern = await findBusinessPattern(businessId, description);

if (pattern && pattern.confidence > 0.85) {
  return {
    classification: pattern.category,
    confidence: pattern.confidence,
    source: 'business_pattern'
  };
}
```

### Tier 2: Rule-Based (Nigerian-Specific)
```typescript
// Salary
if (description.match(/salary|wages|pay ?roll/i)) {
  return { classification: 'salary', confidence: 0.95, source: 'rule_based' };
}

// ATM withdrawal (personal)
if (description.match(/atm|cash ?withdrawal/i)) {
  return { classification: 'personal', confidence: 0.90, source: 'rule_based' };
}

// POS payment (likely sale)
if (description.match(/pos|payment ?terminal/i) && txn.credit > 0) {
  return { classification: 'sale', confidence: 0.85, source: 'rule_based' };
}

// BUYPOWER (electricity - need user input on business vs personal)
if (description.match(/buypower|ekedc|ikedc|phed/i)) {
  return { 
    classification: 'utility', 
    confidence: 0.70, 
    source: 'rule_based',
    requiresUserInput: true,
    question: "Is this electricity for business or home?"
  };
}
```

### Tier 3: AI Classifier (Claude Haiku 4.5)
```typescript
const prompt = `
Classify this Nigerian bank transaction for VAT/tax purposes.

Transaction:
- Date: ${txn.date}
- Description: "${txn.description}"
- Amount: ₦${txn.amount.toLocaleString()}
- Type: ${txn.debit ? 'Debit' : 'Credit'}

Business Context: ${businessType} (${industry})

Classify as:
- "sale" - Customer payment (VAT output)
- "expense" - Business expense (VAT input)  
- "capital" - Investment/equipment (capital allowance)
- "loan" - Loan disbursement (no VAT)
- "personal" - Personal/family transfer (not business)
- "salary" - Staff salary (WHT applies)

Return JSON:
{
  "classification": "...",
  "confidence": 0.XX,
  "reasoning": "brief explanation",
  "needsConfirmation": true/false
}
`;

const result = await claude.messages.create({
  model: 'claude-3-5-haiku-20241022',
  max_tokens: 300,
  messages: [{ role: 'user', content: prompt }]
});
```

## Example Flow

### Input: Bank Statement PDF
```
GTBank Statement - December 2025
Account: 0123456789

DATE       | DESCRIPTION           | DEBIT    | CREDIT   | BALANCE
-----------|-----------------------|----------|----------|----------
01/12/2025 | Transfer to Chidi     | 50,000   |          | 450,000
05/12/2025 | POS TERMINAL PAYMENT  |          | 125,000  | 575,000
08/12/2025 | BUYPOWER 08012345678  | 15,000   |          | 560,000
12/12/2025 | Facebook Ads Payment  | 25,000   |          | 535,000
18/12/2025 | OPay Transfer: John   |          | 80,000   | 615,000
```

### Output: Classified Transactions
```json
{
  "statement": {
    "id": "stmt_123",
    "period": "2025-12",
    "totalTransactions": 5,
    "classified": 5
  },
  "transactions": [
    {
      "description": "Transfer to Chidi",
      "amount": 50000,
      "classification": "personal",
      "category": "family_support",
      "confidence": 0.95,
      "source": "business_pattern",
      "reasoning": "Recurring monthly transfer to 'Chidi' - learned as personal"
    },
    {
      "description": "POS TERMINAL PAYMENT",
      "amount": 125000,
      "classification": "sale",
      "category": "pos_sale",
      "confidence": 0.92,
      "source": "hybrid",
      "is_pos_transaction": true,
      "reasoning": "POS terminal credit = customer payment"
    },
    {
      "description": "BUYPOWER 08012345678",
      "amount": 15000,
      "classification": "expense",
      "category": "utilities_electricity",
      "confidence": 0.75,
      "source": "user",
      "user_reviewed": true,
      "reasoning": "User confirmed: shop electricity"
    },
    {
      "description": "Facebook Ads Payment",
      "amount": 25000,
      "classification": "expense",
      "category": "marketing_expense",
      "confidence": 0.98,
      "source": "business_pattern",
      "reasoning": "Recurring Facebook Ads = marketing expense"
    },
    {
      "description": "OPay Transfer: John",
      "amount": 80000,
      "classification": "sale",
      "category": "mobile_money_receipt",
      "confidence": 0.88,
      "source": "ai",
      "is_mobile_money": true,
      "mobile_money_provider": "OPay",
      "requires_user_confirmation": false,
      "reasoning": "OPay credit from customer name = business receipt"
    }
  ],
  "summary": {
    "sales": 205000,
    "expenses": 40000,
    "personal": 50000,
    "vatOutput": 15375,
    "vatInput": 3000,
    "needsReview": 0
  }
}
```

### User Message
```
✅ Statement Processed: December 2025

📊 Summary:
• 5 transactions analyzed
• Sales: ₦205,000 (POS + OPay)
• Expenses: ₦40,000 (Ads + Electricity)
• Personal: ₦50,000

💰 VAT Summary:
• Output VAT: ₦15,375
• Input VAT: ₦3,000
• Net VAT: ₦12,375

✨ Insights:
• BUYPOWER: Classified as business (shop electricity)
• OPay receipts: +36% this month
• Facebook Ads: Consistent ₦25K/month

All transactions matched learned patterns! 🎯

Need changes? Reply with transaction number.
```

## Compliance Flagging

```typescript
// Section 191 check (related party > ₦5M)
if (txn.description.match(/director|shareholder|family/i) && txn.amount > 5_000_000) {
  complianceFlags.push({
    type: 'section_191_risk',
    severity: 'high',
    message: 'Related party transaction > ₦5M requires FIRS pre-approval',
    action: 'Document relationship and business purpose'
  });
}

// Foreign currency
if (txn.description.match(/usd|gbp|eur|\$/i)) {
  complianceFlags.push({
    type: 'foreign_currency',
    severity: 'medium',
    message: 'Foreign currency transaction detected',
    action: 'Obtain CBN exchange rate for NGN conversion'
  });
}

// Mixed account (personal + business)
const personalTxns = await countPersonalTransactions(statement_id);
if (personalTxns > statement.total_transactions * 0.2) {
  complianceFlags.push({
    type: 'mixed_account',
    severity: 'low',
    message: '20%+ transactions are personal',
    action: 'Consider separating business and personal accounts'
  });
}
```

## Success Metrics

- **Extraction Accuracy**: 98%+ (transaction data from PDF)
- **Classification Accuracy**: 95%+ (after user corrections)
- **Learning Rate**: Pattern accuracy improves 10%+ per month
- **Processing Time**: < 60 seconds for 50-transaction statement
- **User Review Rate**: < 15% of transactions need user input

## API

### Endpoint: Process Document
```typescript
POST /document/process
{
  "userId": "user_123",
  "businessId": "biz_456",
  "platform": "telegram",
  "documentUrl": "https://...",
  "documentType": "bank_statement",
  "idempotencyKey": "telegram_user123_msg789"
}

Response:
{
  "jobId": "job_abc",
  "status": "queued",
  "message": "📄 Bank statement received! Processing...",
  "estimatedTime": 45
}
```

### Webhook: Job Complete
```typescript
// Sent to user via Telegram/WhatsApp
{
  "jobId": "job_abc",
  "status": "completed",
  "statementId": "stmt_123",
  "summary": {
    "transactions": 45,
    "classified": 40,
    "needsReview": 5,
    "sales": 2400000,
    "expenses": 850000,
    "accuracy": 0.89
  },
  "message": "✅ Statement analyzed! December 2025..."
}
```

## Configuration

```typescript
// gateway/src/skills/document-processing/config.ts
export const DOCUMENT_PROCESSING_CONFIG = {
  // Claude API
  claudeModel: 'claude-3-5-haiku-20241022',
  maxTokens: 5000,
  
  // Classification thresholds
  businessPatternThreshold: 0.85,
  ruleBasedThreshold: 0.75,
  aiThreshold: 0.75,
  
  // User review triggers
  lowConfidenceThreshold: 0.75,
  highValueThreshold: 1_000_000, // ₦1M - always confirm
  
  // Nigerian-specific
  defaultCurrency: 'NGN',
  section191Threshold: 5_000_000,
  vatRate: 0.075,
  
  // Processing limits
  maxTransactionsPerStatement: 500,
  maxFileSizeMB: 10,
  processingTimeoutSeconds: 120
};
```

## Status
- **Phase**: 2A (In Progress)
- **Dependencies**: Gateway deployed, Supabase tables created
- **Next**: Implement extraction and classification logic
