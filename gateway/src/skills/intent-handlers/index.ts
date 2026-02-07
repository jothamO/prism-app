/**
 * Intent Handlers for NLU-Routed Messages
 * Handles intents detected by NLU that don't have dedicated skills
 */

import { logger } from '../../utils/logger';
import { PersonalityFormatter } from '../../utils/personality';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';
import type { NLUIntent } from '../../services/nlu.service';
import { getReliefs, getDeadlines, formatNaira, buildTaxRulesSummary } from '../../services/rules-fetcher';
import { getFactExtractor } from '../../services/conversation-fact-extractor';
import config from '../../config';
import { aiClient } from '../../utils/ai-client';

export interface IntentHandlerResult {
    message: string;
    buttons?: Array<Array<{ text: string; callback_data: string }>>;
    metadata?: Record<string, unknown>;
}

/**
 * Handle transaction summary intent
 */
export async function handleTransactionSummary(
    intent: NLUIntent,
    context: SessionContext
): Promise<IntentHandlerResult> {
    const period = intent.entities.period as string || 'current_month';
    const periodDisplay = formatPeriod(period);
    const userName = (context.metadata?.userName as string)?.split(' ')[0];

    // Nigerian-friendly message with personality
    const greeting = userName ? `${userName}, ` : '';

    return {
        message: `📊 *Transaction Summary - ${periodDisplay}*\n\n` +
            `${greeting}oya let's see what your money has been up to ${periodDisplay.toLowerCase()}! 💰\n\n` +
            `Upload a bank statement and I'll break down every kobo:\n` +
            `✅ Income vs expenses\n` +
            `✅ Tax-deductible items\n` +
            `✅ Potential savings\n\n` +
            `Just send me the file and I'll handle the rest!`,
        buttons: [[
            { text: '📤 Upload Statement', callback_data: 'upload_statement' },
            { text: '📅 Change Period', callback_data: 'change_period' }
        ]],
        metadata: { intent: 'get_transaction_summary', period, personality: true }
    };
}

/**
 * Handle tax relief info intent
 */
export async function handleTaxReliefInfo(
    intent: NLUIntent,
    context: SessionContext
): Promise<IntentHandlerResult> {
    const reliefType = intent.entities.relief_type as string;

    // Fetch reliefs from database
    const dbReliefs = await getReliefs();

    // Build relief info from database with fallback
    const reliefInfo: Record<string, { title: string; description: string; limit: string; reference: string; tip: string }> = {
        pension: {
            title: 'Pension Contribution Relief',
            description: 'Your pension contributions are tax-free! This is one of the best ways to reduce your tax bill.',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_PENSION')?.parameters?.label || 'Up to 8% of basic salary',
            reference: 'Section 69 NTA 2025',
            tip: '💡 Pro tip: Max out your pension contributions before year-end to save more!'
        },
        nhf: {
            title: 'National Housing Fund',
            description: 'NHF helps you save for housing AND reduce your taxes. Double win!',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_NHF')?.parameters?.label || '2.5% of basic salary',
            reference: 'NHF Act',
            tip: '💡 Your NHF contributions also make you eligible for housing loans at lower rates.'
        },
        nhis: {
            title: 'Health Insurance',
            description: 'Health insurance premiums reduce your taxable income. Stay healthy, pay less tax!',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_NHIS')?.parameters?.label || 'Actual contribution',
            reference: 'Section 71 NTA 2025',
            tip: '💡 Include family health coverage - those premiums count too!'
        },
        housing: {
            title: 'Housing/Rent Relief',
            description: 'If you pay rent and your employer doesn\'t provide housing, you get a relief.',
            limit: 'Up to 20% of earned income',
            reference: 'Section 70 NTA 2025',
            tip: '💡 Keep your rent receipts - you\'ll need them for verification.'
        },
        children: {
            title: 'Children Education Allowance',
            description: 'Got kids in school? You get a tax break for each child!',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_CHILDREN')?.parameters?.label || '₦2,500 per child (max 4)',
            reference: 'Section 68 NTA 2025',
            tip: '💡 This applies to children in approved educational institutions.'
        }
    };

    if (reliefType && reliefInfo[reliefType]) {
        const info = reliefInfo[reliefType];
        return {
            message: `💡 *${info.title}*\n\n` +
                `${info.description}\n\n` +
                `📊 *How much:* ${info.limit}\n` +
                `📖 *Legal backing:* ${info.reference}\n\n` +
                `${info.tip}\n\n` +
                `Want me to calculate your tax with this relief?`,
            buttons: [[
                { text: '🧮 Calculate Tax', callback_data: `calc_with_${reliefType}` },
                { text: '📋 Other Reliefs', callback_data: 'list_reliefs' }
            ]],
            metadata: { intent: 'get_tax_relief_info', reliefType, personality: true }
        };
    }

    // Build dynamic relief list from database
    const reliefsList = dbReliefs.map(r => {
        const emoji = r.rule_code.includes('PENSION') ? '👴' :
            r.rule_code.includes('NHF') ? '🏠' :
                r.rule_code.includes('NHIS') ? '🏥' :
                    r.rule_code.includes('CHILDREN') ? '📚' : '💰';
        return `${emoji} *${r.rule_name}* - ${r.parameters?.label || 'See details'}`;
    }).join('\n');

    // General relief overview with personality
    return {
        message: `💡 *Tax Reliefs You Can Claim*\n\n` +
            `Good news! The law allows several ways to reduce your tax. Here's what you might be missing:\n\n` +
            `🏦 *Consolidated Relief (CRA)*\n` +
            `Everyone gets this one! Higher of ₦200k or 1% of gross + 20% of gross\n\n` +
            `${reliefsList || '👴 *Pension* - 8% of basic (tax-free!)\n🏠 *NHF* - 2.5% for housing\n🏥 *Health* - Insurance premiums\n📚 *Children* - ₦2,500/child (max 4)\n🏡 *Rent* - Up to 20% of income'}\n\n` +
            `Tap any relief to learn more 👇`,
        buttons: [
            [
                { text: '👴 Pension', callback_data: 'relief_pension' },
                { text: '🏠 NHF', callback_data: 'relief_nhf' }
            ],
            [
                { text: '🏥 Health', callback_data: 'relief_nhis' },
                { text: '🏡 Rent', callback_data: 'relief_housing' }
            ]
        ],
        metadata: { intent: 'get_tax_relief_info', personality: true }
    };
}

/**
 * Handle set reminder intent
 */
export async function handleSetReminder(
    intent: NLUIntent,
    context: SessionContext
): Promise<IntentHandlerResult> {
    const reminderType = intent.entities.reminder_type as string;
    const taxType = intent.entities.tax_type as string;

    // Fetch deadlines from database
    const dbDeadlines = await getDeadlines();

    // Get upcoming deadlines
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate next VAT due from DB or fallback
    const vatDeadline = dbDeadlines.find(d => d.rule_code === 'DEADLINE_VAT');
    const vatDay = vatDeadline?.parameters?.day || 21;
    const nextVATDue = new Date(currentYear, currentMonth + 1, vatDay);
    const daysToVAT = Math.ceil((nextVATDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate PAYE deadline
    const payeDeadline = dbDeadlines.find(d => d.rule_code === 'DEADLINE_PAYE');
    const payeDay = payeDeadline?.parameters?.day || 10;

    // Calculate annual deadline
    const annualDeadline = dbDeadlines.find(d => d.rule_code === 'DEADLINE_ANNUAL');
    const annualMonth = annualDeadline?.parameters?.month || 3;
    const annualDay = annualDeadline?.parameters?.day || 31;

    // Personalized urgency message
    const urgencyMessage = daysToVAT <= 7
        ? `⚠️ *Heads up!* VAT is due in ${daysToVAT} days o!\n\n`
        : daysToVAT <= 14
            ? `📢 VAT due in ${daysToVAT} days - still got time, but don't sleep on it!\n\n`
            : '';

    return {
        message: `📅 *Tax Filing Reminders*\n\n` +
            `${urgencyMessage}` +
            `Here are your upcoming deadlines:\n\n` +
            `🔹 *VAT Return:* ${formatDate(nextVATDue)} (${daysToVAT} days)\n` +
            `🔹 *Monthly PAYE:* ${payeDay}th of each month\n` +
            `🔹 *Annual Tax:* ${getMonthName(annualMonth)} ${annualDay}${getDaySuffix(annualDay)}\n\n` +
            `I can remind you 3 days before each deadline so you never get caught off guard. 🛡️\n\n` +
            `Which reminders should I set up for you?`,
        buttons: [
            [
                { text: '📊 VAT Reminders', callback_data: 'remind_vat' },
                { text: '💰 PAYE Reminders', callback_data: 'remind_paye' }
            ],
            [
                { text: '📅 All Reminders', callback_data: 'remind_all' },
                { text: '❌ Not Now', callback_data: 'no_reminders' }
            ]
        ],
        metadata: { intent: 'set_reminder', nextVATDue: nextVATDue.toISOString(), personality: true }
    };
}

/**
 * Handle connect bank intent
 */
export async function handleConnectBank(
    intent: NLUIntent,
    context: SessionContext
): Promise<IntentHandlerResult> {
    const bankName = intent.entities.bank_name as string;

    return {
        message: `🏦 *Connect Your Bank Account*\n\n` +
            `This is where the magic happens! 🪄\n\n` +
            `When you link your bank, I can:\n` +
            `✅ Pull your transactions automatically\n` +
            `✅ Classify income vs expenses\n` +
            `✅ Spot VAT-liable items\n` +
            `✅ Generate filing reports in seconds\n\n` +
            `🔒 *About security:* We use Mono for secure, read-only access. I can only see transactions - no transfers, no modifications. Your login details never touch our servers.\n\n` +
            `${bankName ? `You mentioned ${bankName}. Let's connect it! ` : ''}Which bank would you like to connect?`,
        buttons: [
            [
                { text: '🏦 GTBank', callback_data: 'bank_gtb' },
                { text: '🏦 Zenith', callback_data: 'bank_zenith' }
            ],
            [
                { text: '🏦 Access', callback_data: 'bank_access' },
                { text: '🏦 First Bank', callback_data: 'bank_first' }
            ],
            [
                { text: '📋 Other Banks', callback_data: 'bank_other' }
            ]
        ],
        metadata: { intent: 'connect_bank', bankName, personality: true }
    };
}

/**
 * Handle general query with context-aware response (static fallback)
 */
export async function handleGeneralQuery(
    intent: NLUIntent,
    context: SessionContext,
    timeOfDay: 'morning' | 'afternoon' | 'evening'
): Promise<IntentHandlerResult> {
    const userName = context.metadata?.userName as string;
    const greeting = PersonalityFormatter.greet(userName, timeOfDay);

    return {
        message: `${greeting}\n\n` +
            `I'm ready to help with your tax matters! Here's what I can do:\n\n` +
            `💰 *Quick Calculations*\n` +
            `• \`tax 5000000\` - See your income tax breakdown\n` +
            `• \`vat 50000 electronics\` - Calculate VAT instantly\n\n` +
            `📄 *Document Processing*\n` +
            `Just upload a bank statement or receipt and I'll handle the rest!\n\n` +
            `🆔 *ID Verification*\n` +
            `• \`verify NIN 12345678901\`\n\n` +
            `Or just ask me anything about Nigerian taxes - I'm here to help! 🙌`,
        buttons: [
            [
                { text: '🧮 Calculate Tax', callback_data: 'calc_tax' },
                { text: '📤 Upload Document', callback_data: 'upload_doc' }
            ],
            [
                { text: '💡 Tax Reliefs', callback_data: 'view_reliefs' },
                { text: '❓ Help', callback_data: 'help' }
            ]
        ],
        metadata: { intent: 'general_query', personality: true }
    };
}

/**
 * Handle general query with AI-powered conversation
 * Uses Anthropic Claude (same as Web chat-assist) for natural language responses
 */
export async function handleGeneralQueryWithAI(
    message: string,
    intent: NLUIntent,
    context: SessionContext,
    timeOfDay: 'morning' | 'afternoon' | 'evening'
): Promise<IntentHandlerResult> {
    try {
        // Extract and store facts from user message (async, non-blocking)
        // Uses internal users.id from context.userId
        if (context.userId) {
            getFactExtractor().extractAndStore(context.userId, message).catch(err => {
                logger.error('[IntentHandlers] Fact extraction failed:', err);
            });
        }

        // Build Nigerian tax-aware system prompt with dynamic rules from database
        const systemPrompt = await buildConversationalPromptAsync(context, timeOfDay);

        logger.info('[IntentHandlers] Calling OpenRouter for conversation', {
            messageLength: message.length,
            userName: context.metadata?.userName || 'anonymous'
        });

        const aiResponse = await aiClient.chat({
            tier: 'fast',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: message }
            ]
        });

        if (!aiResponse) {
            throw new Error('Empty AI response');
        }

        logger.info('[IntentHandlers] AI response received', {
            responseLength: aiResponse.length,
            source: 'ai_client'
        });

        return {
            message: aiResponse,
            buttons: [[
                { text: '🧮 Calculate Tax', callback_data: 'calc_tax' },
                { text: '📤 Upload Doc', callback_data: 'upload_doc' }
            ]],
            metadata: {
                intent: 'conversational_ai',
                source: 'anthropic_claude',
                model: config.anthropic.model,
                originalIntent: intent.name,
                personality: true
            }
        };
    } catch (error) {
        logger.error('[IntentHandlers] AI conversation failed:', error);
        // Fallback to static menu with personality
        return handleGeneralQuery(intent, context, timeOfDay);
    }
}

/**
 * Build conversational system prompt for AI with dynamic rules from database
 */
async function buildConversationalPromptAsync(
    context: SessionContext,
    timeOfDay: 'morning' | 'afternoon' | 'evening'
): Promise<string> {
    const userName = context.metadata?.userName;
    const entityType = context.metadata?.entityType;

    // Fetch dynamic tax rules from database (same as Web chat-assist)
    let taxRulesContext = '';
    try {
        taxRulesContext = await buildTaxRulesSummary();
    } catch (error) {
        logger.warn('[IntentHandlers] Failed to fetch tax rules, using fallback', error);
        taxRulesContext = `
KNOWLEDGE (Nigeria Tax Act 2025 - Fallback):
- Tax bands: ₦0-800k (0%), ₦800k-3M (15%), ₦3M-12M (18%), ₦12M-25M (21%), ₦25M-50M (23%), 50M+ (25%)
- VAT: 7.5%
- EMTL: ₦50 per transfer ≥₦10,000
- CRA: Higher of ₦200k or 1% of gross income, plus 20% of gross income
- Reliefs: Pension (8% of basic), NHF (2.5%), NHIS (actual), Children (₦2,500/child, max 4)
- Filing deadlines: VAT by 21st monthly, PAYE by 10th monthly, Annual by March 31st`;
    }

    // V28: DATA ACCESS RULES (Anti-Hallucination)
    // Railway Gateway does NOT fetch user-specific data, so we must be explicit
    const dataAccessRules = `
DATA ACCESS RULES:
You have access to the following user data:
  ${userName ? '✅ User name' : '❌ NO user profile - do not assume any user details'}
  ${entityType ? '✅ Entity type: ' + entityType : '❌ NO entity type'}
  ❌ NO transaction data - do NOT invent income/expense figures
  ❌ NO calendar data - use general Nigerian tax deadlines only
  ❌ NO invoice data
  ❌ NO project data - you CANNOT save project info
  ❌ NO inventory data
  ❌ NO payables data
  ❌ NO remembered facts from this user

CRITICAL: If you don't have data (marked ❌), you MUST NOT invent numbers.
Say: "I don't have your [X] data yet. Would you like to upload/connect it?"

CAPABILITIES (What you CAN do):
✅ Answer tax questions using Nigerian tax law
✅ Calculate taxes if user provides numbers
✅ Explain tax concepts and deadlines
✅ Save information TO PRISM when the user explicitly asks (via tool calls)
❌ You CANNOT access data that doesn't exist in context`;

    return `You are PRISM, a friendly Nigerian tax assistant chatbot. 

PERSONALITY:
- Warm and conversational like a knowledgeable friend who happens to be great at tax
- Use Nigerian context naturally (Naira, FIRS, local examples like generator fuel, danfo fare)
- Celebrate wins, empathize with challenges ("I know NEPA wahala makes fuel expenses high!")
- Be clear and direct, avoid jargon
- Occasionally use Nigerian expressions naturally:
  * "o" for gentle emphasis ("make sure you file on time o")
  * "sha" for "anyway/though" ("I'll help you sha")
  * "oya" for "let's go/come on"
  * "wahala" for trouble/problem
  * "na so" for "that's right"
- Keep it conversational, not every message needs pidgin

CONTEXT:
- Time: ${timeOfDay}
${userName ? `- User: ${userName}` : '- Anonymous user'}
${entityType ? `- Entity type: ${entityType}` : ''}

${taxRulesContext}

${dataAccessRules}

FORMATTING:
- Use markdown for structure (bold for emphasis, bullets for lists)
- Keep responses focused (2-3 short paragraphs max)
- Use ₦ symbol for amounts
- If doing calculations, show brief math
- End with a helpful next action or question

WHAT NOT TO DO:
- Don't be robotic or formal
- Don't give long lectures
- Don't use every Nigerian expression in one message
- Don't say "as an AI" or similar
- Don't make up laws or rates
- DON'T INVENT USER DATA - if you don't have it, say so

Answer the user's question naturally and helpfully.`;
}

/**
 * Handle ambiguous intent with clarifying questions
 */
export async function handleAmbiguousIntent(
    message: string,
    possibleIntents: Array<{ name: string; confidence: number }>,
    context: SessionContext
): Promise<IntentHandlerResult> {
    // Generate clarifying options based on possible intents
    const intentLabels: Record<string, string> = {
        get_tax_calculation: '🧮 Calculate Tax',
        get_transaction_summary: '📊 View Transactions',
        get_tax_relief_info: '💡 Tax Reliefs',
        upload_receipt: '📤 Upload Document',
        verify_identity: '🆔 Verify ID',
        connect_bank: '🏦 Connect Bank'
    };

    const buttons = possibleIntents
        .filter(i => intentLabels[i.name])
        .slice(0, 4)
        .map(i => ({
            text: intentLabels[i.name],
            callback_data: `clarify_${i.name}`
        }));

    return {
        message: `I want to make sure I help you with the right thing! 🎯\n\nWhat would you like to do?`,
        buttons: buttons.length > 0
            ? [buttons.slice(0, 2), buttons.slice(2, 4)].filter(row => row.length > 0)
            : [[{ text: '❓ Show Help', callback_data: 'help' }]],
        metadata: { intent: 'ambiguous', originalMessage: message, personality: true }
    };
}

// Helper functions
function formatPeriod(period: string): string {
    const periodMap: Record<string, string> = {
        'last_month': 'Last Month',
        'current_month': 'This Month',
        'last_week': 'Last Week',
        'current_year': 'This Year',
        'last_year': 'Last Year'
    };

    // Check if it's a month name
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'];
    if (months.includes(period.toLowerCase())) {
        return period.charAt(0).toUpperCase() + period.slice(1);
    }

    return periodMap[period] || period;
}

function formatDate(date: Date): string {
    return date.toLocaleDateString('en-NG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

function getMonthName(month: number): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    return months[month - 1] || 'March';
}

function getDaySuffix(day: number): string {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
    }
}

// Export all handlers
export const intentHandlers = {
    handleTransactionSummary,
    handleTaxReliefInfo,
    handleSetReminder,
    handleConnectBank,
    handleGeneralQuery,
    handleGeneralQueryWithAI,
    handleAmbiguousIntent
};
