-- Maintenance ticket conversation notes.
-- Campers, admins, and approved maintenance staff can leave plain-text updates
-- on a work order without changing the ticket itself.

CREATE TABLE IF NOT EXISTS public.maintenance_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_role text NOT NULL DEFAULT 'camper',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_ticket_comments_ticket_idx
  ON public.maintenance_ticket_comments (ticket_id, created_at);

ALTER TABLE public.maintenance_ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_ticket_comments_admin_full_access ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_admin_full_access
  ON public.maintenance_ticket_comments
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS maintenance_ticket_comments_camper_view_own ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_camper_view_own
  ON public.maintenance_ticket_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      JOIN public.campers c ON c.lot_number::text = t.lot_number::text
      WHERE t.id = ticket_id
        AND (
          LOWER(c.email) = public.current_user_email()
          OR LOWER(COALESCE(to_jsonb(c) ->> 'secondary_email', '')) = public.current_user_email()
        )
    )
  );

DROP POLICY IF EXISTS maintenance_ticket_comments_camper_insert_own ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_camper_insert_own
  ON public.maintenance_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'camper'
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      JOIN public.campers c ON c.lot_number::text = t.lot_number::text
      WHERE t.id = ticket_id
        AND c.id = camper_id
        AND (
          LOWER(c.email) = public.current_user_email()
          OR LOWER(COALESCE(to_jsonb(c) ->> 'secondary_email', '')) = public.current_user_email()
        )
    )
  );

DROP POLICY IF EXISTS maintenance_ticket_comments_maintenance_view_approved ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_maintenance_view_approved
  ON public.maintenance_ticket_comments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = ticket_id
        AND t.admin_approved = true
    )
  );

DROP POLICY IF EXISTS maintenance_ticket_comments_maintenance_insert_approved ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_maintenance_insert_approved
  ON public.maintenance_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'maintenance'
    AND (SELECT public.is_maintenance_user())
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_tickets t
      WHERE t.id = ticket_id
        AND t.admin_approved = true
    )
  );
