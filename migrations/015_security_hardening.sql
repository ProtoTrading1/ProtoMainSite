-- 015: Security hardening
-- 1. Block self-service privilege escalation: customers may update their own
--    row but never change role / tier / is_approved. Service-role connections
--    (API + admin portal) bypass this trigger guard via current_setting check.
-- 2. Remove the anon INSERT policy on analytics_events — events are written
--    through /api/track-event with the service role.

CREATE OR REPLACE FUNCTION public.protect_customer_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Direct DB roles (dashboard SQL editor, service connections) bypass the guard
  IF current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- service_role API connections bypass too, so admin tooling keeps working.
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admins (role column on their own customers row) may change anything.
  IF EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = auth.uid() AND c.role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Everyone else: privileged columns are immutable.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
    RAISE EXCEPTION 'You cannot change role, tier or approval status';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_customer_privileges ON public.customers;
CREATE TRIGGER trg_protect_customer_privileges
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_customer_privileges();

-- analytics events: only the service role (API) writes now
DROP POLICY IF EXISTS "analytics_events_insert_anon" ON public.analytics_events;
