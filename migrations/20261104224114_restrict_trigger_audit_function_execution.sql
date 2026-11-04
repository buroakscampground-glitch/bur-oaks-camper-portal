-- These two SECURITY DEFINER functions are invoked only by database triggers.
-- They must not be callable through the public PostgREST RPC surface.
--
-- Rollback (only if direct RPC access is intentionally restored):
--   GRANT EXECUTE ON FUNCTION public.audit_account_credit_insert() TO PUBLIC, anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.audit_season_renewal_change() TO PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_account_credit_insert()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.audit_season_renewal_change()
  FROM PUBLIC, anon, authenticated;

-- Preserve server-side access explicitly. Trigger execution itself does not
-- depend on the caller having EXECUTE on the trigger function.
GRANT EXECUTE ON FUNCTION public.audit_account_credit_insert()
  TO service_role;

GRANT EXECUTE ON FUNCTION public.audit_season_renewal_change()
  TO service_role;
