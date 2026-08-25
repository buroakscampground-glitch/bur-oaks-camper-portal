-- Per-phone SMS consent, per-recipient event delivery reservations, and
-- concurrency-safe manual invoice numbers.

CREATE TABLE IF NOT EXISTS public.sms_phone_consents (
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  opted_in boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  opted_out_at timestamptz,
  source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (camper_id, phone_number)
);

ALTER TABLE public.sms_phone_consents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sms_phone_consents FROM anon, authenticated;

-- Preserve the consent represented by the existing household flag during rollout.
INSERT INTO public.sms_phone_consents (camper_id, phone_number, opted_in, opted_in_at, source)
SELECT
  c.id,
  CASE
    WHEN length(regexp_replace(phone.value, '\D', '', 'g')) = 10
      THEN '+1' || regexp_replace(phone.value, '\D', '', 'g')
    WHEN length(regexp_replace(phone.value, '\D', '', 'g')) = 11
      AND regexp_replace(phone.value, '\D', '', 'g') LIKE '1%'
      THEN '+' || regexp_replace(phone.value, '\D', '', 'g')
    ELSE NULL
  END,
  true,
  COALESCE(c.sms_opt_in_at, now()),
  'migration'
FROM public.campers c
CROSS JOIN LATERAL (
  VALUES (c.phone), (c.alternate_phone), (c.second_profile_phone)
) AS phone(value)
WHERE c.sms_opt_in = true
  AND phone.value IS NOT NULL
  AND (
    length(regexp_replace(phone.value, '\D', '', 'g')) = 10
    OR (
      length(regexp_replace(phone.value, '\D', '', 'g')) = 11
      AND regexp_replace(phone.value, '\D', '', 'g') LIKE '1%'
    )
  )
ON CONFLICT (camper_id, phone_number) DO NOTHING;

ALTER TABLE public.event_reminder_deliveries
  ADD COLUMN IF NOT EXISTS recipient_key text;

UPDATE public.event_reminder_deliveries
SET recipient_key = COALESCE(recipient, '')
WHERE recipient_key IS NULL;

ALTER TABLE public.event_reminder_deliveries
  ALTER COLUMN recipient_key SET DEFAULT '',
  ALTER COLUMN recipient_key SET NOT NULL;

ALTER TABLE public.event_reminder_deliveries
  DROP CONSTRAINT IF EXISTS event_reminder_deliveries_event_id_camper_id_reminder_date_channel_key;

-- Split historical multi-phone rows so a same-day retry after deployment does
-- not resend to numbers that were already successful.
INSERT INTO public.event_reminder_deliveries (
  event_id, camper_id, reminder_date, channel, status, recipient, recipient_key,
  subject, message, provider, provider_message_id, error_message, sent_at,
  created_at, updated_at
)
SELECT
  delivery.event_id, delivery.camper_id, delivery.reminder_date, delivery.channel,
  delivery.status, recipient.phone, recipient.phone, delivery.subject,
  delivery.message, delivery.provider, delivery.provider_message_id,
  delivery.error_message, delivery.sent_at, delivery.created_at, delivery.updated_at
FROM public.event_reminder_deliveries delivery
CROSS JOIN LATERAL unnest(regexp_split_to_array(delivery.recipient, '\s*,\s*'))
  WITH ORDINALITY AS recipient(phone, position)
WHERE delivery.channel = 'sms'
  AND delivery.recipient LIKE '%,%'
  AND recipient.position > 1;

UPDATE public.event_reminder_deliveries
SET recipient = (regexp_split_to_array(recipient, '\s*,\s*'))[1],
    recipient_key = (regexp_split_to_array(recipient, '\s*,\s*'))[1]
WHERE channel = 'sms'
  AND recipient LIKE '%,%';

CREATE UNIQUE INDEX IF NOT EXISTS event_reminder_deliveries_recipient_key
  ON public.event_reminder_deliveries (event_id, camper_id, reminder_date, channel, recipient_key);

CREATE TABLE IF NOT EXISTS public.manual_invoice_sequences (
  invoice_date date PRIMARY KEY,
  last_value integer NOT NULL CHECK (last_value > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.manual_invoice_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_invoice_sequences FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_manual_invoice_number(p_invoice_date date DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date := COALESCE(p_invoice_date, (now() AT TIME ZONE 'America/Chicago')::date);
  next_value integer;
  prefix text := 'INV-' || to_char(target_date, 'YYYYMMDD') || '-';
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.manual_invoice_sequences (invoice_date, last_value)
  VALUES (
    target_date,
    COALESCE((
      SELECT max((substring(invoice_number from '[0-9]+$'))::integer)
      FROM public.invoices
      WHERE invoice_number ~* ('^' || prefix || '[0-9]+$')
    ), 0) + 1
  )
  ON CONFLICT (invoice_date) DO UPDATE
    SET last_value = public.manual_invoice_sequences.last_value + 1,
        updated_at = now()
  RETURNING last_value INTO next_value;

  RETURN prefix || lpad(next_value::text, 3, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_manual_invoice_number(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_manual_invoice_number(date) TO authenticated;
