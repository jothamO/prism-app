/**
 * Batch Processor
 * Process multiple bank statements in parallel with rate limiting
 */

import { supabase } from '../../../config';
import { logger } from '../../../utils/logger';
import { DocumentProcessor } from '../processor';

export interface BatchJobRequest {
    userId: string;
    businessId?: string;
    documentUrls: string[];
    priority?: number;
}

export interface BatchStatus {
    batchId: string;
    totalJobs: number;
    completed: number;
    failed: number;
    inProgress: number;
    queued: number;
    accuracy?: number;
    patternsLearned?: number;
}

export class BatchProcessor {
    private processor = new DocumentProcessor();
    private readonly MAX_CONCURRENT = 3; // Process 3 statements at once
    private readonly RATE_LIMIT_MS = 1000; // 1 second between batches

    /**
     * Create and queue multiple processing jobs
     */
    async createBatch(request: BatchJobRequest): Promise<{ batchId: string; totalJobs: number }> {
        const batchId = this.generateBatchId();

        logger.info('[BatchProcessor] Creating batch', {
            batchId,
            documentCount: request.documentUrls.length,
            userId: request.userId
        });

        // Create jobs for each document
        const jobs = [];
        for (const documentUrl of request.documentUrls) {
            const job = await this.createJob({
                userId: request.userId,
                businessId: request.businessId,
                documentUrl,
                batchId,
                priority: request.priority || 5
            });
            jobs.push(job);
        }

        // Start processing (non-blocking)
        this.processBatchAsync(batchId, jobs).catch(error => {
            logger.error(`[BatchProcessor] Batch ${batchId} processing failed:`, error);
        });

        return {
            batchId,
            totalJobs: jobs.length
        };
    }

    /**
     * Process batch jobs with rate limiting
     */
    private async processBatchAsync(batchId: string, jobs: any[]): Promise<void> {
        logger.info(`[BatchProcessor] Processing batch ${batchId} (${jobs.length} jobs)`);

        // Group into chunks for concurrent processing
        const chunks = this.chunkArray(jobs, this.MAX_CONCURRENT);

        for (const chunk of chunks) {
            // Process chunk concurrently
            await Promise.all(
                chunk.map(job => this.processJobSafe(job.id))
            );

            // Rate limit between chunks
            if (chunks.indexOf(chunk) < chunks.length - 1) {
                await this.sleep(this.RATE_LIMIT_MS);
            }
        }

        logger.info(`[BatchProcessor] Batch ${batchId} completed`);
    }

    /**
     * Process single job with error handling
     */
    private async processJobSafe(jobId: string): Promise<void> {
        try {
            await this.processor.processJob(jobId);
        } catch (error) {
            logger.error(`[BatchProcessor] Job ${jobId} failed:`, error);
            // Job failure is handled in processor
        }
    }

    /**
     * Create document processing job
     */
    private async createJob(params: {
        userId: string;
        businessId?: string;
        documentUrl: string;
        batchId: string;
        priority: number;
    }): Promise<any> {
        const { data, error } = await supabase
            .from('document_processing_jobs')
            .insert({
                user_id: params.userId,
                business_id: params.businessId,
                document_type: 'bank_statement',
                document_url: params.documentUrl,
                processing_status: 'queued',
                priority: params.priority,
                metadata: { batch_id: params.batchId }
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get batch processing status
     */
    async getBatchStatus(batchId: string): Promise<BatchStatus> {
        const { data: jobs, error } = await supabase
            .from('document_processing_jobs')
            .select('*')
            .eq('metadata->>batch_id', batchId);

        if (error) throw error;
        if (!jobs) {
            throw new Error(`Batch ${batchId} not found`);
        }

        const completed = jobs.filter(j => j.processing_status === 'completed');
        const failed = jobs.filter(j => j.processing_status === 'failed');
        const inProgress = jobs.filter(j => j.processing_status === 'processing');
        const queued = jobs.filter(j => j.processing_status === 'queued');

        // Calculate average accuracy from completed jobs
        const accuracy = await this.calculateBatchAccuracy(completed);

        // Count patterns learned during this batch
        const patternsLearned = await this.countPatternsLearned(batchId);

        return {
            batchId,
            totalJobs: jobs.length,
            completed: completed.length,
            failed: failed.length,
            inProgress: inProgress.length,
            queued: queued.length,
            accuracy,
            patternsLearned
        };
    }

    /**
     * Calculate average accuracy across batch
     */
    private async calculateBatchAccuracy(completedJobs: any[]): Promise<number | undefined> {
        if (completedJobs.length === 0) return undefined;

        const statementIds = completedJobs
            .map(j => j.statement_id)
            .filter(Boolean);

        if (statementIds.length === 0) return undefined;

        const { data: statements } = await supabase
            .from('bank_statements')
            .select('classification_accuracy')
            .in('id', statementIds);

        if (!statements || statements.length === 0) return undefined;

        const validAccuracies = statements
            .map(s => s.classification_accuracy)
            .filter(a => a !== null && a !== undefined);

        if (validAccuracies.length === 0) return undefined;

        const sum = validAccuracies.reduce((acc, val) => acc + val, 0);
        return sum / validAccuracies.length;
    }

    /**
     * Count new patterns learned during batch
     */
    private async countPatternsLearned(batchId: string): Promise<number> {
        // Get earliest job creation time for this batch
        const { data: jobs } = await supabase
            .from('document_processing_jobs')
            .select('created_at')
            .eq('metadata->>batch_id', batchId)
            .order('created_at', { ascending: true })
            .limit(1);

        if (!jobs || jobs.length === 0) return 0;

        const batchStartTime = jobs[0].created_at;

        // Count patterns created since batch start
        const { count } = await supabase
            .from('business_classification_patterns')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', batchStartTime);

        return count || 0;
    }

    /**
     * Helper: Split array into chunks
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Helper: Sleep for milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Generate unique batch ID
     */
    private generateBatchId(): string {
        return `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }
}
