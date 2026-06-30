-- Allow admins to add one-off site service charges with custom descriptions and prices.

ALTER TABLE public.site_service_charges
  DROP CONSTRAINT IF EXISTS site_service_charges_type_check;

ALTER TABLE public.site_service_charges
  ADD CONSTRAINT site_service_charges_type_check
  CHECK (
    service_type IN (
      'full_weed_eat',
      'half_weed_eat',
      'spray_weeds',
      'half_spray_weeds',
      'pressure_wash',
      'misc_service'
    )
  );
