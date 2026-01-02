/**
 * PRISM Clawdis Gateway - Entry Point
 * 
 * Tax-restricted AI assistant control plane
 */

import { GatewayServer } from './gateway-server';
import { config } from './config';
import { logger } from './utils/logger';

async function main() {
    try {
        logger.info('Starting PRISM Clawdis Gateway...');

        // Initialize Gateway server
        const gateway = new GatewayServer(config);

        // Start server
        await gateway.start();

        logger.info(`Gateway running on port ${config.port}`);
        logger.info(`WebSocket: ws://0.0.0.0:${config.port}`);
        logger.info(`HTTP: http://0.0.0.0:${config.port}`);

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received, shutting down gracefully...');
            await gateway.stop();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            logger.info('SIGINT received, shutting down gracefully...');
            await gateway.stop();
            process.exit(0);
        });

    } catch (error) {
        logger.error('Fatal error starting gateway:', error);
        process.exit(1);
    }
}

main();
