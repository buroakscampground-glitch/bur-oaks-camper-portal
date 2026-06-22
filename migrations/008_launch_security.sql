-- Launch security: helper functions, complete RLS coverage, and Stripe event ledger.

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(auth.jwt() ->> 'email');
$$;

CREATE OR REPLACE FUNCTION public.current_camper_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public.campers
  WHERE LOWER(email) = public.current_user_email()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers
    WHERE LOWER(email) = public.current_user_email()
      AND LOWER(COALESCE(role, '')) = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_maintenance_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers
    WHERE LOWER(email) = public.current_user_email()
      AND LOWER(COALESCE(role, '')) = 'maintenance'
  );
$$;

CREATE OR REPLACE FUNCTION public.camper_protected_fields_unchanged(
  target_camper_id uuid,
  new_email text,
  new_role text,
  new_lot_number text,
  new_active boolean
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers c
    WHERE c.id = target_camper_id
      AND LOWER(c.email) = LOWER(new_email)
      AND c.role IS NOT DISTINCT FROM new_role
      AND c.lot_number::text IS NOT DISTINCT FROM new_lot_number
      AND c.active IS NOT DISTINCT FROM new_active
  );
$$;

REVOKE ALL ON FUNCTION public.current_camper_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_maintenance_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.camper_protected_fields_unchanged(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_camper_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_maintenance_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.camper_protected_fields_unchanged(uuid, text, text, text, boolean) TO authenticated;

-- Campers
ALTER TABLE public.campers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campers_admin_full_access ON public.campers;
CREATE POLICY campers_admin_full_access ON public.campers
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS campers_view_own ON public.campers;
CREATE POLICY campers_view_own ON public.campers
  FOR SELECT TO authenticated
  USING (LOWER(email) = public.current_user_email());

DROP POLICY IF EXISTS campers_update_own_safe_fields ON public.campers;
CREATE POLICY campers_update_own_safe_fields ON public.campers
  FOR UPDATE TO authenticated
  USING (LOWER(email) = public.current_user_email())
  WITH CHECK (
    LOWER(email) = public.current_user_email()
    AND public.camper_protected_fields_unchanged(
      id,
      email,
      role,
      lot_number::text,
      active
    )
  );

-- Invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_admin_full_access ON public.invoices;
DROP POLICY IF EXISTS invoices_camper_view_own ON public.invoices;
CREATE POLICY invoices_admin_full_access ON public.invoices
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY invoices_camper_view_own ON public.invoices
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Invoice items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_items_admin_full_access ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_camper_view_own ON public.invoice_items;
CREATE POLICY invoice_items_admin_full_access ON public.invoice_items
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY invoice_items_camper_view_own ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND i.camper_id = (SELECT public.current_camper_id())
    )
  );

-- Electric readings
ALTER TABLE public.electric_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS electric_readings_admin_full_access ON public.electric_readings;
DROP POLICY IF EXISTS electric_readings_camper_view_own ON public.electric_readings;
CREATE POLICY electric_readings_admin_full_access ON public.electric_readings
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY electric_readings_camper_view_own ON public.electric_readings
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Documents
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_admin_full_access ON public.documents;
DROP POLICY IF EXISTS documents_camper_view_own ON public.documents;
CREATE POLICY documents_admin_full_access ON public.documents
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY documents_camper_view_own ON public.documents
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Events and announcements
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_admin_full_access ON public.events;
DROP POLICY IF EXISTS events_authenticated_view ON public.events;
CREATE POLICY events_admin_full_access ON public.events
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY events_authenticated_view ON public.events
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_admin_full_access ON public.announcements;
DROP POLICY IF EXISTS announcements_authenticated_view_active ON public.announcements;
CREATE POLICY announcements_admin_full_access ON public.announcements
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY announcements_authenticated_view_active ON public.announcements
  FOR SELECT TO authenticated USING (is_active = true);

-- RSVPs
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_rsvps_admin_full_access ON public.event_rsvps;
DROP POLICY IF EXISTS event_rsvps_camper_view_own ON public.event_rsvps;
DROP POLICY IF EXISTS event_rsvps_camper_insert_own ON public.event_rsvps;
DROP POLICY IF EXISTS event_rsvps_camper_delete_own ON public.event_rsvps;
CREATE POLICY event_rsvps_admin_full_access ON public.event_rsvps
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY event_rsvps_camper_view_own ON public.event_rsvps
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
CREATE POLICY event_rsvps_camper_insert_own ON public.event_rsvps
  FOR INSERT TO authenticated
  WITH CHECK (camper_id = (SELECT public.current_camper_id()));
CREATE POLICY event_rsvps_camper_delete_own ON public.event_rsvps
  FOR DELETE TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Admin-only operational tables
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waitlist_admin_full_access ON public.waitlist;
CREATE POLICY waitlist_admin_full_access ON public.waitlist
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lots_admin_full_access ON public.lots;
CREATE POLICY lots_admin_full_access ON public.lots
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

ALTER TABLE public.gate_cards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gate_cards_admin_full_access ON public.gate_cards;
CREATE POLICY gate_cards_admin_full_access ON public.gate_cards
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

-- Alerts
ALTER TABLE public.text_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS text_reminders_admin_full_access ON public.text_reminders;
DROP POLICY IF EXISTS text_reminders_camper_view_own ON public.text_reminders;
CREATE POLICY text_reminders_admin_full_access ON public.text_reminders
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY text_reminders_camper_view_own ON public.text_reminders
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

-- Maintenance tickets
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS maintenance_tickets_admin_full_access ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_view_all ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_update ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_maintenance_insert ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_camper_view_own ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_camper_create_own ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_camper_update_none ON public.maintenance_tickets;
DROP POLICY IF EXISTS maintenance_tickets_camper_delete_none ON public.maintenance_tickets;

CREATE POLICY maintenance_tickets_admin_full_access ON public.maintenance_tickets
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
CREATE POLICY maintenance_tickets_maintenance_view_all ON public.maintenance_tickets
  FOR SELECT TO authenticated
  USING ((SELECT public.is_maintenance_user()));
CREATE POLICY maintenance_tickets_maintenance_update ON public.maintenance_tickets
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_maintenance_user()))
  WITH CHECK ((SELECT public.is_maintenance_user()));
CREATE POLICY maintenance_tickets_maintenance_insert ON public.maintenance_tickets
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_maintenance_user()));
CREATE POLICY maintenance_tickets_camper_view_own ON public.maintenance_tickets
  FOR SELECT TO authenticated
  USING (
    lot_number::text = (
      SELECT c.lot_number::text FROM public.campers c
      WHERE LOWER(c.email) = public.current_user_email()
      LIMIT 1
    )
  );
CREATE POLICY maintenance_tickets_camper_create_own ON public.maintenance_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    lot_number::text = (
      SELECT c.lot_number::text FROM public.campers c
      WHERE LOWER(c.email) = public.current_user_email()
      LIMIT 1
    )
  );

-- Stripe webhook deduplication. No client policies: service role only.
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Private camper documents. Object paths are camper-id/unique-filename.
INSERT INTO storage.buckets (id, name, public)
VALUES ('camper-documents', 'camper-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Lock the original upload bucket too. Existing public URLs are translated into
-- authenticated signed links by /api/document-url.
UPDATE storage.buckets
SET public = false
WHERE id = 'Documents';

DROP POLICY IF EXISTS camper_documents_admin_insert ON storage.objects;
DROP POLICY IF EXISTS camper_documents_admin_select ON storage.objects;
DROP POLICY IF EXISTS camper_documents_admin_update ON storage.objects;
DROP POLICY IF EXISTS camper_documents_admin_delete ON storage.objects;
DROP POLICY IF EXISTS camper_documents_camper_select_own ON storage.objects;

CREATE POLICY camper_documents_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'camper-documents'
    AND (SELECT public.is_admin_user())
  );
CREATE POLICY camper_documents_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'camper-documents'
    AND (SELECT public.is_admin_user())
  );
CREATE POLICY camper_documents_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'camper-documents'
    AND (SELECT public.is_admin_user())
  )
  WITH CHECK (
    bucket_id = 'camper-documents'
    AND (SELECT public.is_admin_user())
  );
CREATE POLICY camper_documents_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'camper-documents'
    AND (SELECT public.is_admin_user())
  );
CREATE POLICY camper_documents_camper_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'camper-documents'
    AND (storage.foldername(name))[1] = (SELECT public.current_camper_id())::text
  );
