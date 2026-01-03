/**
 * Document Processing Skill - Main Handler
 * Processes bank statements and extracts/classifies transactions
 */

import { logger } from '../../utils/logger';
import { Session as SessionContext } from '../../protocol';
import { supabase } from '../../config';
import type { Static } from '@sinclair/typebox';
import type { MessageResponseSchema } from '../../protocol';

export interface DocumentProcessingRequest {
    userId: string;
    businessId?: string;
    documentUrl: string;
    documentType: 'bank_statement' | 'invoice' | 'receipt';
    metadata?: Record<string, any>;
}

export class DocumentProcessingSkill {
    name = 'document-processing';

    /**
     * Look up user's database UUID from their platform-specific ID
     */
    private async getUserUUID(platformUserId: string, platform: string): Promise<string | null> {
        const columnMap: Record<string, string> = {
            'telegram': 'telegram_id',
            'whatsapp': 'whatsapp_id',
            'simulator': 'telegram_id'  // Simulator uses telegram_id for testing
        };
        
        const column = columnMap[platform] || 'telegram_id';
        
        const { data, error } = await supabase
            .from('users')
            .select('id')
            .eq(column, platformUserId)
            .maybeSingle();
        
        if (error) {
            logger.error('[DocumentProcessing] Failed to lookup user UUID:', error);
            return null;
        }
        
        return data?.id || null;
    }

    /**
     * Handle document processing request
     */
    async handle(
        message: string,
        context: SessionContext
    ): Promise<Static<typeof MessageResponseSchema>> {
        try {
            // Check if this is a document upload
            const documentUrl = context.metadata?.documentUrl;

            if (!documentUrl) {
                return {
                    message: "Please upload a bank statement (PDF or image) to get started.",
                    metadata: { skill: this.name }
                };
            }

            // Resolve platform user ID to database UUID
            const userUUID = await this.getUserUUID(context.userId, context.platform);
            
            if (!userUUID) {
                logger.error('[DocumentProcessing] User not found in database', {
                    platformUserId: context.userId,
                    platform: context.platform
                });
                return {
                    message: "❌ Please complete onboarding first by sending /start before uploading documents.",
                    metadata: { skill: this.name, error: 'user_not_found' }
                };
            }

            // Create processing job with proper UUID
            const job = await this.createProcessingJob({
                userId: userUUID,
                businessId: context.metadata?.businessId,
                documentUrl,
                documentType: context.metadata?.documentType || 'bank_statement'
            });

            // Queue for async processing
            await this.queueProcessing(job.id);

            logger.info(`[DocumentProcessing] Job created: ${job.id}`, {
                platformUserId: context.userId,
                userUUID,
                documentType: job.document_type
            });

            return {
                message: "📄 Bank statement received! Processing...\n\nI'll analyze your transactions and ping you when ready (usually <60 seconds).",
                metadata: {
                    skill: this.name,
                    jobId: job.id,
                    estimatedTime: 45
                }
            };
        } catch (error) {
            logger.error('[DocumentProcessing] Handle error:', error);
            return {
                message: "❌ Failed to process document. Please try again or contact support.",
                metadata: { skill: this.name, error: (error as Error).message }
            };
        }
    }

    /**
     * Create document processing job
     */
    private async createProcessingJob(request: DocumentProcessingRequest) {
        const { data, error } = await supabase
            .from('document_processing_jobs')
            .insert({
                user_id: request.userId,
                business_id: request.businessId,
                document_type: request.documentType,
                document_url: request.documentUrl,
                processing_status: 'queued',
                queued_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            logger.error('[DocumentProcessing] Failed to create job:', error);
            throw new Error('Failed to create processing job');
        }

        return data;
    }

    /**
     * Queue job for async processing
     * In production, this would use a real queue (Bull, BullMQ, etc.)
     * For now, we'll process immediately in background
     */
    private async queueProcessing(jobId: string) {
        // Import processor dynamically to avoid circular deps
        const { DocumentProcessor } = await import('./processor');
        const processor = new DocumentProcessor();

        // Process in background (don't await)
        processor.processJob(jobId).catch(err => {
            logger.error(`[DocumentProcessing] Job ${jobId} failed:`, err);
        });
    }
}

export const documentProcessingSkill = new DocumentProcessingSkill();
