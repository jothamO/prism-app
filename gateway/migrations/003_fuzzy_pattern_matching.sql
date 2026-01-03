-- Phase 2B: Fuzzy Pattern Matching
-- Add trigram similarity searching for business patterns

-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index on item_pattern for fast similarity searches
CREATE INDEX IF NOT EXISTS idx_business_patterns_trgm 
ON business_classification_patterns 
USING gin(item_pattern gin_trgm_ops);

-- Function to find similar patterns using trigram similarity
CREATE OR REPLACE FUNCTION find_similar_pattern(
    p_business_id UUID,
    p_description TEXT,
    p_threshold DECIMAL DEFAULT 0.3
)
RETURNS TABLE (
    id UUID,
    item_pattern TEXT,
    category VARCHAR(100),
    confidence DECIMAL(5,4),
    similarity DECIMAL(5,4)
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        bcp.id,
        bcp.item_pattern,
        bcp.category,
        bcp.confidence,
        similarity(bcp.item_pattern, LOWER(TRIM(p_description))) as sim
    FROM business_classification_patterns bcp
    WHERE bcp.business_id = p_business_id
        AND similarity(bcp.item_pattern, LOWER(TRIM(p_description))) > p_threshold
    ORDER BY sim DESC, bcp.confidence DESC
    LIMIT 1;
END;
$$;

-- Comments
COMMENT ON FUNCTION find_similar_pattern IS 'Finds the most similar business pattern using trigram similarity (fuzzy matching)';
COMMENT ON INDEX idx_business_patterns_trgm IS 'Accelerates fuzzy pattern matching queries using trigrams';
