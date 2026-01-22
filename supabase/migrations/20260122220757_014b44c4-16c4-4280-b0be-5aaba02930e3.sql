-- Fix notify_profile_rule_changes trigger function to use valid severity values
-- The constraint compliance_notifications_severity_check only allows: 'info', 'warning', 'critical'
-- Previously using invalid values: 'high', 'medium'

CREATE OR REPLACE FUNCTION public.notify_profile_rule_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    affected_rule RECORD;
BEGIN
    -- When a compliance rule changes, log which profiles might need updates
    IF TG_OP = 'UPDATE' OR TG_OP = 'INSERT' THEN
        -- Check if this affects tax calculations (rate changes, threshold changes)
        IF NEW.rule_type IN ('tax_band', 'vat_rate', 'threshold', 'relief', 'emtl') THEN
            -- Insert notification for admins about potential profile recalculations
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
                    WHEN NEW.rule_type IN ('tax_band', 'vat_rate') THEN 'critical'
                    ELSE 'warning'
                END,
                jsonb_build_object(
                    'rule_id', NEW.id,
                    'rule_type', NEW.rule_type,
                    'rule_name', NEW.rule_name
                )
            FROM public.user_roles ur
            WHERE ur.role = 'admin'
            LIMIT 5;
        END IF;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$function$;