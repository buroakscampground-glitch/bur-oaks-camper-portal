-- Let campers update their contact/portal email fields without losing access.
-- The app requires the currently signed-in email to remain on either email or secondary_email.

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
      AND c.role IS NOT DISTINCT FROM new_role
      AND c.lot_number::text IS NOT DISTINCT FROM new_lot_number
      AND c.active IS NOT DISTINCT FROM new_active
  );
$$;

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
