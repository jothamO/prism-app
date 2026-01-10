-- Add missing columns to ml_models table for training configuration
ALTER TABLE public.ml_models 
ADD COLUMN IF NOT EXISTS model_config JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS training_metadata JSONB DEFAULT '{}'::jsonb;