-- A private portal greeting is not an email or SMS and does not require
-- personal-message consent. It is still reserved once per birthday/profile/year
-- so automatic and manual runs cannot create duplicate celebrations.

ALTER TABLE public.camper_celebration_deliveries
  DROP CONSTRAINT IF EXISTS camper_celebration_deliveries_channel_check;

ALTER TABLE public.camper_celebration_deliveries
  ADD CONSTRAINT camper_celebration_deliveries_channel_check
  CHECK (channel IN ('email', 'sms', 'portal'));
