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

            // Create processing job
            const job = await this.createProcessingJob({
                userId: context.userId,
                businessId: context.metadata?.businessId,
                documentUrl,
                documentType: context.metadata?.documentType || 'bank_statement'
            });

            // Queue for async processing
            await this.queueProcessing(job.id);

            logger.info(`[DocumentProcessing] Job created: ${job.id}`, {
                userId: context.userId,
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
