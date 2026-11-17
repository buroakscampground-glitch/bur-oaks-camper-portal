-- Add a visible, auditable permanent late-fee exemption and enforce it at
-- both the application and database boundaries. Existing billing records are
-- preserved; Charlie Kimball currently has no late fees to remove.

ALTER TABLE public.camper_account_policies
  DROP CONSTRAINT IF EXISTS camper_account_policies_policy_type_check;

ALTER TABLE public.camper_account_policies
  ADD CONSTRAINT camper_account_policies_policy_type_check CHECK (policy_type IN (
    'billing_disabled', 'lot_rent_exempt', 'late_fee_exempt',
    'document_delivery_exempt', 'billing_delegate', 'pump_out_service_access'
  ));

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
  IF p_policy_type NOT IN ('billing_disabled','lot_rent_exempt','late_fee_exempt','document_delivery_exempt','billing_delegate','pump_out_service_access') THEN
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

REVOKE ALL ON FUNCTION public.set_camper_account_policy_atomic(uuid,text,uuid,text,text,text,text,date,date,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_camper_account_policy_atomic(uuid,text,uuid,text,text,text,text,date,date,boolean,text) TO service_role;

CREATE OR REPLACE FUNCTION public.block_late_fee_for_exempt_camper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.late_fee, 0) > 0 AND EXISTS (
    SELECT 1
    FROM public.camper_account_policies policy
    LEFT JOIN public.campers camper ON camper.id = NEW.camper_id
    WHERE policy.policy_type = 'late_fee_exempt'
      AND policy.active = true
      AND policy.effective_on <= CURRENT_DATE
      AND (policy.expires_on IS NULL OR policy.expires_on >= CURRENT_DATE)
      AND (
        policy.camper_id = NEW.camper_id
        OR (
          policy.camper_id IS NULL
          AND upper(regexp_replace(COALESCE(policy.lot_number, ''), '[^a-zA-Z0-9]', '', 'g')) =
              upper(regexp_replace(COALESCE(camper.lot_number, ''), '[^a-zA-Z0-9]', '', 'g'))
        )
      )
  ) THEN
    RAISE EXCEPTION 'Late fees are prohibited by an active camper account policy.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.block_late_fee_for_exempt_camper() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_block_exempt_late_fee ON public.invoices;
CREATE TRIGGER invoices_block_exempt_late_fee
  BEFORE INSERT OR UPDATE OF late_fee ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_late_fee_for_exempt_camper();

INSERT INTO public.camper_account_policies (
  policy_key, policy_type, camper_id, lot_number, reason, effective_on,
  expires_on, active, created_by, updated_by
)
SELECT
  'permanent:late-fee-exempt:charlie-kimball-lot-47',
  'late_fee_exempt',
  camper.id,
  upper(btrim(camper.lot_number)),
  'Owner instruction: never assess a late fee for Charlie Kimball.',
  '2026-11-17',
  NULL,
  true,
  'owner-instruction',
  'owner-instruction'
FROM public.campers camper
WHERE upper(btrim(COALESCE(camper.lot_number, ''))) = '47'
  AND lower(regexp_replace(COALESCE(camper.first_name, ''), '[^a-zA-Z]', '', 'g')) IN ('charlie', 'charles')
  AND lower(regexp_replace(COALESCE(camper.last_name, ''), '[^a-zA-Z]', '', 'g')) IN ('kimball', 'kimbal')
ON CONFLICT (policy_key) DO UPDATE SET
  camper_id = EXCLUDED.camper_id,
  lot_number = EXCLUDED.lot_number,
  reason = EXCLUDED.reason,
  effective_on = EXCLUDED.effective_on,
  expires_on = NULL,
  active = true,
  updated_at = now(),
  updated_by = EXCLUDED.updated_by;

INSERT INTO public.camper_account_policy_events (policy_id, action, actor, reason, after_state)
SELECT policy.id, 'created', 'owner-instruction', policy.reason, to_jsonb(policy)
FROM public.camper_account_policies policy
WHERE policy.policy_key = 'permanent:late-fee-exempt:charlie-kimball-lot-47'
  AND NOT EXISTS (
    SELECT 1 FROM public.camper_account_policy_events event WHERE event.policy_id = policy.id
  );

COMMENT ON FUNCTION public.block_late_fee_for_exempt_camper() IS 'Prevents every invoice write path from adding a late fee when an active late_fee_exempt policy exists.';
