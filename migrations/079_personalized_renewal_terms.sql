-- Freeze the exact financial terms shown on each renewal. These values are
-- intentionally stored on the renewal itself so a later lot-rate change can
-- never alter the agreement the camper reviewed and signed.

ALTER TABLE public.season_renewals
  ADD COLUMN IF NOT EXISTS annual_rent numeric(10,2),
  ADD COLUMN IF NOT EXISTS rent_payment_plan text;

ALTER TABLE public.season_renewals
  DROP CONSTRAINT IF EXISTS season_renewals_rent_payment_plan_check;

ALTER TABLE public.season_renewals
  ADD CONSTRAINT season_renewals_rent_payment_plan_check
  CHECK (rent_payment_plan IS NULL OR rent_payment_plan IN ('semiannual', 'quarterly'));

