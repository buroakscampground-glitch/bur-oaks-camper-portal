-- Sewer pump-out requests and monthly electric-bill charges.

CREATE TABLE IF NOT EXISTS public.sewer_pump_out_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text,
  camper_name text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  charge_amount numeric(10,2) NOT NULL DEFAULT 10.00,
  notes text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  billed_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  billed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sewer_pump_out_status_check
    CHECK (status IN ('requested', 'completed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS sewer_pump_out_requests_admin_idx
  ON public.sewer_pump_out_requests (status, billed_at, requested_at DESC);

CREATE INDEX IF NOT EXISTS sewer_pump_out_requests_camper_idx
  ON public.sewer_pump_out_requests (camper_id, requested_at DESC);

ALTER TABLE public.sewer_pump_out_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sewer_pump_out_requests_admin_full_access ON public.sewer_pump_out_requests;
CREATE POLICY sewer_pump_out_requests_admin_full_access
  ON public.sewer_pump_out_requests
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS sewer_pump_out_requests_camper_view_own ON public.sewer_pump_out_requests;
CREATE POLICY sewer_pump_out_requests_camper_view_own
  ON public.sewer_pump_out_requests
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS sewer_pump_out_requests_camper_insert_own ON public.sewer_pump_out_requests;
CREATE POLICY sewer_pump_out_requests_camper_insert_own
  ON public.sewer_pump_out_requests
  FOR INSERT TO authenticated
  WITH CHECK (camper_id = (SELECT public.current_camper_id()));
