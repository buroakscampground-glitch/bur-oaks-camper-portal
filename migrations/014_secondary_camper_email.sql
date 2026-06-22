-- Add a second camper email that can also be used for portal access.
-- This lets couples/families keep one camper record while either email can sign in.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS secondary_email text;

CREATE INDEX IF NOT EXISTS campers_secondary_email_idx
  ON public.campers (LOWER(secondary_email));

CREATE OR REPLACE FUNCTION public.current_camper_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public.campers
  WHERE LOWER(email) = public.current_user_email()
     OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
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
        LOWER(email) = public.current_user_email()
        OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
      )
      AND LOWER(COALESCE(role, '')) = 'admin'
  );
$$;

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
        LOWER(email) = public.current_user_email()
        OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
      )
      AND LOWER(COALESCE(role, '')) = 'maintenance'
  );
$$;

CREATE OR REPLACE FUNCTION public.camper_protected_fields_unchanged(
  target_camper_id uuid,
  new_email text,
  new_role text,
  new_lot_number text,
  new_active boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers c
    WHERE c.id = target_camper_id
      AND c.email IS NOT DISTINCT FROM new_email
      AND c.role IS NOT DISTINCT FROM new_role
      AND c.lot_number::text IS NOT DISTINCT FROM new_lot_number
      AND c.active IS NOT DISTINCT FROM new_active
  );
$$;

DROP POLICY IF EXISTS campers_view_own ON public.campers;
CREATE POLICY campers_view_own ON public.campers
  FOR SELECT TO authenticated
  USING (
    LOWER(email) = public.current_user_email()
    OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
  );

DROP POLICY IF EXISTS campers_update_own_safe_fields ON public.campers;
CREATE POLICY campers_update_own_safe_fields ON public.campers
  FOR UPDATE TO authenticated
  USING (
    LOWER(email) = public.current_user_email()
    OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
  )
  WITH CHECK (
    (
      LOWER(email) = public.current_user_email()
      OR LOWER(COALESCE(secondary_email, '')) = public.current_user_email()
    )
    AND public.camper_protected_fields_unchanged(
      id,
      email,
      role,
      lot_number::text,
      active
    )
  );

DROP POLICY IF EXISTS maintenance_tickets_camper_view_own ON public.maintenance_tickets;
CREATE POLICY maintenance_tickets_camper_view_own ON public.maintenance_tickets
  FOR SELECT TO authenticated
  USING (
    lot_number::text = (
      SELECT c.lot_number::text FROM public.campers c
      WHERE LOWER(c.email) = public.current_user_email()
         OR LOWER(COALESCE(c.secondary_email, '')) = public.current_user_email()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS maintenance_tickets_camper_create_own ON public.maintenance_tickets;
CREATE POLICY maintenance_tickets_camper_create_own ON public.maintenance_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    lot_number::text = (
      SELECT c.lot_number::text FROM public.campers c
      WHERE LOWER(c.email) = public.current_user_email()
         OR LOWER(COALESCE(c.secondary_email, '')) = public.current_user_email()
      LIMIT 1
    )
  );
