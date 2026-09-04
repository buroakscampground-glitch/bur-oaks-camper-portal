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

-- A secure renewal can have been signed while its forecast row was still in
-- Not Started during rollout. Both unsent states are undecided, so a verified
-- signature must move either one to Renewing.
CREATE OR REPLACE FUNCTION public.sync_secure_renewal_signature_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.signature_status, '')) = 'signed'
     AND NEW.signed_at IS NOT NULL
     AND nullif(btrim(coalesce(NEW.signed_name, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(NEW.signature_record_hash, '')), '') IS NOT NULL
     AND (
       NOT coalesce(NEW.requires_two_signatures, false)
       OR (
         NEW.second_signed_at IS NOT NULL
         AND nullif(btrim(coalesce(NEW.second_signed_name, '')), '') IS NOT NULL
         AND nullif(btrim(coalesce(NEW.second_signature_record_hash, '')), '') IS NOT NULL
       )
     )
  THEN
    UPDATE public.season_renewals
    SET status = 'Renewing',
        decision_recorded_at = (coalesce(NEW.second_signed_at, NEW.signed_at) AT TIME ZONE 'America/Chicago')::date,
        auto_send_approved = false,
        auto_send_approved_at = NULL,
        last_automation_at = coalesce(NEW.second_signed_at, NEW.signed_at),
        automation_error = NULL
    WHERE camper_id = NEW.camper_id
      AND renewal_document_id = NEW.id
      AND status IN ('Not Started', 'Awaiting Response');
  END IF;
  RETURN NEW;
END;
$$;
