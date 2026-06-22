-- Adds an electronic-signature audit trail for camper leases and renewals.
-- Run this once in Supabase SQL Editor before using the Sign Lease button.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_name text,
  ADD COLUMN IF NOT EXISTS signed_email text,
  ADD COLUMN IF NOT EXISTS signed_user_id uuid,
  ADD COLUMN IF NOT EXISTS signature_ip text,
  ADD COLUMN IF NOT EXISTS signature_user_agent text,
  ADD COLUMN IF NOT EXISTS signature_consent_text text,
  ADD COLUMN IF NOT EXISTS signature_record_hash text;

CREATE INDEX IF NOT EXISTS documents_signature_status_idx
  ON public.documents (signature_status);

CREATE INDEX IF NOT EXISTS documents_signed_at_idx
  ON public.documents (signed_at);
