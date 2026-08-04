-- Atomic, admin-only editing for open invoices and their itemized charges.

CREATE OR REPLACE FUNCTION public.update_invoice_bundle_atomic(
  p_invoice_id uuid,
  p_invoice_number text,
  p_invoice_type text,
  p_due_date date,
  p_late_fee numeric,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_row public.invoices%ROWTYPE;
  item jsonb;
  item_description text;
  item_quantity numeric;
  item_unit_price numeric;
  item_total numeric;
  new_subtotal numeric(10,2) := 0;
  new_late_fee numeric(10,2) := ROUND(COALESCE(p_late_fee, 0), 2);
  new_total numeric(10,2);
  has_applied_credit boolean := false;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO invoice_row
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  IF lower(COALESCE(invoice_row.status, '')) IN ('paid', 'processing') THEN
    RAISE EXCEPTION 'Paid or processing invoices cannot be edited.' USING ERRCODE = 'P0001';
  END IF;

  IF length(trim(COALESCE(p_invoice_number, ''))) = 0 THEN
    RAISE EXCEPTION 'Invoice number is required.' USING ERRCODE = '22023';
  END IF;

  IF length(trim(COALESCE(p_invoice_type, ''))) = 0 THEN
    RAISE EXCEPTION 'Invoice type is required.' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.account_credit_applications
    WHERE invoice_id = p_invoice_id
  ) INTO has_applied_credit;

  IF has_applied_credit THEN
    UPDATE public.invoices
    SET invoice_number = trim(p_invoice_number),
        invoice_type = trim(p_invoice_type),
        due_date = p_due_date
    WHERE id = p_invoice_id
    RETURNING * INTO invoice_row;

    RETURN jsonb_build_object(
      'invoice', to_jsonb(invoice_row),
      'amountsLocked', true
    );
  END IF;

  IF new_late_fee < 0 THEN
    RAISE EXCEPTION 'Late fee cannot be negative.' USING ERRCODE = '22023';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'An invoice cannot contain more than 50 items.' USING ERRCODE = '22023';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_description := trim(COALESCE(item->>'description', ''));
    item_quantity := ROUND(COALESCE((item->>'quantity')::numeric, 0), 2);
    item_unit_price := ROUND(COALESCE((item->>'unit_price')::numeric, 0), 2);

    IF length(item_description) = 0 THEN
      RAISE EXCEPTION 'Every invoice item needs a description.' USING ERRCODE = '22023';
    END IF;

    IF item_quantity <= 0 THEN
      RAISE EXCEPTION 'Invoice item quantity must be greater than zero.' USING ERRCODE = '22023';
    END IF;

    item_total := ROUND(item_quantity * item_unit_price, 2);
    new_subtotal := new_subtotal + item_total;
  END LOOP;

  new_subtotal := ROUND(new_subtotal, 2);
  new_total := ROUND(new_subtotal + new_late_fee, 2);

  IF new_total < 0.50 THEN
    RAISE EXCEPTION 'Invoice total must be at least $0.50.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    item_description := trim(item->>'description');
    item_quantity := ROUND((item->>'quantity')::numeric, 2);
    item_unit_price := ROUND((item->>'unit_price')::numeric, 2);
    item_total := ROUND(item_quantity * item_unit_price, 2);

    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (p_invoice_id, item_description, item_quantity, item_unit_price, item_total);
  END LOOP;

  UPDATE public.invoices
  SET invoice_number = trim(p_invoice_number),
      invoice_type = trim(p_invoice_type),
      due_date = p_due_date,
      subtotal = new_subtotal,
      late_fee = new_late_fee,
      total_due = new_total
  WHERE id = p_invoice_id
  RETURNING * INTO invoice_row;

  RETURN jsonb_build_object(
    'invoice', to_jsonb(invoice_row),
    'amountsLocked', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice_bundle_atomic(uuid, text, text, date, numeric, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_invoice_bundle_atomic(uuid, text, text, date, numeric, jsonb) TO authenticated;
