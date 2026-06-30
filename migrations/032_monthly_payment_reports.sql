-- Monthly payment reporting support.
-- Adds clean payment tracking fields without changing existing invoice data.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text;

-- Backfill older paid invoices so they appear in reports.
-- These older records did not always have an exact paid date, so created_at is the safest available fallback.
UPDATE public.invoices
SET
  paid_at = COALESCE(paid_at, created_at),
  payment_method = COALESCE(payment_method, 'Paid before detailed tracking')
WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS invoices_paid_at_idx
  ON public.invoices (paid_at DESC)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS invoices_payment_method_idx
  ON public.invoices (payment_method)
  WHERE status = 'paid';
