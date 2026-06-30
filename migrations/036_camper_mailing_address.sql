-- Camper mailing address and alternate phone.
-- App screens require mailing address before saving, but columns remain nullable
-- so existing camper records do not break while the office collects information.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS mailing_address_line1 text,
  ADD COLUMN IF NOT EXISTS mailing_address_line2 text,
  ADD COLUMN IF NOT EXISTS mailing_city text,
  ADD COLUMN IF NOT EXISTS mailing_state text,
  ADD COLUMN IF NOT EXISTS mailing_zip text,
  ADD COLUMN IF NOT EXISTS alternate_phone text;
