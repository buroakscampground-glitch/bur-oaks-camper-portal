-- Let campers reserve an online extra payment for future lot rent instead of
-- allowing another bill type to consume it. Stripe references make creation
-- idempotent across checkout-session and payment-intent webhooks.

ALTER TABLE public.account_credits
  ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS source_reference text;

ALTER TABLE public.account_credits
  DROP CONSTRAINT IF EXISTS account_credits_applies_to_check;

ALTER TABLE public.account_credits
  ADD CONSTRAINT account_credits_applies_to_check
  CHECK (applies_to IN ('general', 'lot_rent'));

CREATE UNIQUE INDEX IF NOT EXISTS account_credits_source_reference_unique
  ON public.account_credits (source_reference)
  WHERE source_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_account_credits_to_invoice_atomic(
  p_camper_id uuid,
  p_invoice_id uuid,
  p_invoice_total numeric,
  p_applied_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_row public.invoices%ROWTYPE;
  credit_row public.account_credits%ROWTYPE;
  remaining_due numeric(10,2);
  applied_total numeric(10,2) := 0;
  amount_applied numeric(10,2);
  new_remaining numeric(10,2);
  available_credit numeric(10,2) := 0;
  invoice_is_lot_rent boolean := false;
  campground_today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO invoice_row
  FROM public.invoices
  WHERE id = p_invoice_id AND camper_id = p_camper_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;

  invoice_is_lot_rent := LOWER(COALESCE(invoice_row.invoice_type, '')) LIKE '%rent%'
    AND LOWER(COALESCE(invoice_row.invoice_type, '')) NOT LIKE '%association%';
  remaining_due := ROUND(COALESCE(invoice_row.total_due, 0), 2);

  IF LOWER(COALESCE(invoice_row.status, '')) NOT IN ('open', 'sent', 'overdue') OR remaining_due <= 0 THEN
    RETURN jsonb_build_object('appliedTotal', 0, 'remainingDue', remaining_due,
      'paidInFull', LOWER(COALESCE(invoice_row.status, '')) = 'paid',
      'heldUntilDue', false, 'dueDate', invoice_row.due_date);
  END IF;

  IF invoice_row.due_date IS NULL OR invoice_row.due_date > campground_today THEN
    SELECT ROUND(COALESCE(SUM(remaining_amount), 0), 2) INTO available_credit
    FROM public.account_credits
    WHERE camper_id = p_camper_id AND status = 'active' AND remaining_amount > 0
      AND (COALESCE(applies_to, 'general') = 'general'
        OR (COALESCE(applies_to, 'general') = 'lot_rent' AND invoice_is_lot_rent));

    RETURN jsonb_build_object('appliedTotal', 0, 'remainingDue', remaining_due,
      'paidInFull', false, 'heldUntilDue', available_credit > 0, 'dueDate', invoice_row.due_date);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_camper_id::text, 0));

  FOR credit_row IN
    SELECT * FROM public.account_credits
    WHERE camper_id = p_camper_id AND status = 'active' AND remaining_amount > 0
      AND (COALESCE(applies_to, 'general') = 'general'
        OR (COALESCE(applies_to, 'general') = 'lot_rent' AND invoice_is_lot_rent))
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_due <= 0;
    amount_applied := LEAST(credit_row.remaining_amount, remaining_due);
    new_remaining := ROUND(credit_row.remaining_amount - amount_applied, 2);

    UPDATE public.account_credits
    SET remaining_amount = new_remaining,
        status = CASE WHEN new_remaining <= 0 THEN 'used' ELSE 'active' END,
        updated_at = now()
    WHERE id = credit_row.id;

    INSERT INTO public.account_credit_applications (credit_id, camper_id, invoice_id, amount_applied, applied_by)
    VALUES (credit_row.id, p_camper_id, p_invoice_id, amount_applied, p_applied_by);

    applied_total := ROUND(applied_total + amount_applied, 2);
    remaining_due := ROUND(remaining_due - amount_applied, 2);
  END LOOP;

  IF applied_total > 0 THEN
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (p_invoice_id, 'Account credit applied - ' || TO_CHAR(applied_total, 'FM$999,999,990.00'), 1, -applied_total, -applied_total);

    UPDATE public.invoices
    SET total_due = remaining_due,
        status = CASE WHEN remaining_due <= 0 THEN 'paid'
          WHEN LOWER(COALESCE(invoice_row.status, '')) = 'overdue' THEN 'overdue' ELSE 'sent' END,
        paid_at = CASE WHEN remaining_due <= 0 THEN now() ELSE paid_at END,
        payment_method = CASE WHEN remaining_due <= 0 THEN 'Paid by account credit' ELSE payment_method END,
        payment_reference = CASE WHEN remaining_due <= 0
          THEN 'Paid by account credit: ' || TO_CHAR(applied_total, 'FM$999,999,990.00') ELSE payment_reference END
    WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object('appliedTotal', applied_total, 'remainingDue', remaining_due,
    'paidInFull', remaining_due <= 0, 'heldUntilDue', false, 'dueDate', invoice_row.due_date);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) TO service_role;

COMMENT ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) IS
  'Applies due general credits to any invoice and restricted lot-rent credits only to due lot-rent invoices.';
