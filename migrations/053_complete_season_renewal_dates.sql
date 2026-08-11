-- Complete annual contract anniversary dates from the office renewal board.
--
-- Safety rules for this import:
--   * Only the red "Contract Date" column is used (never the 9-month date).
--   * A row must match both an active portal lot and the current camper surname.
--   * Old campers, moved campers, blank dates, and uncertain rows are omitted.
--   * Existing renewal decisions, notes, and sent dates are preserved.

WITH board_dates(lot_key, expected_last_name, contract_month, contract_day) AS (
  VALUES
    ('FF1', 'YERKES', 5, 1),
    ('FF3', 'WEYHAUPT', 5, 1),
    ('FF4', 'BURKHARDT', 5, 1),
    ('FF5', 'CAMPBELL', 5, 1),
    ('FF6', 'CLICK', 5, 1),
    ('FF7', 'DIPAOLO', 5, 1),
    ('FF8', 'GREENWELL', 5, 1),
    ('FF9', 'CAMERON', 5, 1),
    ('FF12', 'BOHNENSTHIL', 5, 1),
    ('FF13', 'MCNISH', 5, 1),
    ('FF14', 'GARIBALDI', 5, 1),
    ('FF15', 'TRADER', 5, 1),
    ('FF16', 'SCHAAR', 7, 1),
    ('FF18', 'MINERT', 5, 1),
    ('POINT', 'HANSON', 10, 1),
    ('2', 'FITE', 5, 1),
    ('3', 'DAUDERMAN', 3, 1),
    ('5', 'GUSTAFSON', 5, 16),
    ('6', 'PLUMMER', 6, 1),
    ('7', 'VOGEL', 9, 1),
    ('8', 'ERNST', 1, 8),
    ('9', 'JOHNSON', 1, 8),
    ('10', 'HOFF', 4, 4),
    ('11', 'ELLIOTT', 7, 30),
    ('13', 'SCOTT', 8, 1),
    ('16', 'BARTZ', 5, 28),
    ('16A', 'STRAIN', 4, 2),
    ('17A', 'PORTER', 3, 18),
    ('21', 'PORTER', 3, 12),
    ('23', 'SMITH', 2, 6),
    ('25', 'HEEPKE', 7, 1),
    ('26', 'MATESA', 3, 13),
    ('27', 'HOORMANN', 12, 1),
    ('28', 'FINCH', 10, 1),
    ('30', 'HAUGEN', 9, 5),
    ('31', 'BECK', 10, 1),
    ('33', 'ANDREWS', 7, 23),
    ('34', 'COX', 2, 12),
    ('35', 'VANETTA', 3, 25),
    ('35A', 'BALLARD', 10, 12),
    ('35B', 'SLEMER', 3, 25),
    ('46', 'HOLMANN', 7, 25),
    ('47A', 'IMEL', 7, 1),
    ('47B', 'MCNAUGHTON', 1, 8),
    ('48A', 'LOOMIS', 8, 1),
    ('48B', 'SLEMER', 3, 8),
    ('49', 'YOUNT', 3, 18),
    ('50', 'GIDDINGS', 4, 6),
    ('51', 'FROST', 6, 1),
    ('52', 'HORAT', 11, 1),
    ('53', 'GONZALES', 4, 1),
    ('54', 'MARTIN', 3, 1),
    ('55', 'BRINSON', 6, 1),
    ('56', 'LOGAN', 6, 3)
), matched_active_campers AS (
  SELECT
    camper.id AS camper_id,
    camper.lot_number,
    make_date(2000, board.contract_month, board.contract_day) AS contract_start_date,
    CASE
      WHEN make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,
        board.contract_month,
        board.contract_day
      ) >= CURRENT_DATE
        THEN make_date(
          EXTRACT(YEAR FROM CURRENT_DATE)::integer,
          board.contract_month,
          board.contract_day
        )
      ELSE make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1,
        board.contract_month,
        board.contract_day
      )
    END AS contract_end_date
  FROM board_dates board
  JOIN public.campers camper
    ON regexp_replace(upper(trim(camper.lot_number::text)), '[^A-Z0-9]', '', 'g') = board.lot_key
   AND regexp_replace(upper(trim(camper.last_name::text)), '[^A-Z0-9]', '', 'g') = board.expected_last_name
  WHERE camper.active = true
    AND lower(coalesce(camper.role, 'camper')) NOT IN ('admin', 'maintenance')
), saved_dates AS (
  INSERT INTO public.season_renewals (
    camper_id,
    lot_number,
    contract_start_date,
    contract_end_date
  )
  SELECT
    camper_id,
    lot_number,
    contract_start_date,
    contract_end_date
  FROM matched_active_campers
  ON CONFLICT (camper_id) DO UPDATE
  SET lot_number = EXCLUDED.lot_number,
      contract_start_date = EXCLUDED.contract_start_date,
      contract_end_date = EXCLUDED.contract_end_date
  RETURNING camper_id, lot_number, contract_start_date, contract_end_date
)
SELECT
  count(*) AS dates_saved,
  string_agg(lot_number, ', ' ORDER BY lot_number) AS lots_updated
FROM saved_dates;
