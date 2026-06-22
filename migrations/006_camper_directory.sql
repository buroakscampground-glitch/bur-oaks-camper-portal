-- Privacy-first camper directory.
-- Campers are hidden unless they explicitly opt in. Phone sharing is separate.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS directory_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS directory_show_phone boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS campers_directory_opt_in_idx
  ON public.campers (directory_opt_in)
  WHERE directory_opt_in = true;

CREATE OR REPLACE FUNCTION public.get_camper_directory()
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  lot_number text,
  phone text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.first_name::text,
    c.last_name::text,
    c.lot_number::text,
    CASE WHEN c.directory_show_phone THEN c.phone::text ELSE NULL END
  FROM public.campers c
  WHERE auth.uid() IS NOT NULL
    AND c.directory_opt_in = true
    AND COALESCE(c.active, true) = true
    AND LOWER(COALESCE(c.role, 'camper')) = 'camper'
  ORDER BY c.last_name, c.first_name;
$$;

REVOKE ALL ON FUNCTION public.get_camper_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_camper_directory() TO authenticated;
