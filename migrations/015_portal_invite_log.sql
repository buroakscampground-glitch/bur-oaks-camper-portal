-- Track portal invite emails so bulk sending can move through the roster
-- without repeatedly emailing the same campers.

CREATE TABLE IF NOT EXISTS public.portal_invite_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE CASCADE,
  email text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'sent',
  delivery_provider text NOT NULL DEFAULT 'resend',
  error_message text,
  sent_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_invite_log_email_created_idx
  ON public.portal_invite_log (LOWER(email), created_at DESC);

ALTER TABLE public.portal_invite_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_invite_log_admin_full_access ON public.portal_invite_log;
CREATE POLICY portal_invite_log_admin_full_access ON public.portal_invite_log
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
