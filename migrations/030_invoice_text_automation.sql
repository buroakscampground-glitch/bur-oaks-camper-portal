ALTER TABLE public.text_reminders
  ADD COLUMN IF NOT EXISTS reminder_date date,
  ADD COLUMN IF NOT EXISTS automation_key text;

CREATE UNIQUE INDEX IF NOT EXISTS text_reminders_invoice_automation_unique
  ON public.text_reminders (invoice_id, automation_key, reminder_date)
  WHERE invoice_id IS NOT NULL
    AND automation_key IS NOT NULL
    AND reminder_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS text_reminders_invoice_lookup_idx
  ON public.text_reminders (invoice_id, sent_at DESC);
