-- A renewal document and its forecast row are one business event. Keep the
-- forecast accurate even if a deployment changes between document assignment
-- and signature, or the application is interrupted after recording a secure
-- signature.

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
      AND status = 'Awaiting Response';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_sync_secure_renewal_signature ON public.documents;

CREATE TRIGGER documents_sync_secure_renewal_signature
AFTER INSERT OR UPDATE OF
  signature_status,
  signed_at,
  signed_name,
  signature_record_hash,
  second_signed_at,
  second_signed_name,
  second_signature_record_hash
ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.sync_secure_renewal_signature_status();

-- Repair any secure signatures recorded before this trigger existed. This
-- intentionally changes only the renewal decision; it does not create, alter,
-- or delete invoices.
UPDATE public.season_renewals renewal
SET status = 'Renewing',
    decision_recorded_at = (coalesce(document.second_signed_at, document.signed_at) AT TIME ZONE 'America/Chicago')::date,
    auto_send_approved = false,
    auto_send_approved_at = NULL,
    last_automation_at = coalesce(document.second_signed_at, document.signed_at),
    automation_error = NULL
FROM public.documents document
WHERE renewal.camper_id = document.camper_id
  AND renewal.renewal_document_id = document.id
  AND renewal.status = 'Awaiting Response'
  AND lower(coalesce(document.signature_status, '')) = 'signed'
  AND document.signed_at IS NOT NULL
  AND nullif(btrim(coalesce(document.signed_name, '')), '') IS NOT NULL
  AND nullif(btrim(coalesce(document.signature_record_hash, '')), '') IS NOT NULL
  AND (
    NOT coalesce(document.requires_two_signatures, false)
    OR (
      document.second_signed_at IS NOT NULL
      AND nullif(btrim(coalesce(document.second_signed_name, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(document.second_signature_record_hash, '')), '') IS NOT NULL
    )
  );

COMMENT ON FUNCTION public.sync_secure_renewal_signature_status() IS
  'Immediately marks the linked renewal Renewing after every required secure portal signature is recorded.';
