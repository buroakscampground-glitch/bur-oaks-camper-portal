-- Keep campsite logins out of the maintenance staff portal even if an office
-- profile edit or legacy import accidentally writes role = maintenance.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.campers
    WHERE lower(coalesce(role, '')) = 'maintenance'
      AND upper(btrim(coalesce(lot_number, ''))) <> 'STAFF'
  ) THEN
    RAISE EXCEPTION 'A non-STAFF camper profile still has the maintenance role.';
  END IF;
END;
$$;

ALTER TABLE public.campers
  DROP CONSTRAINT IF EXISTS campers_maintenance_staff_lot_check;

ALTER TABLE public.campers
  ADD CONSTRAINT campers_maintenance_staff_lot_check
  CHECK (
    lower(coalesce(role, 'camper')) <> 'maintenance'
    OR upper(btrim(coalesce(lot_number, ''))) = 'STAFF'
  );

CREATE OR REPLACE FUNCTION public.is_maintenance_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers
    WHERE (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
      AND lower(coalesce(role, '')) = 'maintenance'
      AND upper(btrim(coalesce(lot_number, ''))) = 'STAFF'
      AND active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_maintenance_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_maintenance_user() TO authenticated;
