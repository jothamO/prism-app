/**
 * Proof of Concept: Bank Statement Processor using Claude Haiku 4.5
 * 
 * This script validates the approach outlined in document_processing_enhancement.md
 * by processing the December 2025 bank statement and comparing results with Claude app.
 * 
 * Usage:
 *   1. Set ANTHROPIC_API_KEY environment variable
 *   2. Run: npx tsx test-bank-statement-processor.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || ''
});

interface Transaction {
    date: string;
    description: string;
    credit?: number;
    debit?: number;
}

interface ClassifiedTransaction extends Transaction {
    category: string;
    reasoning: string;
    vatApplicable: boolean;
    vatAmount?: number;
    confidence: number;
    action: 'AUTO_INCLUDE' | 'AUTO_EXCLUDE' | 'ASK_USER';
    userPrompt?: string;
}

interface ComplianceIssue {
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    type: string;
    description: string;
    transactions?: ClassifiedTransaction[];
    action: string;
    userPrompt?: string;
}

interface VATCalculation {
    businessIncome: number;
    outputVAT: number;
    businessExpenses: number;
    inputVAT: number;
    netVAT: number;
}

/**
 * Extract transactions from bank statement text file
 */
function extractTransactionsFromText(textContent: string): Transaction[] {
    const transactions: Transaction[] = [];

    // This is a simplified parser - in production, use proper PDF parsing
    // For now, we'll manually create the transaction list from the statement

    // Parse the text content to extract transactions
    // Format expected: Date | Description | Debit | Credit | Balance
    const lines = textContent.split('\n');

    for (const line of lines) {
        // Skip headers and empty lines
        if (!line.trim() || line.includes('Date') || line.includes('---')) {
            continue;
        }

        // Simple regex to match transaction lines
        // This would need to be more robust for production
        const match = line.match(/(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)?/);

        if (match) {
            const [, date, description, amount1, amount2] = match;

            transactions.push({
                date,
                description: description.trim(),
                debit: amount2 ? parseFloat(amount1.replace(/,/g, '')) : undefined,
                credit: amount2 ? parseFloat(amount2.replace(/,/g, '')) : parseFloat(amount1.replace(/,/g, ''))
            });
        }
    }

    return transactions;
}

/**
 * Classify transactions using Claude Haiku 4.5
 */
async function classifyTransactions(
    transactions: Transaction[],
    userContext: { entity_type: string; business_name?: string }
): Promise<ClassifiedTransaction[]> {

    console.log(`\n📊 Classifying ${transactions.length} transactions with Claude Haiku 4.5...\n`);

    const prompt = `
You are analyzing a Nigerian bank statement for tax purposes.

User Context:
- Entity Type: ${userContext.entity_type}
- Business: ${userContext.business_name || 'Self-employed individual (SchoolRanker Technologies)'}

Tax Act 2025 Rules:
1. Business income (sales, services) → VAT applicable (7.5%)
2. Personal transfers, gifts → NOT taxable
3. Refunds → NOT new income
4. Foreign currency expenses → Use CBN exchange rates
5. Section 191: Artificial transactions (personal expenses claimed as business) → Prohibited

Transactions to classify (${transactions.length} total):

${transactions.map((t, i) => `
${i + 1}. Date: ${t.date}
   ${t.credit ? `CREDIT: ₦${t.credit.toLocaleString()}` : `DEBIT: ₦${t.debit?.toLocaleString()}`}
   Description: ${t.description}
`).join('\n')}

For EACH transaction, provide:
{
  "category": "BUSINESS_SALE | PERSONAL_GIFT | REFUND | BANK_CHARGE | BUSINESS_EXPENSE | PERSONAL_EXPENSE | INTERNAL_TRANSFER",
  "reasoning": "Brief explanation (max 50 chars)",
  "vatApplicable": true/false,
  "vatAmount": number (if applicable, calculate as amount * 0.075 / 1.075 for inclusive pricing),
  "confidence": 0.0-1.0,
  "action": "AUTO_INCLUDE | AUTO_EXCLUDE | ASK_USER",
  "userPrompt": "Question to ask user (if action is ASK_USER, otherwise null)"
}

CRITICAL: Analyze patterns across ALL transactions. For example:
- Multiple payments from same person → Likely business client
- Payments via Paystack/Flutterwave → Almost always business
- Narration says "GIFT" → Personal, exclude
- Airtime purchases → Usually personal
- Software subscriptions (Lovable, OpenAI, Canva) → Business if user is developer
- "FOR SCHOOL RANKER" → Business payment
- "BUYPOWER" → Could be business utilities (ask user)

Respond with JSON array of ${transactions.length} classifications.
`;

    const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // Current Claude Haiku model
        max_tokens: 16000,
        temperature: 0.2,
        system: 'You are a Nigerian tax expert. Respond ONLY with valid JSON array. No markdown, no explanations.',
        messages: [{ role: 'user', content: prompt }]
    });

    const responseText = response.content[0].text;

    // Remove markdown code blocks if present
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const classifications = JSON.parse(jsonText);

    return transactions.map((txn, i) => ({
        ...txn,
        ...classifications[i]
    }));
}

/**
 * Detect compliance issues
 */
async function detectComplianceIssues(
    transactions: ClassifiedTransaction[]
): Promise<ComplianceIssue[]> {

    console.log('\n🔍 Checking for compliance issues...\n');

    const issues: ComplianceIssue[] = [];

    // Check for foreign currency
    const foreignTxns = transactions.filter(t =>
        t.description.match(/LOVABLE|OPENAI|CANVA|USD|EUR|GBP|DOVER US|SAN FRANCISCO US/i)
    );

    if (foreignTxns.length > 0) {
        const totalForeign = foreignTxns.reduce((sum, t) => sum + (t.debit || 0), 0);
        issues.push({
            severity: 'HIGH',
            type: 'FOREIGN_CURRENCY',
            description: `${foreignTxns.length} foreign currency transactions (₦${totalForeign.toLocaleString()})`,
            transactions: foreignTxns,
            action: 'Must use CBN exchange rates (Section 20, NTA 2025)',
            userPrompt: `
⚠️ Foreign Currency Detected

I found ${foreignTxns.length} transactions in foreign currency:
${foreignTxns.slice(0, 3).map(t => `• ${t.description}: ₦${t.debit?.toLocaleString()}`).join('\n')}
${foreignTxns.length > 3 ? `... and ${foreignTxns.length - 3} more` : ''}

Total: ₦${totalForeign.toLocaleString()}

I'll fetch CBN exchange rates for accurate VAT calculation.
Continue? Reply YES
      `
        });
    }

    // Check for mixed personal/business
    const personalTxns = transactions.filter(t => t.category === 'PERSONAL_EXPENSE');
    const businessTxns = transactions.filter(t => t.category === 'BUSINESS_EXPENSE');

    if (personalTxns.length > 0 && businessTxns.length > 0) {
        issues.push({
            severity: 'MEDIUM',
            type: 'MIXED_ACCOUNT',
            description: 'Personal and business transactions in same account',
            action: 'Recommend opening separate business account',
            userPrompt: `
⚠️ Mixed Account Detected

Your account has both:
• ${businessTxns.length} business expenses
• ${personalTxns.length} personal expenses

This makes tax filing complex. Consider opening a dedicated business account.

For now, I'll ask you to confirm ambiguous transactions.
      `
        });
    }

    // Check for Section 191 risks
    const suspiciousTxns = transactions.filter(t =>
        t.confidence < 0.7 && t.category === 'BUSINESS_EXPENSE'
    );

    if (suspiciousTxns.length > 0) {
        issues.push({
            severity: 'MEDIUM',
            type: 'SECTION_191_RISK',
            description: `${suspiciousTxns.length} transactions need clarification to avoid artificial transaction claims`,
            transactions: suspiciousTxns,
            action: 'User must confirm business purpose',
            userPrompt: `
⚠️ Compliance Check (Section 191)

${suspiciousTxns.length} transactions need clarification:
${suspiciousTxns.slice(0, 3).map(t => `• ${t.description}: ₦${t.debit?.toLocaleString()}`).join('\n')}

Please confirm these are legitimate business expenses.
      `
        });
    }

    return issues;
}

/**
 * Calculate VAT
 */
function calculateVAT(transactions: ClassifiedTransaction[]): VATCalculation {

    console.log('\n💰 Calculating VAT...\n');

    // Income (credits)
    const businessIncome = transactions
        .filter(t => t.credit && t.category === 'BUSINESS_SALE')
        .reduce((sum, t) => sum + (t.credit || 0), 0);

    // Output VAT (VAT-inclusive pricing)
    const outputVAT = businessIncome - (businessIncome / 1.075);

    // Expenses (debits)
    const businessExpenses = transactions
        .filter(t => t.debit && t.category === 'BUSINESS_EXPENSE' && t.vatApplicable)
        .reduce((sum, t) => sum + (t.debit || 0), 0);

    // Input VAT (claimable)
    const inputVAT = businessExpenses - (businessExpenses / 1.075);

    // Net VAT
    const netVAT = outputVAT - inputVAT;

    return {
        businessIncome,
        outputVAT,
        businessExpenses,
        inputVAT,
        netVAT
    };
}

/**
 * Generate user-facing report
 */
function generateReport(
    transactions: ClassifiedTransaction[],
    complianceIssues: ComplianceIssue[],
    vatCalculation: VATCalculation
): string {

    const businessSales = transactions.filter(t => t.category === 'BUSINESS_SALE');
    const personalExpenses = transactions.filter(t => t.category === 'PERSONAL_EXPENSE');
    const businessExpenses = transactions.filter(t => t.category === 'BUSINESS_EXPENSE');
    const needsConfirmation = transactions.filter(t => t.action === 'ASK_USER');
    const excluded = transactions.filter(t => t.action === 'AUTO_EXCLUDE');

    return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 DECEMBER 2025 BANK STATEMENT ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Found: ${transactions.length} transactions

INCOME:
✅ Business sales: ₦${businessSales.reduce((s, t) => s + (t.credit || 0), 0).toLocaleString()}
   (${businessSales.length} transactions)
${needsConfirmation.filter(t => t.credit).length > 0 ? `❓ Needs confirmation: ₦${needsConfirmation.filter(t => t.credit).reduce((s, t) => s + (t.credit || 0), 0).toLocaleString()}
   (${needsConfirmation.filter(t => t.credit).length} transactions)` : ''}
❌ Excluded: ₦${excluded.filter(t => t.credit).reduce((s, t) => s + (t.credit || 0), 0).toLocaleString()}
   (${excluded.filter(t => t.credit).length} transactions - gifts, refunds)

EXPENSES:
✅ Business: ₦${businessExpenses.reduce((s, t) => s + (t.debit || 0), 0).toLocaleString()}
   (${businessExpenses.length} transactions)
❌ Personal: ₦${personalExpenses.reduce((s, t) => s + (t.debit || 0), 0).toLocaleString()}
   (${personalExpenses.length} transactions)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 VAT CALCULATION:

Business Income: ₦${vatCalculation.businessIncome.toLocaleString()}
  └─ Subtotal: ₦${(vatCalculation.businessIncome / 1.075).toLocaleString('en-NG', { maximumFractionDigits: 2 })}
  └─ VAT collected: ₦${vatCalculation.outputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}

Business Expenses: ₦${vatCalculation.businessExpenses.toLocaleString()}
  └─ Input VAT (claimable): ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NET VAT PAYABLE: ₦${vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}

You saved ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })} by claiming input VAT! 🎉

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${complianceIssues.length > 0 ? `⚠️ COMPLIANCE WARNINGS:

${complianceIssues.map(issue => `
${issue.severity === 'HIGH' ? '🚨' : issue.severity === 'MEDIUM' ? '⚠️' : 'ℹ️'} ${issue.type}
${issue.description}
→ ${issue.action}
`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

${needsConfirmation.length > 0 ? `📋 TRANSACTIONS NEEDING CONFIRMATION (${needsConfirmation.length}):

${needsConfirmation.slice(0, 5).map(t => `
• ${t.date}: ${t.description}
  Amount: ₦${(t.credit || t.debit || 0).toLocaleString()}
  Reason: ${t.reasoning}
  ${t.userPrompt || ''}
`).join('\n')}
${needsConfirmation.length > 5 ? `\n... and ${needsConfirmation.length - 5} more` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}

Ready to file?
Filing deadline: January 21, 2026
Amount owed: ₦${vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}

[FILE NOW] [REVIEW DETAILS] [DOWNLOAD REPORT]
  `.trim();
}

/**
 * Main test function
 */
async function main() {
    console.log('🧪 PRISM Bank Statement Processor - Proof of Concept\n');
    console.log('Testing with December 2025 bank statement...\n');

    try {
        // Check for API key
        if (!process.env.ANTHROPIC_API_KEY) {
            console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
            console.log('\nSet it with: export ANTHROPIC_API_KEY=sk-ant-...');
            process.exit(1);
        }

        // Read bank statement text file
        const statementPath = path.join(__dirname, 'ignore', 'AC_OSSAI JOTHAM CHIBUEZE_DECEMBER, 2025_262R000330524_FullStmt.txt');

        if (!fs.existsSync(statementPath)) {
            console.error(`❌ Error: Bank statement not found at ${statementPath}`);
            console.log('\nPlease ensure the statement text file exists in the ignore/ directory');
            process.exit(1);
        }

        const statementText = fs.readFileSync(statementPath, 'utf-8');
        console.log(`✅ Loaded bank statement (${statementText.length} characters)\n`);

        // Extract transactions
        console.log('📄 Extracting transactions from statement...\n');
        const transactions = extractTransactionsFromText(statementText);
        console.log(`✅ Extracted ${transactions.length} transactions\n`);

        if (transactions.length === 0) {
            console.log('⚠️  No transactions found. Using manual transaction list from Claude output...\n');

            // For POC, we'll use a subset of transactions from the Claude output
            // In production, this would be properly parsed from the PDF
            const sampleTransactions: Transaction[] = [
                { date: '2025-12-04', description: 'JOHN, DAVID CHUKWUKA - FOR SCHOOL RANKER', credit: 300000 },
                { date: '2025-12-05', description: 'LOVABLE DOVER US', debit: 72650 },
                { date: '2025-12-08', description: 'OPENAI SAN FRANCISCO US', debit: 7844.04 },
                { date: '2025-12-12', description: 'OBAJENIHI FAITH,DELE', credit: 29000 },
                { date: '2025-12-15', description: 'ENUNEKU JONATHAN CHIDI (PROVIDUS) - GIFT', credit: 20000 },
                { date: '2025-12-17', description: 'Airtime Purchase VIA GTWORLD - DATA', debit: 18000 },
                { date: '2025-12-18', description: 'CANVA', debit: 3750 },
                { date: '2025-12-25', description: 'OSSAI SUSANNA NGOZI - FOR WORK', credit: 18000 },
                { date: '2025-12-11', description: 'BUYPOWER-CAROLINE ENUNEKU', debit: 1100 },
                { date: '2025-12-04', description: 'FAITH ODIMMACHUKWU (OPAY)', debit: 6000 }
            ];

            transactions.push(...sampleTransactions);
            console.log(`✅ Using ${transactions.length} sample transactions for testing\n`);
        }

        // User context
        const userContext = {
            entity_type: 'self_employed',
            business_name: 'SchoolRanker Technologies'
        };

        // Classify transactions
        const classified = await classifyTransactions(transactions, userContext);
        console.log(`✅ Classified ${classified.length} transactions\n`);

        // Detect compliance issues
        const complianceIssues = await detectComplianceIssues(classified);
        console.log(`✅ Found ${complianceIssues.length} compliance issues\n`);

        // Calculate VAT
        const vatCalculation = calculateVAT(classified);
        console.log(`✅ VAT calculation complete\n`);

        // Generate report
        const report = generateReport(classified, complianceIssues, vatCalculation);

        // Display report
        console.log('\n' + report + '\n');

        // Save detailed results
        const resultsPath = path.join(__dirname, 'ignore', 'PRISM_POC_Results.json');
        const results = {
            timestamp: new Date().toISOString(),
            transactions: classified,
            complianceIssues,
            vatCalculation,
            summary: {
                totalTransactions: classified.length,
                autoClassified: classified.filter(t => t.action !== 'ASK_USER').length,
                needsConfirmation: classified.filter(t => t.action === 'ASK_USER').length,
                averageConfidence: classified.reduce((sum, t) => sum + t.confidence, 0) / classified.length
            }
        };

        fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
        console.log(`\n💾 Detailed results saved to: ${resultsPath}\n`);

        // Comparison with Claude app
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 COMPARISON WITH CLAUDE APP OUTPUT');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('Expected (from Claude app):');
        console.log('  • Net VAT: ₦2,319.35');
        console.log('  • Input VAT: ₦42,468.93');
        console.log('  • Output VAT: ₦44,788.28');
        console.log('  • Business Income: ₦641,972\n');

        console.log('Actual (from POC):');
        console.log(`  • Net VAT: ₦${vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  • Input VAT: ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  • Output VAT: ₦${vatCalculation.outputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  • Business Income: ₦${vatCalculation.businessIncome.toLocaleString()}\n`);

        console.log('✅ POC Test Complete!\n');

    } catch (error) {
        console.error('\n❌ Error during processing:', error);
        if (error instanceof Error) {
            console.error('Message:', error.message);
            console.error('Stack:', error.stack);
        }
        process.exit(1);
    }
}

// Run the test
main();
