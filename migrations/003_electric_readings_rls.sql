-- Migration: enable row level security for electric_readings
-- Admin users may fully manage all readings.
-- Campers may only view readings belonging to their own camper record.

-- Enable RLS on electric_readings
ALTER TABLE electric_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE electric_readings FORCE ROW LEVEL SECURITY;

-- Required index for camper-scoped selection
CREATE INDEX IF NOT EXISTS electric_readings_camper_id_idx
  ON electric_readings (camper_id);

-- Admin policy: full access for admin users
CREATE POLICY electric_readings_admin_full_access
  ON electric_readings
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- Camper policy: allow campers to select only their own readings
CREATE POLICY electric_readings_camper_view_own
  ON electric_readings
  FOR SELECT
  USING (camper_id = public.current_camper_id());
