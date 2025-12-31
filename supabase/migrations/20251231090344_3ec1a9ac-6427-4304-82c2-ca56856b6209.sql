-- Enable pg_trgm extension for fuzzy pattern matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Table 1: ai_feedback - Stores user corrections on AI predictions
CREATE TABLE public.ai_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_id UUID REFERENCES public.businesses(id) ON DELETE SET NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    ai_prediction JSONB NOT NULL,
    user_correction JSONB NOT NULL,
    item_description TEXT NOT NULL,
    amount NUMERIC(15,2),
    metadata JSONB DEFAULT '{}',
    ai_model_version VARCHAR(50),
    correction_type VARCHAR(50) NOT NULL,
    used_in_training BOOLEAN DEFAULT FALSE,
    training_batch_id VARCHAR(100),
    trained_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 2: invoice_validations - Tracks OCR/AI validation changes
CREATE TABLE public.invoice_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    original_data JSONB NOT NULL,
    validated_data JSONB NOT NULL,
    fields_changed TEXT[] DEFAULT '{}',
    ocr_confidence_score NUMERIC(5,4),
    validation_time_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 3: business_classification_patterns - Learned patterns per business
CREATE TABLE public.business_classification_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    item_pattern TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    occurrence_count INTEGER DEFAULT 1,
    correct_predictions INTEGER DEFAULT 1,
    total_amount NUMERIC(15,2) DEFAULT 0,
    confidence NUMERIC(5,4) DEFAULT 0.5,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(business_id, item_pattern, category)
);

-- Table 4: ml_models - ML model version tracking
CREATE TABLE public.ml_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    training_data_count INTEGER DEFAULT 0,
    accuracy NUMERIC(5,4),
    precision_score NUMERIC(5,4),
    recall_score NUMERIC(5,4),
    f1_score NUMERIC(5,4),
    is_active BOOLEAN DEFAULT FALSE,
    trained_at TIMESTAMP WITH TIME ZONE,
    deployed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(model_name, version)
);

-- Function: update_business_pattern_confidence - Trigger to auto-recalculate confidence
CREATE OR REPLACE FUNCTION public.update_business_pattern_confidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.confidence := CASE 
        WHEN NEW.occurrence_count > 0 THEN 
            LEAST(1.0, (NEW.correct_predictions::NUMERIC / NEW.occurrence_count) * 
                  (1 - EXP(-NEW.occurrence_count::NUMERIC / 10)))
        ELSE 0.5 
    END;
    RETURN NEW;
END;
$$;

-- Trigger to update confidence on insert/update
CREATE TRIGGER update_pattern_confidence
    BEFORE INSERT OR UPDATE ON public.business_classification_patterns
    FOR EACH ROW
    EXECUTE FUNCTION public.update_business_pattern_confidence();

-- Function: upsert_business_pattern - Atomically insert or update patterns
CREATE OR REPLACE FUNCTION public.upsert_business_pattern(
    p_business_id UUID,
    p_pattern TEXT,
    p_category VARCHAR(100),
    p_amount NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pattern_id UUID;
BEGIN
    INSERT INTO public.business_classification_patterns (
        business_id, item_pattern, category, occurrence_count, correct_predictions, total_amount, last_used_at
    )
    VALUES (
        p_business_id, LOWER(TRIM(p_pattern)), p_category, 1, 1, COALESCE(p_amount, 0), NOW()
    )
    ON CONFLICT (business_id, item_pattern, category)
    DO UPDATE SET
        occurrence_count = business_classification_patterns.occurrence_count + 1,
        correct_predictions = business_classification_patterns.correct_predictions + 1,
        total_amount = business_classification_patterns.total_amount + COALESCE(p_amount, 0),
        last_used_at = NOW()
    RETURNING id INTO v_pattern_id;
    
    RETURN v_pattern_id;
END;
$$;

-- Performance indexes
CREATE INDEX idx_ai_feedback_user_id ON public.ai_feedback(user_id);
CREATE INDEX idx_ai_feedback_business_id ON public.ai_feedback(business_id);
CREATE INDEX idx_ai_feedback_entity_type ON public.ai_feedback(entity_type);
CREATE INDEX idx_ai_feedback_used_in_training ON public.ai_feedback(used_in_training);
CREATE INDEX idx_ai_feedback_created_at ON public.ai_feedback(created_at);
CREATE INDEX idx_invoice_validations_invoice_id ON public.invoice_validations(invoice_id);
CREATE INDEX idx_invoice_validations_user_id ON public.invoice_validations(user_id);
CREATE INDEX idx_business_patterns_business_id ON public.business_classification_patterns(business_id);
CREATE INDEX idx_business_patterns_pattern_trgm ON public.business_classification_patterns USING gin(item_pattern gin_trgm_ops);

-- Enable RLS
ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_classification_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ml_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_feedback
CREATE POLICY "Users can view their own feedback"
    ON public.ai_feedback FOR SELECT
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own feedback"
    ON public.ai_feedback FOR INSERT
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own feedback"
    ON public.ai_feedback FOR UPDATE
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- RLS Policies for invoice_validations
CREATE POLICY "Users can view their own validations"
    ON public.invoice_validations FOR SELECT
    USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own validations"
    ON public.invoice_validations FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- RLS Policies for business_classification_patterns
CREATE POLICY "Users can view patterns for their businesses"
    ON public.business_classification_patterns FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses 
            WHERE businesses.id = business_classification_patterns.business_id 
            AND businesses.user_id = auth.uid()
        ) OR has_role(auth.uid(), 'admin')
    );

CREATE POLICY "Users can manage patterns for their businesses"
    ON public.business_classification_patterns FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.businesses 
            WHERE businesses.id = business_classification_patterns.business_id 
            AND businesses.user_id = auth.uid()
        ) OR has_role(auth.uid(), 'admin')
    );

-- RLS Policies for ml_models (admin only)
CREATE POLICY "Admins can manage ml_models"
    ON public.ml_models FOR ALL
    USING (has_role(auth.uid(), 'admin'));