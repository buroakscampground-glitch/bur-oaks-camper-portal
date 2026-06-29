-- Twilio-ready camper text alerts.
-- Campers must opt in before they can receive campground SMS messages.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS sms_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_opt_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.text_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  reminder_type text NOT NULL DEFAULT 'General Alert',
  message text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'saved'
);

ALTER TABLE public.text_reminders
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS sent_by text;

CREATE INDEX IF NOT EXISTS text_reminders_camper_sent_idx
  ON public.text_reminders (camper_id, sent_at DESC);

ALTER TABLE public.text_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS text_reminders_admin_full_access ON public.text_reminders;
CREATE POLICY text_reminders_admin_full_access
  ON public.text_reminders
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS text_reminders_camper_view_own ON public.text_reminders;
CREATE POLICY text_reminders_camper_view_own
  ON public.text_reminders
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
