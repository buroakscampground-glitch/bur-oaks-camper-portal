-- Remove only generic admin policies that are exactly equivalent to a second
-- table-specific policy. This changes no access decision and modifies no rows.

DO $$
DECLARE
  duplicate_policy record;
BEGIN
  FOR duplicate_policy IN
    WITH policies AS (
      SELECT
        tablename,
        policyname,
        cmd,
        roles,
        COALESCE(qual, '') AS qual,
        COALESCE(with_check, '') AS with_check
      FROM pg_policies
      WHERE schemaname = 'public'
    )
    SELECT DISTINCT generic.tablename, generic.policyname
    FROM policies generic
    JOIN policies specific
      ON specific.tablename = generic.tablename
     AND specific.policyname <> generic.policyname
     AND specific.cmd = generic.cmd
     AND specific.roles = generic.roles
     AND specific.qual = generic.qual
     AND specific.with_check = generic.with_check
    WHERE generic.policyname = 'admin_full_access_security_lockdown'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.%I',
      duplicate_policy.policyname,
      duplicate_policy.tablename
    );
  END LOOP;
END $$;

-- Guard the postcondition: an exactly duplicated generic policy must not remain.
DO $$
BEGIN
  IF EXISTS (
    WITH policies AS (
      SELECT
        tablename,
        policyname,
        cmd,
        roles,
        COALESCE(qual, '') AS qual,
        COALESCE(with_check, '') AS with_check
      FROM pg_policies
      WHERE schemaname = 'public'
    )
    SELECT 1
    FROM policies generic
    JOIN policies specific
      ON specific.tablename = generic.tablename
     AND specific.policyname <> generic.policyname
     AND specific.cmd = generic.cmd
     AND specific.roles = generic.roles
     AND specific.qual = generic.qual
     AND specific.with_check = generic.with_check
    WHERE generic.policyname = 'admin_full_access_security_lockdown'
  ) THEN
    RAISE EXCEPTION 'An exactly duplicated generic admin policy remains.';
  END IF;
END $$;
