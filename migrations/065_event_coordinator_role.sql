-- Allow the dedicated, community-only event coordinator role.
ALTER TABLE public.campers
  DROP CONSTRAINT IF EXISTS campers_role_check;

ALTER TABLE public.campers
  ADD CONSTRAINT campers_role_check
  CHECK (role IN ('admin', 'camper', 'maintenance', 'event_coordinator'));
