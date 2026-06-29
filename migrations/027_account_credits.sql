-- Camper account credits for overpayments, mistakes, and office adjustments.

CREATE TABLE IF NOT EXISTS public.account_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text,
  camper_name text NOT NULL,
  original_amount numeric(10,2) NOT NULL,
  remaining_amount numeric(10,2) NOT NULL,
  reason text NOT NULL DEFAULT 'Account credit',
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_credits_amount_check CHECK (original_amount > 0 AND remaining_amount >= 0),
  CONSTRAINT account_credits_status_check CHECK (status IN ('active', 'used', 'voided'))
);

CREATE TABLE IF NOT EXISTS public.account_credit_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_id uuid REFERENCES public.account_credits(id) ON DELETE CASCADE,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  amount_applied numeric(10,2) NOT NULL,
  applied_by text,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_credit_applications_amount_check CHECK (amount_applied > 0)
);

CREATE INDEX IF NOT EXISTS account_credits_camper_idx
  ON public.account_credits (camper_id, status, remaining_amount);

CREATE INDEX IF NOT EXISTS account_credit_applications_invoice_idx
  ON public.account_credit_applications (invoice_id);

ALTER TABLE public.account_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_credit_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_credits_admin_full_access ON public.account_credits;
CREATE POLICY account_credits_admin_full_access
  ON public.account_credits
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS account_credits_camper_view_own ON public.account_credits;
CREATE POLICY account_credits_camper_view_own
  ON public.account_credits
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS account_credit_applications_admin_full_access ON public.account_credit_applications;
CREATE POLICY account_credit_applications_admin_full_access
  ON public.account_credit_applications
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS account_credit_applications_camper_view_own ON public.account_credit_applications;
CREATE POLICY account_credit_applications_camper_view_own
  ON public.account_credit_applications
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
