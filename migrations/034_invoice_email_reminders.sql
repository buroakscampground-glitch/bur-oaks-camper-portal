-- Add camper invoice email reminder logging alongside SMS reminder history.

ALTER TABLE public.text_reminders
  ADD COLUMN IF NOT EXISTS recipient_email text;

CREATE INDEX IF NOT EXISTS text_reminders_provider_sent_idx
  ON public.text_reminders (provider, sent_at DESC);

