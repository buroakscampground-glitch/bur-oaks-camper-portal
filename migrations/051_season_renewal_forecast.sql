-- Seasonal contract renewal tracking and site-opening forecasts.

CREATE TABLE IF NOT EXISTS public.season_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL UNIQUE REFERENCES public.campers(id) ON DELETE CASCADE,
  lot_number text,
  contract_start_date date,
  contract_end_date date,
  renewal_sent_at date,
  status text NOT NULL DEFAULT 'Not Started'
    CHECK (status IN ('Not Started', 'Awaiting Response', 'Renewing', 'Camper Leaving', 'Campground Not Renewing')),
  decision_recorded_at date,
  renewal_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  last_automation_at timestamptz,
  automation_error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep this migration safe if an earlier draft of the table was already run.
ALTER TABLE public.season_renewals
  ADD COLUMN IF NOT EXISTS renewal_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_automation_at timestamptz,
  ADD COLUMN IF NOT EXISTS automation_error text;

CREATE INDEX IF NOT EXISTS season_renewals_status_idx
  ON public.season_renewals (status, contract_end_date);

CREATE INDEX IF NOT EXISTS season_renewals_contract_end_idx
  ON public.season_renewals (contract_end_date);

CREATE OR REPLACE FUNCTION public.touch_season_renewal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS season_renewals_touch ON public.season_renewals;
CREATE TRIGGER season_renewals_touch
  BEFORE UPDATE ON public.season_renewals
  FOR EACH ROW EXECUTE FUNCTION public.touch_season_renewal();

ALTER TABLE public.season_renewals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS season_renewals_admin_full_access ON public.season_renewals;
CREATE POLICY season_renewals_admin_full_access ON public.season_renewals
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

-- Load the known yearly contract anniversary dates. The active cycle is the
-- next occurrence of that month/day, so this remains correct in future years.
WITH known_dates(lot_key, contract_month, contract_day) AS (
  VALUES
    ('F1', 5, 1), ('FF3', 5, 1), ('FF4', 5, 1), ('FF5', 5, 1),
    ('FF6', 5, 1), ('FF7', 5, 1), ('FF8', 5, 1), ('FF9', 5, 1),
    ('FF12', 5, 1), ('FF13', 5, 1), ('FF14', 5, 1), ('FF15', 5, 1),
    ('FF18', 5, 1),
    ('2', 5, 1), ('3', 3, 1), ('5', 5, 16), ('6', 6, 1),
    ('7', 9, 1), ('8', 1, 8), ('9', 1, 8), ('10', 4, 4),
    ('11', 7, 30), ('13', 8, 1), ('16', 5, 28), ('16A', 4, 2),
    ('17A', 3, 18)
), upcoming_dates AS (
  SELECT
    camper.id AS camper_id,
    camper.lot_number,
    CASE
      WHEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::integer, known.contract_month, known.contract_day) >= CURRENT_DATE
        THEN make_date(EXTRACT(YEAR FROM CURRENT_DATE)::integer, known.contract_month, known.contract_day)
      ELSE make_date(EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1, known.contract_month, known.contract_day)
    END AS contract_end_date
  FROM known_dates known
  JOIN public.campers camper
    ON regexp_replace(upper(trim(camper.lot_number::text)), '[^A-Z0-9]', '', 'g') = known.lot_key
  WHERE camper.active = true
)
INSERT INTO public.season_renewals (camper_id, lot_number, contract_end_date)
SELECT camper_id, lot_number, contract_end_date
FROM upcoming_dates
ON CONFLICT (camper_id) DO UPDATE
SET lot_number = EXCLUDED.lot_number,
    contract_end_date = EXCLUDED.contract_end_date;
