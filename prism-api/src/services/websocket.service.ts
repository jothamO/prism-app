import { Server as HTTPServer } from 'http';
import { Server, Socket } from 'socket.io';

export class WebSocketService {
    private io: Server | null = null;
    private connectedClients: Set<string> = new Set();

    /**
     * Initialize WebSocket server
     */
    init(httpServer: HTTPServer) {
        this.io = new Server(httpServer, {
            cors: {
                origin: ['http://localhost:5173', 'http://localhost:5174'],
                credentials: true
            }
        });

        this.io.on('connection', (socket: Socket) => {
            console.log(`WebSocket client connected: ${socket.id}`);
            this.connectedClients.add(socket.id);

            socket.on('disconnect', () => {
                console.log(`WebSocket client disconnected: ${socket.id}`);
                this.connectedClients.delete(socket.id);
            });

            // Send current stats on connection
            this.emitToClient(socket.id, 'connection_stats', {
                connectedClients: this.connectedClients.size,
                timestamp: new Date().toISOString()
            });
        });

        console.log('✅ WebSocket server initialized');
    }

    /**
     * Emit event to all connected clients
     */
    emit(event: string, data: any) {
        if (!this.io) {
            console.warn('WebSocket not initialized, skipping emit');
            return;
        }

        this.io.emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });

        console.log(`📡 WebSocket event: ${event}`, { clientCount: this.connectedClients.size });
    }

    /**
     * Emit event to specific client
     */
    emitToClient(clientId: string, event: string, data: any) {
        if (!this.io) {
            console.warn('WebSocket not initialized, skipping emit');
            return;
        }

        this.io.to(clientId).emit(event, {
            ...data,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get connected clients count
     */
    getConnectedCount(): number {
        return this.connectedClients.size;
    }

    /**
     * Event helpers for common actions
     */
    emitNewInvoice(invoice: any) {
        this.emit('new_invoice', {
            type: 'invoice_created',
            invoice: {
                id: invoice.id,
                user_id: invoice.user_id,
                amount: invoice.total,
                customer: invoice.customer_name,
                source: invoice.source
            }
        });
    }

    emitFilingCompleted(filing: any) {
        this.emit('filing_completed', {
            type: 'filing_done',
            filing: {
                id: filing.id,
                user_id: filing.user_id,
                period: filing.period,
                net_amount: filing.net_amount,
                status: filing.status
            }
        });
    }

    emitUserJoined(user: any) {
        this.emit('user_joined', {
            type: 'new_user',
            user: {
                id: user.id,
                business_name: user.business_name,
                whatsapp_number: user.whatsapp_number
            }
        });
    }

    emitReviewItemAdded(item: any) {
        this.emit('review_item_added', {
            type: 'review_queue_update',
            item: {
                id: item.id,
                priority: item.priority,
                reasons: item.reasons,
                user_id: item.user_id
            }
        });
    }

    emitClassificationCompleted(result: any) {
        this.emit('classification_completed', {
            type: 'ai_classification',
            result: {
                classification: result.classification,
                confidence: result.confidence,
                user_id: result.userId
            }
        });
    }
}

export const websocketService = new WebSocketService();
