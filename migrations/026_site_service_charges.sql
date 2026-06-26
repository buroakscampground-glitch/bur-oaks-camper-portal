-- Admin-created site service charges that attach to the next electric bill.

CREATE TABLE IF NOT EXISTS public.site_service_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text,
  camper_name text NOT NULL,
  service_type text NOT NULL,
  service_label text NOT NULL,
  charge_amount numeric(10,2) NOT NULL,
  notes text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  billed_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  billed_at timestamptz,
  cancelled_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_service_charges_type_check
    CHECK (service_type IN ('full_weed_eat', 'half_weed_eat', 'spray_weeds', 'half_spray_weeds', 'pressure_wash'))
);

CREATE INDEX IF NOT EXISTS site_service_charges_admin_idx
  ON public.site_service_charges (billed_at, cancelled_at, performed_at DESC);

CREATE INDEX IF NOT EXISTS site_service_charges_camper_idx
  ON public.site_service_charges (camper_id, billed_at, cancelled_at);

ALTER TABLE public.site_service_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_service_charges_admin_full_access ON public.site_service_charges;
CREATE POLICY site_service_charges_admin_full_access
  ON public.site_service_charges
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS site_service_charges_camper_view_own ON public.site_service_charges;
CREATE POLICY site_service_charges_camper_view_own
  ON public.site_service_charges
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
