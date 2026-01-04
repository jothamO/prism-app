-- Add missing updated_at column to ai_feedback
ALTER TABLE ai_feedback 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add trigger for updated_at on ai_feedback
CREATE OR REPLACE FUNCTION update_ai_feedback_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ai_feedback_updated_at
    BEFORE UPDATE ON ai_feedback
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_feedback_updated_at();

-- Add missing needs_review column to invoice_validations
ALTER TABLE invoice_validations 
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT FALSE;