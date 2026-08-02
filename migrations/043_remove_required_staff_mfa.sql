-- Remove required two-step authentication for staff accounts.
-- Password authentication, active-account checks, role checks, and all other
-- security hardening remain in place.

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campers
    WHERE (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
    AND LOWER(COALESCE(role, '')) = 'admin'
    AND active IS NOT FALSE
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
    SELECT 1 FROM public.campers
    WHERE (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
    AND LOWER(COALESCE(role, '')) = 'maintenance'
    AND active IS NOT FALSE
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

REVOKE ALL ON FUNCTION public.is_maintenance_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_maintenance_user() TO authenticated;
