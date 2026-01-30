/**
 * PRISM Tools for OpenClaw
 * Supabase data access layer
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Initialize Supabase client
function getSupabase(): SupabaseClient {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('Missing Supabase credentials');
    }

    return createClient(url, key);
}

/**
 * Query user data from Supabase
 */
export async function prism_query(args: {
    table: string;
    userId: string;
    filters?: Record<string, unknown>;
    limit?: number;
}): Promise<{ data: unknown[]; error?: string }> {
    const supabase = getSupabase();
    const { table, userId, filters = {}, limit = 50 } = args;

    // Validate table name (whitelist)
    const allowedTables = ['transactions', 'invoices', 'projects', 'inventory', 'payables', 'calendar_events'];
    if (!allowedTables.includes(table)) {
        return { data: [], error: `Table '${table}' not allowed` };
    }

    let query = supabase
        .from(table)
        .select('*')
        .eq('user_id', userId)
        .limit(limit);

    // Apply additional filters
    for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
    }

    const { data, error } = await query;

    if (error) {
        return { data: [], error: error.message };
    }

    return { data: data || [] };
}

/**
 * Get user profile
 */
export async function prism_profile(args: {
    userId: string;
}): Promise<{ profile: unknown | null; error?: string }> {
    const supabase = getSupabase();

    const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', args.userId)
        .single();

    if (error) {
        return { profile: null, error: error.message };
    }

    return { profile: data };
}

/**
 * Save user data
 */
export async function prism_save(args: {
    type: 'project' | 'invoice' | 'memory' | 'transaction';
    userId: string;
    data: Record<string, unknown>;
}): Promise<{ success: boolean; id?: string; error?: string }> {
    const supabase = getSupabase();
    const { type, userId, data } = args;

    const tableMap: Record<string, string> = {
        project: 'projects',
        invoice: 'invoices',
        memory: 'remembered_facts',
        transaction: 'transactions'
    };

    const table = tableMap[type];
    if (!table) {
        return { success: false, error: `Unknown type: ${type}` };
    }

    const { data: result, error } = await supabase
        .from(table)
        .insert({
            user_id: userId,
            ...data,
            created_at: new Date().toISOString()
        })
        .select('id')
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, id: result?.id };
}

/**
 * Tax/VAT calculations
 */
export async function prism_calculate(args: {
    type: 'income_tax' | 'vat' | 'withholding' | 'emtl';
    amount: number;
    options?: Record<string, unknown>;
}): Promise<{ result: unknown; breakdown?: unknown[] }> {
    const { type, amount, options = {} } = args;

    switch (type) {
        case 'income_tax':
            return calculateIncomeTax(amount, options);
        case 'vat':
            return calculateVAT(amount);
        case 'withholding':
            return calculateWHT(amount, options);
        case 'emtl':
            return calculateEMTL(amount);
        default:
            return { result: null, breakdown: [] };
    }
}

function calculateIncomeTax(gross: number, options: Record<string, unknown>) {
    // Nigerian Tax Act 2025 bands
    const bands = [
        { min: 0, max: 800000, rate: 0 },
        { min: 800000, max: 3000000, rate: 0.15 },
        { min: 3000000, max: 12000000, rate: 0.18 },
        { min: 12000000, max: 25000000, rate: 0.21 },
        { min: 25000000, max: 50000000, rate: 0.23 },
        { min: 50000000, max: Infinity, rate: 0.25 }
    ];

    // Calculate CRA
    const cra = Math.max(200000, gross * 0.01) + (gross * 0.20);

    // Apply reliefs
    const pension = Number(options.pensionContribution) || 0;
    const nhf = Number(options.nhfContribution) || 0;
    const nhis = Number(options.nhisContribution) || 0;

    const taxableIncome = Math.max(0, gross - cra - pension - nhf - nhis);

    // Calculate tax by bands
    let tax = 0;
    let remaining = taxableIncome;
    const breakdown = [];

    for (const band of bands) {
        if (remaining <= 0) break;

        const bandWidth = band.max - band.min;
        const amountInBand = Math.min(remaining, bandWidth);
        const taxInBand = amountInBand * band.rate;

        if (amountInBand > 0) {
            breakdown.push({
                band: `₦${band.min.toLocaleString()} - ₦${band.max === Infinity ? '∞' : band.max.toLocaleString()}`,
                rate: `${band.rate * 100}%`,
                amount: amountInBand,
                tax: taxInBand
            });
        }

        tax += taxInBand;
        remaining -= amountInBand;
    }

    return {
        result: {
            grossIncome: gross,
            cra,
            reliefs: { pension, nhf, nhis },
            taxableIncome,
            totalTax: tax,
            effectiveRate: gross > 0 ? (tax / gross * 100).toFixed(2) + '%' : '0%'
        },
        breakdown
    };
}

function calculateVAT(amount: number) {
    const vatRate = 0.075; // 7.5%
    const vat = amount * vatRate;

    return {
        result: {
            baseAmount: amount,
            vatRate: '7.5%',
            vatAmount: vat,
            total: amount + vat
        }
    };
}

function calculateWHT(amount: number, options: Record<string, unknown>) {
    const type = String(options.paymentType || 'contract');
    const rates: Record<string, number> = {
        dividend: 0.10,
        interest: 0.10,
        rent: 0.10,
        royalty: 0.10,
        contract: 0.05,
        consultancy: 0.10
    };

    const rate = rates[type] || 0.10;
    const wht = amount * rate;

    return {
        result: {
            grossAmount: amount,
            paymentType: type,
            whtRate: (rate * 100) + '%',
            whtAmount: wht,
            netAmount: amount - wht
        }
    };
}

function calculateEMTL(amount: number) {
    // EMTL: ₦50 per transfer ≥ ₦10,000
    const threshold = 10000;
    const levy = 50;

    const applicable = amount >= threshold;

    return {
        result: {
            transferAmount: amount,
            threshold,
            applicable,
            emtlCharge: applicable ? levy : 0,
            total: applicable ? amount + levy : amount
        }
    };
}

/**
 * Memory/facts management
 */
export async function prism_memory(args: {
    action: 'get' | 'save';
    userId: string;
    fact?: string;
}): Promise<{ facts?: string[]; saved?: boolean; error?: string }> {
    const supabase = getSupabase();
    const { action, userId, fact } = args;

    if (action === 'get') {
        const { data, error } = await supabase
            .from('remembered_facts')
            .select('fact')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return { error: error.message };
        }

        return { facts: data?.map(r => r.fact) || [] };
    }

    if (action === 'save' && fact) {
        const { error } = await supabase
            .from('remembered_facts')
            .insert({
                user_id: userId,
                fact,
                source: 'openclaw',
                created_at: new Date().toISOString()
            });

        if (error) {
            return { saved: false, error: error.message };
        }

        return { saved: true };
    }

    return { error: 'Invalid action or missing fact' };
}
