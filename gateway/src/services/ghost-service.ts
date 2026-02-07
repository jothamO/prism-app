/**
 * Ghost Service
 * Handles SHA-256 hashing and file purging for Metadata Ghosting (PRISM P6.18).
 */

import { createHash } from 'crypto';
import { supabase } from '../config';
import { logger } from '../utils/logger';

export class GhostService {
    /**
     * Calculate SHA-256 hash of a buffer
     */
    static calculateHash(buffer: Buffer): string {
        return createHash('sha256').update(buffer).digest('hex');
    }

    /**
     * Permanently delete a file from Supabase storage
     * @param fileUrl The full URL of the file to be purged
     */
    static async purgeFile(fileUrl: string): Promise<void> {
        try {
            logger.info('[GhostService] Purging file', { fileUrl: fileUrl.substring(0, 50) + '...' });

            // Extract bucket and path from URL
            // Format: .../storage/v1/object/public/BUCKET_NAME/PATH/TO/FILE
            const urlParts = fileUrl.split('/storage/v1/object/public/');
            if (urlParts.length < 2) {
                throw new Error('Invalid file URL format for storage purge');
            }

            const pathParts = urlParts[1].split('/');
            const bucketName = pathParts[0];
            const filePath = pathParts.slice(1).join('/');

            const { error } = await supabase.storage
                .from(bucketName)
                .remove([filePath]);

            if (error) {
                throw error;
            }

            logger.info('[GhostService] File purged successfully', { bucketName, filePath });
        } catch (error) {
            logger.error('[GhostService] Failed to purge file', { error, fileUrl });
            throw error;
        }
    }
}
