-- Campground billing settings controlled from Admin > Settings.

INSERT INTO public.app_settings (key, value, description)
VALUES
  ('electric_default_rate', '0.23', 'Default electric billing rate per kWh.'),
  ('water_trash_fee_options', '20,25', 'Comma-separated water/trash fee options shown on electric billing.'),
  ('sewer_pump_out_fee', '10', 'Default sewer pump-out charge added to the next electric bill.'),
  ('site_service_full_weed_eat', '45', 'Default charge for full weed eating.'),
  ('site_service_half_weed_eat', '20', 'Default charge for half weed eating.'),
  ('site_service_spray_weeds', '45', 'Default charge for spraying weeds.'),
  ('site_service_half_spray_weeds', '20', 'Default charge for half spray weeds.'),
  ('site_service_pressure_wash', '20', 'Default charge for pressure washing.')
ON CONFLICT (key) DO NOTHING;
