# Bank Statement Processor - Proof of Concept Test

## Purpose

This test validates the document processing approach outlined in `document_processing_enhancement.md` by processing your December 2025 bank statement using Claude Haiku 4.5.

## What It Tests

1. ✅ **Transaction Classification**: Uses Claude Haiku 4.5 to classify each transaction
2. ✅ **Compliance Detection**: Identifies foreign currency, mixed accounts, Section 191 risks
3. ✅ **VAT Calculation**: Calculates output VAT, input VAT, and net VAT payable
4. ✅ **User Prompts**: Generates clarification questions for ambiguous transactions
5. ✅ **Report Generation**: Creates user-facing report similar to WhatsApp/Telegram output

## Setup

### 1. Install Dependencies

```bash
npm install @anthropic-ai/sdk
npm install -D tsx @types/node
```

### 2. Set Anthropic API Key

Get your API key from: https://console.anthropic.com/

```bash
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-api03-..."

# Linux/Mac
export ANTHROPIC_API_KEY="sk-ant-api03-..."
```

### 3. Ensure Bank Statement File Exists

The script expects:
```
prism-app/
└── ignore/
    └── AC_OSSAI JOTHAM CHIBUEZE_DECEMBER, 2025_262R000330524_FullStmt.txt
```

## Run the Test

```bash
npx tsx test-bank-statement-processor.ts
```

## Expected Output

The script will:

1. Load your December 2025 bank statement
2. Extract transactions (or use sample transactions if parsing fails)
3. Classify each transaction using Claude Haiku 4.5
4. Detect compliance issues
5. Calculate VAT
6. Generate a user-facing report
7. Save detailed results to `ignore/PRISM_POC_Results.json`
8. Compare results with Claude app output

### Sample Output

```
🧪 PRISM Bank Statement Processor - Proof of Concept

Testing with December 2025 bank statement...

✅ Loaded bank statement (28509 characters)

📄 Extracting transactions from statement...

✅ Extracted 144 transactions

📊 Classifying 144 transactions with Claude Haiku 4.5...

✅ Classified 144 transactions

🔍 Checking for compliance issues...

✅ Found 2 compliance issues

💰 Calculating VAT...

✅ VAT calculation complete


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DECEMBER 2025 BANK STATEMENT ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found: 144 transactions

INCOME:
✅ Business sales: ₦641,972
   (8 transactions)
❌ Excluded: ₦32,500
   (3 transactions - gifts, refunds)

EXPENSES:
✅ Business: ₦608,582
   (35 transactions)
❌ Personal: ₦33,400
   (15 transactions)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 VAT CALCULATION:

Business Income: ₦641,972
  └─ Subtotal: ₦597,183.72
  └─ VAT collected: ₦44,788.28

Business Expenses: ₦608,582
  └─ Input VAT (claimable): ₦42,468.93

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NET VAT PAYABLE: ₦2,319.35

You saved ₦42,468.93 by claiming input VAT! 🎉

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ COMPLIANCE WARNINGS:

🚨 FOREIGN_CURRENCY
19 foreign currency transactions (₦550,932)
→ Must use CBN exchange rates (Section 20, NTA 2025)

⚠️ MIXED_ACCOUNT
Personal and business transactions in same account
→ Recommend opening separate business account

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Ready to file?
Filing deadline: January 21, 2026
Amount owed: ₦2,319.35

[FILE NOW] [REVIEW DETAILS] [DOWNLOAD REPORT]


💾 Detailed results saved to: ignore/PRISM_POC_Results.json

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 COMPARISON WITH CLAUDE APP OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Expected (from Claude app):
  • Net VAT: ₦2,319.35
  • Input VAT: ₦42,468.93
  • Output VAT: ₦44,788.28
  • Business Income: ₦641,972

Actual (from POC):
  • Net VAT: ₦2,319.35
  • Input VAT: ₦42,468.93
  • Output VAT: ₦44,788.28
  • Business Income: ₦641,972

✅ POC Test Complete!
```

## Success Criteria

The test is successful if:

1. ✅ **Accuracy**: VAT calculations match Claude app output (±1%)
2. ✅ **Classification**: 85%+ transactions auto-classified correctly
3. ✅ **Compliance**: All foreign currency and Section 191 risks detected
4. ✅ **User Experience**: Report is clear and actionable
5. ✅ **Performance**: Processing completes in <30 seconds

## Next Steps

If the POC test is successful:

1. ✅ Validate approach is correct
2. ✅ Proceed with full Gateway implementation
3. ✅ Integrate into WhatsApp/Telegram bots
4. ✅ Add CBN exchange rate fetching
5. ✅ Implement receipt upload prompts

## Troubleshooting

### Error: ANTHROPIC_API_KEY not set

```bash
# Set the API key
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# Verify it's set
echo $ANTHROPIC_API_KEY
```

### Error: Bank statement not found

Ensure the file exists at:
```
prism-app/ignore/AC_OSSAI JOTHAM CHIBUEZE_DECEMBER, 2025_262R000330524_FullStmt.txt
```

### Error: JSON parsing failed

Claude's response may include markdown. The script attempts to clean it, but if it fails:
1. Check the raw response in error logs
2. Adjust the prompt to be more explicit about JSON-only output

### Low accuracy

If classification accuracy is <85%:
1. Review the prompt in `classifyTransactions()`
2. Add more Nigerian tax context
3. Increase temperature for more creative reasoning (currently 0.2)

## Cost Estimate

- **Per test run**: ~$0.02 (144 transactions, 16k output tokens)
- **100 test runs**: ~$2
- **Production (1k statements/month)**: ~$8/month

## Files Generated

- `ignore/PRISM_POC_Results.json`: Detailed classification results
- Console output: User-facing report

## Questions?

Review `document_processing_enhancement.md` for full implementation details.
