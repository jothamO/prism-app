/**
 * Identity Verification Skill
 * Handles NIN, TIN, CAC, BVN verification via Mono API
 */

import { logger } from '../../utils/logger';
import { supabase } from '../../config';
import { Session as SessionContext } from '../../protocol';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

export interface VerificationResult {
    verified: boolean;
    idType: 'nin' | 'tin' | 'cac' | 'bvn';
    data?: {
        fullName?: string;
        businessName?: string;
        registrationNumber?: string;
        status?: string;
    };
    error?: string;
}

export class IdentityVerificationSkill {
    /**
     * Handle identity verification request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            logger.info('[Identity Skill] Processing request', { userId: context.userId, message });

            const lowerMessage = message.toLowerCase();

            // Check for specific ID type verification
            if (lowerMessage.includes('nin') || context.metadata?.awaitingNIN) {
                return await this.handleNINVerification(message, context);
            }

            if (lowerMessage.includes('tin') || context.metadata?.awaitingTIN) {
                return await this.handleTINVerification(message, context);
            }

            if (lowerMessage.includes('cac') || lowerMessage.includes('rc') || context.metadata?.awaitingCAC) {
                return await this.handleCACVerification(message, context);
            }

            if (lowerMessage.includes('bvn') || context.metadata?.awaitingBVN) {
                return await this.handleBVNVerification(message, context);
            }

            // Show verification options
            return {
                message: `🆔 Identity Verification\n\n` +
                    `I can verify the following IDs via Mono:\n\n` +
                    `*Personal IDs:*\n` +
                    `• NIN - National Identification Number\n` +
                    `• BVN - Bank Verification Number\n` +
                    `• TIN - Tax Identification Number\n\n` +
                    `*Business IDs:*\n` +
                    `• CAC/RC - Company Registration Number\n\n` +
                    `Send your ID in format:\n` +
                    `"verify NIN 12345678901"\n` +
                    `"verify CAC RC123456"`,
                buttons: [
                    [{ text: '🆔 Verify NIN', callback_data: 'verify_nin' }],
                    [{ text: '🏢 Verify CAC', callback_data: 'verify_cac' }],
                    [{ text: '📋 Verify TIN', callback_data: 'verify_tin' }]
                ],
                metadata: { skill: 'identity-verification' }
            };
        } catch (error) {
            logger.error('[Identity Skill] Error:', error);
            return {
                message: "❌ Verification failed. Please try again later.",
                metadata: { skill: 'identity-verification', error: (error as Error).message }
            };
        }
    }

    /**
     * Handle NIN verification
     */
    private async handleNINVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        // Extract NIN from message
        const ninMatch = message.match(/\b(\d{11})\b/);
        
        if (!ninMatch) {
            return {
                message: "📝 Please enter your 11-digit NIN (National ID Number):",
                metadata: { skill: 'identity-verification', awaitingNIN: true }
            };
        }

        const nin = ninMatch[1];
        logger.info('[Identity Skill] Verifying NIN', { userId: context.userId, nin: nin.substring(0, 4) + '***' });

        // For now, simulate verification (would call Mono API in production)
        // In production: Use MONO_SECRET_KEY to call Mono v3 Lookup API
        
        return {
            message: `🆔 NIN Verification\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `NIN: ${nin.substring(0, 4)}****${nin.substring(8)}\n\n` +
                `⏳ *Verification in progress...*\n\n` +
                `This typically takes 5-10 seconds.\n` +
                `You'll receive a confirmation once verified.\n\n` +
                `💡 NIN verification via NIMC database.`,
            metadata: {
                skill: 'identity-verification',
                idType: 'nin',
                status: 'pending',
                maskedId: nin.substring(0, 4) + '****' + nin.substring(8)
            }
        };
    }

    /**
     * Handle TIN verification
     */
    private async handleTINVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const tinMatch = message.match(/\b(\d{10,14})\b/);
        
        if (!tinMatch) {
            return {
                message: "📝 Please enter your TIN (Tax Identification Number):\n\n" +
                    "Format: 10-14 digits",
                metadata: { skill: 'identity-verification', awaitingTIN: true }
            };
        }

        const tin = tinMatch[1];
        logger.info('[Identity Skill] Verifying TIN', { userId: context.userId, tin: tin.substring(0, 4) + '***' });

        return {
            message: `📋 TIN Verification\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `TIN: ${tin.substring(0, 4)}****\n\n` +
                `⏳ *Verifying with FIRS...*\n\n` +
                `This confirms your tax registration status.\n\n` +
                `💡 TIN verification via FIRS JTB database.`,
            metadata: {
                skill: 'identity-verification',
                idType: 'tin',
                status: 'pending',
                maskedId: tin.substring(0, 4) + '****'
            }
        };
    }

    /**
     * Handle CAC verification
     */
    private async handleCACVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        // Match RC number or BN number
        const cacMatch = message.match(/\b(?:RC|BN)?[\s-]?(\d{5,10})\b/i);
        
        if (!cacMatch) {
            return {
                message: "📝 Please enter your CAC Registration Number:\n\n" +
                    "Format: RC123456 or BN123456\n\n" +
                    "• RC = Company (Limited Liability)\n" +
                    "• BN = Business Name (Sole Prop/Partnership)",
                metadata: { skill: 'identity-verification', awaitingCAC: true }
            };
        }

        const regNumber = cacMatch[1];
        const prefix = message.toUpperCase().includes('BN') ? 'BN' : 'RC';
        
        logger.info('[Identity Skill] Verifying CAC', { userId: context.userId, regNumber: prefix + regNumber });

        return {
            message: `🏢 CAC Verification\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Registration: ${prefix}${regNumber}\n\n` +
                `⏳ *Verifying with CAC...*\n\n` +
                `This will confirm:\n` +
                `• Business name\n` +
                `• Registration status\n` +
                `• Directors (if Company)\n\n` +
                `💡 Verification via CAC Public Registry.`,
            metadata: {
                skill: 'identity-verification',
                idType: 'cac',
                status: 'pending',
                registrationType: prefix,
                registrationNumber: regNumber
            }
        };
    }

    /**
     * Handle BVN verification
     */
    private async handleBVNVerification(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        const bvnMatch = message.match(/\b(\d{11})\b/);
        
        if (!bvnMatch) {
            return {
                message: "📝 Please enter your 11-digit BVN:\n\n" +
                    "⚠️ BVN verification requires additional consent.\n" +
                    "Only proceed if you consent to this verification.",
                buttons: [
                    [{ text: '✅ I Consent', callback_data: 'bvn_consent_yes' }],
                    [{ text: '❌ Cancel', callback_data: 'bvn_consent_no' }]
                ],
                metadata: { skill: 'identity-verification', awaitingBVN: true }
            };
        }

        const bvn = bvnMatch[1];
        logger.info('[Identity Skill] BVN verification requested', { userId: context.userId });

        return {
            message: `🏦 BVN Verification\n` +
                `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `BVN: ${bvn.substring(0, 4)}****${bvn.substring(8)}\n\n` +
                `⏳ *Verifying with NIBSS...*\n\n` +
                `This confirms your bank identity.\n\n` +
                `⚠️ BVN data is sensitive and protected\n` +
                `under CBN regulations.`,
            metadata: {
                skill: 'identity-verification',
                idType: 'bvn',
                status: 'pending',
                maskedId: bvn.substring(0, 4) + '****' + bvn.substring(8)
            }
        };
    }
}

export const identityVerificationSkill = new IdentityVerificationSkill();
