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
import { getReliefs, getDeadlines, formatNaira } from '../../services/rules-fetcher';

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
    
    // Format period for display
    const periodDisplay = formatPeriod(period);
    
    return {
        message: `📊 *Transaction Summary - ${periodDisplay}*\n\n` +
            `I'd be happy to show you your transaction summary!\n\n` +
            `To get started, please upload a bank statement (PDF or image) and I'll analyze your transactions for ${periodDisplay}.`,
        buttons: [[
            { text: '📤 Upload Statement', callback_data: 'upload_statement' },
            { text: '📅 Change Period', callback_data: 'change_period' }
        ]],
        metadata: { intent: 'get_transaction_summary', period }
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
    const reliefInfo: Record<string, { title: string; description: string; limit: string; reference: string }> = {
        pension: {
            title: 'Pension Contribution Relief',
            description: 'Contributions to approved pension schemes are tax-deductible.',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_PENSION')?.parameters?.label || 'Up to 8% of basic salary',
            reference: 'Section 69 NTA 2025'
        },
        nhf: {
            title: 'National Housing Fund',
            description: '2.5% contribution to NHF is tax-deductible.',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_NHF')?.parameters?.label || '2.5% of basic salary',
            reference: 'NHF Act'
        },
        nhis: {
            title: 'Health Insurance',
            description: 'Contributions to NHIS or approved health insurance are deductible.',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_NHIS')?.parameters?.label || 'Actual contribution',
            reference: 'Section 71 NTA 2025'
        },
        housing: {
            title: 'Housing/Rent Relief',
            description: 'Rent paid for residential accommodation (if no employer-provided housing).',
            limit: 'Up to 20% of earned income',
            reference: 'Section 70 NTA 2025'
        },
        children: {
            title: 'Children Education Allowance',
            description: 'Allowance for dependent children in approved educational institutions.',
            limit: dbReliefs.find(r => r.rule_code === 'RELIEF_CHILDREN')?.parameters?.label || '₦2,500 per child (max 4)',
            reference: 'Section 68 NTA 2025'
        }
    };
    
    if (reliefType && reliefInfo[reliefType]) {
        const info = reliefInfo[reliefType];
        return {
            message: `💡 *${info.title}*\n\n` +
                `${info.description}\n\n` +
                `📊 *Limit:* ${info.limit}\n` +
                `📖 *Reference:* ${info.reference}\n\n` +
                `Would you like to calculate your tax with this relief applied?`,
            buttons: [[
                { text: '🧮 Calculate Tax', callback_data: `calc_with_${reliefType}` },
                { text: '📋 Other Reliefs', callback_data: 'list_reliefs' }
            ]],
            metadata: { intent: 'get_tax_relief_info', reliefType }
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
    
    // General relief overview
    return {
        message: `💡 *Available Tax Reliefs (NTA 2025)*\n\n` +
            `Nigeria Tax Act 2025 provides several reliefs to reduce your tax liability:\n\n` +
            `🏦 *Consolidated Relief Allowance (CRA)*\n` +
            `   Higher of ₦200,000 or 1% of gross income + 20% of gross\n\n` +
            `${reliefsList || '👴 *Pension* - 8% of basic salary\n🏠 *NHF* - 2.5% of basic salary\n🏥 *NHIS* - Health insurance contributions\n📚 *Children* - ₦2,500/child (max 4)\n🏡 *Rent* - Up to 20% of earned income'}\n\n` +
            `Which relief would you like to learn more about?`,
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
        metadata: { intent: 'get_tax_relief_info' }
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
    
    return {
        message: `📅 *Tax Filing Reminders*\n\n` +
            `📋 *Upcoming Deadlines:*\n\n` +
            `🔹 VAT Return: ${formatDate(nextVATDue)} (${daysToVAT} days)\n` +
            `🔹 Monthly PAYE: ${payeDay}th of each month\n` +
            `🔹 Annual Tax: ${getMonthName(annualMonth)} ${annualDay}${getDaySuffix(annualDay)}\n\n` +
            `I can remind you 3 days before each deadline via this chat.\n\n` +
            `Which reminders would you like to set up?`,
        buttons: [
            [
                { text: '📊 VAT Reminders', callback_data: 'remind_vat' },
                { text: '💰 PAYE Reminders', callback_data: 'remind_paye' }
            ],
            [
                { text: '📅 All Reminders', callback_data: 'remind_all' },
                { text: '❌ No Thanks', callback_data: 'no_reminders' }
            ]
        ],
        metadata: { intent: 'set_reminder', nextVATDue: nextVATDue.toISOString() }
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
            `Linking your bank allows PRISM to:\n` +
            `✅ Automatically import transactions\n` +
            `✅ Categorize income and expenses\n` +
            `✅ Detect VAT-liable transactions\n` +
            `✅ Generate filing reports\n\n` +
            `🔒 We use Mono for secure, read-only access to your transactions. We never see your login credentials.\n\n` +
            `${bankName ? `You mentioned ${bankName}. ` : ''}Select your bank to connect:`,
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
        metadata: { intent: 'connect_bank', bankName }
    };
}

/**
 * Handle general query with context-aware response
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
            `I can help you with:\n\n` +
            `📊 *Tax Calculations:*\n` +
            `• \`vat 50000 electronics\` - Calculate VAT\n` +
            `• \`tax 10000000\` - Income tax calculation\n` +
            `• \`salary 350000\` - PAYE calculation\n\n` +
            `🆔 *Identity Verification:*\n` +
            `• \`verify NIN 12345678901\` - Verify NIN\n` +
            `• \`verify CAC RC123456\` - Verify company\n\n` +
            `📄 *Document Processing:*\n` +
            `• Upload a bank statement (PDF/image)\n` +
            `• Upload receipts for expense tracking\n\n` +
            `What would you like to do today?`,
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
        metadata: { intent: 'general_query' }
    };
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
        message: `I want to make sure I help you with the right thing. What would you like to do?`,
        buttons: buttons.length > 0 
            ? [buttons.slice(0, 2), buttons.slice(2, 4)].filter(row => row.length > 0)
            : [[{ text: '❓ Show Help', callback_data: 'help' }]],
        metadata: { intent: 'ambiguous', originalMessage: message }
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
    handleAmbiguousIntent
};
