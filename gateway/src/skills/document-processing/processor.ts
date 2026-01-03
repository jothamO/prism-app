/**
 * Document Processor
 * Orchestrates extraction, classification, and analysis of bank statements
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../utils/logger';
import { supabase } from '../../config';
import { BankStatementExtractor } from './extractors/bank-statement';
import { BusinessPatternClassifier } from './classifiers/business-pattern';
import { RuleBasedClassifier } from './classifiers/rule-based';
import { AIClassifier } from './classifiers/ai-classifier';
import { NigerianDetectors } from './nigerian-detectors/index';
import { ComplianceChecker } from './compliance/index';
import { FeedbackHandler } from './feedback/correction-handler';

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' });

export class DocumentProcessor {
    private extractor = new BankStatementExtractor(claude);
    private businessPatternClassifier = new BusinessPatternClassifier();
    private ruleBasedClassifier = new RuleBasedClassifier();
    private aiClassifier = new AIClassifier(claude);
    private nigerianDetectors = new NigerianDetectors();
    private complianceChecker = new ComplianceChecker();
    private feedbackHandler = new FeedbackHandler();

    /**
     * Process a document processing job
     */
    async processJob(jobId: string): Promise<void> {
        try {
            // Get job details
            const { data: job, error: jobError } = await supabase
                .from('document_processing_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (jobError || !job) {
                throw new Error(`Job ${jobId} not found`);
            }

            logger.info(`[Processor] Starting job ${jobId}`, {
                documentType: job.document_type,
                userId: job.user_id
            });

            // Update status to processing
            await this.updateJobStatus(jobId, 'processing', { started_at: new Date().toISOString() });

            // Step 1: Extract transactions from document
            const transactions = await this.extractor.extract(job.document_url);

            logger.info(`[Processor] Extracted ${transactions.length} transactions`);

            // Step 2: Create bank statement record
            const statement = await this.createStatement(job, transactions);

            // Step 3: Classify and save each transaction
            for (const txn of transactions) {
                await this.classifyAndSaveTransaction(txn, statement.id, job);
            }

            // Step 4: Generate summary
            const summary = await this.generateSummary(statement.id);

            // Step 5: Update job as completed
            await this.updateJobStatus(jobId, 'completed', {
                completed_at: new Date().toISOString(),
                statement_id: statement.id,
                result_summary: summary
            });

            // Step 6: Notify user
            await this.notifyUser(job.user_id, summary);

            logger.info(`[Processor] Job ${jobId} completed`, summary);
        } catch (error) {
            logger.error(`[Processor] Job ${jobId} failed:`, error);
            await this.updateJobStatus(jobId, 'failed', {
                failed_at: new Date().toISOString(),
                error_message: (error as Error).message
            });
        }
    }

    /**
     * Classify and save a single transaction
     */
    private async classifyAndSaveTransaction(
        txn: any,
        statementId: string,
        job: any
    ): Promise<void> {
        // Step 1: Try business pattern (fastest, most accurate)
        let classification = await this.businessPatternClassifier.classify({
            businessId: job.business_id,
            description: txn.description,
            amount: txn.credit || txn.debit
        });

        // Step 2: If no pattern match, try rule-based
        if (!classification || classification.confidence < 0.85) {
            const ruleResult = await this.ruleBasedClassifier.classify(txn);
            if (ruleResult.confidence > (classification?.confidence || 0)) {
                classification = ruleResult;
            }
        }

        // Step 3: If still low confidence, use AI
        if (!classification || classification.confidence < 0.75) {
            const aiResult = await this.aiClassifier.classify(txn, {
                userId: job.user_id,
                businessId: job.business_id
            });
            classification = aiResult;
        }

        // Step 4: Apply Nigerian-specific detectors
        const nigerianFlags = await this.nigerianDetectors.detect(txn);

        // Step 5: Run compliance checks
        const complianceFlags = await this.complianceChecker.check(txn, {
            userId: job.user_id,
            businessId: job.business_id,
            statementId
        });

        // Step 6: Save transaction (with null safety)
        if (!classification) {
            classification = {
                classification: 'unclassified',
                category: 'needs_review',
                confidence: 0,
                source: 'ai' as const
            };
        }

        const needsReview = classification.confidence < 0.75 || complianceFlags.length > 0;
        
        await supabase.from('bank_transactions').insert({
            statement_id: statementId,
            user_id: job.user_id,
            transaction_date: txn.date,
            description: txn.description,
            debit: txn.debit,
            credit: txn.credit,
            balance: txn.balance,
            reference: txn.reference,
            classification: classification.classification,
            category: classification.category,
            confidence: classification.confidence,
            classification_source: classification.source,
            user_reviewed: false,
            ...nigerianFlags,
            compliance_flags: complianceFlags,
            metadata: { requires_confirmation: needsReview }
        });
    }

    /**
     * Create bank statement record
     */
    private async createStatement(job: any, transactions: any[]): Promise<any> {
        const { data, error } = await supabase
            .from('bank_statements')
            .insert({
                user_id: job.user_id,
                business_id: job.business_id,
                file_url: job.document_url,
                processing_status: 'processing',
                statement_start_date: transactions[0]?.date,
                statement_end_date: transactions[transactions.length - 1]?.date,
                transaction_count: transactions.length,
                metadata: { upload_source: 'gateway' }
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Generate summary of processed statement
     */
    private async generateSummary(statementId: string): Promise<any> {
        const { data: transactions } = await supabase
            .from('bank_transactions')
            .select('*')
            .eq('statement_id', statementId);

        if (!transactions) return {};

        const sales = transactions.filter(t => t.classification === 'sale');
        const expenses = transactions.filter(t => t.classification === 'expense');
        const needsReview = transactions.filter(t => t.confidence < 0.75 || !t.user_reviewed);

        return {
            transactions: transactions.length,
            classified: transactions.filter(t => t.classification).length,
            needsReview: needsReview.length,
            sales: sales.reduce((sum, t) => sum + (t.credit || 0), 0),
            expenses: expenses.reduce((sum, t) => sum + (t.debit || 0), 0),
            accuracy: 0.95 // Will be calculated from user feedback
        };
    }

    /**
     * Update job status
     */
    private async updateJobStatus(jobId: string, status: string, updates: any = {}): Promise<void> {
        await supabase
            .from('document_processing_jobs')
            .update({ processing_status: status, ...updates })
            .eq('id', jobId);
    }

    /**
     * Notify user of completion
     * In production, this would send via Telegram/WhatsApp
     */
    private async notifyUser(userId: string, summary: any): Promise<void> {
        logger.info(`[Processor] Notify user ${userId}`, summary);
        // TODO: Integrate with bot to send completion message
    }
}
