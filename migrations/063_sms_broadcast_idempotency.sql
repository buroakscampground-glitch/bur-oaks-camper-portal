-- One campaign per admin action and one delivery per physical phone number.
CREATE TABLE IF NOT EXISTS public.sms_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  target_mode text NOT NULL,
  target_camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  reminder_type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  recipient_count integer NOT NULL DEFAULT 0,
  duplicate_recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.sms_broadcast_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES public.sms_broadcasts(id) ON DELETE CASCADE,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  recipient_phone text NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (broadcast_id, recipient_phone)
);

ALTER TABLE public.text_reminders
  ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.sms_broadcasts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS text_reminders_broadcast_phone_unique
  ON public.text_reminders (broadcast_id, recipient_phone)
  WHERE broadcast_id IS NOT NULL AND recipient_phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_broadcasts_created_idx
  ON public.sms_broadcasts (created_at DESC);

CREATE INDEX IF NOT EXISTS sms_broadcast_deliveries_broadcast_idx
  ON public.sms_broadcast_deliveries (broadcast_id, created_at);

ALTER TABLE public.sms_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_broadcast_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sms_broadcasts FROM anon, authenticated;
REVOKE ALL ON TABLE public.sms_broadcast_deliveries FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sms_broadcasts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sms_broadcast_deliveries TO service_role;
