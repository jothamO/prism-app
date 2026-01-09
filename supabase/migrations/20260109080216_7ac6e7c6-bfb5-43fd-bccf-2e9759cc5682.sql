-- Fix: Update sync_deadline_rules_to_tax_calendar to check actions before parameters
CREATE OR REPLACE FUNCTION public.sync_deadline_rules_to_tax_calendar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Only process deadline rules when active
    IF NEW.rule_type IN ('deadline', 'filing_deadline') AND NEW.is_active = true THEN
        INSERT INTO tax_deadlines (
            deadline_type,
            title,
            description,
            recurrence,
            day_of_month,
            month_of_year,
            specific_date,
            source_rule_id,
            is_active
        )
        VALUES (
            -- Check actions first, then parameters, then fall back to rule_code, then rule_name
            COALESCE(
                (NEW.actions->>'deadline_type')::varchar,
                (NEW.parameters->>'deadline_type')::varchar,
                NEW.rule_code,
                NEW.rule_name
            ),
            NEW.rule_name,
            NEW.description,
            COALESCE((NEW.parameters->>'recurrence')::varchar, (NEW.actions->>'recurrence')::varchar, 'annual'),
            COALESCE((NEW.parameters->>'day')::integer, (NEW.actions->>'day')::integer),
            COALESCE((NEW.parameters->>'month')::integer, (NEW.actions->>'month')::integer),
            COALESCE(
                (NEW.actions->>'effective_date')::date,
                (NEW.parameters->>'effective_date')::date,
                NEW.effective_from::date
            ),
            NEW.id,
            true
        )
        ON CONFLICT (source_rule_id) WHERE source_rule_id IS NOT NULL
        DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            recurrence = EXCLUDED.recurrence,
            day_of_month = EXCLUDED.day_of_month,
            month_of_year = EXCLUDED.month_of_year,
            specific_date = EXCLUDED.specific_date,
            is_active = EXCLUDED.is_active,
            updated_at = NOW();
    END IF;
    
    -- Handle deactivation
    IF TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false THEN
        UPDATE tax_deadlines SET is_active = false, updated_at = NOW()
        WHERE source_rule_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$function$;