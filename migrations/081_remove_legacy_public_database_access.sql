-- Remove legacy grants and RLS policies that override the newer least-privilege
-- access model. This migration changes permissions only; it does not modify rows.

-- These policies predate the current admin and self-service policies. Because
-- PostgreSQL permissive policies are ORed together, their `true` expressions
-- made the restrictive policies ineffective.
DROP POLICY IF EXISTS campers_admin_update ON public.campers;
DROP POLICY IF EXISTS campers_delete_policy ON public.campers;
DROP POLICY IF EXISTS campers_insert_policy ON public.campers;
DROP POLICY IF EXISTS campers_select_own_profile ON public.campers;
DROP POLICY IF EXISTS campers_update_own_profile ON public.campers;

-- The lockdown policy duplicates campers_admin_full_access. Keep one clear
-- admin policy so future policy reviews cannot mistake duplication for defense.
DROP POLICY IF EXISTS admin_full_access_security_lockdown ON public.campers;

-- Supabase grants new functions broadly by default. Remove anonymous and broad
-- authenticated access from every SECURITY DEFINER function, then restore only
-- the explicitly reviewed application entry points below. The service role is
-- trusted server-side and retains access to every such function.
DO $$
DECLARE
  function_row record;
BEGIN
  FOR function_row IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      function_row.signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      function_row.signature
    );
  END LOOP;
END $$;

-- Authenticated portal helpers and admin-only routines. The mutating routines
-- perform their own is_admin_user() check before changing data.
GRANT EXECUTE ON FUNCTION public.current_camper_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_maintenance_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.camper_protected_fields_unchanged(uuid, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_camper_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_manual_invoice_number(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_bundle_atomic(text, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invoice_with_credit_restore_atomic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice_bundle_atomic(uuid, text, text, date, numeric, jsonb) TO authenticated;

-- Make the two non-definer helper functions' name resolution explicit.
ALTER FUNCTION public.current_user_email() SET search_path = pg_catalog, public;
ALTER FUNCTION public.normalized_camper_email(text) SET search_path = pg_catalog, public;

-- Fail the migration if a dangerous policy or anonymous SECURITY DEFINER grant
-- remains. This makes the intended postcondition executable and reviewable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'campers'
      AND policyname IN (
        'campers_admin_update',
        'campers_delete_policy',
        'campers_insert_policy',
        'campers_select_own_profile',
        'campers_update_own_profile'
      )
  ) THEN
    RAISE EXCEPTION 'Legacy permissive camper policies still exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Anonymous SECURITY DEFINER execution remains.';
  END IF;
END $$;
