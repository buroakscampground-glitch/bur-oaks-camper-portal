-- Bur Oaks public schema baseline
-- Generated through the project-scoped read-only Supabase MCP connection.
-- Contains schema definitions only; no application, authentication, or Storage rows.

BEGIN;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET search_path = public, pg_catalog, extensions;

CREATE SCHEMA IF NOT EXISTS public;
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE OR REPLACE FUNCTION public.apply_account_credits_to_invoice_atomic(p_camper_id uuid, p_invoice_id uuid, p_invoice_total numeric, p_applied_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin_user() THEN RAISE EXCEPTION 'Admin access required.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO invoice_row FROM public.invoices WHERE id = p_invoice_id AND camper_id = p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  invoice_is_lot_rent := LOWER(COALESCE(invoice_row.invoice_type, '')) LIKE '%rent%' AND LOWER(COALESCE(invoice_row.invoice_type, '')) NOT LIKE '%association%';
  remaining_due := ROUND(COALESCE(invoice_row.total_due, 0), 2);
  IF LOWER(COALESCE(invoice_row.status, '')) NOT IN ('open', 'sent', 'overdue') OR remaining_due <= 0 THEN
    RETURN jsonb_build_object('appliedTotal', 0, 'remainingDue', remaining_due, 'paidInFull', LOWER(COALESCE(invoice_row.status, '')) = 'paid', 'heldUntilDue', false, 'dueDate', invoice_row.due_date);
  END IF;
  IF invoice_row.due_date IS NULL OR invoice_row.due_date > campground_today THEN
    SELECT ROUND(COALESCE(SUM(remaining_amount), 0), 2) INTO available_credit FROM public.account_credits
    WHERE camper_id = p_camper_id AND status = 'active' AND remaining_amount > 0
      AND (COALESCE(applies_to, 'general') = 'general' OR (COALESCE(applies_to, 'general') = 'lot_rent' AND invoice_is_lot_rent));
    RETURN jsonb_build_object('appliedTotal', 0, 'remainingDue', remaining_due, 'paidInFull', false, 'heldUntilDue', available_credit > 0, 'dueDate', invoice_row.due_date);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_camper_id::text, 0));
  FOR credit_row IN SELECT * FROM public.account_credits
    WHERE camper_id = p_camper_id AND status = 'active' AND remaining_amount > 0
      AND (COALESCE(applies_to, 'general') = 'general' OR (COALESCE(applies_to, 'general') = 'lot_rent' AND invoice_is_lot_rent))
    ORDER BY created_at, id FOR UPDATE
  LOOP
    EXIT WHEN remaining_due <= 0;
    amount_applied := LEAST(credit_row.remaining_amount, remaining_due);
    new_remaining := ROUND(credit_row.remaining_amount - amount_applied, 2);
    UPDATE public.account_credits SET remaining_amount = new_remaining, status = CASE WHEN new_remaining <= 0 THEN 'used' ELSE 'active' END, updated_at = now() WHERE id = credit_row.id;
    INSERT INTO public.account_credit_applications (credit_id, camper_id, invoice_id, amount_applied, applied_by) VALUES (credit_row.id, p_camper_id, p_invoice_id, amount_applied, p_applied_by);
    applied_total := ROUND(applied_total + amount_applied, 2);
    remaining_due := ROUND(remaining_due - amount_applied, 2);
  END LOOP;
  IF applied_total > 0 THEN
    INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (p_invoice_id, 'Account credit applied - ' || TO_CHAR(applied_total, 'FM$999,999,990.00'), 1, -applied_total, -applied_total);
    UPDATE public.invoices SET total_due = remaining_due,
      status = CASE WHEN remaining_due <= 0 THEN 'paid' WHEN LOWER(COALESCE(invoice_row.status, '')) = 'overdue' THEN 'overdue' ELSE 'sent' END,
      paid_at = CASE WHEN remaining_due <= 0 THEN now() ELSE paid_at END,
      payment_method = CASE WHEN remaining_due <= 0 THEN 'Paid by account credit' ELSE payment_method END,
      payment_reference = CASE WHEN remaining_due <= 0 THEN 'Paid by account credit: ' || TO_CHAR(applied_total, 'FM$999,999,990.00') ELSE payment_reference END
    WHERE id = p_invoice_id;
  END IF;
  RETURN jsonb_build_object('appliedTotal', applied_total, 'remainingDue', remaining_due, 'paidInFull', remaining_due <= 0, 'heldUntilDue', false, 'dueDate', invoice_row.due_date);
END;
$function$;
CREATE OR REPLACE FUNCTION public.apply_maintenance_part_inventory()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.audit_account_credit_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('account_credit_created',NEW.camper_id,NEW.lot_number,'account_credit',NEW.id::text,left(coalesce(nullif(btrim(NEW.reason),''),'Account credit created'),1000),coalesce(nullif(btrim(NEW.created_by),''),'system'),'{}'::jsonb,
    jsonb_build_object('originalAmount',NEW.original_amount,'remainingAmount',NEW.remaining_amount,'status',NEW.status,'notes',NEW.notes));
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.audit_season_renewal_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reason_text text := btrim(coalesce(NEW.audit_reason, ''));
  actor_text text := coalesce(nullif(btrim(NEW.audit_actor), ''), 'office');
  lot text;
BEGIN
  IF char_length(reason_text) >= 5 THEN
    SELECT lot_number INTO lot FROM public.campers WHERE id = NEW.camper_id;
    INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
    VALUES(
      'renewal_override', NEW.camper_id, coalesce(NEW.lot_number, lot), 'season_renewal', NEW.id::text,
      left(reason_text,1000), actor_text,
      CASE WHEN TG_OP='INSERT' THEN '{}'::jsonb ELSE jsonb_build_object(
        'status',OLD.status,'contractEndDate',OLD.contract_end_date,'renewalSentAt',OLD.renewal_sent_at,
        'annualRent',OLD.annual_rent,'rentPaymentPlan',OLD.rent_payment_plan,'autoSendApproved',OLD.auto_send_approved
      ) END,
      jsonb_build_object(
        'status',NEW.status,'contractEndDate',NEW.contract_end_date,'renewalSentAt',NEW.renewal_sent_at,
        'annualRent',NEW.annual_rent,'rentPaymentPlan',NEW.rent_payment_plan,'autoSendApproved',NEW.auto_send_approved
      )
    );
  END IF;
  NEW.audit_reason := NULL;
  NEW.audit_actor := NULL;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.block_admin_audit_event_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'Administrative audit events are append-only.' USING ERRCODE = '42501';
END;
$function$;
CREATE OR REPLACE FUNCTION public.camper_protected_fields_unchanged(target_camper_id uuid, new_email text, new_role text, new_lot_number text, new_active boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.campers c
    WHERE c.id = target_camper_id
      AND c.role IS NOT DISTINCT FROM new_role
      AND c.lot_number::text IS NOT DISTINCT FROM new_lot_number
      AND c.active IS NOT DISTINCT FROM new_active
  );
$function$;
CREATE OR REPLACE FUNCTION public.check_api_rate_limit(p_scope text, p_identifier text, p_limit integer, p_window_seconds integer)
 RETURNS TABLE(allowed boolean, retry_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.create_account_credit_audited(p_camper_id uuid, p_amount numeric, p_reason text, p_notes text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE camper_row public.campers%ROWTYPE; credit_row public.account_credits%ROWTYPE; credit_amount numeric(10,2):=round(coalesce(p_amount,0),2);
BEGIN
  IF credit_amount<=0 OR credit_amount>1000000 THEN RAISE EXCEPTION 'Enter a valid credit amount.'; END IF;
  IF char_length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'A credit reason is required.'; END IF;
  SELECT * INTO camper_row FROM public.campers WHERE id=p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper not found.'; END IF;
  INSERT INTO public.account_credits(camper_id,lot_number,camper_name,original_amount,remaining_amount,reason,notes,status,created_by)
  VALUES(p_camper_id,camper_row.lot_number,btrim(coalesce(camper_row.first_name,'')||' '||coalesce(camper_row.last_name,'')),credit_amount,credit_amount,left(btrim(p_reason),1000),nullif(left(btrim(coalesce(p_notes,'')),2000),''),'active',coalesce(nullif(btrim(p_actor_email),''),'office')) RETURNING * INTO credit_row;
  RETURN to_jsonb(credit_row);
END;
$function$;
CREATE OR REPLACE FUNCTION public.create_invoice_bundle_atomic(p_operation_key text, p_invoice jsonb, p_items jsonb, p_readings jsonb DEFAULT '[]'::jsonb, p_pump_out_ids uuid[] DEFAULT ARRAY[]::uuid[], p_site_service_ids uuid[] DEFAULT ARRAY[]::uuid[], p_new_credit jsonb DEFAULT NULL::jsonb, p_applied_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.current_camper_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.current_user_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT LOWER(auth.jwt() ->> 'email');
$function$;
CREATE OR REPLACE FUNCTION public.delete_invoice_with_audit_atomic(p_invoice_id uuid, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_row public.invoices%ROWTYPE;
  application_row public.account_credit_applications%ROWTYPE;
  restored numeric(10,2) := 0;
  lot text;
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A cancellation reason is required.'; END IF;
  SELECT * INTO invoice_row FROM public.invoices WHERE id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  IF lower(coalesce(invoice_row.status,''))='processing' THEN RAISE EXCEPTION 'This invoice has a Stripe payment processing and cannot be deleted.'; END IF;
  SELECT lot_number INTO lot FROM public.campers WHERE id=invoice_row.camper_id;
  FOR application_row IN SELECT * FROM public.account_credit_applications WHERE invoice_id=p_invoice_id FOR UPDATE LOOP
    UPDATE public.account_credits SET remaining_amount=least(original_amount,remaining_amount+application_row.amount_applied),status='active',updated_at=now() WHERE id=application_row.credit_id;
    restored := restored+application_row.amount_applied;
  END LOOP;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('invoice_deleted',invoice_row.camper_id,lot,'invoice',invoice_row.id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('invoiceNumber',invoice_row.invoice_number,'invoiceType',invoice_row.invoice_type,'subtotal',invoice_row.subtotal,'lateFee',invoice_row.late_fee,'totalDue',invoice_row.total_due,'dueDate',invoice_row.due_date,'status',invoice_row.status),
    jsonb_build_object('deleted',true,'creditRestored',restored));
  DELETE FROM public.text_reminders WHERE invoice_id=p_invoice_id;
  DELETE FROM public.account_credit_applications WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoice_items WHERE invoice_id=p_invoice_id;
  DELETE FROM public.invoices WHERE id=p_invoice_id;
  RETURN jsonb_build_object('success',true,'restoredTotal',restored);
END;
$function$;
CREATE OR REPLACE FUNCTION public.delete_invoice_with_credit_restore_atomic(p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.enforce_maintenance_approval_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_maintenance_user() AND NOT public.is_admin_user() THEN
    IF TG_OP = 'INSERT' THEN
      NEW.admin_approved := false;
      NEW.approved_at := NULL;
      NEW.approved_by := NULL;
      NEW.status := 'Open';
      NEW.assigned_to := 'Open';
    ELSIF
      NEW.admin_approved IS DISTINCT FROM OLD.admin_approved OR
      NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
      NEW.approved_by IS DISTINCT FROM OLD.approved_by
    THEN
      RAISE EXCEPTION 'Only an administrator can change work approval.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_camper_directory()
 RETURNS TABLE(id uuid, first_name text, last_name text, lot_number text, phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.first_name::text,
    c.last_name::text,
    c.lot_number::text,
    CASE WHEN c.directory_show_phone THEN c.phone::text ELSE NULL END
  FROM public.campers c
  WHERE auth.uid() IS NOT NULL
    AND c.directory_opt_in = true
    AND COALESCE(c.active, true) = true
    AND LOWER(COALESCE(c.role, 'camper')) = 'camper'
  ORDER BY c.last_name, c.first_name;
$function$;
CREATE OR REPLACE FUNCTION public.is_admin_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.campers
    WHERE (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
    AND LOWER(COALESCE(role, '')) = 'admin'
    AND active IS NOT FALSE
  );
$function$;
CREATE OR REPLACE FUNCTION public.is_maintenance_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.campers
    WHERE (
      public.normalized_camper_email(email) = public.current_user_email()
      OR public.normalized_camper_email(secondary_email) = public.current_user_email()
    )
    AND LOWER(COALESCE(role, '')) = 'maintenance'
    AND active IS NOT FALSE
  );
$function$;
CREATE OR REPLACE FUNCTION public.next_manual_invoice_number(p_invoice_date date DEFAULT NULL::date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.normalized_camper_email(value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT NULLIF(LOWER(BTRIM(COALESCE(value, ''))), '');
$function$;
CREATE OR REPLACE FUNCTION public.preserve_paid_invoice_total()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  original_total numeric(10,2);
BEGIN
  original_total := ROUND(COALESCE(NEW.subtotal, 0) + COALESCE(NEW.late_fee, 0), 2);
  IF lower(COALESCE(NEW.status, '')) = 'paid'
     AND COALESCE(NEW.total_due, 0) <= 0
     AND original_total > 0 THEN
    NEW.total_due := original_total;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.prevent_duplicate_camper_emails()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.record_document_signature_atomic(p_document_id uuid, p_camper_id uuid, p_user_id uuid, p_email text, p_name text, p_signed_at timestamp with time zone, p_ip text, p_user_agent text, p_consent text, p_record_hash text)
 RETURNS TABLE(result_status text, signed_slot text, requires_two boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.record_manual_payment_atomic(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text DEFAULT NULL::text, p_recorded_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.record_manual_payment_audited(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  invoice_row public.invoices%ROWTYPE;
  lot text;
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A payment reason is required.'; END IF;
  SELECT * INTO invoice_row FROM public.invoices WHERE id = p_selected_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  SELECT lot_number INTO lot FROM public.campers WHERE id = invoice_row.camper_id;
  result := public.record_manual_payment_atomic(p_operation_key, p_selected_invoice_id, p_amount, p_payment_method, p_received_on, p_reference, p_actor_email);
  INSERT INTO public.admin_audit_events(operation_key,action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES (p_operation_key,'manual_payment_recorded',invoice_row.camper_id,lot,'manual_payment',result->>'paymentId',left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('selectedInvoiceId',p_selected_invoice_id,'selectedInvoiceBalance',invoice_row.total_due),
    jsonb_build_object('amount',result->'amount','appliedTotal',result->'appliedTotal','creditAmount',result->'creditAmount','method',left(p_payment_method,100),'receivedOn',p_received_on))
  ON CONFLICT (operation_key) DO NOTHING;
  RETURN result;
END;
$function$;
CREATE OR REPLACE FUNCTION public.remove_invoice_late_fee_audited(p_invoice_id uuid, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  invoice_row public.invoices%ROWTYPE;
  removed numeric(10,2);
  new_total numeric(10,2);
  lot text;
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A late-fee waiver reason is required.'; END IF;
  SELECT * INTO invoice_row FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;
  IF lower(coalesce(invoice_row.status,'')) IN ('paid','processing','cancelled','canceled','void','refunded') THEN RAISE EXCEPTION 'Late fees can only be removed from an open invoice.'; END IF;
  removed := round(coalesce(invoice_row.late_fee,0),2);
  IF removed <= 0 THEN RAISE EXCEPTION 'This invoice does not have a late fee.'; END IF;
  new_total := greatest(0,round(coalesce(invoice_row.total_due,0)-removed,2));
  SELECT lot_number INTO lot FROM public.campers WHERE id = invoice_row.camper_id;
  INSERT INTO public.text_reminders(camper_id,invoice_id,reminder_type,message,status,provider,sent_by,automation_key)
  VALUES(invoice_row.camper_id,invoice_row.id,'Late Fee Waived',
    'Late fee of '||to_char(removed,'FM$999,999,990.00')||' removed from invoice #'||coalesce(invoice_row.invoice_number,invoice_row.id::text)||'. Reason: '||left(btrim(p_reason),1000),
    'saved','office',coalesce(nullif(btrim(p_actor_email),''),'office'),'invoice-late-fee-waived');
  UPDATE public.invoices SET late_fee=0,total_due=new_total WHERE id=invoice_row.id;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('late_fee_waived',invoice_row.camper_id,lot,'invoice',invoice_row.id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('lateFee',removed,'totalDue',invoice_row.total_due,'status',invoice_row.status),jsonb_build_object('lateFee',0,'totalDue',new_total,'status',invoice_row.status));
  RETURN jsonb_build_object('success',true,'removedFee',removed,'totalDue',new_total);
END;
$function$;
CREATE OR REPLACE FUNCTION public.request_sewer_pump_out_atomic(p_camper_id uuid, p_lot_number text, p_camper_name text, p_charge_amount numeric, p_notes text)
 RETURNS TABLE(request_row jsonb, duplicate boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  normalized_lot text := UPPER(BTRIM(COALESCE(p_lot_number, '')));
  existing_row public.sewer_pump_out_requests%ROWTYPE;
  created_row public.sewer_pump_out_requests%ROWTYPE;
BEGIN
  IF normalized_lot = '' THEN
    RAISE EXCEPTION 'A service lot is required.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('pump-out:' || normalized_lot, 0));

  SELECT * INTO existing_row
  FROM public.sewer_pump_out_requests
  WHERE UPPER(BTRIM(lot_number)) = normalized_lot
    AND billed_at IS NULL
    AND status = 'requested'
  ORDER BY requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT to_jsonb(existing_row), true;
    RETURN;
  END IF;

  INSERT INTO public.sewer_pump_out_requests (
    camper_id, lot_number, camper_name, status, charge_amount, gallons_used, notes
  ) VALUES (
    p_camper_id,
    BTRIM(p_lot_number),
    LEFT(COALESCE(NULLIF(BTRIM(p_camper_name), ''), 'Camper'), 200),
    'requested',
    p_charge_amount,
    CASE WHEN p_charge_amount = 15.00 THEN 150 ELSE 30 END,
    NULLIF(LEFT(BTRIM(COALESCE(p_notes, '')), 500), '')
  )
  RETURNING * INTO created_row;

  RETURN QUERY SELECT to_jsonb(created_row), false;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_camper_active_audited(p_camper_id uuid, p_active boolean, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE camper_row public.campers%ROWTYPE;
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 5 THEN RAISE EXCEPTION 'A camper status reason is required.'; END IF;
  SELECT * INTO camper_row FROM public.campers WHERE id=p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper not found.'; END IF;
  IF camper_row.active IS NOT DISTINCT FROM p_active THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
  UPDATE public.campers SET active=p_active WHERE id=p_camper_id;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES(CASE WHEN p_active THEN 'camper_restored' ELSE 'camper_archived' END,p_camper_id,camper_row.lot_number,'camper',p_camper_id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('active',camper_row.active),jsonb_build_object('active',p_active));
  RETURN jsonb_build_object('success',true,'active',p_active);
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_secure_renewal_signature_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF lower(coalesce(NEW.signature_status, '')) = 'signed'
     AND NEW.signed_at IS NOT NULL
     AND nullif(btrim(coalesce(NEW.signed_name, '')), '') IS NOT NULL
     AND nullif(btrim(coalesce(NEW.signature_record_hash, '')), '') IS NOT NULL
     AND (NOT coalesce(NEW.requires_two_signatures, false) OR (NEW.second_signed_at IS NOT NULL AND nullif(btrim(coalesce(NEW.second_signed_name, '')), '') IS NOT NULL AND nullif(btrim(coalesce(NEW.second_signature_record_hash, '')), '') IS NOT NULL))
  THEN
    UPDATE public.season_renewals
    SET status = 'Renewing', decision_recorded_at = (coalesce(NEW.second_signed_at, NEW.signed_at) AT TIME ZONE 'America/Chicago')::date, auto_send_approved = false, auto_send_approved_at = NULL, last_automation_at = coalesce(NEW.second_signed_at, NEW.signed_at), automation_error = NULL
    WHERE camper_id = NEW.camper_id AND renewal_document_id = NEW.id AND status IN ('Not Started', 'Awaiting Response');
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_maintenance_inventory_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_maintenance_supply_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_season_renewal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.touch_site_care_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_camper_profile_audited(p_camper_id uuid, p_patch jsonb, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  old_row public.campers%ROWTYPE;
  new_row public.campers%ROWTYPE;
  before_values jsonb;
  after_values jsonb;
BEGIN
  IF char_length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'A profile-change reason is required.'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN RAISE EXCEPTION 'A camper profile patch is required.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS patch_keys(key)
    WHERE key NOT IN (
      'lot_number','first_name','last_name','email','secondary_email','phone','alternate_phone',
      'second_profile_first_name','second_profile_last_name','second_profile_phone',
      'mailing_address_line1','mailing_address_line2','mailing_city','mailing_state','mailing_zip','role',
      'emergency_contact_name','emergency_contact_phone','vehicle_make','vehicle_model','license_plate',
      'vehicle_2_make','vehicle_2_model','vehicle_2_license_plate','golf_cart_make','golf_cart_color',
      'directory_opt_in','directory_show_phone','sms_opt_in','sms_opt_in_at','camper_since_date','office_notes','rent_payment_plan'
    )
  ) THEN RAISE EXCEPTION 'The camper profile patch contains a protected field.'; END IF;

  SELECT * INTO old_row FROM public.campers WHERE id=p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper not found.'; END IF;
  new_row := jsonb_populate_record(old_row,p_patch);
  SELECT coalesce(jsonb_object_agg(key,to_jsonb(old_row)->key),'{}'::jsonb) INTO before_values FROM jsonb_object_keys(p_patch) AS patch_keys(key);
  SELECT coalesce(jsonb_object_agg(key,to_jsonb(new_row)->key),'{}'::jsonb) INTO after_values FROM jsonb_object_keys(p_patch) AS patch_keys(key);
  IF before_values = after_values THEN RETURN jsonb_build_object('success',true,'unchanged',true,'camper',to_jsonb(old_row)); END IF;

  UPDATE public.campers SET
    lot_number=new_row.lot_number,first_name=new_row.first_name,last_name=new_row.last_name,email=new_row.email,
    secondary_email=new_row.secondary_email,phone=new_row.phone,alternate_phone=new_row.alternate_phone,
    second_profile_first_name=new_row.second_profile_first_name,second_profile_last_name=new_row.second_profile_last_name,
    second_profile_phone=new_row.second_profile_phone,mailing_address_line1=new_row.mailing_address_line1,
    mailing_address_line2=new_row.mailing_address_line2,mailing_city=new_row.mailing_city,mailing_state=new_row.mailing_state,
    mailing_zip=new_row.mailing_zip,role=new_row.role,emergency_contact_name=new_row.emergency_contact_name,
    emergency_contact_phone=new_row.emergency_contact_phone,vehicle_make=new_row.vehicle_make,vehicle_model=new_row.vehicle_model,
    license_plate=new_row.license_plate,vehicle_2_make=new_row.vehicle_2_make,vehicle_2_model=new_row.vehicle_2_model,
    vehicle_2_license_plate=new_row.vehicle_2_license_plate,golf_cart_make=new_row.golf_cart_make,golf_cart_color=new_row.golf_cart_color,
    directory_opt_in=new_row.directory_opt_in,directory_show_phone=new_row.directory_show_phone,sms_opt_in=new_row.sms_opt_in,
    sms_opt_in_at=new_row.sms_opt_in_at,camper_since_date=new_row.camper_since_date,office_notes=new_row.office_notes,
    rent_payment_plan=new_row.rent_payment_plan
  WHERE id=p_camper_id RETURNING * INTO new_row;

  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('camper_profile_updated',p_camper_id,new_row.lot_number,'camper',p_camper_id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),before_values,after_values);
  RETURN jsonb_build_object('success',true,'camper',to_jsonb(new_row));
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_camper_rent_terms_audited(p_camper_id uuid, p_annual_rent numeric, p_payment_plan text, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE camper_row public.campers%ROWTYPE; lot_row public.lots%ROWTYPE; rent_amount numeric(10,2); old_rent numeric(10,2); plan text;
BEGIN
  IF char_length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'A rent-term reason is required.'; END IF;
  IF p_annual_rent IS NOT NULL AND (p_annual_rent<0 OR p_annual_rent>1000000) THEN RAISE EXCEPTION 'Enter a valid annual rent.'; END IF;
  plan := CASE WHEN p_payment_plan='quarterly' THEN 'quarterly' ELSE 'semiannual' END;
  rent_amount := CASE WHEN p_annual_rent IS NULL THEN NULL ELSE round(p_annual_rent,2) END;
  SELECT * INTO camper_row FROM public.campers WHERE id=p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper not found.'; END IF;
  IF btrim(coalesce(camper_row.lot_number,''))='' THEN RAISE EXCEPTION 'Add a lot number first.'; END IF;
  SELECT * INTO lot_row FROM public.lots WHERE lot_number=camper_row.lot_number LIMIT 1 FOR UPDATE;
  old_rent := CASE WHEN FOUND THEN lot_row.lot_rent_amount ELSE NULL END;
  IF FOUND THEN UPDATE public.lots SET lot_rent_amount=rent_amount WHERE id=lot_row.id RETURNING * INTO lot_row;
  ELSE INSERT INTO public.lots(lot_number,camper_id,lot_rent_amount) VALUES(camper_row.lot_number,p_camper_id,rent_amount) RETURNING * INTO lot_row;
  END IF;
  UPDATE public.campers SET rent_payment_plan=plan WHERE id=p_camper_id;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('camper_rent_terms_updated',p_camper_id,camper_row.lot_number,'camper_rent_terms',p_camper_id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('annualRent',old_rent,'paymentPlan',camper_row.rent_payment_plan),
    jsonb_build_object('annualRent',rent_amount,'paymentPlan',plan));
  RETURN jsonb_build_object('success',true,'annualRent',rent_amount,'paymentPlan',plan);
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_invoice_bundle_atomic(p_invoice_id uuid, p_invoice_number text, p_invoice_type text, p_due_date date, p_late_fee numeric, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
CREATE OR REPLACE FUNCTION public.void_account_credit_audited(p_credit_id uuid, p_reason text, p_actor_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE credit_row public.account_credits%ROWTYPE;
BEGIN
  IF char_length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'A void reason is required.'; END IF;
  SELECT * INTO credit_row FROM public.account_credits WHERE id=p_credit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Credit not found.'; END IF;
  IF credit_row.status<>'active' OR credit_row.remaining_amount<=0 THEN RAISE EXCEPTION 'Only an active remaining credit can be voided.'; END IF;
  UPDATE public.account_credits SET status='voided',remaining_amount=0,updated_at=now() WHERE id=p_credit_id;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('account_credit_voided',credit_row.camper_id,credit_row.lot_number,'account_credit',credit_row.id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),
    jsonb_build_object('remainingAmount',credit_row.remaining_amount,'status',credit_row.status),jsonb_build_object('remainingAmount',0,'status','voided'));
  RETURN jsonb_build_object('success',true,'voidedAmount',credit_row.remaining_amount);
END;
$function$;
CREATE TABLE public."account_credit_applications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "credit_id" uuid,
  "camper_id" uuid,
  "invoice_id" uuid,
  "amount_applied" numeric(10,2) NOT NULL,
  "applied_by" text,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."account_credits" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "lot_number" text,
  "camper_name" text NOT NULL,
  "original_amount" numeric(10,2) NOT NULL,
  "remaining_amount" numeric(10,2) NOT NULL,
  "reason" text DEFAULT 'Account credit'::text NOT NULL,
  "notes" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applies_to" text DEFAULT 'general'::text NOT NULL,
  "source_reference" text
);
CREATE TABLE public."admin_audit_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "operation_key" text,
  "action" text NOT NULL,
  "camper_id" uuid,
  "lot_number" text,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "reason" text NOT NULL,
  "actor_email" text NOT NULL,
  "before_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "after_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."admin_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "lot_number" text,
  "camper_id" uuid,
  "source_table" text,
  "source_id" text,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."announcements" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "title" text,
  "message" text,
  "is_active" boolean DEFAULT true,
  "is_urgent" boolean DEFAULT false NOT NULL,
  "request_id" uuid
);
CREATE TABLE public."api_rate_limits" (
  "rate_key" text NOT NULL,
  "request_count" integer DEFAULT 0 NOT NULL,
  "reset_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."app_settings" (
  "key" text NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" text
);
CREATE TABLE public."billing_operation_keys" (
  "operation_key" text NOT NULL,
  "invoice_id" uuid,
  "result" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."birthday_wishes" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "sender_camper_id" uuid NOT NULL,
  "recipient_camper_id" uuid NOT NULL,
  "recipient_profile" text NOT NULL,
  "celebration_year" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."camper_celebration_deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "celebration_type" text NOT NULL,
  "recipient_profile" text NOT NULL,
  "celebration_year" integer NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'sending'::text NOT NULL,
  "recipient" text,
  "subject" text,
  "message" text NOT NULL,
  "provider" text,
  "provider_message_id" text,
  "error_message" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."campers" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "lot_number" text,
  "active_status" boolean DEFAULT true,
  "created_at" timestamp without time zone DEFAULT now(),
  "role" text DEFAULT 'camper'::text NOT NULL,
  "is_active" boolean DEFAULT true,
  "active" boolean DEFAULT true,
  "emergency_contact_name" text,
  "emergency_contact_phone" text,
  "vehicle_make" text,
  "vehicle_model" text,
  "license_plate" text,
  "golf_cart_make" text,
  "golf_cart_color" text,
  "directory_opt_in" boolean DEFAULT false NOT NULL,
  "directory_show_phone" boolean DEFAULT false NOT NULL,
  "secondary_email" text,
  "second_profile_first_name" text,
  "second_profile_last_name" text,
  "second_profile_phone" text,
  "vehicle_2_make" text,
  "vehicle_2_model" text,
  "vehicle_2_license_plate" text,
  "office_notes" text,
  "sms_opt_in" boolean DEFAULT false NOT NULL,
  "sms_opt_in_at" timestamp with time zone,
  "mailing_address_line1" text,
  "mailing_address_line2" text,
  "mailing_city" text,
  "mailing_state" text,
  "mailing_zip" text,
  "alternate_phone" text,
  "birthday" date,
  "second_profile_birthday" date,
  "birthday_celebration_opt_in" boolean DEFAULT false NOT NULL,
  "sms_opt_out_at" timestamp with time zone,
  "sms_last_keyword" text,
  "camper_since_date" date,
  "celebration_messages_opt_in" boolean DEFAULT false NOT NULL,
  "celebration_messages_opt_in_at" timestamp with time zone,
  "event_reminders_opt_in" boolean DEFAULT false NOT NULL,
  "event_reminders_opt_in_at" timestamp with time zone,
  "rent_payment_plan" text DEFAULT 'semiannual'::text NOT NULL
);
CREATE TABLE public."community_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "camper_id" uuid NOT NULL,
  "author_name" text NOT NULL,
  "lot_number" text,
  "body" text NOT NULL,
  "status" text DEFAULT 'published'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_digest_deliveries" (
  "camper_id" uuid NOT NULL,
  "digest_date" date NOT NULL,
  "post_count" integer DEFAULT 0 NOT NULL,
  "email_status" text DEFAULT 'sending'::text NOT NULL,
  "provider_message_id" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_login_reads" (
  "post_id" uuid NOT NULL,
  "camper_id" uuid NOT NULL,
  "reader_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_member_controls" (
  "camper_id" uuid NOT NULL,
  "access_level" text DEFAULT 'active'::text NOT NULL,
  "reason" text,
  "controlled_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_moderation_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "admin_camper_id" uuid,
  "action" text NOT NULL,
  "target_camper_id" uuid,
  "post_id" uuid,
  "comment_id" uuid,
  "reason" text,
  "content_snapshot" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_notification_preferences" (
  "camper_id" uuid NOT NULL,
  "community_mode" text DEFAULT 'daily_summary'::text NOT NULL,
  "replies_mode" text DEFAULT 'right_away'::text NOT NULL,
  "official_mode" text DEFAULT 'right_away'::text NOT NULL,
  "quiet_hours_enabled" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_notifications" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "post_id" uuid,
  "comment_id" uuid,
  "kind" text NOT NULL,
  "message" text NOT NULL,
  "email_status" text DEFAULT 'pending'::text NOT NULL,
  "email_provider_id" text,
  "email_error" text,
  "email_sent_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_posts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "author_name" text NOT NULL,
  "lot_number" text,
  "body" text NOT NULL,
  "photo_path" text,
  "is_official" boolean DEFAULT false NOT NULL,
  "comments_enabled" boolean DEFAULT true NOT NULL,
  "request_id" text,
  "status" text DEFAULT 'published'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "category" text DEFAULT 'general'::text NOT NULL,
  "publish_at" timestamp with time zone DEFAULT now() NOT NULL,
  "pinned_until" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "action_type" text,
  "action_url" text,
  "edited_at" timestamp with time zone,
  "send_text" boolean DEFAULT true NOT NULL
);
CREATE TABLE public."community_reactions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "post_id" uuid NOT NULL,
  "camper_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_reads" (
  "post_id" uuid NOT NULL,
  "camper_id" uuid NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."community_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "reporter_camper_id" uuid NOT NULL,
  "post_id" uuid,
  "comment_id" uuid,
  "reason" text DEFAULT 'Please review this content.'::text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone
);
CREATE TABLE public."document_templates" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "document_name" text NOT NULL,
  "document_type" text DEFAULT 'Lease Template'::text NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."documents" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "document_name" text NOT NULL,
  "document_type" text,
  "file_url" text,
  "signature_status" text DEFAULT 'not_sent'::text,
  "uploaded_at" timestamp without time zone DEFAULT now(),
  "signed_at" timestamp with time zone,
  "signed_name" text,
  "signed_email" text,
  "signed_user_id" uuid,
  "signature_ip" text,
  "signature_user_agent" text,
  "signature_consent_text" text,
  "signature_record_hash" text,
  "requires_two_signatures" boolean DEFAULT false NOT NULL,
  "second_signed_at" timestamp with time zone,
  "second_signed_name" text,
  "second_signed_email" text,
  "second_signed_user_id" uuid,
  "second_signature_ip" text,
  "second_signature_user_agent" text,
  "second_signature_consent_text" text,
  "second_signature_record_hash" text
);
CREATE TABLE public."electric_readings" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lot_id" uuid,
  "camper_id" uuid,
  "previous_reading" numeric(10,2),
  "current_reading" numeric(10,2),
  "kwh_used" numeric(10,2),
  "rate_per_kwh" numeric(10,4),
  "Rate" numeric(10,2),
  "reading_date" date NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "amount_due" numeric,
  "invoice_id" uuid
);
CREATE TABLE public."event_reminder_deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "event_id" text NOT NULL,
  "camper_id" uuid NOT NULL,
  "reminder_date" date NOT NULL,
  "channel" text NOT NULL,
  "status" text DEFAULT 'sending'::text NOT NULL,
  "recipient" text,
  "subject" text,
  "message" text NOT NULL,
  "provider" text,
  "provider_message_id" text,
  "error_message" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "recipient_key" text DEFAULT ''::text NOT NULL
);
CREATE TABLE public."event_rsvps" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "event_id" uuid DEFAULT gen_random_uuid(),
  "camper_id" uuid DEFAULT gen_random_uuid(),
  "response" text
);
CREATE TABLE public."events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "event_date" date NOT NULL,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "location" text,
  "image_url" text,
  "created_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."gate_cards" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "card_number" text,
  "status" text DEFAULT 'active'::text,
  "issue_date" date DEFAULT CURRENT_DATE,
  "notes" text,
  "created_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."invoice_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(10,2) DEFAULT 1,
  "unit_price" numeric(10,2) DEFAULT 0,
  "total" numeric(10,2) DEFAULT 0
);
CREATE TABLE public."invoices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "21" uuid,
  "invoice_number" text NOT NULL,
  "invoice_type" text,
  "subtotal" numeric(10,2) DEFAULT 0,
  "late_fee" numeric(10,2) DEFAULT 0,
  "total_due" numeric(10,2) DEFAULT 0,
  "due_date" date NOT NULL,
  "status" text DEFAULT 'draft'::text,
  "created_at" timestamp without time zone DEFAULT now(),
  "paid_at" timestamp with time zone,
  "payment_method" text,
  "payment_reference" text,
  "ach_expected_date" date
);
CREATE TABLE public."lots" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "lot_number" text NOT NULL,
  "meter_number" text,
  "lot_rent_amount" numeric(10,2),
  "camper_id" uuid
);
CREATE TABLE public."maintenance_inventory_items" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_name" text NOT NULL,
  "category" text DEFAULT 'General'::text NOT NULL,
  "unit" text DEFAULT 'each'::text NOT NULL,
  "sku" text,
  "location" text,
  "stock_quantity" numeric(10,2) DEFAULT 0 NOT NULL,
  "reorder_level" numeric(10,2) DEFAULT 0 NOT NULL,
  "unit_cost" numeric(10,2),
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."maintenance_receipts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text,
  "vendor" text,
  "amount" numeric(10,2),
  "purchased_by" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."maintenance_supply_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "item_name" text NOT NULL,
  "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
  "unit" text DEFAULT 'each'::text NOT NULL,
  "urgency" text DEFAULT 'Normal'::text NOT NULL,
  "notes" text,
  "requested_by" text NOT NULL,
  "requested_by_camper_id" uuid,
  "status" text DEFAULT 'Requested'::text NOT NULL,
  "admin_notes" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ordered_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."maintenance_ticket_comments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "camper_id" uuid,
  "author_name" text NOT NULL,
  "author_role" text DEFAULT 'camper'::text NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."maintenance_ticket_parts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "inventory_item_id" uuid,
  "item_name" text NOT NULL,
  "quantity" numeric(10,2) NOT NULL,
  "unit" text DEFAULT 'each'::text NOT NULL,
  "unit_cost" numeric(10,2),
  "used_by" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."maintenance_tickets" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "title" text,
  "description" text,
  "category" text,
  "status" text DEFAULT 'Open'::text,
  "reported_by" text,
  "lot_number" text,
  "assigned_to" text,
  "priority" text DEFAULT 'Normal'::text,
  "completion_notes" text,
  "completed_at" timestamp with time zone,
  "work_order" boolean DEFAULT false,
  "photo_urls" text[] DEFAULT '{}'::text[] NOT NULL,
  "admin_approved" boolean DEFAULT false NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by" text,
  "camper_id" uuid,
  "work_order_printed_at" timestamp with time zone
);
CREATE TABLE public."manual_invoice_sequences" (
  "invoice_date" date NOT NULL,
  "last_value" integer NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."manual_payment_allocations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "payment_id" uuid NOT NULL,
  "camper_id" uuid NOT NULL,
  "invoice_id" uuid,
  "amount_applied" numeric(10,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."manual_payments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "operation_key" text NOT NULL,
  "camper_id" uuid NOT NULL,
  "selected_invoice_id" uuid,
  "amount" numeric(10,2) NOT NULL,
  "payment_method" text NOT NULL,
  "payment_reference" text,
  "received_on" date NOT NULL,
  "recorded_by" text,
  "credit_id" uuid,
  "result" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."meter_reading_submissions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "lot_number" text NOT NULL,
  "meter_number" text,
  "meter_code" text NOT NULL,
  "photo_path" text NOT NULL,
  "detected_reading" numeric,
  "submitted_reading" numeric,
  "reviewed_reading" numeric,
  "ocr_confidence" numeric,
  "ocr_text" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "captured_by" uuid,
  "captured_by_email" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "invoice_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."office_messages" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "lot_number" text,
  "sender_role" text DEFAULT 'camper'::text NOT NULL,
  "sender_name" text,
  "sender_email" text,
  "body" text NOT NULL,
  "read_by_admin_at" timestamp with time zone,
  "read_by_camper_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "camper_archived_at" timestamp with time zone
);
CREATE TABLE public."payments" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid,
  "camper_id" uuid,
  "amount_paid" numeric(10,2) NOT NULL,
  "payment_method" text,
  "stripe_payment_id" text,
  "paid_at" timestamp without time zone DEFAULT now()
);
CREATE TABLE public."portal_invite_log" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "email" text NOT NULL,
  "delivery_status" text DEFAULT 'sent'::text NOT NULL,
  "delivery_provider" text DEFAULT 'resend'::text NOT NULL,
  "error_message" text,
  "sent_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."saturday_dinner_signups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "dinner_date" date NOT NULL,
  "camper_id" uuid,
  "lot_number" text,
  "camper_name" text NOT NULL,
  "attending_status" text DEFAULT 'Going'::text NOT NULL,
  "bringing" text,
  "guest_count" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."scheduled_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "report_key" text NOT NULL,
  "report_date" date NOT NULL,
  "status" text DEFAULT 'running'::text NOT NULL,
  "item_count" integer DEFAULT 0 NOT NULL,
  "office_email_status" text,
  "printer_email_status" text,
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."season_renewals" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "lot_number" text,
  "contract_start_date" date,
  "contract_end_date" date,
  "renewal_sent_at" date,
  "status" text DEFAULT 'Not Started'::text NOT NULL,
  "decision_recorded_at" date,
  "renewal_document_id" uuid,
  "last_automation_at" timestamp with time zone,
  "automation_error" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "auto_send_approved" boolean DEFAULT false NOT NULL,
  "auto_send_approved_at" timestamp with time zone,
  "review_notified_at" timestamp with time zone,
  "annual_rent" numeric(10,2),
  "rent_payment_plan" text,
  "audit_reason" text,
  "audit_actor" text
);
CREATE TABLE public."sewer_pump_out_requests" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "lot_number" text,
  "camper_name" text NOT NULL,
  "status" text DEFAULT 'requested'::text NOT NULL,
  "charge_amount" numeric(10,2) DEFAULT 10.00 NOT NULL,
  "notes" text,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "billed_invoice_id" uuid,
  "billed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "gallons_used" integer DEFAULT 30 NOT NULL
);
CREATE TABLE public."site_care_notices" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid NOT NULL,
  "lot_number" text,
  "template_key" text,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "priority" text DEFAULT 'Standard'::text NOT NULL,
  "status" text DEFAULT 'Open'::text NOT NULL,
  "due_date" date,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "ready_for_review_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "resolved_by" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."site_service_charges" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "lot_number" text,
  "camper_name" text NOT NULL,
  "service_type" text NOT NULL,
  "service_label" text NOT NULL,
  "charge_amount" numeric(10,2) NOT NULL,
  "notes" text,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "billed_invoice_id" uuid,
  "billed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."sms_broadcast_deliveries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "broadcast_id" uuid NOT NULL,
  "camper_id" uuid,
  "recipient_phone" text NOT NULL,
  "status" text DEFAULT 'reserved'::text NOT NULL,
  "provider_message_id" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE TABLE public."sms_broadcasts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "idempotency_key" uuid NOT NULL,
  "target_mode" text NOT NULL,
  "target_camper_id" uuid,
  "reminder_type" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'sending'::text NOT NULL,
  "recipient_count" integer DEFAULT 0 NOT NULL,
  "duplicate_recipient_count" integer DEFAULT 0 NOT NULL,
  "sent_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "created_by" uuid,
  "created_by_email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
CREATE TABLE public."sms_consent_events" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "phone_number" text NOT NULL,
  "keyword" text NOT NULL,
  "consent_action" text NOT NULL,
  "provider_message_id" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."sms_phone_consents" (
  "camper_id" uuid NOT NULL,
  "phone_number" text NOT NULL,
  "opted_in" boolean DEFAULT false NOT NULL,
  "opted_in_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "source" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."stripe_webhook_events" (
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."tawk_webhook_events" (
  "event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "chat_id" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sms_sent_at" timestamp with time zone,
  "provider_message_id" text
);
CREATE TABLE public."text_reminders" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "camper_id" uuid,
  "invoice_id" uuid,
  "reminder_type" text,
  "message" text,
  "sent_at" timestamp without time zone DEFAULT now(),
  "status" text,
  "recipient_phone" text,
  "provider" text,
  "provider_message_id" text,
  "error_message" text,
  "sent_by" text,
  "reminder_date" date,
  "automation_key" text,
  "recipient_email" text,
  "broadcast_id" uuid
);
CREATE TABLE public."waitlist" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "created_at" timestamp without time zone DEFAULT now(),
  "first_name" text,
  "last_name" text,
  "phone" text,
  "email" text,
  "desired_site" text,
  "notes" text,
  "status" text DEFAULT 'Waiting'::text,
  "last_check_in_at" timestamp with time zone,
  "removed_at" timestamp with time zone
);
ALTER TABLE ONLY public."account_credit_applications" ADD CONSTRAINT "account_credit_applications_amount_check" CHECK (amount_applied > 0::numeric);
ALTER TABLE ONLY public."account_credit_applications" ADD CONSTRAINT "account_credit_applications_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."account_credits" ADD CONSTRAINT "account_credits_amount_check" CHECK (original_amount > 0::numeric AND remaining_amount >= 0::numeric);
ALTER TABLE ONLY public."account_credits" ADD CONSTRAINT "account_credits_applies_to_check" CHECK (applies_to = ANY (ARRAY['general'::text, 'lot_rent'::text]));
ALTER TABLE ONLY public."account_credits" ADD CONSTRAINT "account_credits_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."account_credits" ADD CONSTRAINT "account_credits_status_check" CHECK (status = ANY (ARRAY['active'::text, 'used'::text, 'voided'::text]));
ALTER TABLE ONLY public."admin_audit_events" ADD CONSTRAINT "admin_audit_events_operation_key_key" UNIQUE (operation_key);
ALTER TABLE ONLY public."admin_audit_events" ADD CONSTRAINT "admin_audit_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."admin_audit_events" ADD CONSTRAINT "admin_audit_events_reason_check" CHECK (char_length(btrim(reason)) >= 5 AND char_length(btrim(reason)) <= 1000);
ALTER TABLE ONLY public."admin_notifications" ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."announcements" ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."api_rate_limits" ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY (rate_key);
ALTER TABLE ONLY public."app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY (key);
ALTER TABLE ONLY public."billing_operation_keys" ADD CONSTRAINT "billing_operation_keys_pkey" PRIMARY KEY (operation_key);
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_celebration_year_check" CHECK (celebration_year >= 2026);
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_recipient_profile_check" CHECK (recipient_profile = ANY (ARRAY['primary'::text, 'secondary'::text]));
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_sender_camper_id_recipient_camper_id_recipi_key" UNIQUE (sender_camper_id, recipient_camper_id, recipient_profile, celebration_year);
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_camper_id_celebration_type_re_key" UNIQUE (camper_id, celebration_type, recipient_profile, celebration_year, channel);
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_celebration_type_check" CHECK (celebration_type = ANY (ARRAY['birthday'::text, 'anniversary'::text]));
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_celebration_year_check" CHECK (celebration_year >= 2026);
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text, 'portal'::text]));
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_recipient_profile_check" CHECK (recipient_profile = ANY (ARRAY['primary'::text, 'secondary'::text, 'household'::text]));
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_status_check" CHECK (status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE ONLY public."campers" ADD CONSTRAINT "campers_email_key" UNIQUE (email);
ALTER TABLE ONLY public."campers" ADD CONSTRAINT "campers_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."campers" ADD CONSTRAINT "campers_rent_payment_plan_check" CHECK (rent_payment_plan = ANY (ARRAY['quarterly'::text, 'semiannual'::text]));
ALTER TABLE ONLY public."campers" ADD CONSTRAINT "campers_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'camper'::text, 'maintenance'::text]));
ALTER TABLE ONLY public."community_comments" ADD CONSTRAINT "community_comments_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 800);
ALTER TABLE ONLY public."community_comments" ADD CONSTRAINT "community_comments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_comments" ADD CONSTRAINT "community_comments_status_check" CHECK (status = ANY (ARRAY['published'::text, 'hidden'::text]));
ALTER TABLE ONLY public."community_digest_deliveries" ADD CONSTRAINT "community_digest_deliveries_email_status_check" CHECK (email_status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE ONLY public."community_digest_deliveries" ADD CONSTRAINT "community_digest_deliveries_pkey" PRIMARY KEY (camper_id, digest_date);
ALTER TABLE ONLY public."community_login_reads" ADD CONSTRAINT "community_login_reads_pkey" PRIMARY KEY (post_id, camper_id, reader_id);
ALTER TABLE ONLY public."community_member_controls" ADD CONSTRAINT "community_member_controls_access_level_check" CHECK (access_level = ANY (ARRAY['active'::text, 'read_only'::text, 'blocked'::text]));
ALTER TABLE ONLY public."community_member_controls" ADD CONSTRAINT "community_member_controls_pkey" PRIMARY KEY (camper_id);
ALTER TABLE ONLY public."community_moderation_log" ADD CONSTRAINT "community_moderation_log_action_check" CHECK (action = ANY (ARRAY['hide'::text, 'restore'::text, 'delete_post'::text, 'delete_comment'::text, 'set_active'::text, 'set_read_only'::text, 'set_blocked'::text]));
ALTER TABLE ONLY public."community_moderation_log" ADD CONSTRAINT "community_moderation_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_community_mode_check" CHECK (community_mode = ANY (ARRAY['daily_summary'::text, 'right_away'::text, 'portal_only'::text]));
ALTER TABLE ONLY public."community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_official_mode_check" CHECK (official_mode = ANY (ARRAY['daily_summary'::text, 'right_away'::text, 'portal_only'::text]));
ALTER TABLE ONLY public."community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_pkey" PRIMARY KEY (camper_id);
ALTER TABLE ONLY public."community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_replies_mode_check" CHECK (replies_mode = ANY (ARRAY['daily_summary'::text, 'right_away'::text, 'portal_only'::text]));
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_email_status_check" CHECK (email_status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'skipped'::text]));
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_kind_check" CHECK (kind = ANY (ARRAY['reply'::text, 'official'::text]));
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_action_type_check" CHECK (action_type IS NULL OR (action_type = ANY (ARRAY['events'::text, 'dinners'::text, 'contact'::text, 'custom'::text])));
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_body_check" CHECK (char_length(body) >= 1 AND char_length(body) <= 2000);
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_category_check" CHECK (category = ANY (ARRAY['general'::text, 'office'::text, 'event'::text, 'dinner'::text, 'lost_found'::text, 'marketplace'::text]));
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_request_id_key" UNIQUE (request_id);
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_status_check" CHECK (status = ANY (ARRAY['published'::text, 'scheduled'::text, 'hidden'::text]));
ALTER TABLE ONLY public."community_reactions" ADD CONSTRAINT "community_reactions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_reactions" ADD CONSTRAINT "community_reactions_post_id_camper_id_key" UNIQUE (post_id, camper_id);
ALTER TABLE ONLY public."community_reads" ADD CONSTRAINT "community_reads_pkey" PRIMARY KEY (post_id, camper_id);
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_check" CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL);
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_status_check" CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text]));
ALTER TABLE ONLY public."document_templates" ADD CONSTRAINT "document_templates_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."document_templates" ADD CONSTRAINT "document_templates_storage_path_key" UNIQUE (storage_path);
ALTER TABLE ONLY public."documents" ADD CONSTRAINT "documents_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."electric_readings" ADD CONSTRAINT "electric_readings_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."event_reminder_deliveries" ADD CONSTRAINT "event_reminder_deliveries_channel_check" CHECK (channel = ANY (ARRAY['email'::text, 'sms'::text]));
ALTER TABLE ONLY public."event_reminder_deliveries" ADD CONSTRAINT "event_reminder_deliveries_event_id_camper_id_reminder_date__key" UNIQUE (event_id, camper_id, reminder_date, channel);
ALTER TABLE ONLY public."event_reminder_deliveries" ADD CONSTRAINT "event_reminder_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."event_reminder_deliveries" ADD CONSTRAINT "event_reminder_deliveries_status_check" CHECK (status = ANY (ARRAY['sending'::text, 'sent'::text, 'failed'::text]));
ALTER TABLE ONLY public."event_rsvps" ADD CONSTRAINT "event_rsvps_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."events" ADD CONSTRAINT "events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."gate_cards" ADD CONSTRAINT "gate_cards_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."invoice_items" ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."invoices" ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE (invoice_number);
ALTER TABLE ONLY public."invoices" ADD CONSTRAINT "invoices_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."lots" ADD CONSTRAINT "lots_lot_number_key" UNIQUE (lot_number);
ALTER TABLE ONLY public."lots" ADD CONSTRAINT "lots_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_inventory_items" ADD CONSTRAINT "maintenance_inventory_items_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_inventory_items" ADD CONSTRAINT "maintenance_inventory_nonnegative_stock" CHECK (stock_quantity >= 0::numeric) NOT VALID;
ALTER TABLE ONLY public."maintenance_receipts" ADD CONSTRAINT "maintenance_receipts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_supply_requests" ADD CONSTRAINT "maintenance_supply_requests_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_supply_requests" ADD CONSTRAINT "maintenance_supply_requests_quantity_check" CHECK (quantity > 0::numeric);
ALTER TABLE ONLY public."maintenance_supply_requests" ADD CONSTRAINT "maintenance_supply_requests_status_check" CHECK (status = ANY (ARRAY['Requested'::text, 'Ordered'::text, 'Received'::text, 'Cancelled'::text]));
ALTER TABLE ONLY public."maintenance_supply_requests" ADD CONSTRAINT "maintenance_supply_requests_urgency_check" CHECK (urgency = ANY (ARRAY['Normal'::text, 'Urgent'::text]));
ALTER TABLE ONLY public."maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_ticket_parts" ADD CONSTRAINT "maintenance_ticket_parts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."maintenance_ticket_parts" ADD CONSTRAINT "maintenance_ticket_parts_quantity_check" CHECK (quantity > 0::numeric);
ALTER TABLE ONLY public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."manual_invoice_sequences" ADD CONSTRAINT "manual_invoice_sequences_last_value_check" CHECK (last_value > 0);
ALTER TABLE ONLY public."manual_invoice_sequences" ADD CONSTRAINT "manual_invoice_sequences_pkey" PRIMARY KEY (invoice_date);
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_amount_applied_check" CHECK (amount_applied > 0::numeric);
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_payment_id_invoice_id_key" UNIQUE (payment_id, invoice_id);
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_amount_check" CHECK (amount > 0::numeric);
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_operation_key_key" UNIQUE (operation_key);
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_reviewed_reading_check" CHECK (reviewed_reading IS NULL OR reviewed_reading >= 0::numeric);
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'retake'::text, 'ready'::text, 'used'::text, 'cancelled'::text]));
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_submitted_reading_check" CHECK (submitted_reading >= 0::numeric);
ALTER TABLE ONLY public."office_messages" ADD CONSTRAINT "office_messages_body_check" CHECK (char_length(TRIM(BOTH FROM body)) > 0);
ALTER TABLE ONLY public."office_messages" ADD CONSTRAINT "office_messages_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."office_messages" ADD CONSTRAINT "office_messages_sender_role_check" CHECK (sender_role = ANY (ARRAY['camper'::text, 'admin'::text]));
ALTER TABLE ONLY public."payments" ADD CONSTRAINT "payments_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."portal_invite_log" ADD CONSTRAINT "portal_invite_log_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."saturday_dinner_signups" ADD CONSTRAINT "saturday_dinner_signups_dinner_date_camper_id_key" UNIQUE (dinner_date, camper_id);
ALTER TABLE ONLY public."saturday_dinner_signups" ADD CONSTRAINT "saturday_dinner_signups_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."saturday_dinner_signups" ADD CONSTRAINT "saturday_dinner_signups_status_check" CHECK (attending_status = ANY (ARRAY['Going'::text, 'Maybe'::text, 'Not Going'::text]));
ALTER TABLE ONLY public."scheduled_reports" ADD CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."scheduled_reports" ADD CONSTRAINT "scheduled_reports_report_key_report_date_key" UNIQUE (report_key, report_date);
ALTER TABLE ONLY public."scheduled_reports" ADD CONSTRAINT "scheduled_reports_status_check" CHECK (status = ANY (ARRAY['running'::text, 'sent'::text, 'partial'::text, 'failed'::text]));
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_camper_id_key" UNIQUE (camper_id);
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_rent_payment_plan_check" CHECK (rent_payment_plan IS NULL OR (rent_payment_plan = ANY (ARRAY['semiannual'::text, 'quarterly'::text])));
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_status_check" CHECK (status = ANY (ARRAY['Not Started'::text, 'Awaiting Response'::text, 'Renewing'::text, 'Camper Leaving'::text, 'Campground Not Renewing'::text]));
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_billing_requires_completion" CHECK (status = 'completed'::text OR billed_at IS NULL AND billed_invoice_id IS NULL);
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_gallons_positive" CHECK (gallons_used > 0);
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_requests_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_status_check" CHECK (status = ANY (ARRAY['requested'::text, 'completed'::text, 'cancelled'::text]));
ALTER TABLE ONLY public."site_care_notices" ADD CONSTRAINT "site_care_notices_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."site_care_notices" ADD CONSTRAINT "site_care_notices_priority_check" CHECK (priority = ANY (ARRAY['Standard'::text, 'Important'::text]));
ALTER TABLE ONLY public."site_care_notices" ADD CONSTRAINT "site_care_notices_status_check" CHECK (status = ANY (ARRAY['Open'::text, 'Acknowledged'::text, 'Ready for Review'::text, 'Resolved'::text]));
ALTER TABLE ONLY public."site_service_charges" ADD CONSTRAINT "site_service_charges_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."site_service_charges" ADD CONSTRAINT "site_service_charges_type_check" CHECK (service_type = ANY (ARRAY['full_weed_eat'::text, 'half_weed_eat'::text, 'spray_weeds'::text, 'half_spray_weeds'::text, 'pressure_wash'::text, 'misc_service'::text]));
ALTER TABLE ONLY public."sms_broadcast_deliveries" ADD CONSTRAINT "sms_broadcast_deliveries_broadcast_id_recipient_phone_key" UNIQUE (broadcast_id, recipient_phone);
ALTER TABLE ONLY public."sms_broadcast_deliveries" ADD CONSTRAINT "sms_broadcast_deliveries_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."sms_broadcast_deliveries" ADD CONSTRAINT "sms_broadcast_deliveries_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'sent'::text, 'failed'::text]));
ALTER TABLE ONLY public."sms_broadcasts" ADD CONSTRAINT "sms_broadcasts_idempotency_key_key" UNIQUE (idempotency_key);
ALTER TABLE ONLY public."sms_broadcasts" ADD CONSTRAINT "sms_broadcasts_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."sms_broadcasts" ADD CONSTRAINT "sms_broadcasts_status_check" CHECK (status = ANY (ARRAY['sending'::text, 'sent'::text, 'partial'::text, 'failed'::text]));
ALTER TABLE ONLY public."sms_consent_events" ADD CONSTRAINT "sms_consent_events_consent_action_check" CHECK (consent_action = ANY (ARRAY['opt_in'::text, 'opt_out'::text, 'help'::text, 'other'::text]));
ALTER TABLE ONLY public."sms_consent_events" ADD CONSTRAINT "sms_consent_events_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."sms_consent_events" ADD CONSTRAINT "sms_consent_events_provider_message_id_key" UNIQUE (provider_message_id);
ALTER TABLE ONLY public."sms_phone_consents" ADD CONSTRAINT "sms_phone_consents_pkey" PRIMARY KEY (camper_id, phone_number);
ALTER TABLE ONLY public."stripe_webhook_events" ADD CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY (event_id);
ALTER TABLE ONLY public."tawk_webhook_events" ADD CONSTRAINT "tawk_webhook_events_pkey" PRIMARY KEY (event_id);
ALTER TABLE ONLY public."text_reminders" ADD CONSTRAINT "text_reminders_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."waitlist" ADD CONSTRAINT "waitlist_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."account_credit_applications" ADD CONSTRAINT "account_credit_applications_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."account_credit_applications" ADD CONSTRAINT "account_credit_applications_credit_id_fkey" FOREIGN KEY (credit_id) REFERENCES account_credits(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."account_credit_applications" ADD CONSTRAINT "account_credit_applications_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."account_credits" ADD CONSTRAINT "account_credits_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."admin_audit_events" ADD CONSTRAINT "admin_audit_events_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."admin_notifications" ADD CONSTRAINT "admin_notifications_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."billing_operation_keys" ADD CONSTRAINT "billing_operation_keys_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_recipient_camper_id_fkey" FOREIGN KEY (recipient_camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."birthday_wishes" ADD CONSTRAINT "birthday_wishes_sender_camper_id_fkey" FOREIGN KEY (sender_camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."camper_celebration_deliveries" ADD CONSTRAINT "camper_celebration_deliveries_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_comments" ADD CONSTRAINT "community_comments_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_comments" ADD CONSTRAINT "community_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_digest_deliveries" ADD CONSTRAINT "community_digest_deliveries_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_login_reads" ADD CONSTRAINT "community_login_reads_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_login_reads" ADD CONSTRAINT "community_login_reads_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_member_controls" ADD CONSTRAINT "community_member_controls_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_member_controls" ADD CONSTRAINT "community_member_controls_controlled_by_fkey" FOREIGN KEY (controlled_by) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."community_moderation_log" ADD CONSTRAINT "community_moderation_log_admin_camper_id_fkey" FOREIGN KEY (admin_camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."community_moderation_log" ADD CONSTRAINT "community_moderation_log_target_camper_id_fkey" FOREIGN KEY (target_camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."community_notification_preferences" ADD CONSTRAINT "community_notification_preferences_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_notifications" ADD CONSTRAINT "community_notifications_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_posts" ADD CONSTRAINT "community_posts_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reactions" ADD CONSTRAINT "community_reactions_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reactions" ADD CONSTRAINT "community_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reads" ADD CONSTRAINT "community_reads_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reads" ADD CONSTRAINT "community_reads_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_comments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."community_reports" ADD CONSTRAINT "community_reports_reporter_camper_id_fkey" FOREIGN KEY (reporter_camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."documents" ADD CONSTRAINT "documents_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."electric_readings" ADD CONSTRAINT "electric_readings_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."electric_readings" ADD CONSTRAINT "electric_readings_lot_id_fkey" FOREIGN KEY (lot_id) REFERENCES lots(id);
ALTER TABLE ONLY public."event_reminder_deliveries" ADD CONSTRAINT "event_reminder_deliveries_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."gate_cards" ADD CONSTRAINT "gate_cards_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."invoices" ADD CONSTRAINT "invoices_21_fkey" FOREIGN KEY ("21") REFERENCES lots(id);
ALTER TABLE ONLY public."invoices" ADD CONSTRAINT "invoices_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."lots" ADD CONSTRAINT "lots_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."maintenance_receipts" ADD CONSTRAINT "maintenance_receipts_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."maintenance_supply_requests" ADD CONSTRAINT "maintenance_supply_requests_requested_by_camper_id_fkey" FOREIGN KEY (requested_by_camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."maintenance_ticket_parts" ADD CONSTRAINT "maintenance_ticket_parts_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES maintenance_inventory_items(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."maintenance_ticket_parts" ADD CONSTRAINT "maintenance_ticket_parts_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES maintenance_tickets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."manual_payment_allocations" ADD CONSTRAINT "manual_payment_allocations_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES manual_payments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE RESTRICT;
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_credit_id_fkey" FOREIGN KEY (credit_id) REFERENCES account_credits(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."manual_payments" ADD CONSTRAINT "manual_payments_selected_invoice_id_fkey" FOREIGN KEY (selected_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."meter_reading_submissions" ADD CONSTRAINT "meter_reading_submissions_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."office_messages" ADD CONSTRAINT "office_messages_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."payments" ADD CONSTRAINT "payments_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE ONLY public."portal_invite_log" ADD CONSTRAINT "portal_invite_log_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."saturday_dinner_signups" ADD CONSTRAINT "saturday_dinner_signups_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."season_renewals" ADD CONSTRAINT "season_renewals_renewal_document_id_fkey" FOREIGN KEY (renewal_document_id) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_requests_billed_invoice_id_fkey" FOREIGN KEY (billed_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sewer_pump_out_requests" ADD CONSTRAINT "sewer_pump_out_requests_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."site_care_notices" ADD CONSTRAINT "site_care_notices_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."site_service_charges" ADD CONSTRAINT "site_service_charges_billed_invoice_id_fkey" FOREIGN KEY (billed_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."site_service_charges" ADD CONSTRAINT "site_service_charges_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sms_broadcast_deliveries" ADD CONSTRAINT "sms_broadcast_deliveries_broadcast_id_fkey" FOREIGN KEY (broadcast_id) REFERENCES sms_broadcasts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."sms_broadcast_deliveries" ADD CONSTRAINT "sms_broadcast_deliveries_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sms_broadcasts" ADD CONSTRAINT "sms_broadcasts_target_camper_id_fkey" FOREIGN KEY (target_camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sms_consent_events" ADD CONSTRAINT "sms_consent_events_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."sms_phone_consents" ADD CONSTRAINT "sms_phone_consents_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public."text_reminders" ADD CONSTRAINT "text_reminders_broadcast_id_fkey" FOREIGN KEY (broadcast_id) REFERENCES sms_broadcasts(id) ON DELETE SET NULL;
ALTER TABLE ONLY public."text_reminders" ADD CONSTRAINT "text_reminders_camper_id_fkey" FOREIGN KEY (camper_id) REFERENCES campers(id);
ALTER TABLE ONLY public."text_reminders" ADD CONSTRAINT "text_reminders_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
CREATE INDEX account_credit_applications_invoice_idx ON public.account_credit_applications USING btree (invoice_id);
CREATE INDEX account_credits_camper_idx ON public.account_credits USING btree (camper_id, status, remaining_amount);
CREATE UNIQUE INDEX account_credits_source_reference_unique ON public.account_credits USING btree (source_reference) WHERE (source_reference IS NOT NULL);
CREATE INDEX admin_audit_events_camper_date_idx ON public.admin_audit_events USING btree (camper_id, created_at DESC);
CREATE INDEX admin_audit_events_entity_idx ON public.admin_audit_events USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX admin_notifications_camper_type_idx ON public.admin_notifications USING btree (camper_id, type);
CREATE INDEX admin_notifications_unread_idx ON public.admin_notifications USING btree (type, read_at, created_at DESC);
CREATE INDEX announcements_active_urgent_created_idx ON public.announcements USING btree (is_active, is_urgent, created_at DESC);
CREATE UNIQUE INDEX announcements_request_id_unique ON public.announcements USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX birthday_wishes_recipient_idx ON public.birthday_wishes USING btree (recipient_camper_id, recipient_profile, celebration_year);
CREATE INDEX camper_celebration_deliveries_camper_idx ON public.camper_celebration_deliveries USING btree (camper_id, celebration_year DESC);
CREATE INDEX campers_directory_opt_in_idx ON public.campers USING btree (directory_opt_in) WHERE (directory_opt_in = true);
CREATE INDEX campers_email_idx ON public.campers USING btree (email);
CREATE INDEX campers_secondary_email_idx ON public.campers USING btree (lower(secondary_email));
CREATE INDEX community_comments_post_idx ON public.community_comments USING btree (post_id, created_at);
CREATE INDEX community_login_reads_reader_idx ON public.community_login_reads USING btree (camper_id, reader_id, read_at DESC);
CREATE INDEX community_member_controls_level_idx ON public.community_member_controls USING btree (access_level, updated_at DESC);
CREATE INDEX community_moderation_log_date_idx ON public.community_moderation_log USING btree (created_at DESC);
CREATE UNIQUE INDEX community_notifications_official_once_idx ON public.community_notifications USING btree (camper_id, post_id, kind) WHERE (kind = 'official'::text);
CREATE INDEX community_notifications_unread_idx ON public.community_notifications USING btree (camper_id, read_at, created_at DESC);
CREATE INDEX community_posts_feed_idx ON public.community_posts USING btree (status, created_at DESC);
CREATE INDEX community_posts_pinned_idx ON public.community_posts USING btree (pinned_until DESC NULLS LAST, created_at DESC);
CREATE INDEX community_posts_publish_idx ON public.community_posts USING btree (status, publish_at, created_at DESC);
CREATE INDEX community_reports_status_idx ON public.community_reports USING btree (status, created_at DESC);
CREATE INDEX documents_camper_id_idx ON public.documents USING btree (camper_id);
CREATE INDEX documents_requires_two_signatures_idx ON public.documents USING btree (requires_two_signatures);
CREATE INDEX documents_signature_status_idx ON public.documents USING btree (signature_status);
CREATE INDEX documents_signed_at_idx ON public.documents USING btree (signed_at);
CREATE INDEX electric_readings_camper_id_idx ON public.electric_readings USING btree (camper_id);
CREATE INDEX event_reminder_deliveries_camper_idx ON public.event_reminder_deliveries USING btree (camper_id, reminder_date DESC);
CREATE INDEX event_reminder_deliveries_event_idx ON public.event_reminder_deliveries USING btree (event_id, reminder_date DESC);
CREATE UNIQUE INDEX event_reminder_deliveries_recipient_key ON public.event_reminder_deliveries USING btree (event_id, camper_id, reminder_date, channel, recipient_key);
CREATE INDEX invoice_items_invoice_id_idx ON public.invoice_items USING btree (invoice_id);
CREATE INDEX invoices_camper_id_idx ON public.invoices USING btree (camper_id);
CREATE INDEX invoices_paid_at_idx ON public.invoices USING btree (paid_at DESC) WHERE (status = 'paid'::text);
CREATE INDEX invoices_payment_method_idx ON public.invoices USING btree (payment_method) WHERE (status = 'paid'::text);
CREATE INDEX maintenance_inventory_items_active_idx ON public.maintenance_inventory_items USING btree (active, item_name);
CREATE INDEX maintenance_receipts_ticket_idx ON public.maintenance_receipts USING btree (ticket_id, created_at DESC);
CREATE INDEX maintenance_supply_requests_active_idx ON public.maintenance_supply_requests USING btree (status, urgency, requested_at DESC);
CREATE INDEX maintenance_ticket_comments_ticket_idx ON public.maintenance_ticket_comments USING btree (ticket_id, created_at);
CREATE INDEX maintenance_ticket_parts_ticket_idx ON public.maintenance_ticket_parts USING btree (ticket_id, created_at DESC);
CREATE INDEX maintenance_tickets_admin_approved_idx ON public.maintenance_tickets USING btree (admin_approved, status);
CREATE INDEX maintenance_tickets_camper_id_idx ON public.maintenance_tickets USING btree (camper_id);
CREATE INDEX maintenance_tickets_lot_number_idx ON public.maintenance_tickets USING btree (lot_number);
CREATE INDEX maintenance_tickets_unprinted_work_orders_idx ON public.maintenance_tickets USING btree (created_at) WHERE ((admin_approved = true) AND (status <> 'Completed'::text) AND (work_order_printed_at IS NULL));
CREATE INDEX manual_payment_allocations_invoice_idx ON public.manual_payment_allocations USING btree (invoice_id);
CREATE INDEX manual_payments_camper_date_idx ON public.manual_payments USING btree (camper_id, received_on DESC);
CREATE INDEX meter_reading_submissions_camper_idx ON public.meter_reading_submissions USING btree (camper_id, captured_at DESC);
CREATE INDEX meter_reading_submissions_invoice_id_idx ON public.meter_reading_submissions USING btree (invoice_id) WHERE (invoice_id IS NOT NULL);
CREATE INDEX meter_reading_submissions_lot_idx ON public.meter_reading_submissions USING btree (lot_number, captured_at DESC);
CREATE INDEX meter_reading_submissions_status_idx ON public.meter_reading_submissions USING btree (status, captured_at DESC);
CREATE INDEX office_messages_admin_unread_idx ON public.office_messages USING btree (sender_role, read_by_admin_at, created_at DESC) WHERE (sender_role = 'camper'::text);
CREATE INDEX office_messages_camper_created_idx ON public.office_messages USING btree (camper_id, created_at DESC);
CREATE INDEX office_messages_camper_unread_idx ON public.office_messages USING btree (camper_id, sender_role, read_by_camper_at, created_at DESC) WHERE (sender_role = 'admin'::text);
CREATE INDEX office_messages_camper_visible_idx ON public.office_messages USING btree (camper_id, camper_archived_at, created_at DESC);
CREATE INDEX portal_invite_log_email_created_idx ON public.portal_invite_log USING btree (lower(email), created_at DESC);
CREATE INDEX saturday_dinner_signups_date_idx ON public.saturday_dinner_signups USING btree (dinner_date, attending_status);
CREATE INDEX scheduled_reports_recent_idx ON public.scheduled_reports USING btree (report_key, report_date DESC);
CREATE INDEX season_renewals_contract_end_idx ON public.season_renewals USING btree (contract_end_date);
CREATE INDEX season_renewals_review_queue_idx ON public.season_renewals USING btree (status, review_notified_at, contract_end_date) WHERE (renewal_sent_at IS NULL);
CREATE INDEX season_renewals_status_idx ON public.season_renewals USING btree (status, contract_end_date);
CREATE UNIQUE INDEX sewer_pump_out_one_open_request_per_lot_idx ON public.sewer_pump_out_requests USING btree (upper(btrim(lot_number))) WHERE ((status = 'requested'::text) AND (billed_at IS NULL));
CREATE INDEX sewer_pump_out_requests_admin_idx ON public.sewer_pump_out_requests USING btree (status, billed_at, requested_at DESC);
CREATE INDEX sewer_pump_out_requests_camper_idx ON public.sewer_pump_out_requests USING btree (camper_id, requested_at DESC);
CREATE INDEX site_care_notices_active_idx ON public.site_care_notices USING btree (status, created_at DESC);
CREATE INDEX site_care_notices_camper_idx ON public.site_care_notices USING btree (camper_id, status, created_at DESC);
CREATE INDEX site_service_charges_admin_idx ON public.site_service_charges USING btree (billed_at, cancelled_at, performed_at DESC);
CREATE INDEX site_service_charges_camper_idx ON public.site_service_charges USING btree (camper_id, billed_at, cancelled_at);
CREATE INDEX sms_broadcast_deliveries_broadcast_idx ON public.sms_broadcast_deliveries USING btree (broadcast_id, created_at);
CREATE INDEX sms_broadcasts_created_idx ON public.sms_broadcasts USING btree (created_at DESC);
CREATE INDEX tawk_webhook_events_received_at_idx ON public.tawk_webhook_events USING btree (received_at DESC);
CREATE UNIQUE INDEX text_reminders_broadcast_phone_unique ON public.text_reminders USING btree (broadcast_id, recipient_phone) WHERE ((broadcast_id IS NOT NULL) AND (recipient_phone IS NOT NULL));
CREATE INDEX text_reminders_camper_sent_idx ON public.text_reminders USING btree (camper_id, sent_at DESC);
CREATE UNIQUE INDEX text_reminders_invoice_automation_unique ON public.text_reminders USING btree (invoice_id, automation_key, reminder_date) WHERE ((invoice_id IS NOT NULL) AND (automation_key IS NOT NULL) AND (reminder_date IS NOT NULL));
CREATE INDEX text_reminders_invoice_lookup_idx ON public.text_reminders USING btree (invoice_id, sent_at DESC);
CREATE INDEX text_reminders_provider_sent_idx ON public.text_reminders USING btree (provider, sent_at DESC);
CREATE INDEX waitlist_check_in_eligibility_idx ON public.waitlist USING btree (status, removed_at, last_check_in_at, created_at) WHERE (email IS NOT NULL);
CREATE TRIGGER account_credits_insert_audit AFTER INSERT ON account_credits FOR EACH ROW EXECUTE FUNCTION audit_account_credit_insert();
CREATE TRIGGER admin_audit_events_immutable BEFORE DELETE OR UPDATE ON admin_audit_events FOR EACH ROW EXECUTE FUNCTION block_admin_audit_event_mutation();
CREATE TRIGGER campers_unique_email_identity BEFORE INSERT OR UPDATE OF email, secondary_email ON campers FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_camper_emails();
CREATE TRIGGER documents_sync_secure_renewal_signature AFTER INSERT OR UPDATE OF signature_status, signed_at, signed_name, signature_record_hash, second_signed_at, second_signed_name, second_signature_record_hash ON documents FOR EACH ROW EXECUTE FUNCTION sync_secure_renewal_signature_status();
CREATE TRIGGER preserve_paid_invoice_total_trigger BEFORE INSERT OR UPDATE OF status, total_due ON invoices FOR EACH ROW EXECUTE FUNCTION preserve_paid_invoice_total();
CREATE TRIGGER maintenance_inventory_items_touch BEFORE UPDATE ON maintenance_inventory_items FOR EACH ROW EXECUTE FUNCTION touch_maintenance_inventory_item();
CREATE TRIGGER maintenance_supply_requests_touch BEFORE UPDATE ON maintenance_supply_requests FOR EACH ROW EXECUTE FUNCTION touch_maintenance_supply_request();
CREATE TRIGGER maintenance_ticket_parts_inventory AFTER INSERT OR DELETE OR UPDATE ON maintenance_ticket_parts FOR EACH ROW EXECUTE FUNCTION apply_maintenance_part_inventory();
CREATE TRIGGER maintenance_approval_fields_guard BEFORE INSERT OR UPDATE ON maintenance_tickets FOR EACH ROW EXECUTE FUNCTION enforce_maintenance_approval_fields();
CREATE TRIGGER season_renewals_admin_audit BEFORE INSERT OR UPDATE ON season_renewals FOR EACH ROW EXECUTE FUNCTION audit_season_renewal_change();
CREATE TRIGGER season_renewals_touch BEFORE UPDATE ON season_renewals FOR EACH ROW EXECUTE FUNCTION touch_season_renewal();
CREATE TRIGGER site_care_notices_touch BEFORE UPDATE ON site_care_notices FOR EACH ROW EXECUTE FUNCTION touch_site_care_notice();
CREATE POLICY "account_credit_applications_admin_full_access" ON public."account_credit_applications" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "account_credit_applications_camper_view_own" ON public."account_credit_applications" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "account_credits_admin_full_access" ON public."account_credits" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "account_credits_camper_view_own" ON public."account_credits" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "admin_audit_events_admin_read" ON public."admin_audit_events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "admin_notifications_admin_full_access" ON public."admin_notifications" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "announcements_admin_full_access" ON public."announcements" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "announcements_authenticated_view_active" ON public."announcements" AS PERMISSIVE FOR SELECT TO "authenticated" USING (is_active = true);
CREATE POLICY "app_settings_admin_full_access" ON public."app_settings" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "app_settings_authenticated_select" ON public."app_settings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "birthday_wishes_admin_full_access" ON public."birthday_wishes" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "camper_celebration_deliveries_admin_access" ON public."camper_celebration_deliveries" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "camper_celebration_deliveries_camper_view" ON public."camper_celebration_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "campers_admin_full_access" ON public."campers" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "campers_update_own_safe_fields" ON public."campers" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (active IS NOT FALSE AND (normalized_camper_email(email) = current_user_email() OR normalized_camper_email(secondary_email) = current_user_email())) WITH CHECK (active IS NOT FALSE AND (normalized_camper_email(email) = current_user_email() OR normalized_camper_email(secondary_email) = current_user_email()) AND camper_protected_fields_unchanged(id, email, role, lot_number, active));
CREATE POLICY "campers_view_own" ON public."campers" AS PERMISSIVE FOR SELECT TO "authenticated" USING (active IS NOT FALSE AND (normalized_camper_email(email) = current_user_email() OR normalized_camper_email(secondary_email) = current_user_email()));
CREATE POLICY "document_templates_admin_full_access" ON public."document_templates" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "documents_admin_full_access" ON public."documents" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "documents_camper_view_own" ON public."documents" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "electric_readings_admin_full_access" ON public."electric_readings" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "electric_readings_camper_view_own" ON public."electric_readings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "event_reminder_deliveries_admin_access" ON public."event_reminder_deliveries" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "event_reminder_deliveries_camper_view" ON public."event_reminder_deliveries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "event_rsvps_admin_full_access" ON public."event_rsvps" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "event_rsvps_camper_delete_own" ON public."event_rsvps" AS PERMISSIVE FOR DELETE TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "event_rsvps_camper_insert_own" ON public."event_rsvps" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "event_rsvps_camper_view_own" ON public."event_rsvps" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "events_admin_full_access" ON public."events" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "events_authenticated_view" ON public."events" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "gate_cards_admin_full_access" ON public."gate_cards" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "invoice_items_admin_full_access" ON public."invoice_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "invoice_items_camper_view_own" ON public."invoice_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE i.id = invoice_items.invoice_id AND i.camper_id = (( SELECT current_camper_id() AS current_camper_id)))));
CREATE POLICY "invoices_admin_full_access" ON public."invoices" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "invoices_camper_view_own" ON public."invoices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "lots_admin_full_access" ON public."lots" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_inventory_admin_full_access" ON public."maintenance_inventory_items" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_inventory_maintenance_select" ON public."maintenance_inventory_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user));
CREATE POLICY "maintenance_receipts_admin_full_access" ON public."maintenance_receipts" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_receipts_maintenance_insert" ON public."maintenance_receipts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_receipts.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_receipts_maintenance_select" ON public."maintenance_receipts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_receipts.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_supply_requests_admin_full_access" ON public."maintenance_supply_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_supply_requests_staff_select" ON public."maintenance_supply_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user));
CREATE POLICY "maintenance_ticket_comments_admin_full_access" ON public."maintenance_ticket_comments" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_ticket_comments_camper_insert_own" ON public."maintenance_ticket_comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (author_role = 'camper'::text AND camper_id = (( SELECT current_camper_id() AS current_camper_id)) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_comments.ticket_id AND t.camper_id = (( SELECT current_camper_id() AS current_camper_id)))));
CREATE POLICY "maintenance_ticket_comments_camper_view_own" ON public."maintenance_ticket_comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_comments.ticket_id AND t.camper_id = (( SELECT current_camper_id() AS current_camper_id)))));
CREATE POLICY "maintenance_ticket_comments_maintenance_insert_approved" ON public."maintenance_ticket_comments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (author_role = 'maintenance'::text AND ( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_comments.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_ticket_comments_maintenance_view_approved" ON public."maintenance_ticket_comments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_comments.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_ticket_parts_admin_full_access" ON public."maintenance_ticket_parts" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_ticket_parts_maintenance_insert" ON public."maintenance_ticket_parts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_parts.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_ticket_parts_maintenance_select" ON public."maintenance_ticket_parts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user) AND (EXISTS ( SELECT 1
   FROM maintenance_tickets t
  WHERE t.id = maintenance_ticket_parts.ticket_id AND t.admin_approved = true)));
CREATE POLICY "maintenance_tickets_admin_full_access" ON public."maintenance_tickets" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "maintenance_tickets_camper_create_own" ON public."maintenance_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (lot_number = (( SELECT c.lot_number
   FROM campers c
  WHERE lower(c.email) = current_user_email() OR lower(COALESCE(c.secondary_email, ''::text)) = current_user_email()
 LIMIT 1)));
CREATE POLICY "maintenance_tickets_camper_view_own" ON public."maintenance_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "maintenance_tickets_maintenance_submit_pending" ON public."maintenance_tickets" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (( SELECT is_maintenance_user() AS is_maintenance_user) AND admin_approved = false AND approved_at IS NULL AND approved_by IS NULL);
CREATE POLICY "maintenance_tickets_maintenance_update_approved" ON public."maintenance_tickets" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user) AND admin_approved = true) WITH CHECK (( SELECT is_maintenance_user() AS is_maintenance_user) AND admin_approved = true);
CREATE POLICY "maintenance_tickets_maintenance_view_approved" ON public."maintenance_tickets" AS PERMISSIVE FOR SELECT TO "authenticated" USING (( SELECT is_maintenance_user() AS is_maintenance_user) AND admin_approved = true);
CREATE POLICY "meter_reading_submissions_admin_access" ON public."meter_reading_submissions" AS PERMISSIVE FOR ALL TO "authenticated" USING (is_admin_user()) WITH CHECK (is_admin_user());
CREATE POLICY "office_messages_admin_full_access" ON public."office_messages" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "office_messages_camper_insert_own" ON public."office_messages" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (camper_id = (( SELECT current_camper_id() AS current_camper_id)) AND sender_role = 'camper'::text);
CREATE POLICY "office_messages_camper_view_own" ON public."office_messages" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "admin_full_access_security_lockdown" ON public."payments" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "portal_invite_log_admin_full_access" ON public."portal_invite_log" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "saturday_dinner_signups_admin_full_access" ON public."saturday_dinner_signups" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "saturday_dinner_signups_camper_insert_own" ON public."saturday_dinner_signups" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "saturday_dinner_signups_camper_update_own" ON public."saturday_dinner_signups" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id))) WITH CHECK (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "saturday_dinner_signups_camper_view_own" ON public."saturday_dinner_signups" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "scheduled_reports_admin_access" ON public."scheduled_reports" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "season_renewals_admin_full_access" ON public."season_renewals" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "sewer_pump_out_requests_admin_full_access" ON public."sewer_pump_out_requests" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "sewer_pump_out_requests_camper_insert_own" ON public."sewer_pump_out_requests" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "sewer_pump_out_requests_camper_view_own" ON public."sewer_pump_out_requests" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "site_care_notices_admin_full_access" ON public."site_care_notices" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "site_care_notices_camper_select" ON public."site_care_notices" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "site_service_charges_admin_full_access" ON public."site_service_charges" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "site_service_charges_camper_view_own" ON public."site_service_charges" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "text_reminders_admin_full_access" ON public."text_reminders" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
CREATE POLICY "text_reminders_camper_view_own" ON public."text_reminders" AS PERMISSIVE FOR SELECT TO "authenticated" USING (camper_id = (( SELECT current_camper_id() AS current_camper_id)));
CREATE POLICY "waitlist_admin_full_access" ON public."waitlist" AS PERMISSIVE FOR ALL TO "authenticated" USING (( SELECT is_admin_user() AS is_admin_user)) WITH CHECK (( SELECT is_admin_user() AS is_admin_user));
ALTER TABLE public."account_credit_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."announcements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_rate_limits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."billing_operation_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."birthday_wishes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."camper_celebration_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."campers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_digest_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_login_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_member_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_moderation_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_reactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_reads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."community_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."document_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."documents" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."electric_readings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."electric_readings" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."event_reminder_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."event_rsvps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gate_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_supply_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_ticket_comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_ticket_parts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."maintenance_tickets" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."manual_invoice_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."manual_payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."manual_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meter_reading_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."meter_reading_submissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE public."office_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_invite_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."saturday_dinner_signups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."scheduled_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."season_renewals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sewer_pump_out_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."site_care_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."site_service_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_broadcast_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_broadcasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_consent_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sms_phone_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tawk_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."text_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."waitlist" ENABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON TABLE
  public."account_credit_applications", public."account_credits", public."admin_notifications",
  public."announcements", public."app_settings", public."birthday_wishes",
  public."camper_celebration_deliveries", public."campers", public."community_comments",
  public."community_digest_deliveries", public."community_member_controls",
  public."community_moderation_log", public."community_notification_preferences",
  public."community_notifications", public."community_posts", public."community_reactions",
  public."community_reads", public."community_reports", public."document_templates",
  public."documents", public."electric_readings", public."event_reminder_deliveries",
  public."event_rsvps", public."events", public."gate_cards", public."invoice_items",
  public."invoices", public."lots", public."maintenance_inventory_items",
  public."maintenance_receipts", public."maintenance_supply_requests",
  public."maintenance_ticket_comments", public."maintenance_ticket_parts",
  public."maintenance_tickets", public."meter_reading_submissions", public."office_messages",
  public."payments", public."portal_invite_log", public."saturday_dinner_signups",
  public."scheduled_reports", public."season_renewals", public."sewer_pump_out_requests",
  public."site_care_notices", public."site_service_charges", public."stripe_webhook_events",
  public."text_reminders", public."waitlist"
TO "anon", "authenticated";
GRANT SELECT ON TABLE public."admin_audit_events" TO "authenticated";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "service_role";
GRANT EXECUTE ON FUNCTION public."apply_account_credits_to_invoice_atomic"(p_camper_id uuid, p_invoice_id uuid, p_invoice_total numeric, p_applied_by text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."apply_account_credits_to_invoice_atomic"(p_camper_id uuid, p_invoice_id uuid, p_invoice_total numeric, p_applied_by text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."apply_maintenance_part_inventory"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."audit_account_credit_insert"() TO "anon";
GRANT EXECUTE ON FUNCTION public."audit_account_credit_insert"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."audit_account_credit_insert"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."audit_season_renewal_change"() TO "anon";
GRANT EXECUTE ON FUNCTION public."audit_season_renewal_change"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."audit_season_renewal_change"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."block_admin_audit_event_mutation"() TO "anon";
GRANT EXECUTE ON FUNCTION public."block_admin_audit_event_mutation"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."block_admin_audit_event_mutation"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."camper_protected_fields_unchanged"(target_camper_id uuid, new_email text, new_role text, new_lot_number text, new_active boolean) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."camper_protected_fields_unchanged"(target_camper_id uuid, new_email text, new_role text, new_lot_number text, new_active boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION public."check_api_rate_limit"(p_scope text, p_identifier text, p_limit integer, p_window_seconds integer) TO "service_role";
GRANT EXECUTE ON FUNCTION public."create_account_credit_audited"(p_camper_id uuid, p_amount numeric, p_reason text, p_notes text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."create_account_credit_audited"(p_camper_id uuid, p_amount numeric, p_reason text, p_notes text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_account_credit_audited"(p_camper_id uuid, p_amount numeric, p_reason text, p_notes text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."create_invoice_bundle_atomic"(p_operation_key text, p_invoice jsonb, p_items jsonb, p_readings jsonb, p_pump_out_ids uuid[], p_site_service_ids uuid[], p_new_credit jsonb, p_applied_by text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_invoice_bundle_atomic"(p_operation_key text, p_invoice jsonb, p_items jsonb, p_readings jsonb, p_pump_out_ids uuid[], p_site_service_ids uuid[], p_new_credit jsonb, p_applied_by text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."current_camper_id"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."current_camper_id"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."current_user_email"() TO "anon";
GRANT EXECUTE ON FUNCTION public."current_user_email"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."current_user_email"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."delete_invoice_with_audit_atomic"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."delete_invoice_with_audit_atomic"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_invoice_with_audit_atomic"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."delete_invoice_with_credit_restore_atomic"(p_invoice_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."delete_invoice_with_credit_restore_atomic"(p_invoice_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."enforce_maintenance_approval_fields"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."get_camper_directory"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."get_camper_directory"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."is_admin_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_admin_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."is_maintenance_user"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."is_maintenance_user"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."next_manual_invoice_number"(p_invoice_date date) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."next_manual_invoice_number"(p_invoice_date date) TO "service_role";
GRANT EXECUTE ON FUNCTION public."normalized_camper_email"(value text) TO "anon";
GRANT EXECUTE ON FUNCTION public."normalized_camper_email"(value text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."normalized_camper_email"(value text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."preserve_paid_invoice_total"() TO "anon";
GRANT EXECUTE ON FUNCTION public."preserve_paid_invoice_total"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."preserve_paid_invoice_total"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."prevent_duplicate_camper_emails"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."record_document_signature_atomic"(p_document_id uuid, p_camper_id uuid, p_user_id uuid, p_email text, p_name text, p_signed_at timestamp with time zone, p_ip text, p_user_agent text, p_consent text, p_record_hash text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."record_manual_payment_atomic"(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text, p_recorded_by text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."record_manual_payment_audited"(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."record_manual_payment_audited"(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."record_manual_payment_audited"(p_operation_key text, p_selected_invoice_id uuid, p_amount numeric, p_payment_method text, p_received_on date, p_reference text, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."remove_invoice_late_fee_audited"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."remove_invoice_late_fee_audited"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."remove_invoice_late_fee_audited"(p_invoice_id uuid, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."request_sewer_pump_out_atomic"(p_camper_id uuid, p_lot_number text, p_camper_name text, p_charge_amount numeric, p_notes text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."set_camper_active_audited"(p_camper_id uuid, p_active boolean, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."set_camper_active_audited"(p_camper_id uuid, p_active boolean, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."set_camper_active_audited"(p_camper_id uuid, p_active boolean, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."sync_secure_renewal_signature_status"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."touch_maintenance_inventory_item"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."touch_maintenance_supply_request"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."touch_season_renewal"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."touch_site_care_notice"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."update_camper_profile_audited"(p_camper_id uuid, p_patch jsonb, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."update_camper_profile_audited"(p_camper_id uuid, p_patch jsonb, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_camper_profile_audited"(p_camper_id uuid, p_patch jsonb, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."update_camper_rent_terms_audited"(p_camper_id uuid, p_annual_rent numeric, p_payment_plan text, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."update_camper_rent_terms_audited"(p_camper_id uuid, p_annual_rent numeric, p_payment_plan text, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_camper_rent_terms_audited"(p_camper_id uuid, p_annual_rent numeric, p_payment_plan text, p_reason text, p_actor_email text) TO "service_role";
GRANT EXECUTE ON FUNCTION public."update_invoice_bundle_atomic"(p_invoice_id uuid, p_invoice_number text, p_invoice_type text, p_due_date date, p_late_fee numeric, p_items jsonb) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."update_invoice_bundle_atomic"(p_invoice_id uuid, p_invoice_number text, p_invoice_type text, p_due_date date, p_late_fee numeric, p_items jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public."void_account_credit_audited"(p_credit_id uuid, p_reason text, p_actor_email text) TO "anon";
GRANT EXECUTE ON FUNCTION public."void_account_credit_audited"(p_credit_id uuid, p_reason text, p_actor_email text) TO "authenticated";
GRANT EXECUTE ON FUNCTION public."void_account_credit_audited"(p_credit_id uuid, p_reason text, p_actor_email text) TO "service_role";
COMMENT ON COLUMN public."campers"."rent_payment_plan" IS 'Renewal lot-rent installments: quarterly is grandfathered; semiannual is the standard half-and-half plan.';
COMMENT ON COLUMN public."invoices"."ach_expected_date" IS 'Estimated ACH completion date calculated from the Stripe processing event; cleared when the payment resolves.';
COMMENT ON COLUMN public."waitlist"."last_check_in_at" IS 'Most recent successful periodic waitlist check-in email.';
COMMENT ON COLUMN public."waitlist"."removed_at" IS 'When an applicant used the email removal option or was removed by staff.';
COMMENT ON TABLE public."tawk_webhook_events" IS 'Private webhook delivery ledger used to prevent duplicate live-chat SMS alerts.';

COMMIT;
