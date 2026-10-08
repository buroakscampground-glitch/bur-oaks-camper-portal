-- One append-only proof trail for high-risk office changes. This migration is
-- additive: it does not rewrite or delete any camper, invoice, payment, or
-- credit record.

CREATE TABLE IF NOT EXISTS public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_key text UNIQUE,
  action text NOT NULL,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text,
  entity_type text NOT NULL,
  entity_id text,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 5 AND 1000),
  actor_email text NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_events_camper_date_idx
  ON public.admin_audit_events (camper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_events_entity_idx
  ON public.admin_audit_events (entity_type, entity_id, created_at DESC);

ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_events FROM anon, authenticated;
GRANT SELECT ON TABLE public.admin_audit_events TO authenticated;

DROP POLICY IF EXISTS admin_audit_events_admin_read ON public.admin_audit_events;
CREATE POLICY admin_audit_events_admin_read
  ON public.admin_audit_events FOR SELECT TO authenticated
  USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.block_admin_audit_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Administrative audit events are append-only.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_events_immutable ON public.admin_audit_events;
CREATE TRIGGER admin_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.block_admin_audit_event_mutation();

CREATE OR REPLACE FUNCTION public.record_manual_payment_audited(
  p_operation_key text,
  p_selected_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_received_on date,
  p_reference text,
  p_reason text,
  p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.remove_invoice_late_fee_audited(
  p_invoice_id uuid, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.delete_invoice_with_audit_atomic(
  p_invoice_id uuid, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.set_camper_active_audited(
  p_camper_id uuid, p_active boolean, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.create_account_credit_audited(
  p_camper_id uuid, p_amount numeric, p_reason text, p_notes text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE camper_row public.campers%ROWTYPE; credit_row public.account_credits%ROWTYPE; credit_amount numeric(10,2):=round(coalesce(p_amount,0),2);
BEGIN
  IF credit_amount<=0 OR credit_amount>1000000 THEN RAISE EXCEPTION 'Enter a valid credit amount.'; END IF;
  IF char_length(btrim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'A credit reason is required.'; END IF;
  SELECT * INTO camper_row FROM public.campers WHERE id=p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper not found.'; END IF;
  INSERT INTO public.account_credits(camper_id,lot_number,camper_name,original_amount,remaining_amount,reason,notes,status,created_by)
  VALUES(p_camper_id,camper_row.lot_number,btrim(coalesce(camper_row.first_name,'')||' '||coalesce(camper_row.last_name,'')),credit_amount,credit_amount,left(btrim(p_reason),1000),nullif(left(btrim(coalesce(p_notes,'')),2000),''),'active',coalesce(nullif(btrim(p_actor_email),''),'office')) RETURNING * INTO credit_row;
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('account_credit_created',p_camper_id,camper_row.lot_number,'account_credit',credit_row.id::text,left(btrim(p_reason),1000),coalesce(nullif(btrim(p_actor_email),''),'office'),'{}'::jsonb,
    jsonb_build_object('originalAmount',credit_amount,'remainingAmount',credit_amount,'status','active','notes',nullif(left(btrim(coalesce(p_notes,'')),2000),'')));
  RETURN to_jsonb(credit_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_account_credit_audited(
  p_credit_id uuid, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

REVOKE ALL ON FUNCTION public.record_manual_payment_audited(text,uuid,numeric,text,date,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_invoice_late_fee_audited(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_invoice_with_audit_atomic(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_camper_active_audited(uuid,boolean,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_account_credit_audited(uuid,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_account_credit_audited(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_manual_payment_audited(text,uuid,numeric,text,date,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.remove_invoice_late_fee_audited(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invoice_with_audit_atomic(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_camper_active_audited(uuid,boolean,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_account_credit_audited(uuid,numeric,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_account_credit_audited(uuid,text,text) TO service_role;
