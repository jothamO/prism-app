import * as Sentry from '@sentry/node';

export function initSentry() {
    if (!process.env.SENTRY_DSN) {
        console.log('⚠️  Sentry DSN not configured, skipping initialization');
        return;
    }

    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

        beforeSend(event, hint) {
            // Add custom context
            if (event.user) {
                event.tags = {
                    ...event.tags,
                    userId: event.user.id
                };
            }

            // Filter out noisy errors
            if (event.exception) {
                const error = hint.originalException;
                if (error && typeof error === 'object' && 'message' in error) {
                    const message = (error as Error).message;
                    // Skip common non-critical errors
                    if (message.includes('ECONNRESET') || message.includes('ETIMEDOUT')) {
                        return null;
                    }
                }
            }

            return event;
        }
    });

    console.log('✅ Sentry initialized');
}

export { Sentry };
