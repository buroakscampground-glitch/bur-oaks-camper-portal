-- Simple supply requests submitted by the maintenance team and handled by admins.

CREATE TABLE IF NOT EXISTS public.maintenance_supply_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'each',
  urgency text NOT NULL DEFAULT 'Normal' CHECK (urgency IN ('Normal', 'Urgent')),
  notes text,
  requested_by text NOT NULL,
  requested_by_camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Requested' CHECK (status IN ('Requested', 'Ordered', 'Received', 'Cancelled')),
  admin_notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  ordered_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_supply_requests_active_idx
  ON public.maintenance_supply_requests (status, urgency, requested_at DESC);

CREATE OR REPLACE FUNCTION public.touch_maintenance_supply_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS maintenance_supply_requests_touch ON public.maintenance_supply_requests;
CREATE TRIGGER maintenance_supply_requests_touch
  BEFORE UPDATE ON public.maintenance_supply_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_maintenance_supply_request();

ALTER TABLE public.maintenance_supply_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_supply_requests_admin_full_access ON public.maintenance_supply_requests;
CREATE POLICY maintenance_supply_requests_admin_full_access ON public.maintenance_supply_requests
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS maintenance_supply_requests_staff_select ON public.maintenance_supply_requests;
CREATE POLICY maintenance_supply_requests_staff_select ON public.maintenance_supply_requests
  FOR SELECT TO authenticated
  USING ((SELECT public.is_maintenance_user()));
