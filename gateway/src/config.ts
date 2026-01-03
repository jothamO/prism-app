/**
 * Gateway Configuration
 * Centralized config for environment variables and settings
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config();

// Required environment variables
const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'ANTHROPIC_API_KEY'
];

// Validate required environment variables
for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
        throw new Error(`Missing required environment variable: ${varName}`);
    }
}

// Export configuration
export const config = {
    // Server
    port: parseInt(process.env.PORT || '18789', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL!,
        serviceKey: process.env.SUPABASE_SERVICE_KEY!
    },

    // Anthropic/Claude
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY!,
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4000
    },

    // Google Cloud Vision (OCR)
    vision: {
        credentials: process.env.GOOGLE_CLOUD_CREDENTIALS || '',
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
        enabled: !!(process.env.GOOGLE_CLOUD_CREDENTIALS && process.env.GOOGLE_CLOUD_PROJECT_ID)
    },

    // Mono API (Identity Verification)
    mono: {
        secretKey: process.env.MONO_SECRET_KEY || '',
        publicKey: process.env.MONO_PUBLIC_KEY || '',
        baseUrl: 'https://api.withmono.com/v3'
    },

    // CORS
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['https://prismtaxassistant.lovable.app'],

    // Sessions
    sessions: {
        maxSessions: parseInt(process.env.MAX_SESSIONS || '10000', 10),
        ttlMinutes: parseInt(process.env.SESSION_TTL_MINUTES || '60', 10)
    },

    // Idempotency
    idempotency: {
        ttlMinutes: parseInt(process.env.IDEMPOTENCY_TTL_MINUTES || '60', 10),
        maxKeys: parseInt(process.env.MAX_IDEMPOTENCY_KEYS || '10000', 10)
    },

    // Document Processing
    documentProcessing: {
        // Classification thresholds
        businessPatternThreshold: 0.85,
        ruleBasedThreshold: 0.75,
        aiThreshold: 0.75,

        // User review triggers
        lowConfidenceThreshold: 0.75,
        highValueThreshold: 1_000_000, // ₦1M

        // Nigerian-specific
        defaultCurrency: 'NGN',
        section191Threshold: 5_000_000, // ₦5M
        vatRate: 0.075,
        vatRegistrationThreshold: 25_000_000, // ₦25M

        // Processing limits
        maxTransactionsPerStatement: 500,
        maxFileSizeMB: 10,
        processingTimeoutSeconds: 120
    }
};

// Initialize Supabase client
export const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

// Export for convenience
export default config;
