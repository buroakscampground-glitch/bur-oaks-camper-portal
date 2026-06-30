-- Allow incorrect invoices to be deleted even if text reminder history exists.
-- Reminder rows for a deleted invoice are removed with that invoice.

ALTER TABLE public.text_reminders
  DROP CONSTRAINT IF EXISTS text_reminders_invoice_id_fkey;

ALTER TABLE public.text_reminders
  ADD CONSTRAINT text_reminders_invoice_id_fkey
  FOREIGN KEY (invoice_id)
  REFERENCES public.invoices(id)
  ON DELETE CASCADE;
