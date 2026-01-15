-- Function to purge expired soft-deleted items (runs after 5-minute grace period)
CREATE OR REPLACE FUNCTION public.purge_expired_deleted_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  purged_count INTEGER;
BEGIN
  DELETE FROM deleted_items 
  WHERE expires_at < NOW() 
    AND restored = false;
  GET DIAGNOSTICS purged_count = ROW_COUNT;
  RETURN purged_count;
END;
$$;