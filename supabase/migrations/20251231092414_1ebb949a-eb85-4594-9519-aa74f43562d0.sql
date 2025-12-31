-- Add model_type and status columns to ml_models for better tracking
ALTER TABLE public.ml_models 
ADD COLUMN IF NOT EXISTS model_type VARCHAR(50) DEFAULT 'classification',
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'trained';