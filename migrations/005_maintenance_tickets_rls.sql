-- Migration: enable row level security for maintenance_tickets
-- Admin users may fully manage all tickets.
-- Campers may view tickets tied to their own lot and may create tickets.
-- Campers may not delete or update existing tickets.

ALTER TABLE maintenance_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tickets FORCE ROW LEVEL SECURITY;

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
    lot_number = (
      SELECT lot_number
      FROM campers
      WHERE email = public.current_user_email()
      LIMIT 1
    )
  );

CREATE POLICY maintenance_tickets_camper_create_own
  ON maintenance_tickets
  FOR INSERT
  WITH CHECK (
    lot_number = (
      SELECT lot_number
      FROM campers
      WHERE email = public.current_user_email()
      LIMIT 1
    )
    AND reported_by = public.current_user_email()
  );

CREATE POLICY maintenance_tickets_camper_update_none
  ON maintenance_tickets
  FOR UPDATE
  USING (false);

CREATE POLICY maintenance_tickets_camper_delete_none
  ON maintenance_tickets
  FOR DELETE
  USING (false);
