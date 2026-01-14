/**
 * Currency Formatting Utilities
 * Centralized formatting for Nigerian Naira and percentages
 */

/**
 * Format a number as Nigerian Naira
 */
export function formatNaira(amount: number, options?: {
    showKobo?: boolean;
    compact?: boolean;
}): string {
    const { showKobo = false, compact = false } = options || {};

    if (compact) {
        if (amount >= 1_000_000_000) {
            return `₦${(amount / 1_000_000_000).toFixed(1)}B`;
        }
        if (amount >= 1_000_000) {
            return `₦${(amount / 1_000_000).toFixed(1)}M`;
        }
        if (amount >= 1_000) {
            return `₦${(amount / 1_000).toFixed(0)}K`;
        }
    }

    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: showKobo ? 2 : 0,
        maximumFractionDigits: showKobo ? 2 : 0,
    }).format(amount);
}

/**
 * Format a number as percentage
 */
export function formatPercent(value: number, decimals: number = 2): string {
    return `${value.toFixed(decimals)}%`;
}

/**
 * Format a number with thousand separators
 */
export function formatNumber(value: number, decimals: number = 0): string {
    return new Intl.NumberFormat('en-NG', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(value);
}

/**
 * Parse a Naira string to number
 */
export function parseNaira(value: string): number {
    // Remove currency symbol, commas, and whitespace
    const cleaned = value.replace(/[₦,\s]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format currency for display in chat/messages
 */
export function formatNairaChat(amount: number): string {
    if (amount >= 1_000_000) {
        return `₦${(amount / 1_000_000).toLocaleString('en-NG', { maximumFractionDigits: 2 })} million`;
    }
    return formatNaira(amount);
}
