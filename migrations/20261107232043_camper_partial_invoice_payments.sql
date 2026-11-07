-- Record camper-initiated Stripe installments against one invoice at a time.
-- The Stripe PaymentIntent reference makes checkout-session and PaymentIntent
-- webhook retries idempotent. Invoice and camper locks prevent two concurrent
-- payments from reducing the same balance below zero.

CREATE TABLE IF NOT EXISTS public.online_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference text NOT NULL UNIQUE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  applied_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (applied_amount >= 0),
  credit_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  payment_method text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  credit_id uuid REFERENCES public.account_credits(id) ON DELETE SET NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS online_invoice_payments_camper_date_idx
  ON public.online_invoice_payments (camper_id, received_at DESC);
CREATE INDEX IF NOT EXISTS online_invoice_payments_invoice_date_idx
  ON public.online_invoice_payments (invoice_id, received_at DESC);
CREATE INDEX IF NOT EXISTS online_invoice_payments_credit_idx
  ON public.online_invoice_payments (credit_id)
  WHERE credit_id IS NOT NULL;

ALTER TABLE public.online_invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.online_invoice_payments FROM anon, authenticated;
DROP POLICY IF EXISTS online_invoice_payments_no_client_access ON public.online_invoice_payments;
CREATE POLICY online_invoice_payments_no_client_access
  ON public.online_invoice_payments
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.record_online_invoice_payment_atomic(
  p_payment_reference text,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_row public.invoices%ROWTYPE;
  camper_row public.campers%ROWTYPE;
  payment_row public.online_invoice_payments%ROWTYPE;
  credit_row public.account_credits%ROWTYPE;
  existing_result jsonb;
  payment_amount numeric(10,2) := ROUND(COALESCE(p_amount, 0), 2);
  current_balance numeric(10,2);
  applied_amount numeric(10,2) := 0;
  credit_amount numeric(10,2) := 0;
  remaining_balance numeric(10,2);
  final_status text;
  final_result jsonb;
  campground_today date := (now() AT TIME ZONE 'America/Chicago')::date;
BEGIN
  IF BTRIM(COALESCE(p_payment_reference, '')) = '' THEN
    RAISE EXCEPTION 'A Stripe payment reference is required.';
  END IF;
  IF payment_amount < 0.50 OR payment_amount > 1000000 THEN
    RAISE EXCEPTION 'Enter a payment amount between $0.50 and $1,000,000.';
  END IF;
  IF BTRIM(COALESCE(p_payment_method, '')) = '' THEN
    RAISE EXCEPTION 'Payment method is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(BTRIM(p_payment_reference), 0));
  SELECT result INTO existing_result
  FROM public.online_invoice_payments
  WHERE payment_reference = BTRIM(p_payment_reference);
  IF FOUND THEN
    RETURN COALESCE(existing_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
  END IF;

  SELECT * INTO invoice_row
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(invoice_row.camper_id::text, 0));
  SELECT * INTO camper_row FROM public.campers WHERE id = invoice_row.camper_id;
  current_balance := ROUND(GREATEST(COALESCE(invoice_row.total_due, 0), 0), 2);

  -- A matching processing reference is the ACH payment now clearing. Any
  -- different closed/processing state is a race; preserve all money as credit.
  IF lower(COALESCE(invoice_row.status, '')) IN ('open', 'sent', 'overdue')
     OR (lower(COALESCE(invoice_row.status, '')) = 'processing'
         AND COALESCE(invoice_row.payment_reference, '') = BTRIM(p_payment_reference)) THEN
    applied_amount := LEAST(current_balance, payment_amount);
  END IF;

  credit_amount := ROUND(payment_amount - applied_amount, 2);
  remaining_balance := ROUND(GREATEST(current_balance - applied_amount, 0), 2);

  IF credit_amount > 0 THEN
    INSERT INTO public.account_credits (
      camper_id, lot_number, camper_name, original_amount, remaining_amount,
      reason, notes, applies_to, source_reference, status, created_by
    ) VALUES (
      invoice_row.camper_id,
      camper_row.lot_number,
      BTRIM(COALESCE(camper_row.first_name, '') || ' ' || COALESCE(camper_row.last_name, '')),
      credit_amount,
      credit_amount,
      'Protected online payment credit',
      'A Stripe payment exceeded the invoice balance available when it cleared. The remainder was saved automatically.',
      'general',
      'stripe-overpayment:' || BTRIM(p_payment_reference),
      'active',
      'Stripe camper checkout'
    )
    ON CONFLICT (source_reference) WHERE source_reference IS NOT NULL DO UPDATE
      SET source_reference = EXCLUDED.source_reference
    RETURNING * INTO credit_row;
  END IF;

  INSERT INTO public.online_invoice_payments (
    payment_reference, camper_id, invoice_id, amount, applied_amount,
    credit_amount, payment_method, received_at, credit_id
  ) VALUES (
    BTRIM(p_payment_reference), invoice_row.camper_id, invoice_row.id,
    payment_amount, applied_amount, credit_amount,
    LEFT(BTRIM(p_payment_method), 100), COALESCE(p_received_at, now()), credit_row.id
  ) RETURNING * INTO payment_row;

  IF applied_amount > 0 THEN
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (
      invoice_row.id,
      'Online payment received ' || TO_CHAR(COALESCE(p_received_at, now()) AT TIME ZONE 'America/Chicago', 'MM/DD/YYYY')
        || ' - ' || TO_CHAR(applied_amount, 'FM$999,999,990.00'),
      1, -applied_amount, -applied_amount
    );

    final_status := CASE
      WHEN remaining_balance <= 0 THEN 'paid'
      WHEN invoice_row.due_date < campground_today THEN 'overdue'
      ELSE 'sent'
    END;

    UPDATE public.invoices
    SET total_due = remaining_balance,
        status = final_status,
        paid_at = CASE WHEN remaining_balance <= 0 THEN COALESCE(p_received_at, now()) ELSE NULL END,
        payment_method = LEFT(BTRIM(p_payment_method), 100),
        payment_reference = BTRIM(p_payment_reference),
        ach_expected_date = NULL
    WHERE id = invoice_row.id;
  END IF;

  final_result := jsonb_build_object(
    'success', true,
    'paymentId', payment_row.id,
    'invoiceId', invoice_row.id,
    'amount', payment_amount,
    'appliedAmount', applied_amount,
    'creditAmount', credit_amount,
    'remainingDue', remaining_balance,
    'paidInFull', applied_amount > 0 AND remaining_balance <= 0,
    'creditId', credit_row.id,
    'duplicate', false
  );

  UPDATE public.online_invoice_payments SET result = final_result WHERE id = payment_row.id;
  RETURN final_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_online_invoice_payment_atomic(text, uuid, numeric, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_online_invoice_payment_atomic(text, uuid, numeric, text, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_online_invoice_payment_atomic(text, uuid, numeric, text, timestamptz) TO service_role;

COMMENT ON TABLE public.online_invoice_payments IS
  'Idempotent ledger of camper Stripe payments applied to individual invoices.';
COMMENT ON FUNCTION public.record_online_invoice_payment_atomic(text, uuid, numeric, text, timestamptz) IS
  'Atomically applies one Stripe installment to one invoice and protects any concurrent overage as account credit.';
