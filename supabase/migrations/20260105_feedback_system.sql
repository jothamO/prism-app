-- Phase 5: Automated Learning Pipeline - Feedback System
-- Capture user corrections and learn business-specific patterns

-- User corrections on AI classifications
CREATE TABLE IF NOT EXISTS ai_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- What was classified
    entity_type VARCHAR(50) NOT NULL, -- 'invoice_item', 'expense_category', 'supplier'
    entity_id UUID, -- Reference to invoice, expense, etc.
    
    -- Original AI prediction
    ai_prediction JSONB NOT NULL, -- { category: 'office_supplies', confidence: 0.75 }
    ai_model_version VARCHAR(20) DEFAULT 'v1.0',
    
    -- User correction
    user_correction JSONB NOT NULL, -- { category: 'marketing_expense' }
    correction_type VARCHAR(20) DEFAULT 'full_override', -- 'full_override', 'partial_edit', 'confirmation'
    
    -- Context for learning
    item_description TEXT NOT NULL,
    amount DECIMAL(15,2),
    metadata JSONB DEFAULT '{}', -- Additional context
    
    -- Training status
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id UUID,
    trained_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User validation of auto-processed invoices
CREATE TABLE IF NOT EXISTS invoice_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    
    -- What changed during validation
    original_data JSONB, -- OCR/AI output
    validated_data JSONB, -- User-corrected data
    fields_changed TEXT[], -- ['customer_name', 'vat_amount', 'items[0].description']
    
    -- Quality metrics
    ocr_confidence_score DECIMAL(5,4),
    validation_time_seconds INT, -- Time user spent reviewing
    needs_review BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Business-specific classification patterns (learned from user)
CREATE TABLE IF NOT EXISTS business_classification_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
    
    -- Pattern learned
    item_pattern TEXT NOT NULL, -- Normalized description (e.g., "facebook ads")
    category VARCHAR(100) NOT NULL, -- Learned category (e.g., "marketing_expense")
    confidence DECIMAL(5,4) NOT NULL DEFAULT 0.50, -- How often this pattern → category
    
    -- Usage statistics
    occurrences INT DEFAULT 1,
    correct_predictions INT DEFAULT 0,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Pattern metadata
    average_amount DECIMAL(15,2), -- Average transaction amount for this pattern
    amount_variance DECIMAL(15,2), -- Standard deviation
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(business_id, item_pattern, category)
);

-- ML model versions and performance tracking
CREATE TABLE IF NOT EXISTS ml_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(20) UNIQUE NOT NULL,
    model_type VARCHAR(50) NOT NULL, -- 'classification', 'category', 'supplier'
    
    -- Model metadata
    training_data_count INT,
    training_started_at TIMESTAMPTZ,
    training_completed_at TIMESTAMPTZ,
    
    -- Performance metrics
    accuracy DECIMAL(5,4),
    precision_score DECIMAL(5,4),
    recall_score DECIMAL(5,4),
    f1_score DECIMAL(5,4),
    
    -- Deployment status
    status VARCHAR(20) DEFAULT 'training', -- training, validation, deployed, deprecated
    deployed_at TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    
    -- Model artifacts
    model_config JSONB, -- Hyperparameters, architecture
    training_metrics JSONB, -- Detailed training logs
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_created 
ON ai_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_business 
ON ai_feedback(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_training 
ON ai_feedback(used_in_training, created_at) 
WHERE NOT used_in_training;

CREATE INDEX IF NOT EXISTS idx_ai_feedback_entity 
ON ai_feedback(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_invoice_validations_invoice 
ON invoice_validations(invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_validations_user 
ON invoice_validations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_patterns_business 
ON business_classification_patterns(business_id, confidence DESC);

CREATE INDEX IF NOT EXISTS idx_business_patterns_pattern 
ON business_classification_patterns USING gin(item_pattern gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ml_models_status 
ON ml_models(status, version);

-- Enable trigram extension for fuzzy pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Function to update business pattern confidence
CREATE OR REPLACE FUNCTION update_business_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
    -- Recalculate confidence based on success rate
    NEW.confidence = CASE 
        WHEN NEW.occurrences > 0 
        THEN LEAST(CAST(NEW.correct_predictions AS DECIMAL) / CAST(NEW.occurrences AS DECIMAL), 0.99)
        ELSE 0.50
    END;
    
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_pattern_confidence
    BEFORE UPDATE OF correct_predictions, occurrences
    ON business_classification_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_business_pattern_confidence();

-- Function to upsert business pattern
CREATE OR REPLACE FUNCTION upsert_business_pattern(
    p_business_id UUID,
    p_pattern TEXT,
    p_category VARCHAR(100),
    p_amount DECIMAL DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO business_classification_patterns (
        business_id,
        item_pattern,
        category,
        occurrences,
        average_amount,
        last_seen_at
    )
    VALUES (
        p_business_id,
        LOWER(TRIM(p_pattern)),
        p_category,
        1,
        p_amount,
        NOW()
    )
    ON CONFLICT (business_id, item_pattern, category) 
    DO UPDATE SET
        occurrences = business_classification_patterns.occurrences + 1,
        average_amount = CASE 
            WHEN p_amount IS NOT NULL 
            THEN (business_classification_patterns.average_amount * business_classification_patterns.occurrences + p_amount) / (business_classification_patterns.occurrences + 1)
            ELSE business_classification_patterns.average_amount
        END,
        last_seen_at = NOW(),
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON TABLE ai_feedback IS 'Tracks user corrections on AI predictions for model retraining';
COMMENT ON TABLE invoice_validations IS 'Captures user validation/correction of auto-processed invoices';
COMMENT ON TABLE business_classification_patterns IS 'Business-specific patterns learned from user corrections';
COMMENT ON TABLE ml_models IS 'ML model versions and performance tracking';

COMMENT ON COLUMN ai_feedback.entity_type IS 'Type of entity classified: invoice_item, expense_category, supplier, etc.';
COMMENT ON COLUMN ai_feedback.correction_type IS 'full_override (AI wrong), partial_edit (AI partially correct), confirmation (AI correct)';
COMMENT ON COLUMN business_classification_patterns.confidence IS 'Success rate: correct_predictions / occurrences';
