-- Prevent direct Data API callers from bypassing the Admin-only application routes.
-- The server routes use the service_role client after verifying the signed-in Admin.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.create_account_credit_audited(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.void_account_credit_audited(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_invoice_with_audit_atomic(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_manual_payment_audited(text, uuid, numeric, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_invoice_late_fee_audited(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_camper_active_audited(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_camper_profile_audited(uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_camper_rent_terms_audited(uuid, numeric, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_account_credit_audited(uuid, numeric, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_account_credit_audited(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_with_audit_atomic(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_manual_payment_audited(text, uuid, numeric, text, date, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_invoice_late_fee_audited(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_camper_active_audited(uuid, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_camper_profile_audited(uuid, jsonb, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_camper_rent_terms_audited(uuid, numeric, text, text, text) TO service_role;

COMMIT;
