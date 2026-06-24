-- Optional second signer support for leases and assigned documents.
-- Run once in Supabase SQL Editor before requiring two signatures on a document.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS requires_two_signatures boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS second_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS second_signed_name text,
  ADD COLUMN IF NOT EXISTS second_signed_email text,
  ADD COLUMN IF NOT EXISTS second_signed_user_id uuid,
  ADD COLUMN IF NOT EXISTS second_signature_ip text,
  ADD COLUMN IF NOT EXISTS second_signature_user_agent text,
  ADD COLUMN IF NOT EXISTS second_signature_consent_text text,
  ADD COLUMN IF NOT EXISTS second_signature_record_hash text;

CREATE INDEX IF NOT EXISTS documents_requires_two_signatures_idx
  ON public.documents (requires_two_signatures);

