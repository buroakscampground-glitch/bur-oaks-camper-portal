-- Extend the append-only office audit trail to camper profiles, rent terms,
-- renewal overrides, and credits created inside bundled electric billing.

ALTER TABLE public.season_renewals
  ADD COLUMN IF NOT EXISTS audit_reason text,
  ADD COLUMN IF NOT EXISTS audit_actor text;

CREATE OR REPLACE FUNCTION public.audit_season_renewal_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

DROP TRIGGER IF EXISTS season_renewals_admin_audit ON public.season_renewals;
CREATE TRIGGER season_renewals_admin_audit
  BEFORE INSERT OR UPDATE ON public.season_renewals
  FOR EACH ROW EXECUTE FUNCTION public.audit_season_renewal_change();

CREATE OR REPLACE FUNCTION public.update_camper_profile_audited(
  p_camper_id uuid, p_patch jsonb, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.update_camper_rent_terms_audited(
  p_camper_id uuid, p_annual_rent numeric, p_payment_plan text, p_reason text, p_actor_email text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.audit_account_credit_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_audit_events(action,camper_id,lot_number,entity_type,entity_id,reason,actor_email,before_state,after_state)
  VALUES('account_credit_created',NEW.camper_id,NEW.lot_number,'account_credit',NEW.id::text,left(coalesce(nullif(btrim(NEW.reason),''),'Account credit created'),1000),coalesce(nullif(btrim(NEW.created_by),''),'system'),'{}'::jsonb,
    jsonb_build_object('originalAmount',NEW.original_amount,'remainingAmount',NEW.remaining_amount,'status',NEW.status,'notes',NEW.notes));
  RETURN NEW;
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
  RETURN to_jsonb(credit_row);
END;
$$;

DROP TRIGGER IF EXISTS account_credits_insert_audit ON public.account_credits;
CREATE TRIGGER account_credits_insert_audit
  AFTER INSERT ON public.account_credits
  FOR EACH ROW EXECUTE FUNCTION public.audit_account_credit_insert();

REVOKE ALL ON FUNCTION public.update_camper_profile_audited(uuid,jsonb,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_camper_rent_terms_audited(uuid,numeric,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_camper_profile_audited(uuid,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_camper_rent_terms_audited(uuid,numeric,text,text,text) TO service_role;
