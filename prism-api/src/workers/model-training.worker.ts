/**
 * Model Retraining Worker
 * Phase 5 Week 2: Automated Learning Pipeline
 * 
 * Periodically retrains classification models with user feedback
 * Runs weekly to incorporate new corrections
 */

import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { feedbackCollectionService } from '../services/feedback-collection.service';
import { supabase } from '../config/database';
import OpenAI from 'openai';

export const modelTrainingQueue = new Queue('model-training', { connection: redisConnection });

interface TrainingMetrics {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
}

export class ModelTrainingWorker {
    private openai: OpenAI | null = null;

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    /**
     * Main retraining workflow
     * Runs weekly to update classification model
     */
    async retrain

    Model() {
        console.log('🧠 Starting model retraining workflow...');

        try {
            // Step 1: Fetch untrained feedback
            const feedbackData = await feedbackCollectionService.getUntrainedFeedback(10000);

            if (feedbackData.length < 100) {
                console.log(`⏸️ Insufficient training data: ${feedbackData.length} samples (minimum 100 required)`);
                return {
                    success: false,
                    reason: 'insufficient_data',
                    samplesAvailable: feedbackData.length
                };
            }

            console.log(`📊 Preparing ${feedbackData.length} training samples`);

            // Step 2: Prepare training data
            const trainingSet = this.prepareTrainingData(feedbackData);
            const { training, validation } = this.splitData(trainingSet, 0.80);

            console.log(`✂️ Split: ${training.length} training, ${validation.length} validation`);

            // Step 3: Train new model
            const newModelId = await this.trainWithOpenAI(training);

            if (!newModelId) {
                throw new Error('Model training failed');
            }

            console.log(`🎓 Model trained: ${newModelId}`);

            // Step 4: Validate new model
            const metrics = await this.validateModel(newModelId, validation);

            console.log(`📈 Validation metrics:`, metrics);

            // Step 5: Deploy if accuracy threshold met
            if (metrics.accuracy >= 0.85) {
                await this.deployModel(newModelId, metrics);

                // Mark feedback as used
                const feedbackIds = feedbackData.map(f => f.id);
                await feedbackCollectionService.markAsUsedInTraining(feedbackIds, newModelId);

                console.log(`✅ Model ${newModelId} deployed successfully!`);

                return {
                    success: true,
                    modelId: newModelId,
                    metrics,
                    samplesUsed: feedbackData.length
                };
            } else {
                console.log(`❌ Model ${newModelId} rejected: accuracy ${metrics.accuracy} < 0.85`);

                await this.saveModelRecord(newModelId, 'validation_failed', metrics, feedbackData.length);

                return {
                    success: false,
                    reason: 'low_accuracy',
                    modelId: newModelId,
                    metrics
                };
            }

        } catch (error: any) {
            console.error('❌ Model retraining failed:', error);
            throw error;
        }
    }

    /**
     * Prepare training data from feedback
     */
    private prepareTrainingData(feedbackData: any[]): Array<{
        input: string;
        output: string;
        metadata?: any;
    }> {
        return feedbackData.map(feedback => ({
            input: this.formatInput(feedback),
            output: this.formatOutput(feedback),
            metadata: {
                originalAI: feedback.ai_prediction,
                correctionType: feedback.correction_type,
                confidence: feedback.ai_prediction?.confidence || 0
            }
        }));
    }

    /**
     * Format input for training
     */
    private formatInput(feedback: any): string {
        const amount = feedback.amount ? `Amount: ₦${feedback.amount.toLocaleString()}. ` : '';
        return `${amount}Description: ${feedback.item_description}`;
    }

    /**
     * Format expected output
     */
    private formatOutput(feedback: any): string {
        const category = feedback.user_correction.category || feedback.user_correction.classification;
        return category;
    }

    /**
     * Split data into training and validation sets
     */
    private splitData(data: any[], trainRatio: number = 0.80): { training: any[], validation: any[] } {
        const shuffled = [...data].sort(() => Math.random() - 0.5);
        const splitIndex = Math.floor(shuffled.length * trainRatio);

        return {
            training: shuffled.slice(0, splitIndex),
            validation: shuffled.slice(splitIndex)
        };
    }

    /**
     * Train model using OpenAI Fine-Tuning
     */
    private async trainWithOpenAI(trainingData: any[]): Promise<string | null> {
        if (!this.openai) {
            console.warn('⚠️ OpenAI not configured, using mock training');
            return `mock_model_${Date.now()}`;
        }

        try {
            // Convert to OpenAI fine-tuning format
            const formattedData = trainingData.map(item => ({
                messages: [
                    { role: "system", content: "You are a financial transaction classifier. Classify transactions into categories." },
                    { role: "user", content: item.input },
                    { role: "assistant", content: item.output }
                ]
            }));

            // Upload training file
            const trainingFile = await this.openai.files.create({
                file: new Blob([formattedData.map(d => JSON.stringify(d)).join('\n')], { type: 'application/jsonl' }),
                purpose: 'fine-tune'
            });

            // Start fine-tuning job
            const fineTune = await this.openai.fineTuning.jobs.create({
                training_file: trainingFile.id,
                model: 'gpt-4o-mini-2024-07-18',
                suffix: `prism-classifier-${Date.now()}`
            });

            console.log(`🔄 Fine-tuning job started: ${fineTune.id}`);

            // Poll for completion (in production, use webhook)
            let status = fineTune.status;
            while (status !== 'succeeded' && status !== 'failed') {
                await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute

                const job = await this.openai.fineTuning.jobs.retrieve(fineTune.id);
                status = job.status;

                console.log(`📊 Fine-tuning status: ${status}`);
            }

            if (status === 'succeeded') {
                const completedJob = await this.openai.fineTuning.jobs.retrieve(fineTune.id);
                return completedJob.fine_tuned_model || null;
            }

            return null;

        } catch (error) {
            console.error('OpenAI fine-tuning error:', error);
            return null;
        }
    }

    /**
     * Validate model on validation set
     */
    private async validateModel(modelId: string, validationData: any[]): Promise<TrainingMetrics> {
        let correct = 0;
        let tp = 0, fp = 0, fn = 0; // For precision/recall

        for (const item of validationData.slice(0, 50)) { // Sample 50 for speed
            try {
                const predicted = await this.predictWithModel(modelId, item.input);
                const actual = item.output;

                if (predicted === actual) {
                    correct++;
                    tp++;
                } else {
                    fp++;
                    fn++;
                }
            } catch (error) {
                console.error('Validation prediction error:', error);
                fn++;
            }
        }

        const accuracy = correct / Math.min(validationData.length, 50);
        const precision = tp / (tp + fp) || 0;
        const recall = tp / (tp + fn) || 0;
        const f1Score = 2 * (precision * recall) / (precision + recall) || 0;

        return { accuracy, precision, recall, f1Score };
    }

    /**
     * Make prediction with model
     */
    private async predictWithModel(modelId: string, input: string): Promise<string> {
        if (!this.openai || modelId.startswith('mock')) {
            // Mock prediction for testing
            return 'mock_category';
        }

        const response = await this.openai.chat.completions.create({
            model: modelId,
            messages: [
                { role: "system", content: "You are a financial transaction classifier." },
                { role: "user", content: input }
            ],
            max_tokens: 20
        });

        return response.choices[0].message.content?.trim() || 'unknown';
    }

    /**
     * Deploy model to production
     */
    private async deployModel(modelId: string, metrics: TrainingMetrics): Promise<void> {
        const version = `v${Date.now()}`;

        // Save to ml_models table
        await this.saveModelRecord(modelId, 'deployed', metrics, 0);

        // Update environment variable (in production, use config service)
        process.env.AI_MODEL_VERSION = version;
        process.env.AI_FINE_TUNED_MODEL_ID = modelId;

        console.log(`🚀 Deployed model ${modelId} as version ${version}`);
    }

    /**
     * Save model record to database
     */
    private async saveModelRecord(
        modelId: string,
        status: string,
        metrics: TrainingMetrics,
        trainingDataCount: number
    ): Promise<void> {
        await supabase.from('ml_models').insert({
            version: modelId,
            model_type: 'classification',
            training_data_count: trainingDataCount,
            accuracy: metrics.accuracy,
            precision_score: metrics.precision,
            recall_score: metrics.recall,
            f1_score: metrics.f1Score,
            status,
            deployed_at: status === 'deployed' ? new Date().toISOString() : null
        });
    }
}

// Create worker instance
const worker = new Worker('model-training', async (job) => {
    const trainer = new ModelTrainingWorker();

    if (job.name === 'retrain') {
        return await trainer.retrainModel();
    }

    throw new Error(`Unknown job: ${job.name}`);
}, { connection: redisConnection });

/**
 * Schedule weekly retraining
 */
export async function scheduleWeeklyRetraining() {
    console.log('⏰ Scheduling weekly model retraining...');

    // Run every Sunday at 2 AM
    await modelTrainingQueue.add('retrain', {}, {
        repeat: { pattern: '0 2 * * 0' }, // Cron: 2 AM every Sunday
        jobId: 'weekly-model-retraining'
    });

    console.log('✅ Weekly retraining scheduled for Sundays at 2 AM');
}

export const modelTrainingWorker = worker;
