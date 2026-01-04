/**
 * Gateway Server
 * WebSocket + HTTP server for PRISM chatbot
 */

import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server as HttpServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { SessionManager } from './session-manager';
import { IdempotencyHandler } from './idempotency';
import { MessageRequest, MessageResponse, DocumentUpload, Platform } from './protocol';
import { config } from './config';
import { logger } from './utils/logger';

export class GatewayServer {
    private app: Express;
    private httpServer: HttpServer;
    private wss: WebSocketServer;
    private sessionManager: SessionManager;
    private idempotency: IdempotencyHandler;
    private clients: Map<string, WebSocket>;

    constructor(private cfg: typeof config) {
        this.app = express();
        this.httpServer = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.httpServer });
        this.sessionManager = new SessionManager();
        this.idempotency = new IdempotencyHandler();
        this.clients = new Map();

        this.setupMiddleware();
        this.setupRoutes();
        this.setupWebSocket();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware() {
        // Security
        this.app.use(helmet());

        // CORS
        this.app.use(cors({
            origin: this.cfg.allowedOrigins.length > 0
                ? this.cfg.allowedOrigins
                : '*',
            credentials: true
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging
        this.app.use((req, res, next) => {
            logger.debug(`${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Setup HTTP routes
     */
    private setupRoutes() {
        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                sessions: this.sessionManager.getCacheStats(),
                idempotency: this.idempotency.getStats(),
                connectedClients: this.clients.size
            });
        });

        // Send message (HTTP alternative to WebSocket)
        this.app.post('/chat', async (req: Request, res: Response) => {
            try {
                const request: MessageRequest = req.body;

                // Validate required fields
                if (!request.userId || !request.platform || !request.message || !request.idempotencyKey) {
                    return res.status(400).json({
                        error: 'Missing required fields',
                        code: 'INVALID_REQUEST'
                    });
                }

                // Check idempotency
                if (this.idempotency.isDuplicate(request.idempotencyKey)) {
                    const cached = this.idempotency.getCachedResponse(request.idempotencyKey);
                    logger.info(`Duplicate request: ${request.idempotencyKey}`);
                    return res.json(cached);
                }

                // Process message
                const response = await this.handleMessage(request);

                // Store for idempotency
                this.idempotency.storeResponse(request.idempotencyKey, response);

                res.json(response);
            } catch (error) {
                logger.error('Error handling chat request:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Document upload
        this.app.post('/document/process', async (req: Request, res: Response) => {
            try {
                const request: DocumentUpload = req.body;

                // Validate
                if (!request.userId || !request.platform || !request.documentUrl) {
                    return res.status(400).json({
                        error: 'Missing required fields',
                        code: 'INVALID_REQUEST'
                    });
                }

                // Check idempotency
                if (this.idempotency.isDuplicate(request.idempotencyKey)) {
                    const cached = this.idempotency.getCachedResponse(request.idempotencyKey);
                    return res.json(cached);
                }

                // Process document (async)
                const response = await this.handleDocumentUpload(request);

                // Store for idempotency
                this.idempotency.storeResponse(request.idempotencyKey, response);

                res.json(response);
            } catch (error) {
                logger.error('Error handling document upload:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // Session management (admin)
        this.app.get('/sessions', async (req: Request, res: Response) => {
            try {
                const sessions = await this.sessionManager.listSessions();
                res.json({ sessions });
            } catch (error) {
                logger.error('Error listing sessions:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR'
                });
            }
        });

        this.app.delete('/sessions/:userId/:platform', async (req: Request, res: Response) => {
            try {
                const { userId, platform } = req.params;
                await this.sessionManager.deleteSession(userId, platform as Platform);
                res.json({ success: true });
            } catch (error) {
                logger.error('Error deleting session:', error);
                res.status(500).json({
                    error: 'Internal server error',
                    code: 'INTERNAL_ERROR'
                });
            }
        });
    }

    /**
     * Setup WebSocket server
     */
    private setupWebSocket() {
        this.wss.on('connection', (ws: WebSocket, req) => {
            logger.info(`WebSocket connection from ${req.socket.remoteAddress}`);

            ws.on('message', async (data: Buffer) => {
                try {
                    const message = JSON.parse(data.toString());

                    // Handle different message types
                    if (message.method === 'sendMessage') {
                        const request: MessageRequest = message.params;

                        // Check idempotency
                        if (this.idempotency.isDuplicate(request.idempotencyKey)) {
                            const cached = this.idempotency.getCachedResponse(request.idempotencyKey);
                            ws.send(JSON.stringify(cached));
                            return;
                        }

                        const response = await this.handleMessage(request);
                        this.idempotency.storeResponse(request.idempotencyKey, response);
                        ws.send(JSON.stringify(response));
                    }
                } catch (error) {
                    logger.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        error: 'Invalid message format',
                        code: 'INVALID_MESSAGE'
                    }));
                }
            });

            ws.on('close', () => {
                logger.info('WebSocket connection closed');
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error:', error);
            });
        });
    }

    /**
     * Handle incoming message
     */
    private async handleMessage(request: MessageRequest): Promise<MessageResponse> {
        logger.info(`Message from ${request.platform}:${request.userId}: ${request.message}`);

        // Get or create session
        let session = await this.sessionManager.getSession(request.userId, request.platform);
        if (!session) {
            session = await this.sessionManager.upsertSession(request.userId, request.platform, {});
        }

        // Merge request metadata into session context (for document uploads via /chat endpoint)
        // This allows Telegram bot to pass documentUrl, documentType, fileName through the /chat route
        // CRITICAL: Also include saved session context (like onboardingProgress) from previous requests
        const contextWithMetadata = {
            ...session,
            metadata: {
                ...session.context,  // Include saved context (onboardingProgress, etc.)
                ...request.metadata  // Include documentUrl, documentType, fileName from request
            }
        };

        // Route to appropriate skill
        const { skillRouter } = await import('./skills/skill-router');
        const response = await skillRouter.route(request.message, contextWithMetadata);

        // Update session with ALL metadata from response (including onboardingProgress)
        // This persists state between requests
        if (response.metadata) {
            await this.sessionManager.updateSession(request.userId, request.platform, {
                ...session.context,          // Keep existing context
                ...response.metadata,        // Merge all response metadata (onboardingProgress, etc.)
                lastSkill: response.metadata.skill,
                lastResponse: new Date().toISOString()
            });
        }

        return response;
    }

    /**
     * Handle document upload
     */
    private async handleDocumentUpload(request: DocumentUpload): Promise<MessageResponse> {
        logger.info(`Document upload from ${request.platform}:${request.userId}`);

        // Get or create session
        let session = await this.sessionManager.getSession(request.userId, request.platform);
        if (!session) {
            session = await this.sessionManager.upsertSession(request.userId, request.platform, {});
        }

        // Add document metadata to session context
        const contextWithDocument = {
            ...session,
            metadata: {
                ...session.metadata,
                documentUrl: request.documentUrl,
                documentType: request.documentType
            }
        };

        // Route to document processing skill
        const { skillRouter } = await import('./skills/skill-router');
        const response = await skillRouter.route(
            `Process ${request.documentType}`,
            contextWithDocument
        );

        return response;
    }

    /**
     * Start server
     */
    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.httpServer.listen(this.cfg.port, '0.0.0.0', () => {
                logger.info(`Gateway server started on port ${this.cfg.port}`);
                resolve();
            });
        });
    }

    /**
     * Stop server
     */
    async stop(): Promise<void> {
        return new Promise((resolve, reject) => {
            // Close WebSocket connections
            this.wss.clients.forEach(client => {
                client.close();
            });

            // Close HTTP server
            this.httpServer.close((err) => {
                if (err) {
                    logger.error('Error stopping server:', err);
                    reject(err);
                } else {
                    logger.info('Gateway server stopped');
                    resolve();
                }
            });
        });
    }
}
