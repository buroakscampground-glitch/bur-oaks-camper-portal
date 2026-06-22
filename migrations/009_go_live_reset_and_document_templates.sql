-- GO-LIVE RESET: preserve Rachel and Anthony, add Dawn as an admin,
-- clear test operations,
-- and add a private unassigned document-template library.

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name text NOT NULL,
  document_type text NOT NULL DEFAULT 'Lease Template',
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_templates_admin_full_access ON public.document_templates;
CREATE POLICY document_templates_admin_full_access ON public.document_templates
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

-- Admins may clean up objects from the retired Documents bucket.
DROP POLICY IF EXISTS legacy_documents_admin_select ON storage.objects;
DROP POLICY IF EXISTS legacy_documents_admin_delete ON storage.objects;
CREATE POLICY legacy_documents_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'Documents' AND (SELECT public.is_admin_user()));
CREATE POLICY legacy_documents_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'Documents' AND (SELECT public.is_admin_user()));

-- Clear camper assignments while preserving the lot/site configuration itself.
UPDATE public.lots SET camper_id = NULL;

-- Delete dependent/test operational data before removing camper records.
DELETE FROM public.invoice_items;
DELETE FROM public.invoices;
DELETE FROM public.event_rsvps;
DELETE FROM public.events;
DELETE FROM public.announcements;
DELETE FROM public.electric_readings;
DELETE FROM public.documents;
DELETE FROM public.document_templates;
DELETE FROM public.text_reminders;
DELETE FROM public.gate_cards;
DELETE FROM public.maintenance_tickets;
DELETE FROM public.waitlist;
DELETE FROM public.stripe_webhook_events;

DELETE FROM public.campers
WHERE LOWER(email) NOT IN (
  'signatureflooring2023@gmail.com',
  'buroakscampground@gmail.com',
  'dlfinlee@gmail.com'
);

INSERT INTO public.campers (
  email,
  first_name,
  last_name,
  lot_number,
  role,
  active
)
SELECT
  'dlfinlee@gmail.com',
  'Dawn',
  'Finley',
  '1003',
  'admin',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.campers
  WHERE LOWER(email) = 'dlfinlee@gmail.com'
);

UPDATE public.campers
SET lot_number = CASE
  WHEN LOWER(email) = 'signatureflooring2023@gmail.com' THEN '1001'
  WHEN LOWER(email) = 'buroakscampground@gmail.com' THEN '1002'
  WHEN LOWER(email) = 'dlfinlee@gmail.com' THEN '1003'
  ELSE lot_number::text
END,
role = CASE
  WHEN LOWER(email) = 'signatureflooring2023@gmail.com' THEN 'camper'
  WHEN LOWER(email) = 'buroakscampground@gmail.com' THEN 'admin'
  WHEN LOWER(email) = 'dlfinlee@gmail.com' THEN 'admin'
  ELSE role
END,
active = true,
phone = NULL,
emergency_contact_name = NULL,
emergency_contact_phone = NULL,
vehicle_make = NULL,
vehicle_model = NULL,
license_plate = NULL,
golf_cart_make = NULL,
golf_cart_color = NULL,
directory_opt_in = false,
directory_show_phone = false
WHERE LOWER(email) IN (
  'signatureflooring2023@gmail.com',
  'buroakscampground@gmail.com',
  'dlfinlee@gmail.com'
);

COMMIT;

-- Intentional: auth.users are not deleted. Removed users cannot access portal
-- data because they no longer have a camper record. Delete old Auth users
-- separately only after confirming they are no longer needed.
