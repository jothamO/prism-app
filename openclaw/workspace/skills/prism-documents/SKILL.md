---
name: prism-documents
description: Bank statement and receipt processing
triggers:
  - upload
  - bank statement
  - receipt
  - document
  - pdf
  - statement
---

# Document Processing Skill

## When to Activate

- User uploads a file (PDF, image)
- User mentions bank statement or receipt
- User asks to analyze transactions

## Supported Documents

1. **Bank Statements** (PDF, CSV)
   - Extract transactions
   - Classify income vs expense
   - Detect patterns
   - Flag EMTL charges

2. **Receipts** (Image, PDF)
   - OCR extraction
   - Amount, vendor, date
   - Suggest category
   - VAT detection

## Process Flow

### Bank Statement
1. **Receive** document URL from context
2. **Call** statement processing (via Supabase function)
3. **Summarize** findings:
   - Total income
   - Total expenses
   - Transaction count
   - Top categories
   - Tax-relevant items

### Receipt
1. **Receive** image URL
2. **OCR** the receipt
3. **Extract** vendor, amount, date
4. **Classify** expense category
5. **Ask** user to confirm

## Response Format

### Bank Statement Processed
```
📊 *Statement Analysis Complete!*

Period: January 2026
Transactions: 47

💰 *Summary:*
- Income: ₦2,450,000
- Expenses: ₦876,500
- Net: ₦1,573,500

📈 *Top Income Sources:*
1. Client payments: ₦1,800,000
2. Transfers received: ₦650,000

📉 *Top Expenses:*
1. Supplier payments: ₦450,000
2. Utilities: ₦126,000
3. USSD/Bank charges: ₦12,500

🔍 *Tax-Relevant Findings:*
- EMTL charges detected: ₦350 (7 transfers ≥₦10K)
- VAT input credits: ₦45,000 (estimated)

Want me to classify any specific transactions?
```

### Receipt Processed
```
🧾 *Receipt Captured!*

I found:
- Vendor: Shoprite
- Amount: ₦45,670
- Date: Jan 28, 2026

Suggested category: *Groceries / Personal*

Is this a business expense or personal?
1️⃣ Business
2️⃣ Personal
```

## Error Handling

- File too large: "That file is too large. Try compressing it or uploading a smaller statement."
- Can't read: "I couldn't read this file. Is it a clear image or PDF?"
- Password protected: "This PDF is password-protected. Can you remove the password and try again?"
