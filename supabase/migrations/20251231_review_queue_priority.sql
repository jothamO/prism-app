-- Add priority columns to review_queue table
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium';
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS priority_score DECIMAL(3,2) DEFAULT 0.5;

-- Create index for efficient sorting
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status, priority);

-- Update existing records with calculated priority
UPDATE review_queue rq
SET priority_score = LEAST(1.0, GREATEST(0.0,
    -- Amount score (0-0.4): normalized by ₦2M max
    (COALESCE((SELECT total FROM invoices WHERE id = rq.invoice_id), 0) / 2000000.0) * 0.4 +
    -- Confidence score (0-0.4): inverted (low confidence = high priority)
    (1 - COALESCE((SELECT confidence_score FROM invoices WHERE id = rq.invoice_id), 1)) * 0.4 +
    -- Age score (0-0.2): days old / 7 days max
    (EXTRACT(EPOCH FROM (NOW() - rq.created_at)) / (7 * 24 * 60 * 60)) * 0.2
)),
priority = CASE
    WHEN priority_score > 0.7 THEN 'high'
    WHEN priority_score > 0.4 THEN 'medium'
    ELSE 'low'
END
WHERE status = 'pending';
