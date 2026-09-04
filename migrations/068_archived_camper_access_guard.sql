-- Archived campers must lose direct row access even if an old Supabase login
-- session still exists. Server routes already enforce this; these policies add
-- the same protection at the database boundary.

DROP POLICY IF EXISTS campers_view_own ON public.campers;
CREATE POLICY campers_view_own ON public.campers
  FOR SELECT TO authenticated
  USING (
    active IS NOT FALSE
    AND (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
  );

DROP POLICY IF EXISTS campers_update_own_safe_fields ON public.campers;
CREATE POLICY campers_update_own_safe_fields ON public.campers
  FOR UPDATE TO authenticated
  USING (
    active IS NOT FALSE
    AND (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
  )
  WITH CHECK (
    active IS NOT FALSE
    AND (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
    AND public.camper_protected_fields_unchanged(
      id,
      email,
      role,
      lot_number::text,
      active
    )
  );
