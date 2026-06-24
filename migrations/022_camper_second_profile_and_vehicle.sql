-- Optional second camper profile and second vehicle fields.
-- These are not required; blank values are allowed for sites with one signer/one vehicle.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS second_profile_first_name text,
  ADD COLUMN IF NOT EXISTS second_profile_last_name text,
  ADD COLUMN IF NOT EXISTS second_profile_phone text,
  ADD COLUMN IF NOT EXISTS vehicle_2_make text,
  ADD COLUMN IF NOT EXISTS vehicle_2_model text,
  ADD COLUMN IF NOT EXISTS vehicle_2_license_plate text;

