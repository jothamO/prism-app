/**
 * Gateway Configuration
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
    // Server
    port: parseInt(process.env.PORT || '18789', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Supabase
    supabase: {
        url: process.env.SUPABASE_URL || '',
        serviceKey: process.env.SUPABASE_SERVICE_KEY || ''
    },

    // Anthropic
    anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || ''
    },

    // Security
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),

    // Session Cache
    sessionCache: {
        maxSessions: parseInt(process.env.MAX_SESSIONS || '10000', 10),
        ttlMinutes: parseInt(process.env.SESSION_TTL_MINUTES || '60', 10)
    },

    // Idempotency
    idempotency: {
        ttlMinutes: parseInt(process.env.IDEMPOTENCY_TTL_MINUTES || '5', 10),
        maxKeys: parseInt(process.env.MAX_IDEMPOTENCY_KEYS || '1000', 10)
    }
};

// Validation
if (!config.supabase.url || !config.supabase.serviceKey) {
    throw new Error('Missing Supabase credentials');
}

if (!config.anthropic.apiKey) {
    throw new Error('Missing Anthropic API key');
}
