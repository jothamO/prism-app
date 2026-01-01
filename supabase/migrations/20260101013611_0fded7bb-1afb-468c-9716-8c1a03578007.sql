-- Step 1: Drop indexes that depend on pg_trgm operators
DROP INDEX IF EXISTS public.idx_business_patterns_pattern_trgm;
DROP INDEX IF EXISTS public.idx_business_patterns_pattern;

-- Step 2: Move pg_trgm extension from public to extensions schema
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- Step 3: Recreate the indexes with schema-qualified operators
CREATE INDEX idx_business_patterns_pattern_trgm 
  ON public.business_classification_patterns 
  USING gin(item_pattern extensions.gin_trgm_ops);