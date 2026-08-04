-- Prevent an invoice from being deleted while Stripe is still settling a payment.

CREATE OR REPLACE FUNCTION public.delete_invoice_with_credit_restore_atomic(p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application_row public.account_credit_applications%ROWTYPE;
  invoice_status text;
  restored_total numeric(10,2) := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT status
  INTO invoice_status
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  IF lower(COALESCE(invoice_status, '')) = 'processing' THEN
    RAISE EXCEPTION 'This invoice has a Stripe payment processing and cannot be deleted.'
      USING ERRCODE = 'P0001';
  END IF;

  FOR application_row IN
    SELECT * FROM public.account_credit_applications
    WHERE invoice_id = p_invoice_id
    FOR UPDATE
  LOOP
    UPDATE public.account_credits
    SET remaining_amount = LEAST(original_amount, remaining_amount + application_row.amount_applied),
        status = 'active',
        updated_at = now()
    WHERE id = application_row.credit_id;
    restored_total := restored_total + application_row.amount_applied;
  END LOOP;

  DELETE FROM public.text_reminders WHERE invoice_id = p_invoice_id;
  DELETE FROM public.account_credit_applications WHERE invoice_id = p_invoice_id;
  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;
  DELETE FROM public.invoices WHERE id = p_invoice_id;

  RETURN restored_total;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invoice_with_credit_restore_atomic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invoice_with_credit_restore_atomic(uuid) TO authenticated;
