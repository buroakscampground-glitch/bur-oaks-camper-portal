-- Optional weekly event reminders for active campers.
-- Reminders run on Wednesday for events within 14 days, plus on event day.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS event_reminders_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS event_reminders_opt_in_at timestamptz;

CREATE TABLE IF NOT EXISTS public.event_reminder_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms')),
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed')),
  recipient text,
  subject text,
  message text NOT NULL,
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, camper_id, reminder_date, channel)
);

CREATE INDEX IF NOT EXISTS event_reminder_deliveries_camper_idx
  ON public.event_reminder_deliveries (camper_id, reminder_date DESC);

CREATE INDEX IF NOT EXISTS event_reminder_deliveries_event_idx
  ON public.event_reminder_deliveries (event_id, reminder_date DESC);

ALTER TABLE public.event_reminder_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_reminder_deliveries_admin_access ON public.event_reminder_deliveries;
CREATE POLICY event_reminder_deliveries_admin_access
  ON public.event_reminder_deliveries
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS event_reminder_deliveries_camper_view ON public.event_reminder_deliveries;
CREATE POLICY event_reminder_deliveries_camper_view
  ON public.event_reminder_deliveries
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
