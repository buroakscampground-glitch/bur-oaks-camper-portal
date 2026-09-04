-- Record one office payment once, apply it to the selected invoice first, then
-- to the camper's other open invoices by due date. Any true excess remains a
-- visible account credit. The operation key makes retries idempotent.

CREATE TABLE IF NOT EXISTS public.manual_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text NOT NULL UNIQUE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE RESTRICT,
  selected_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL,
  payment_reference text,
  received_on date NOT NULL,
  recorded_by text,
  credit_id uuid REFERENCES public.account_credits(id) ON DELETE SET NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.manual_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.manual_payments(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE RESTRICT,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount_applied numeric(10,2) NOT NULL CHECK (amount_applied > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS manual_payments_camper_date_idx
  ON public.manual_payments (camper_id, received_on DESC);
CREATE INDEX IF NOT EXISTS manual_payment_allocations_invoice_idx
  ON public.manual_payment_allocations (invoice_id);

ALTER TABLE public.manual_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manual_payment_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_payments, public.manual_payment_allocations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_manual_payment_atomic(
  p_operation_key text,
  p_selected_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_on date,
  p_reference text DEFAULT NULL,
  p_recorded_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_row public.invoices%ROWTYPE;
  invoice_row public.invoices%ROWTYPE;
  camper_row public.campers%ROWTYPE;
  payment_row public.manual_payments%ROWTYPE;
  credit_row public.account_credits%ROWTYPE;
  existing_result jsonb;
  payment_amount numeric(10,2) := ROUND(COALESCE(p_amount, 0), 2);
  unapplied_amount numeric(10,2);
  applied_amount numeric(10,2);
  invoice_remaining numeric(10,2);
  allocation_rows jsonb := '[]'::jsonb;
  final_result jsonb;
  paid_timestamp timestamptz;
BEGIN
  IF BTRIM(COALESCE(p_operation_key, '')) = '' THEN RAISE EXCEPTION 'An operation key is required.'; END IF;
  IF payment_amount <= 0 OR payment_amount > 1000000 THEN RAISE EXCEPTION 'Enter a valid payment amount.'; END IF;
  IF BTRIM(COALESCE(p_payment_method, '')) = '' THEN RAISE EXCEPTION 'Payment method is required.'; END IF;
  IF p_received_on IS NULL THEN RAISE EXCEPTION 'Payment date is required.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_key, 0));
  SELECT result INTO existing_result FROM public.manual_payments WHERE operation_key = p_operation_key;
  IF FOUND THEN RETURN COALESCE(existing_result, '{}'::jsonb) || jsonb_build_object('duplicate', true); END IF;

  SELECT * INTO selected_row FROM public.invoices WHERE id = p_selected_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  IF lower(COALESCE(selected_row.status, '')) IN ('paid', 'processing', 'void', 'canceled', 'cancelled')
     OR COALESCE(selected_row.total_due, 0) <= 0 THEN
    RAISE EXCEPTION 'The selected invoice is not available for an office payment.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(selected_row.camper_id::text, 0));
  SELECT * INTO camper_row FROM public.campers WHERE id = selected_row.camper_id;
  paid_timestamp := (p_received_on::text || ' 12:00:00 America/Chicago')::timestamptz;

  INSERT INTO public.account_credits (
    camper_id, lot_number, camper_name, original_amount, remaining_amount,
    reason, notes, status, created_by
  ) VALUES (
    selected_row.camper_id,
    camper_row.lot_number,
    BTRIM(COALESCE(camper_row.first_name, '') || ' ' || COALESCE(camper_row.last_name, '')),
    payment_amount,
    payment_amount,
    'Office payment',
    CONCAT_WS(' · ', NULLIF(BTRIM(COALESCE(p_payment_method, '')), ''), NULLIF(BTRIM(COALESCE(p_reference, '')), '')),
    'active',
    p_recorded_by
  ) RETURNING * INTO credit_row;

  INSERT INTO public.manual_payments (
    operation_key, camper_id, selected_invoice_id, amount, payment_method,
    payment_reference, received_on, recorded_by, credit_id
  ) VALUES (
    p_operation_key, selected_row.camper_id, p_selected_invoice_id, payment_amount,
    LEFT(BTRIM(p_payment_method), 100), NULLIF(LEFT(BTRIM(COALESCE(p_reference, '')), 300), ''),
    p_received_on, p_recorded_by, credit_row.id
  ) RETURNING * INTO payment_row;

  unapplied_amount := payment_amount;
  FOR invoice_row IN
    SELECT * FROM public.invoices
    WHERE camper_id = selected_row.camper_id
      AND lower(COALESCE(status, '')) NOT IN ('paid', 'processing', 'void', 'canceled', 'cancelled')
      AND COALESCE(total_due, 0) > 0
    ORDER BY CASE WHEN id = p_selected_invoice_id THEN 0 ELSE 1 END,
             due_date ASC NULLS LAST, created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN unapplied_amount <= 0;
    applied_amount := LEAST(ROUND(invoice_row.total_due, 2), unapplied_amount);
    invoice_remaining := ROUND(invoice_row.total_due - applied_amount, 2);

    UPDATE public.account_credits
    SET remaining_amount = ROUND(unapplied_amount - applied_amount, 2),
        status = CASE WHEN ROUND(unapplied_amount - applied_amount, 2) <= 0 THEN 'used' ELSE 'active' END,
        updated_at = now()
    WHERE id = credit_row.id;

    INSERT INTO public.account_credit_applications (credit_id, camper_id, invoice_id, amount_applied, applied_by)
    VALUES (credit_row.id, selected_row.camper_id, invoice_row.id, applied_amount, p_recorded_by);

    INSERT INTO public.manual_payment_allocations (payment_id, camper_id, invoice_id, amount_applied)
    VALUES (payment_row.id, selected_row.camper_id, invoice_row.id, applied_amount);

    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (
      invoice_row.id,
      'Office payment received ' || TO_CHAR(p_received_on, 'MM/DD/YYYY') || ' - ' || TO_CHAR(applied_amount, 'FM$999,999,990.00'),
      1, -applied_amount, -applied_amount
    );

    UPDATE public.invoices
    SET total_due = invoice_remaining,
        status = CASE WHEN invoice_remaining <= 0 THEN 'paid' ELSE status END,
        paid_at = CASE WHEN invoice_remaining <= 0 THEN paid_timestamp ELSE paid_at END,
        payment_method = LEFT(BTRIM(p_payment_method), 100),
        payment_reference = COALESCE(NULLIF(LEFT(BTRIM(COALESCE(p_reference, '')), 300), ''), 'Recorded manually by office')
    WHERE id = invoice_row.id;

    allocation_rows := allocation_rows || jsonb_build_array(jsonb_build_object(
      'invoiceId', invoice_row.id,
      'invoiceNumber', invoice_row.invoice_number,
      'invoiceType', invoice_row.invoice_type,
      'dueDate', invoice_row.due_date,
      'amount', applied_amount,
      'remainingDue', invoice_remaining
    ));
    unapplied_amount := ROUND(unapplied_amount - applied_amount, 2);
  END LOOP;

  final_result := jsonb_build_object(
    'success', true,
    'paymentId', payment_row.id,
    'amount', payment_amount,
    'appliedTotal', ROUND(payment_amount - unapplied_amount, 2),
    'creditAmount', unapplied_amount,
    'allocations', allocation_rows,
    'duplicate', false
  );

  UPDATE public.manual_payments SET result = final_result WHERE id = payment_row.id;
  RETURN final_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_manual_payment_atomic(text, uuid, numeric, text, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_payment_atomic(text, uuid, numeric, text, date, text, text) TO service_role;

COMMENT ON FUNCTION public.record_manual_payment_atomic(text, uuid, numeric, text, date, text, text) IS
  'Idempotently allocates an office payment to the selected invoice, then future/open invoices, leaving only excess as account credit.';
