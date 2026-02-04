-- Migration 1a: Add 'owner' to app_role enum
-- This must be committed separately before it can be used
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';