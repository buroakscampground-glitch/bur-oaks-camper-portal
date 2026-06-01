-- Migration: enable row level security for maintenance_tickets
-- Admin users may fully manage all tickets.
-- Campers may view tickets tied to their own camper record or lot,
-- and may create new tickets, but may not delete or update existing tickets.

ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS maintenance_tickets_camper_id_idx
  ON maintenance_tickets (camper_id);

CREATE INDEX IF NOT EXISTS maintenance_tickets_lot_number_idx
  ON maintenance_tickets (lot_number);

CREATE POLICY maintenance_tickets_admin_full_access
  ON maintenance_tickets
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY maintenance_tickets_camper_view_own
  ON maintenance_tickets
  FOR SELECT
  USING (
    camper_id = public.current_camper_id()
    OR lot_number = (
      SELECT lot_number FROM campers WHERE id = public.current_camper_id() LIMIT 1
    )
  );

CREATE POLICY maintenance_tickets_camper_create_own
  ON maintenance_tickets
  FOR INSERT
  WITH CHECK (
    camper_id = public.current_camper_id()
    OR lot_number = (
      SELECT lot_number FROM campers WHERE id = public.current_camper_id() LIMIT 1
    )
  );
