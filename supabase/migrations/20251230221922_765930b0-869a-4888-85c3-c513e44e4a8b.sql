-- =============================================
-- Migration 1: Analytics Tables
-- =============================================

-- Create user_events table for event tracking
CREATE TABLE IF NOT EXISTS public.user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create analytics_summary table for pre-aggregated metrics
CREATE TABLE IF NOT EXISTS public.analytics_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name VARCHAR(50) NOT NULL,
  metric_value DECIMAL(15,2) NOT NULL,
  period VARCHAR(10) NOT NULL,
  period_date DATE NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for user_events
CREATE INDEX IF NOT EXISTS idx_events_user_type ON public.user_events(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON public.user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON public.user_events(event_type);

-- Create indexes for analytics_summary
CREATE INDEX IF NOT EXISTS idx_analytics_metric ON public.analytics_summary(metric_name, period_date);
CREATE INDEX IF NOT EXISTS idx_analytics_period ON public.analytics_summary(period, period_date);

-- Enable RLS on user_events
ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- Enable RLS on analytics_summary
ALTER TABLE public.analytics_summary ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_events
CREATE POLICY "Users can view their own events"
ON public.user_events
FOR SELECT
USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create their own events"
ON public.user_events
FOR INSERT
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all events"
ON public.user_events
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS Policies for analytics_summary (admin only)
CREATE POLICY "Admins can view analytics"
ON public.analytics_summary
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage analytics"
ON public.analytics_summary
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- Migration 2: Review Queue Priority Score
-- =============================================

-- Add priority_score column to review_queue
ALTER TABLE public.review_queue 
ADD COLUMN IF NOT EXISTS priority_score DECIMAL(3,2) DEFAULT 0.5;

-- Create indexes for review_queue priority
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON public.review_queue(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_queue_status ON public.review_queue(status, priority);