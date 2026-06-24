-- Private admin-only office notes on camper records.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS office_notes text;
