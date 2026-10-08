-- Bur Oaks staging-only synthetic journey fixtures.
-- This file must never run against production.

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_settings
    WHERE key = 'environment' AND value = 'staging'
  ) THEN
    RAISE EXCEPTION 'Blocked: Bur Oaks staging environment marker is missing.';
  END IF;
END
$guard$;

INSERT INTO public.campers
  (id, first_name, last_name, email, lot_number, role, active_status, is_active, active,
   directory_opt_in, directory_show_phone, sms_opt_in, birthday_celebration_opt_in,
   celebration_messages_opt_in, event_reminders_opt_in, rent_payment_plan, office_notes)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Casey', 'Camper', 'camper.one@staging.buroaks.invalid', 'TEST-01', 'camper', true, true, true, false, false, false, false, false, false, 'semiannual', 'Synthetic staging fixture; never contact.'),
  ('10000000-0000-4000-8000-000000000002', 'Avery', 'Administrator', 'office.admin@staging.buroaks.invalid', NULL, 'admin', true, true, true, false, false, false, false, false, false, 'semiannual', 'Synthetic staging fixture; never contact.'),
  ('10000000-0000-4000-8000-000000000003', 'Morgan', 'Maintenance', 'maintenance.staff@staging.buroaks.invalid', NULL, 'maintenance', true, true, true, false, false, false, false, false, false, 'semiannual', 'Synthetic staging fixture; never contact.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lots (id, lot_number, meter_number, lot_rent_amount, camper_id)
VALUES ('10000000-0000-4000-8000-000000000010', 'TEST-01', 'TEST-METER-01', 1750.00, '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoices
  (id, camper_id, invoice_number, invoice_type, subtotal, late_fee, total_due, due_date, status)
VALUES
  ('10000000-0000-4000-8000-000000000020', '10000000-0000-4000-8000-000000000001', 'TEST-OPEN-0001', 'Electric', 86.40, 0, 86.40, CURRENT_DATE + 14, 'sent'),
  ('10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', 'TEST-PAID-0001', 'Lot Rent', 875.00, 0, 875.00, CURRENT_DATE - 30, 'paid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.invoice_items (id, invoice_id, description, quantity, unit_price, total)
VALUES
  ('10000000-0000-4000-8000-000000000030', '10000000-0000-4000-8000-000000000020', 'Synthetic electric usage', 120, 0.72, 86.40),
  ('10000000-0000-4000-8000-000000000031', '10000000-0000-4000-8000-000000000021', 'Synthetic seasonal rent installment', 1, 875.00, 875.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.payments (id, invoice_id, camper_id, amount_paid, payment_method, stripe_payment_id, paid_at)
VALUES ('10000000-0000-4000-8000-000000000040', '10000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000001', 875.00, 'Test payment', 'test_payment_never_send', now() - interval '29 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.account_credits
  (id, camper_id, lot_number, camper_name, original_amount, remaining_amount, reason, notes, status, created_by, applies_to, source_reference)
VALUES ('10000000-0000-4000-8000-000000000050', '10000000-0000-4000-8000-000000000001', 'TEST-01', 'Casey Camper', 25.00, 25.00, 'Synthetic staging credit', 'Never apply outside staging.', 'active', 'office.admin@staging.buroaks.invalid', 'general', 'TEST-CREDIT-0001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents
  (id, camper_id, document_name, document_type, signature_status, requires_two_signatures)
VALUES ('10000000-0000-4000-8000-000000000060', '10000000-0000-4000-8000-000000000001', 'Synthetic Seasonal Agreement', 'Seasonal Agreement', 'not_sent', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.electric_readings
  (id, lot_id, camper_id, previous_reading, current_reading, kwh_used, rate_per_kwh, reading_date, amount_due, invoice_id)
VALUES ('10000000-0000-4000-8000-000000000070', '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000001', 1000, 1120, 120, 0.72, CURRENT_DATE - 7, 86.40, '10000000-0000-4000-8000-000000000020')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.maintenance_tickets
  (id, title, description, category, status, reported_by, lot_number, priority, admin_approved, approved_at, approved_by, camper_id)
VALUES ('10000000-0000-4000-8000-000000000080', 'Synthetic water hookup check', 'Staging journey fixture; no real work order.', 'Water', 'Open', 'Casey Camper', 'TEST-01', 'Normal', true, now(), 'office.admin@staging.buroaks.invalid', '10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.sewer_pump_out_requests
  (id, camper_id, lot_number, camper_name, status, charge_amount, notes, gallons_used)
VALUES ('10000000-0000-4000-8000-000000000090', '10000000-0000-4000-8000-000000000001', 'TEST-01', 'Casey Camper', 'requested', 10.00, 'Synthetic staging request; never dispatch.', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.season_renewals
  (id, camper_id, lot_number, contract_start_date, contract_end_date, status, annual_rent, rent_payment_plan, audit_reason, audit_actor)
VALUES ('10000000-0000-4000-8000-000000000100', '10000000-0000-4000-8000-000000000001', 'TEST-01', CURRENT_DATE, CURRENT_DATE + 365, 'Not Started', 1750.00, 'semiannual', 'Create synthetic staging renewal fixture', 'office.admin@staging.buroaks.invalid')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.events
  (id, title, description, event_date, start_time, end_time, location)
VALUES ('10000000-0000-4000-8000-000000000110', 'Synthetic Campfire', 'Staging-only event; never announce.', CURRENT_DATE + 7, '18:00', '20:00', 'TEST Recreation Area')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_rsvps (id, event_id, camper_id, response)
VALUES ('10000000-0000-4000-8000-000000000120', '10000000-0000-4000-8000-000000000110', '10000000-0000-4000-8000-000000000001', 'Going')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.office_messages
  (id, camper_id, lot_number, sender_role, sender_name, sender_email, body)
VALUES ('10000000-0000-4000-8000-000000000130', '10000000-0000-4000-8000-000000000001', 'TEST-01', 'camper', 'Casey Camper', 'camper.one@staging.buroaks.invalid', 'Synthetic staging message. No response or delivery is required.')
ON CONFLICT (id) DO NOTHING;

COMMIT;
