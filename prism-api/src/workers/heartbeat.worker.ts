import { Queue, Worker } from 'bullmq';
import { redisConnection } from '../config/redis';
import { heartbeatExtractorService } from '../services/heartbeat-extractor.service';

export const heartbeatQueue = new Queue('heartbeat-extraction', { connection: redisConnection });

const worker = new Worker('heartbeat-extraction', async (job) => {
    if (job.name === 'global-heartbeat') {
        console.log('💓 Running scheduled global heartbeat extraction...');
        await heartbeatExtractorService.runGlobalHeartbeat();
        return { success: true };
    }
}, { connection: redisConnection });

/**
 * Schedule the heartbeat extraction to run every 6 hours
 */
export async function scheduleHeartbeat() {
    // Clean up old repeatable jobs
    const repeatableJobs = await heartbeatQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await heartbeatQueue.removeRepeatableByKey(job.key);
    }

    // Schedule global heartbeat every 6 hours
    await heartbeatQueue.add('global-heartbeat', {}, {
        repeat: { pattern: '0 */6 * * *' }
    });

    console.log('📅 Scheduled Global Heartbeat Extraction (Every 6 hours)');
}
