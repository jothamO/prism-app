/**
 * Enhanced POC: Bank Statement Processor with User Correction Feedback
 * 
 * This script demonstrates how the system learns from user corrections
 * and re-classifies transactions with improved accuracy.
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

interface UserCorrection {
    transaction: string;
    originalCategory: string;
    correctedCategory: string;
    userExplanation: string;
}

/**
 * Re-classify transactions with user corrections as context
 */
async function reclassifyWithCorrections(
    transactions: Transaction[],
    userCorrections: UserCorrection[],
    userContext: { entity_type: string; business_name?: string }
): Promise<ClassifiedTransaction[]> {

    console.log(`\n🔄 Re-classifying with ${userCorrections.length} user corrections...\n`);

    // Build enhanced prompt with user corrections
    const correctionsContext = userCorrections.map(c => `
- "${c.transaction}": User corrected from ${c.originalCategory} to ${c.correctedCategory}
  Reason: ${c.userExplanation}
`).join('\n');

    const prompt = `
You are analyzing a Nigerian bank statement for tax purposes.

User Context:
- Entity Type: ${userContext.entity_type}
- Business: ${userContext.business_name || 'Self-employed individual (SchoolRanker Technologies)'}
- Business Stage: Startup (registered October 2025)
- Business Activity: Software development (SchoolRanker platform)

IMPORTANT USER CORRECTIONS FROM PREVIOUS ANALYSIS:
${correctionsContext}

Based on these corrections, I've learned:
1. Payments from family members (mother) for business support → BUSINESS_SALE (even if described as "FOR WORK")
2. Payments from non-executive directors for startup support → BUSINESS_SALE (capital injection)
3. Payments to religious organizations → PERSONAL_EXPENSE (not business)
4. BUYPOWER payments to personal names → PERSONAL_EXPENSE (home utilities)
5. Payments to friends/family via OPAY → PERSONAL_GIFT (not business)
6. Software subscriptions (Lovable, OpenAI, Canva) → BUSINESS_EXPENSE (for SchoolRanker development)

Tax Act 2025 Rules:
1. Business income (sales, services, capital injections) → VAT applicable (7.5%)
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
  "reasoning": "Brief explanation incorporating user's context (max 60 chars)",
  "vatApplicable": true/false,
  "vatAmount": number (if applicable, calculate as amount * 0.075 / 1.075 for inclusive pricing),
  "confidence": 0.0-1.0,
  "action": "AUTO_INCLUDE | AUTO_EXCLUDE | ASK_USER",
  "userPrompt": "Question to ask user (if action is ASK_USER, otherwise null)"
}

Apply the user's corrections to similar transactions. Be consistent with their business model.

Respond with JSON array of ${transactions.length} classifications.
`;

    const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16000,
        temperature: 0.2,
        system: 'You are a Nigerian tax expert who learns from user corrections. Respond ONLY with valid JSON array. No markdown, no explanations.',
        messages: [{ role: 'user', content: prompt }]
    });

    const responseText = response.content[0].text;
    const jsonText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const classifications = JSON.parse(jsonText);

    return transactions.map((txn, i) => ({
        ...txn,
        ...classifications[i]
    }));
}

/**
 * Calculate VAT with corrected classifications
 */
function calculateVAT(transactions: ClassifiedTransaction[]): any {
    const businessIncome = transactions
        .filter(t => t.credit && t.category === 'BUSINESS_SALE')
        .reduce((sum, t) => sum + (t.credit || 0), 0);

    const outputVAT = businessIncome - (businessIncome / 1.075);

    const businessExpenses = transactions
        .filter(t => t.debit && t.category === 'BUSINESS_EXPENSE' && t.vatApplicable)
        .reduce((sum, t) => sum + (t.debit || 0), 0);

    const inputVAT = businessExpenses - (businessExpenses / 1.075);
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
 * Main test function
 */
async function main() {
    console.log('🧪 PRISM Bank Statement Processor - User Correction Test\n');
    console.log('Testing how system learns from user feedback...\n');

    try {
        if (!process.env.ANTHROPIC_API_KEY) {
            console.error('❌ Error: ANTHROPIC_API_KEY environment variable not set');
            process.exit(1);
        }

        // Sample transactions
        const transactions: Transaction[] = [
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

        // User corrections based on your feedback
        const userCorrections: UserCorrection[] = [
            {
                transaction: 'JOHN, DAVID CHUKWUKA - FOR SCHOOL RANKER',
                originalCategory: 'BUSINESS_SALE',
                correctedCategory: 'BUSINESS_SALE',
                userExplanation: 'Support from non-executive director for building SchoolRanker (capital injection, not revenue)'
            },
            {
                transaction: 'OBAJENIHI FAITH,DELE',
                originalCategory: 'BUSINESS_SALE',
                correctedCategory: 'PERSONAL_EXPENSE',
                userExplanation: 'Payment for electricity bill for religious house (not business)'
            },
            {
                transaction: 'OSSAI SUSANNA NGOZI - FOR WORK',
                originalCategory: 'BUSINESS_SALE',
                correctedCategory: 'BUSINESS_SALE',
                userExplanation: 'Support from mother for SchoolRanker, used to purchase Lovable credits (business capital)'
            },
            {
                transaction: 'LOVABLE DOVER US',
                originalCategory: 'BUSINESS_EXPENSE',
                correctedCategory: 'BUSINESS_EXPENSE',
                userExplanation: 'Software subscription for building SchoolRanker (confirmed business use)'
            },
            {
                transaction: 'OPENAI SAN FRANCISCO US',
                originalCategory: 'BUSINESS_EXPENSE',
                correctedCategory: 'BUSINESS_EXPENSE',
                userExplanation: 'API subscription for SchoolRanker (confirmed business use)'
            },
            {
                transaction: 'CANVA',
                originalCategory: 'BUSINESS_EXPENSE',
                correctedCategory: 'BUSINESS_EXPENSE',
                userExplanation: 'Design software for SchoolRanker (confirmed business use)'
            },
            {
                transaction: 'BUYPOWER-CAROLINE ENUNEKU',
                originalCategory: 'BUSINESS_EXPENSE',
                correctedCategory: 'PERSONAL_EXPENSE',
                userExplanation: 'Home electricity purchase (not business premises)'
            },
            {
                transaction: 'FAITH ODIMMACHUKWU (OPAY)',
                originalCategory: 'BUSINESS_EXPENSE',
                correctedCategory: 'PERSONAL_GIFT',
                userExplanation: 'Gift to friend (not business expense)'
            }
        ];

        const userContext = {
            entity_type: 'self_employed',
            business_name: 'SchoolRanker Technologies (Startup, registered Oct 2025)'
        };

        // Re-classify with corrections
        const reclassified = await reclassifyWithCorrections(transactions, userCorrections, userContext);
        console.log(`✅ Re-classified ${reclassified.length} transactions with user feedback\n`);

        // Calculate VAT
        const vatCalculation = calculateVAT(reclassified);
        console.log(`✅ VAT calculation complete\n`);

        // Display results
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 CORRECTED ANALYSIS (After User Feedback)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log('INCOME (Credits):');
        reclassified.filter(t => t.credit).forEach(t => {
            const icon = t.category === 'BUSINESS_SALE' ? '✅' : '❌';
            console.log(`${icon} ${t.description}: ₦${t.credit?.toLocaleString()}`);
            console.log(`   → ${t.category} (${(t.confidence * 100).toFixed(0)}% confidence)`);
            console.log(`   → ${t.reasoning}\n`);
        });

        console.log('\nEXPENSES (Debits):');
        reclassified.filter(t => t.debit).forEach(t => {
            const icon = t.category === 'BUSINESS_EXPENSE' ? '✅' : '❌';
            console.log(`${icon} ${t.description}: ₦${t.debit?.toLocaleString()}`);
            console.log(`   → ${t.category} (${(t.confidence * 100).toFixed(0)}% confidence)`);
            console.log(`   → ${t.reasoning}\n`);
        });

        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('💰 CORRECTED VAT CALCULATION');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        console.log(`Business Income: ₦${vatCalculation.businessIncome.toLocaleString()}`);
        console.log(`  └─ Subtotal: ₦${(vatCalculation.businessIncome / 1.075).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  └─ Output VAT: ₦${vatCalculation.outputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`);

        console.log(`Business Expenses: ₦${vatCalculation.businessExpenses.toLocaleString()}`);
        console.log(`  └─ Input VAT: ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`);

        console.log(`NET VAT PAYABLE: ₦${vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`You saved ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })} by claiming input VAT! 🎉\n`);

        // Comparison
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 BEFORE vs AFTER USER CORRECTIONS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Load original results
        const originalPath = path.join(__dirname, 'ignore', 'PRISM_POC_Results.json');
        const originalResults = JSON.parse(fs.readFileSync(originalPath, 'utf-8'));

        console.log('BEFORE (Initial Classification):');
        console.log(`  Business Income: ₦${originalResults.vatCalculation.businessIncome.toLocaleString()}`);
        console.log(`  Output VAT: ₦${originalResults.vatCalculation.outputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  Input VAT: ₦${originalResults.vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  Net VAT: ₦${originalResults.vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`);

        console.log('AFTER (With User Corrections):');
        console.log(`  Business Income: ₦${vatCalculation.businessIncome.toLocaleString()}`);
        console.log(`  Output VAT: ₦${vatCalculation.outputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  Input VAT: ₦${vatCalculation.inputVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`);
        console.log(`  Net VAT: ₦${vatCalculation.netVAT.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`);

        const incomeDiff = vatCalculation.businessIncome - originalResults.vatCalculation.businessIncome;
        const vatDiff = vatCalculation.netVAT - originalResults.vatCalculation.netVAT;

        console.log('CHANGES:');
        console.log(`  Business Income: ${incomeDiff >= 0 ? '+' : ''}₦${incomeDiff.toLocaleString()}`);
        console.log(`  Net VAT: ${vatDiff >= 0 ? '+' : ''}₦${vatDiff.toLocaleString('en-NG', { maximumFractionDigits: 2 })}\n`);

        // Save corrected results
        const correctedPath = path.join(__dirname, 'ignore', 'PRISM_POC_Corrected_Results.json');
        fs.writeFileSync(correctedPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            userCorrections,
            transactions: reclassified,
            vatCalculation,
            summary: {
                totalTransactions: reclassified.length,
                autoClassified: reclassified.filter(t => t.action !== 'ASK_USER').length,
                needsConfirmation: reclassified.filter(t => t.action === 'ASK_USER').length,
                averageConfidence: reclassified.reduce((sum, t) => sum + t.confidence, 0) / reclassified.length
            }
        }, null, 2));

        console.log(`\n💾 Corrected results saved to: ${correctedPath}\n`);
        console.log('✅ User Correction Test Complete!\n');

    } catch (error) {
        console.error('\n❌ Error during processing:', error);
        if (error instanceof Error) {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
}

// Run the test
main();
