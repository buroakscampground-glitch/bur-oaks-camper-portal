-- Security and billing hardening.
-- Run this migration once in the Supabase SQL editor before deploying the matching app code.

CREATE OR REPLACE FUNCTION public.normalized_camper_email(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(LOWER(BTRIM(COALESCE(value, ''))), '');
$$;

CREATE OR REPLACE FUNCTION public.prevent_duplicate_camper_emails()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  primary_value text := public.normalized_camper_email(NEW.email);
  secondary_value text := public.normalized_camper_email(NEW.secondary_email);
BEGIN
  IF primary_value IS NOT NULL AND secondary_value = primary_value THEN
    RAISE EXCEPTION 'Primary and secondary email addresses must be different.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.campers c
    WHERE c.id IS DISTINCT FROM NEW.id
      AND (
        public.normalized_camper_email(c.email) IN (primary_value, secondary_value)
        OR public.normalized_camper_email(c.secondary_email) IN (primary_value, secondary_value)
      )
  ) THEN
    RAISE EXCEPTION 'That email address is already connected to another camper account.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campers_unique_email_identity ON public.campers;
CREATE TRIGGER campers_unique_email_identity
  BEFORE INSERT OR UPDATE OF email, secondary_email ON public.campers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_camper_emails();

CREATE OR REPLACE FUNCTION public.current_camper_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH matches AS (
    SELECT id
    FROM public.campers
    WHERE active IS NOT FALSE
      AND (
        public.normalized_camper_email(email) = public.current_user_email()
        OR public.normalized_camper_email(secondary_email) = public.current_user_email()
      )
  )
  SELECT (SELECT id FROM matches LIMIT 1)
  WHERE (SELECT COUNT(*) FROM matches) = 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    AND EXISTS (
      SELECT 1 FROM public.campers
      WHERE (
        public.normalized_camper_email(email) = public.current_user_email()
        OR public.normalized_camper_email(secondary_email) = public.current_user_email()
      )
      AND LOWER(COALESCE(role, '')) = 'admin'
      AND active IS NOT FALSE
    );
$$;

CREATE OR REPLACE FUNCTION public.is_maintenance_user()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    AND EXISTS (
      SELECT 1 FROM public.campers
      WHERE (
        public.normalized_camper_email(email) = public.current_user_email()
        OR public.normalized_camper_email(secondary_email) = public.current_user_email()
      )
      AND LOWER(COALESCE(role, '')) = 'maintenance'
      AND active IS NOT FALSE
    );
$$;

DROP POLICY IF EXISTS maintenance_photos_authorized_view ON storage.objects;
CREATE POLICY maintenance_photos_authorized_view
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'maintenance-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (SELECT public.is_admin_user())
      OR (SELECT public.is_maintenance_user())
    )
  );

DROP POLICY IF EXISTS maintenance_tickets_camper_view_own ON public.maintenance_tickets;
CREATE POLICY maintenance_tickets_camper_view_own
  ON public.maintenance_tickets
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS maintenance_ticket_comments_camper_view_own ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_camper_view_own
  ON public.maintenance_ticket_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = ticket_id
        AND t.camper_id = (SELECT public.current_camper_id())
    )
  );

DROP POLICY IF EXISTS maintenance_ticket_comments_camper_insert_own ON public.maintenance_ticket_comments;
CREATE POLICY maintenance_ticket_comments_camper_insert_own
  ON public.maintenance_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'camper'
    AND camper_id = (SELECT public.current_camper_id())
    AND EXISTS (
      SELECT 1 FROM public.maintenance_tickets t
      WHERE t.id = ticket_id
        AND t.camper_id = (SELECT public.current_camper_id())
    )
  );

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  rate_key text PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_scope text,
  p_identifier text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS TABLE(allowed boolean, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_value text;
  current_row public.api_rate_limits%ROWTYPE;
  current_time timestamptz := clock_timestamp();
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Invalid rate-limit settings.';
  END IF;

  key_value := LEFT(COALESCE(p_scope, 'unknown') || ':' || COALESCE(p_identifier, 'unknown'), 500);

  PERFORM pg_advisory_xact_lock(hashtextextended(key_value, 0));

  SELECT * INTO current_row
  FROM public.api_rate_limits
  WHERE rate_key = key_value
  FOR UPDATE;

  IF NOT FOUND OR current_row.reset_at <= current_time THEN
    INSERT INTO public.api_rate_limits (rate_key, request_count, reset_at, updated_at)
    VALUES (key_value, 1, current_time + make_interval(secs => p_window_seconds), current_time)
    ON CONFLICT (rate_key) DO UPDATE
      SET request_count = 1,
          reset_at = EXCLUDED.reset_at,
          updated_at = EXCLUDED.updated_at;

    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF current_row.request_count >= p_limit THEN
    RETURN QUERY SELECT false, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (current_row.reset_at - current_time)))::integer);
    RETURN;
  END IF;

  UPDATE public.api_rate_limits
  SET request_count = request_count + 1,
      updated_at = current_time
  WHERE rate_key = key_value;

  RETURN QUERY SELECT true, 0;
END;
$$;

REVOKE ALL ON TABLE public.api_rate_limits FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.check_api_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, text, integer, integer) TO service_role;

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS sms_opt_out_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_last_keyword text;

CREATE TABLE IF NOT EXISTS public.sms_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  phone_number text NOT NULL,
  keyword text NOT NULL,
  consent_action text NOT NULL CHECK (consent_action IN ('opt_in', 'opt_out', 'help', 'other')),
  provider_message_id text UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sms_consent_events FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_inventory_nonnegative_stock'
      AND conrelid = 'public.maintenance_inventory_items'::regclass
  ) THEN
    ALTER TABLE public.maintenance_inventory_items
      ADD CONSTRAINT maintenance_inventory_nonnegative_stock
      CHECK (stock_quantity >= 0) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_maintenance_part_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity - NEW.quantity
      WHERE id = NEW.inventory_item_id AND stock_quantity >= NEW.quantity;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN RAISE EXCEPTION 'Not enough inventory is available for this part.'; END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity + OLD.quantity
      WHERE id = OLD.inventory_item_id;
    END IF;
    IF NEW.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity - NEW.quantity
      WHERE id = NEW.inventory_item_id AND stock_quantity >= NEW.quantity;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed <> 1 THEN RAISE EXCEPTION 'Not enough inventory is available for this part.'; END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.inventory_item_id IS NOT NULL THEN
      UPDATE public.maintenance_inventory_items
      SET stock_quantity = stock_quantity + OLD.quantity
      WHERE id = OLD.inventory_item_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_sewer_pump_out_atomic(
  p_camper_id uuid,
  p_lot_number text,
  p_camper_name text,
  p_charge_amount numeric,
  p_notes text
)
RETURNS TABLE(request_row jsonb, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_row public.sewer_pump_out_requests%ROWTYPE;
  created_row public.sewer_pump_out_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_camper_id::text, 0));

  SELECT * INTO existing_row
  FROM public.sewer_pump_out_requests
  WHERE camper_id = p_camper_id
    AND billed_at IS NULL
    AND status <> 'cancelled'
  ORDER BY requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT to_jsonb(existing_row), true;
    RETURN;
  END IF;

  INSERT INTO public.sewer_pump_out_requests (
    camper_id, lot_number, camper_name, status, charge_amount, notes
  ) VALUES (
    p_camper_id,
    p_lot_number,
    LEFT(COALESCE(NULLIF(BTRIM(p_camper_name), ''), 'Camper'), 200),
    'requested',
    p_charge_amount,
    NULLIF(LEFT(BTRIM(COALESCE(p_notes, '')), 500), '')
  )
  RETURNING * INTO created_row;

  RETURN QUERY SELECT to_jsonb(created_row), false;
END;
$$;

REVOKE ALL ON FUNCTION public.request_sewer_pump_out_atomic(uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_sewer_pump_out_atomic(uuid, text, text, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_document_signature_atomic(
  p_document_id uuid,
  p_camper_id uuid,
  p_user_id uuid,
  p_email text,
  p_name text,
  p_signed_at timestamptz,
  p_ip text,
  p_user_agent text,
  p_consent text,
  p_record_hash text
)
RETURNS TABLE(result_status text, signed_slot text, requires_two boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  document_row public.documents%ROWTYPE;
  normalized_email text := LOWER(BTRIM(COALESCE(p_email, '')));
BEGIN
  SELECT * INTO document_row
  FROM public.documents
  WHERE id = p_document_id AND camper_id = p_camper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found.' USING ERRCODE = 'P0002';
  END IF;

  IF document_row.signature_status = 'signed' THEN
    RAISE EXCEPTION 'This document has already been signed.' USING ERRCODE = '23505';
  END IF;

  IF LOWER(BTRIM(COALESCE(document_row.signed_email, ''))) = normalized_email
    OR LOWER(BTRIM(COALESCE(document_row.second_signed_email, ''))) = normalized_email THEN
    RAISE EXCEPTION 'You have already signed this document.' USING ERRCODE = '23505';
  END IF;

  IF document_row.requires_two_signatures = true
    AND (document_row.signed_at IS NOT NULL OR document_row.signed_email IS NOT NULL) THEN
    UPDATE public.documents
    SET signature_status = 'signed',
        second_signed_at = p_signed_at,
        second_signed_name = p_name,
        second_signed_email = p_email,
        second_signed_user_id = p_user_id,
        second_signature_ip = p_ip,
        second_signature_user_agent = p_user_agent,
        second_signature_consent_text = p_consent,
        second_signature_record_hash = p_record_hash
    WHERE id = p_document_id;

    RETURN QUERY SELECT 'signed'::text, 'second'::text, true;
  ELSE
    UPDATE public.documents
    SET signature_status = CASE WHEN requires_two_signatures THEN 'pending_second_signature' ELSE 'signed' END,
        signed_at = p_signed_at,
        signed_name = p_name,
        signed_email = p_email,
        signed_user_id = p_user_id,
        signature_ip = p_ip,
        signature_user_agent = p_user_agent,
        signature_consent_text = p_consent,
        signature_record_hash = p_record_hash
    WHERE id = p_document_id;

    RETURN QUERY SELECT
      CASE WHEN document_row.requires_two_signatures THEN 'pending_second_signature' ELSE 'signed' END::text,
      'first'::text,
      COALESCE(document_row.requires_two_signatures, false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_document_signature_atomic(uuid, uuid, uuid, text, text, timestamptz, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_document_signature_atomic(uuid, uuid, uuid, text, text, timestamptz, text, text, text, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.billing_operation_keys (
  operation_key text PRIMARY KEY,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_operation_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_operation_keys FROM anon, authenticated;

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
  credit_row public.account_credits%ROWTYPE;
  remaining_due numeric(10,2) := ROUND(COALESCE(p_invoice_total, 0), 2);
  applied_total numeric(10,2) := 0;
  amount_applied numeric(10,2);
  new_remaining numeric(10,2);
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.invoices
  WHERE id = p_invoice_id AND camper_id = p_camper_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  FOR credit_row IN
    SELECT * FROM public.account_credits
    WHERE camper_id = p_camper_id
      AND status = 'active'
      AND remaining_amount > 0
    ORDER BY created_at
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_due <= 0;
    amount_applied := LEAST(credit_row.remaining_amount, remaining_due);
    new_remaining := credit_row.remaining_amount - amount_applied;

    UPDATE public.account_credits
    SET remaining_amount = new_remaining,
        status = CASE WHEN new_remaining <= 0 THEN 'used' ELSE 'active' END,
        updated_at = now()
    WHERE id = credit_row.id;

    INSERT INTO public.account_credit_applications (
      credit_id, camper_id, invoice_id, amount_applied, applied_by
    ) VALUES (
      credit_row.id, p_camper_id, p_invoice_id, amount_applied, p_applied_by
    );

    applied_total := applied_total + amount_applied;
    remaining_due := remaining_due - amount_applied;
  END LOOP;

  IF applied_total > 0 THEN
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (
      p_invoice_id,
      'Account credit applied - ' || TO_CHAR(applied_total, 'FM$999,999,990.00'),
      1,
      -applied_total,
      -applied_total
    );

    UPDATE public.invoices
    SET total_due = remaining_due,
        status = CASE WHEN remaining_due <= 0 THEN 'paid' ELSE 'sent' END,
        paid_at = CASE WHEN remaining_due <= 0 THEN now() ELSE paid_at END,
        payment_method = CASE WHEN remaining_due <= 0 THEN 'Account credit' ELSE payment_method END,
        payment_reference = CASE WHEN remaining_due <= 0
          THEN 'Credit applied: ' || TO_CHAR(applied_total, 'FM$999,999,990.00')
          ELSE payment_reference END
    WHERE id = p_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'appliedTotal', applied_total,
    'remainingDue', remaining_due,
    'paidInFull', remaining_due <= 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_account_credits_to_invoice_atomic(uuid, uuid, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_bundle_atomic(
  p_operation_key text,
  p_invoice jsonb,
  p_items jsonb,
  p_readings jsonb DEFAULT '[]'::jsonb,
  p_pump_out_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_site_service_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_new_credit jsonb DEFAULT NULL,
  p_applied_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_result jsonb;
  invoice_row public.invoices%ROWTYPE;
  item jsonb;
  reading jsonb;
  credit_result jsonb;
  final_result jsonb;
  affected_count integer;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  IF BTRIM(COALESCE(p_operation_key, '')) = '' THEN
    RAISE EXCEPTION 'An operation key is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_key, 0));

  SELECT result INTO existing_result
  FROM public.billing_operation_keys
  WHERE operation_key = p_operation_key;

  IF FOUND THEN
    RETURN existing_result || jsonb_build_object('duplicate', true);
  END IF;

  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one invoice item is required.';
  END IF;

  INSERT INTO public.invoices (
    camper_id, invoice_number, invoice_type, subtotal, late_fee, total_due, due_date, status
  ) VALUES (
    (p_invoice ->> 'camper_id')::uuid,
    LEFT(BTRIM(p_invoice ->> 'invoice_number'), 200),
    LEFT(BTRIM(COALESCE(p_invoice ->> 'invoice_type', 'Campground Charge')), 200),
    ROUND((p_invoice ->> 'subtotal')::numeric, 2),
    ROUND(COALESCE((p_invoice ->> 'late_fee')::numeric, 0), 2),
    ROUND((p_invoice ->> 'total_due')::numeric, 2),
    (p_invoice ->> 'due_date')::date,
    'sent'
  ) RETURNING * INTO invoice_row;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total)
    VALUES (
      invoice_row.id,
      LEFT(BTRIM(COALESCE(item ->> 'description', 'Campground Charge')), 500),
      (item ->> 'quantity')::numeric,
      ROUND((item ->> 'unit_price')::numeric, 2),
      ROUND((item ->> 'total')::numeric, 2)
    );
  END LOOP;

  IF jsonb_typeof(COALESCE(p_readings, '[]'::jsonb)) = 'array' THEN
    FOR reading IN SELECT value FROM jsonb_array_elements(COALESCE(p_readings, '[]'::jsonb))
    LOOP
      INSERT INTO public.electric_readings (
        camper_id, reading_date, previous_reading, current_reading,
        kwh_used, rate_per_kwh, amount_due, invoice_id
      ) VALUES (
        invoice_row.camper_id,
        (reading ->> 'reading_date')::date,
        (reading ->> 'previous_reading')::numeric,
        (reading ->> 'current_reading')::numeric,
        (reading ->> 'kwh_used')::numeric,
        (reading ->> 'rate_per_kwh')::numeric,
        ROUND((reading ->> 'amount_due')::numeric, 2),
        invoice_row.id
      );
    END LOOP;
  END IF;

  IF COALESCE(cardinality(p_pump_out_ids), 0) > 0 THEN
    UPDATE public.sewer_pump_out_requests
    SET billed_invoice_id = invoice_row.id, billed_at = now(), updated_at = now()
    WHERE id = ANY(p_pump_out_ids)
      AND camper_id = invoice_row.camper_id
      AND billed_at IS NULL
      AND status <> 'cancelled';
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count <> cardinality(p_pump_out_ids) THEN
      RAISE EXCEPTION 'One or more pump-out charges changed before billing completed.';
    END IF;
  END IF;

  IF COALESCE(cardinality(p_site_service_ids), 0) > 0 THEN
    UPDATE public.site_service_charges
    SET billed_invoice_id = invoice_row.id, billed_at = now(), updated_at = now()
    WHERE id = ANY(p_site_service_ids)
      AND camper_id = invoice_row.camper_id
      AND billed_at IS NULL
      AND cancelled_at IS NULL;
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count <> cardinality(p_site_service_ids) THEN
      RAISE EXCEPTION 'One or more site-service charges changed before billing completed.';
    END IF;
  END IF;

  IF p_new_credit IS NOT NULL AND COALESCE((p_new_credit ->> 'amount')::numeric, 0) > 0 THEN
    INSERT INTO public.account_credits (
      camper_id, lot_number, camper_name, original_amount, remaining_amount,
      reason, notes, created_by
    ) VALUES (
      invoice_row.camper_id,
      NULLIF(p_new_credit ->> 'lot_number', ''),
      LEFT(COALESCE(NULLIF(BTRIM(p_new_credit ->> 'camper_name'), ''), 'Camper'), 200),
      ROUND((p_new_credit ->> 'amount')::numeric, 2),
      ROUND((p_new_credit ->> 'amount')::numeric, 2),
      LEFT(COALESCE(NULLIF(BTRIM(p_new_credit ->> 'reason'), ''), 'Account credit'), 500),
      NULLIF(LEFT(BTRIM(COALESCE(p_new_credit ->> 'notes', '')), 1000), ''),
      p_applied_by
    );
  END IF;

  credit_result := public.apply_account_credits_to_invoice_atomic(
    invoice_row.camper_id,
    invoice_row.id,
    invoice_row.total_due,
    p_applied_by
  );

  final_result := jsonb_build_object(
    'invoice', to_jsonb(invoice_row),
    'credit', credit_result,
    'duplicate', false
  );

  INSERT INTO public.billing_operation_keys (operation_key, invoice_id, result)
  VALUES (p_operation_key, invoice_row.id, final_result);

  RETURN final_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_bundle_atomic(text, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_bundle_atomic(text, jsonb, jsonb, jsonb, uuid[], uuid[], jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_invoice_with_credit_restore_atomic(p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  application_row public.account_credit_applications%ROWTYPE;
  restored_total numeric(10,2) := 0;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;

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
