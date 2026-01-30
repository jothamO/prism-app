/**
 * PRISM NLU Service
 * 
 * Extracts structured profile signals from raw chat text.
 */

export interface ProfileSignal {
    field: string;
    value: string;
    confidence: number;
}

/**
 * Parses a message for profile signals (Entity type, Income, Industry, etc.)
 */
export function extractProfileSignals(message: string): ProfileSignal[] {
    const signals: ProfileSignal[] = [];
    const lowerMessage = message.toLowerCase();

    // ============= Entity Type Detection =============
    if (lowerMessage.includes("i'm a freelancer") || lowerMessage.includes("i am a freelancer") || lowerMessage.includes("i'm self-employed")) {
        signals.push({ field: 'entity_type', value: 'self_employed', confidence: 0.95 });
    } else if (lowerMessage.includes("i run a business") || lowerMessage.includes("i own a business") || lowerMessage.includes("my business")) {
        signals.push({ field: 'entity_type', value: 'sme', confidence: 0.9 });
    } else if (lowerMessage.includes("i own a company") || lowerMessage.includes("my company")) {
        signals.push({ field: 'entity_type', value: 'company', confidence: 0.95 });
    } else if (lowerMessage.includes("i'm employed") || lowerMessage.includes("i work for")) {
        signals.push({ field: 'entity_type', value: 'individual', confidence: 0.9 });
    }

    // ============= Income Detection =============
    const incomeMatch = message.match(/(?:i\s+(?:earn|make|get)\s+)?[₦n]?([\d,]+)\s*(?:k|m|million|thousand)?\s*(?:per\s+)?(?:month|monthly|annually|yearly|year|per\s+year)/i);
    if (incomeMatch) {
        let amount = parseInt(incomeMatch[1].replace(/,/g, ''));
        if (lowerMessage.includes('million') || lowerMessage.match(/[\d,]+\s*m\s/)) {
            amount = amount * 1000000;
        } else if (lowerMessage.includes('thousand') || lowerMessage.match(/[\d,]+\s*k\s/)) {
            amount = amount * 1000;
        }

        const isMonthly = lowerMessage.includes('month');
        const annualIncome = isMonthly ? amount * 12 : amount;
        signals.push({ field: 'annual_income', value: String(annualIncome), confidence: 0.85 });
    }

    // ============= Name Detection =============
    // Detects "Call me Dr Alamgba" or "My name is Jotham"
    // Supports common Nigerian/Professional titles (Dr, Chief, Otunba, etc.)
    const nameMatch = message.match(/(?:call\s+me|my\s+name\s+is)\s+([A-Za-z\.\s]{2,50})/i);
    if (nameMatch) {
        let extractedName = nameMatch[1].trim();
        // Remove trailing common words that might be captured
        extractedName = extractedName.replace(/\s+(please|thanks|thank\s+you|o|abeg)$/i, '').trim();
        // Validation: Ensure it's not just a common word and has valid length
        if (extractedName.length > 2 && extractedName.length < 50) {
            signals.push({ field: 'preferred_name', value: extractedName, confidence: 1.0 });
        }
    }

    // ============= Industry Detection =============
    const industryPatterns: Record<string, string[]> = {
        'technology': ['tech', 'software', 'developer', 'programmer', 'it ', 'startup'],
        'consulting': ['consultant', 'consulting', 'advisory'],
        'trading': ['trader', 'trading', 'import', 'export', 'merchandise'],
        'manufacturing': ['factory', 'manufacturing', 'production'],
        'agriculture': ['farmer', 'farming', 'agriculture', 'agribusiness'],
        'healthcare': ['doctor', 'hospital', 'medical', 'pharmacy'],
        'education': ['teacher', 'school', 'training', 'tutoring'],
        'real_estate': ['real estate', 'property', 'landlord', 'rent'],
    };

    for (const [industry, keywords] of Object.entries(industryPatterns)) {
        if (keywords.some(kw => lowerMessage.includes(kw))) {
            signals.push({ field: 'industry', value: industry, confidence: 0.8 });
            break;
        }
    }

    return signals;
}
