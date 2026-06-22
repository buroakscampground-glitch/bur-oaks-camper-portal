-- Admin approval gate for maintenance work orders.

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS admin_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text;

CREATE INDEX IF NOT EXISTS maintenance_tickets_admin_approved_idx
  ON public.maintenance_tickets (admin_approved, status);

CREATE OR REPLACE FUNCTION public.enforce_maintenance_approval_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_maintenance_user() AND NOT public.is_admin_user() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.admin_approved := false;
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
      NEW.status := 'Open';
      NEW.assigned_to := 'Open';
    ELSIF
      NEW.admin_approved IS DISTINCT FROM OLD.admin_approved OR
      NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
      NEW.approved_by IS DISTINCT FROM OLD.approved_by
    THEN
      RAISE EXCEPTION 'Only an administrator can change work approval.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_approval_fields_guard ON public.maintenance_tickets;
CREATE TRIGGER maintenance_approval_fields_guard
  BEFORE INSERT OR UPDATE ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.enforce_maintenance_approval_fields();

DROP POLICY IF EXISTS maintenance_tickets_maintenance_view_all ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_update ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_insert ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_view_approved ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_update_approved ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_submit_pending ON public.maintenance_tickets;

CREATE POLICY maintenance_tickets_maintenance_view_approved ON public.maintenance_tickets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_maintenance_user())
    AND admin_approved = true
  );

CREATE POLICY maintenance_tickets_maintenance_update_approved ON public.maintenance_tickets
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_maintenance_user())
    AND admin_approved = true
  )
  WITH CHECK (
    (SELECT public.is_maintenance_user())
    AND admin_approved = true
  );

CREATE POLICY maintenance_tickets_maintenance_submit_pending ON public.maintenance_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_maintenance_user())
    AND admin_approved = false
    AND approved_at IS NULL
    AND approved_by IS NULL
  );
