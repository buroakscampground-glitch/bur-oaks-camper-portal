-- Remove two unused import-era columns only after proving they contain no data.
-- The guards make this migration fail closed if either environment diverges.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = '21'
  ) AND EXISTS (SELECT 1 FROM public.invoices WHERE "21" IS NOT NULL) THEN
    RAISE EXCEPTION 'Blocked: invoices."21" contains data.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'electric_readings' AND column_name = 'Rate'
  ) AND EXISTS (SELECT 1 FROM public.electric_readings WHERE "Rate" IS NOT NULL) THEN
    RAISE EXCEPTION 'Blocked: electric_readings."Rate" contains data.';
  END IF;
END;
$$;

ALTER TABLE public.invoices DROP COLUMN IF EXISTS "21";
ALTER TABLE public.electric_readings DROP COLUMN IF EXISTS "Rate";
