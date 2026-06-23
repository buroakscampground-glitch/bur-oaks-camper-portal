-- Admin attention alerts for payments, maintenance requests, and RSVPs.

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  lot_number text,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  source_table text,
  source_id text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx
  ON public.admin_notifications (type, read_at, created_at DESC);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_notifications_admin_full_access ON public.admin_notifications;
CREATE POLICY admin_notifications_admin_full_access
  ON public.admin_notifications
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
