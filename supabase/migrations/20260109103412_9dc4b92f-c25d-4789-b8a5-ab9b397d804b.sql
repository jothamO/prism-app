-- Add tracking columns to education_articles
ALTER TABLE public.education_articles
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS last_edited_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS linked_provision_ids UUID[] DEFAULT '{}';

-- Add columns to tax_deadlines for admin management
ALTER TABLE public.tax_deadlines
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS notification_config JSONB DEFAULT '{"days_before": [7, 3, 1], "message_template": null}'::jsonb,
ADD COLUMN IF NOT EXISTS linked_provision_ids UUID[] DEFAULT '{}';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_education_articles_category ON public.education_articles(category);
CREATE INDEX IF NOT EXISTS idx_education_articles_published ON public.education_articles(is_published);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_active ON public.tax_deadlines(is_active);
CREATE INDEX IF NOT EXISTS idx_tax_deadlines_type ON public.tax_deadlines(deadline_type);

-- Full-text search function for education articles (for bot integration)
CREATE OR REPLACE FUNCTION public.search_education_articles(search_query TEXT, result_limit INT DEFAULT 5)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    content TEXT,
    category TEXT,
    slug TEXT,
    read_time TEXT,
    rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ea.id,
        ea.title,
        ea.description,
        ea.content,
        ea.category,
        ea.slug,
        ea.read_time,
        ts_rank(
            to_tsvector('english', COALESCE(ea.title, '') || ' ' || COALESCE(ea.description, '') || ' ' || COALESCE(ea.content, '')),
            plainto_tsquery('english', search_query)
        ) as rank
    FROM public.education_articles ea
    WHERE ea.is_published = true
      AND (
        to_tsvector('english', COALESCE(ea.title, '') || ' ' || COALESCE(ea.description, '') || ' ' || COALESCE(ea.content, ''))
        @@ plainto_tsquery('english', search_query)
        OR ea.title ILIKE '%' || search_query || '%'
        OR ea.category ILIKE '%' || search_query || '%'
      )
    ORDER BY rank DESC
    LIMIT result_limit;
END;
$$;

-- Function to get upcoming deadlines (for bot integration)
CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(days_ahead INT DEFAULT 30, deadline_limit INT DEFAULT 10)
RETURNS TABLE (
    id UUID,
    title TEXT,
    description TEXT,
    deadline_type TEXT,
    deadline_date DATE,
    recurrence TEXT,
    notification_config JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_date_val DATE := CURRENT_DATE;
    target_date DATE := CURRENT_DATE + (days_ahead || ' days')::INTERVAL;
BEGIN
    RETURN QUERY
    SELECT 
        td.id,
        td.title,
        td.description,
        td.deadline_type,
        CASE 
            WHEN td.recurrence = 'monthly' THEN
                CASE 
                    WHEN td.day_of_month >= EXTRACT(DAY FROM current_date_val)::INT THEN
                        (DATE_TRUNC('month', current_date_val) + ((td.day_of_month - 1) || ' days')::INTERVAL)::DATE
                    ELSE
                        (DATE_TRUNC('month', current_date_val) + '1 month'::INTERVAL + ((td.day_of_month - 1) || ' days')::INTERVAL)::DATE
                END
            WHEN td.recurrence = 'annual' THEN
                MAKE_DATE(
                    CASE 
                        WHEN MAKE_DATE(EXTRACT(YEAR FROM current_date_val)::INT, td.month_of_year, td.day_of_month) >= current_date_val
                        THEN EXTRACT(YEAR FROM current_date_val)::INT
                        ELSE EXTRACT(YEAR FROM current_date_val)::INT + 1
                    END,
                    td.month_of_year,
                    td.day_of_month
                )
            ELSE td.specific_date
        END as deadline_date,
        td.recurrence,
        td.notification_config
    FROM public.tax_deadlines td
    WHERE td.is_active = true
    ORDER BY deadline_date ASC
    LIMIT deadline_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.search_education_articles TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines TO authenticated, anon;