-- Correct two verified office records without disturbing any renewal decisions.

UPDATE public.campers
SET last_name = 'Marshall Sr.'
WHERE active = true
  AND regexp_replace(upper(trim(lot_number::text)), '[^A-Z0-9]', '', 'g') = 'FF16A'
  AND lower(trim(last_name)) IN ('marshall jr', 'marshall jr.');

UPDATE public.season_renewals renewal
SET contract_end_date = CASE
      WHEN make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer,
        EXTRACT(MONTH FROM renewal.contract_start_date)::integer,
        EXTRACT(DAY FROM renewal.contract_start_date)::integer
      ) >= CURRENT_DATE
        THEN make_date(
          EXTRACT(YEAR FROM CURRENT_DATE)::integer,
          EXTRACT(MONTH FROM renewal.contract_start_date)::integer,
          EXTRACT(DAY FROM renewal.contract_start_date)::integer
        )
      ELSE make_date(
        EXTRACT(YEAR FROM CURRENT_DATE)::integer + 1,
        EXTRACT(MONTH FROM renewal.contract_start_date)::integer,
        EXTRACT(DAY FROM renewal.contract_start_date)::integer
      )
    END,
    updated_at = now()
FROM public.campers camper
WHERE renewal.camper_id = camper.id
  AND camper.active = true
  AND regexp_replace(upper(trim(camper.lot_number::text)), '[^A-Z0-9]', '', 'g') = '19'
  AND renewal.contract_start_date IS NOT NULL
  AND renewal.contract_end_date IS NULL;
