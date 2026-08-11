-- Opt-in birthday and campground-anniversary greetings.
-- The original camper-since date is separate from the recurring renewal cycle.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS camper_since_date date,
  ADD COLUMN IF NOT EXISTS celebration_messages_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS celebration_messages_opt_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.camper_celebration_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  celebration_type text NOT NULL CHECK (celebration_type IN ('birthday', 'anniversary')),
  recipient_profile text NOT NULL CHECK (recipient_profile IN ('primary', 'secondary', 'household')),
  celebration_year integer NOT NULL CHECK (celebration_year >= 2026),
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'skipped')),
  recipient text,
  subject text,
  message text NOT NULL,
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (camper_id, celebration_type, recipient_profile, celebration_year, channel)
);

CREATE INDEX IF NOT EXISTS camper_celebration_deliveries_camper_idx
  ON public.camper_celebration_deliveries (camper_id, celebration_year DESC);

ALTER TABLE public.camper_celebration_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS camper_celebration_deliveries_admin_access ON public.camper_celebration_deliveries;
CREATE POLICY camper_celebration_deliveries_admin_access
  ON public.camper_celebration_deliveries
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS camper_celebration_deliveries_camper_view ON public.camper_celebration_deliveries;
CREATE POLICY camper_celebration_deliveries_camper_view
  ON public.camper_celebration_deliveries
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Preserve the original contract year from the office board. A date is saved
-- only when the current active lot and current camper surname both match.
WITH board_dates(lot_key, expected_last_name, camper_since_date) AS (
  VALUES
    ('FF1', 'YERKES', DATE '2024-05-01'),
    ('FF3', 'WEYHAUPT', DATE '2024-05-01'),
    ('FF4', 'BURKHARDT', DATE '2024-05-01'),
    ('FF5', 'CAMPBELL', DATE '2024-05-01'),
    ('FF6', 'CLICK', DATE '2024-05-01'),
    ('FF7', 'DIPAOLO', DATE '2024-05-01'),
    ('FF8', 'GREENWELL', DATE '2024-05-01'),
    ('FF9', 'CAMERON', DATE '2024-05-01'),
    ('FF12', 'BOHNENSTHIL', DATE '2024-05-01'),
    ('FF13', 'MCNISH', DATE '2024-05-01'),
    ('FF14', 'GARIBALDI', DATE '2024-05-01'),
    ('FF15', 'TRADER', DATE '2024-05-01'),
    ('FF16', 'SCHAAR', DATE '2024-07-01'),
    ('FF18', 'MINERT', DATE '2024-05-01'),
    ('POINT', 'HANSON', DATE '2020-10-01'),
    ('2', 'FITE', DATE '2000-05-01'),
    ('3', 'DAUDERMAN', DATE '2021-03-01'),
    ('5', 'GUSTAFSON', DATE '2016-05-16'),
    ('6', 'PLUMMER', DATE '2001-06-01'),
    ('7', 'VOGEL', DATE '2000-09-01'),
    ('8', 'ERNST', DATE '2023-01-08'),
    ('9', 'JOHNSON', DATE '2023-01-08'),
    ('10', 'HOFF', DATE '2016-04-04'),
    ('11', 'ELLIOTT', DATE '2023-07-30'),
    ('13', 'SCOTT', DATE '2024-08-01'),
    ('16', 'BARTZ', DATE '2017-05-28'),
    ('16A', 'STRAIN', DATE '2016-04-02'),
    ('17A', 'PORTER', DATE '2022-03-18'),
    ('21', 'PORTER', DATE '2020-03-12'),
    ('23', 'SMITH', DATE '2024-02-06'),
    ('25', 'HEEPKE', DATE '2001-07-01'),
    ('26', 'MATESA', DATE '2020-03-13'),
    ('27', 'HOORMANN', DATE '2020-12-01'),
    ('28', 'FINCH', DATE '2020-10-01'),
    ('30', 'HAUGEN', DATE '2021-09-05'),
    ('31', 'BECK', DATE '2018-10-01'),
    ('33', 'ANDREWS', DATE '2020-07-23'),
    ('34', 'COX', DATE '2024-02-12'),
    ('35', 'VANETTA', DATE '2023-03-25'),
    ('35A', 'BALLARD', DATE '2024-10-12'),
    ('35B', 'SLEMER', DATE '2019-03-25'),
    ('46', 'HOLMANN', DATE '2020-07-25'),
    ('47A', 'IMEL', DATE '2021-07-01'),
    ('47B', 'MCNAUGHTON', DATE '2020-01-08'),
    ('48A', 'LOOMIS', DATE '2022-08-01'),
    ('48B', 'SLEMER', DATE '2020-03-08'),
    ('49', 'YOUNT', DATE '2022-03-18'),
    ('50', 'GIDDINGS', DATE '2020-04-06'),
    ('51', 'FROST', DATE '2010-06-01'),
    ('52', 'HORAT', DATE '1996-11-01'),
    ('53', 'GONZALES', DATE '2020-04-01'),
    ('54', 'MARTIN', DATE '2011-03-01'),
    ('55', 'BRINSON', DATE '2001-06-01'),
    ('56', 'LOGAN', DATE '2019-06-03')
)
UPDATE public.campers camper
SET camper_since_date = board.camper_since_date
FROM board_dates board
WHERE camper.active = true
  AND lower(coalesce(camper.role, 'camper')) NOT IN ('admin', 'maintenance')
  AND regexp_replace(upper(trim(camper.lot_number::text)), '[^A-Z0-9]', '', 'g') = board.lot_key
  AND regexp_replace(upper(trim(camper.last_name::text)), '[^A-Z0-9]', '', 'g') = board.expected_last_name;
