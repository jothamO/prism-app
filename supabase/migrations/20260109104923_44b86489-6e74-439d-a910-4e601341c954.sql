-- Fix the notify_profile_rule_changes function to use valid notification_type
CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
            -- Using 'rate_change' instead of 'rule_change' to match the check constraint
            INSERT INTO public.compliance_notifications (
                user_id,
                notification_type,
                title,
                message,
                severity,
                metadata
            )
            SELECT DISTINCT
                ur.user_id,
                'rate_change',
                'Tax Rule Updated: ' || NEW.rule_name,
                'A tax rule affecting your calculations has been updated. Your tax estimates may change.',
                CASE 
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'high'
                    ELSE 'medium'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5; -- Only notify first 5 admins
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;