-- Security advisor lockdown
-- Fixes Supabase warnings:
-- - rls_disabled_in_public
-- - sensitive_columns_exposed
--
-- This enables Row Level Security on every table in the public schema.
-- Existing table-specific camper/admin policies remain in place.
-- Any public table without a policy becomes admin-only for authenticated admin users.

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(auth.jwt() ->> 'email');
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
        OR LOWER(COALESCE(to_jsonb(campers) ->> 'secondary_email', '')) = public.current_user_email()
      )
      AND LOWER(COALESCE(role, '')) = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

DO $$
DECLARE
  table_record record;
  policy_name text;
BEGIN
  FOR table_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT IN (
        'spatial_ref_sys',
        'geography_columns',
        'geometry_columns',
        'raster_columns',
        'raster_overviews'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      table_record.schemaname,
      table_record.tablename
    );

    policy_name := 'admin_full_access_security_lockdown';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = table_record.schemaname
        AND tablename = table_record.tablename
        AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING ((SELECT public.is_admin_user())) WITH CHECK ((SELECT public.is_admin_user()))',
        policy_name,
        table_record.schemaname,
        table_record.tablename
      );
    END IF;
  END LOOP;
END $$;

-- Service-role-only ledger tables should stay inaccessible to anon/authenticated clients.
DROP POLICY IF EXISTS admin_full_access_security_lockdown ON public.stripe_webhook_events;

-- Quick verification query for Supabase SQL editor:
-- SELECT schemaname, tablename
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND rowsecurity = false;
