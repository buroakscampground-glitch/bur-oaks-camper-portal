-- Replace personal rules embedded in application code with visible, dated,
-- accountable policies. Existing camper and billing records are not changed.

CREATE TABLE IF NOT EXISTS public.camper_account_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_key text NOT NULL UNIQUE CHECK (char_length(policy_key) BETWEEN 3 AND 160),
  policy_type text NOT NULL CHECK (policy_type IN (
    'billing_disabled', 'lot_rent_exempt', 'document_delivery_exempt',
    'billing_delegate', 'pump_out_service_access'
  )),
  camper_id uuid REFERENCES public.campers(id) ON DELETE RESTRICT,
  lot_number text,
  subject_email text,
  related_lot_number text,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000),
  effective_on date NOT NULL,
  expires_on date CHECK (expires_on IS NULL OR expires_on >= effective_on),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL,
  CHECK (camper_id IS NOT NULL OR NULLIF(btrim(COALESCE(lot_number, '')), '') IS NOT NULL OR NULLIF(btrim(COALESCE(subject_email, '')), '') IS NOT NULL),
  CHECK (policy_type <> 'billing_delegate' OR (subject_email IS NOT NULL AND lot_number IS NOT NULL)),
  CHECK (policy_type <> 'pump_out_service_access' OR (subject_email IS NOT NULL AND lot_number IS NOT NULL AND related_lot_number IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.camper_account_policy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.camper_account_policies(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'activated', 'expired')),
  actor text NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000),
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camper_account_policies_camper_idx ON public.camper_account_policies (camper_id, active, effective_on, expires_on);
CREATE INDEX IF NOT EXISTS camper_account_policies_lot_idx ON public.camper_account_policies (upper(btrim(lot_number)), active, policy_type);
CREATE INDEX IF NOT EXISTS camper_account_policies_email_idx ON public.camper_account_policies (lower(btrim(subject_email)), active, policy_type);
CREATE INDEX IF NOT EXISTS camper_account_policy_events_policy_idx ON public.camper_account_policy_events (policy_id, created_at DESC);

ALTER TABLE public.camper_account_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camper_account_policy_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.camper_account_policies, public.camper_account_policy_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.camper_account_policies, public.camper_account_policy_events TO authenticated;
GRANT ALL ON TABLE public.camper_account_policies, public.camper_account_policy_events TO service_role;

DROP POLICY IF EXISTS camper_account_policies_admin_select ON public.camper_account_policies;
CREATE POLICY camper_account_policies_admin_select ON public.camper_account_policies
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));
DROP POLICY IF EXISTS camper_account_policy_events_admin_select ON public.camper_account_policy_events;
CREATE POLICY camper_account_policy_events_admin_select ON public.camper_account_policy_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.block_camper_account_policy_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Camper account policy events are immutable and append-only.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS camper_account_policy_events_immutable ON public.camper_account_policy_events;
CREATE TRIGGER camper_account_policy_events_immutable
  BEFORE UPDATE OR DELETE ON public.camper_account_policy_events
  FOR EACH ROW EXECUTE FUNCTION public.block_camper_account_policy_event_mutation();

CREATE OR REPLACE FUNCTION public.set_camper_account_policy_atomic(
  p_policy_id uuid,
  p_policy_type text,
  p_camper_id uuid,
  p_lot_number text,
  p_subject_email text,
  p_related_lot_number text,
  p_reason text,
  p_effective_on date,
  p_expires_on date,
  p_active boolean,
  p_actor text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  policy_row public.camper_account_policies%ROWTYPE;
  before_row jsonb := '{}'::jsonb;
  normalized_actor text := NULLIF(lower(btrim(COALESCE(p_actor, ''))), '');
  normalized_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  action_name text;
BEGIN
  IF p_policy_type NOT IN ('billing_disabled','lot_rent_exempt','document_delivery_exempt','billing_delegate','pump_out_service_access') THEN
    RAISE EXCEPTION 'Unsupported account policy type.';
  END IF;
  IF normalized_actor IS NULL OR char_length(normalized_actor) > 320 THEN RAISE EXCEPTION 'A valid policy actor is required.'; END IF;
  IF normalized_reason IS NULL OR char_length(normalized_reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'A meaningful policy reason is required.'; END IF;
  IF p_effective_on IS NULL OR (p_expires_on IS NOT NULL AND p_expires_on < p_effective_on) THEN RAISE EXCEPTION 'Choose a valid policy date range.'; END IF;

  IF p_policy_id IS NULL THEN
    INSERT INTO public.camper_account_policies (
      policy_key, policy_type, camper_id, lot_number, subject_email, related_lot_number,
      reason, effective_on, expires_on, active, created_by, updated_by
    ) VALUES (
      'manual:' || gen_random_uuid()::text, p_policy_type, p_camper_id,
      NULLIF(upper(btrim(COALESCE(p_lot_number, ''))), ''), NULLIF(lower(btrim(COALESCE(p_subject_email, ''))), ''),
      NULLIF(upper(btrim(COALESCE(p_related_lot_number, ''))), ''), normalized_reason,
      p_effective_on, p_expires_on, COALESCE(p_active, true), normalized_actor, normalized_actor
    ) RETURNING * INTO policy_row;
    action_name := 'created';
  ELSE
    SELECT * INTO policy_row FROM public.camper_account_policies WHERE id = p_policy_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Account policy not found.'; END IF;
    before_row := to_jsonb(policy_row);
    action_name := CASE
      WHEN policy_row.active IS DISTINCT FROM p_active AND p_active THEN 'activated'
      WHEN policy_row.active IS DISTINCT FROM p_active AND NOT p_active THEN 'expired'
      ELSE 'updated'
    END;
    UPDATE public.camper_account_policies SET
      policy_type = p_policy_type, camper_id = p_camper_id,
      lot_number = NULLIF(upper(btrim(COALESCE(p_lot_number, ''))), ''),
      subject_email = NULLIF(lower(btrim(COALESCE(p_subject_email, ''))), ''),
      related_lot_number = NULLIF(upper(btrim(COALESCE(p_related_lot_number, ''))), ''),
      reason = normalized_reason, effective_on = p_effective_on, expires_on = p_expires_on,
      active = COALESCE(p_active, false), updated_at = now(), updated_by = normalized_actor
    WHERE id = p_policy_id RETURNING * INTO policy_row;
  END IF;

  INSERT INTO public.camper_account_policy_events (policy_id, action, actor, reason, before_state, after_state)
  VALUES (policy_row.id, action_name, normalized_actor, normalized_reason, before_row, to_jsonb(policy_row));
  RETURN to_jsonb(policy_row);
END;
$$;

REVOKE ALL ON FUNCTION public.block_camper_account_policy_event_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_camper_account_policy_atomic(uuid,text,uuid,text,text,text,text,date,date,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_camper_account_policy_atomic(uuid,text,uuid,text,text,text,text,date,date,boolean,text) TO service_role;

-- Preserve the exact currently approved behavior as explicit dated policies.
INSERT INTO public.camper_account_policies
  (policy_key, policy_type, lot_number, reason, effective_on, active, created_by, updated_by)
VALUES
  ('legacy:no-billing:48', 'billing_disabled', '48', 'Active camper site with billing disabled by campground policy.', '2026-10-08', true, 'system-migration', 'system-migration')
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.camper_account_policies
  (policy_key, policy_type, camper_id, lot_number, reason, effective_on, active, created_by, updated_by)
SELECT 'legacy:rent-exempt:' || id::text, 'lot_rent_exempt', id, upper(btrim(lot_number)),
  'Staff camper is exempt from lot rent; other campsite charges remain enabled.', '2026-10-08', true, 'system-migration', 'system-migration'
FROM public.campers
WHERE upper(btrim(COALESCE(lot_number, ''))) = '47'
  AND lower(regexp_replace(COALESCE(first_name, ''), '[^a-zA-Z]', '', 'g')) IN ('charlie','charles')
  AND lower(regexp_replace(COALESCE(last_name, ''), '[^a-zA-Z]', '', 'g')) IN ('kimbal','kimball')
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.camper_account_policies
  (policy_key, policy_type, camper_id, lot_number, reason, effective_on, active, created_by, updated_by)
SELECT 'legacy:document-exempt:' || id::text, 'document_delivery_exempt', id, upper(btrim(lot_number)),
  'Camper uses the approved signature-exempt renewal process and receives no automated renewal document.', '2026-10-08', true, 'system-migration', 'system-migration'
FROM public.campers
WHERE upper(btrim(COALESCE(lot_number, ''))) = '48'
  AND lower(regexp_replace(COALESCE(first_name, ''), '[^a-zA-Z]', '', 'g')) = 'anthony'
  AND lower(regexp_replace(COALESCE(last_name, ''), '[^a-zA-Z]', '', 'g')) = 'finley'
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.camper_account_policies
  (policy_key, policy_type, lot_number, subject_email, reason, effective_on, active, created_by, updated_by)
VALUES
  ('legacy:delegate:ff2:1', 'billing_delegate', 'FF2', 'dmonke69@yahoo.com', 'Authorized family contact may access billing and assigned documents for this campsite.', '2026-10-08', true, 'system-migration', 'system-migration'),
  ('legacy:delegate:ff12:1', 'billing_delegate', 'FF12', 'stacymcnish@yahoo.com', 'Authorized family contact may access billing and assigned documents for this campsite.', '2026-10-08', true, 'system-migration', 'system-migration'),
  ('legacy:delegate:temp1:1', 'billing_delegate', 'TEMP 1', 'neter85@gmail.com', 'Authorized family contact may access billing and assigned documents for this campsite.', '2026-10-08', true, 'system-migration', 'system-migration')
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.camper_account_policies
  (policy_key, policy_type, lot_number, subject_email, related_lot_number, reason, effective_on, active, created_by, updated_by)
VALUES
  ('legacy:pump-access:18:temp1', 'pump_out_service_access', '18', 'neter85@gmail.com', 'TEMP 1', 'Authorized account may request pump-out service for the related campsite while billing remains on the primary campsite.', '2026-10-08', true, 'system-migration', 'system-migration')
ON CONFLICT (policy_key) DO NOTHING;

INSERT INTO public.camper_account_policy_events (policy_id, action, actor, reason, after_state)
SELECT policy.id, 'created', 'system-migration', policy.reason, to_jsonb(policy)
FROM public.camper_account_policies policy
WHERE policy.policy_key LIKE 'legacy:%'
  AND NOT EXISTS (SELECT 1 FROM public.camper_account_policy_events event WHERE event.policy_id = policy.id);

COMMENT ON TABLE public.camper_account_policies IS 'Dated, visible camper billing, document, delegation, and service-access policies formerly embedded in application code.';
COMMENT ON TABLE public.camper_account_policy_events IS 'Immutable history for camper account policy creation, edits, activation, and expiration.';
