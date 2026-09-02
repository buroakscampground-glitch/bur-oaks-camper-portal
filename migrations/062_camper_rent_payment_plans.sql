-- Keep each camper's renewal payment terms explicit instead of inferring them
-- every year from whatever invoices happen to remain in the prior term.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS rent_payment_plan text NOT NULL DEFAULT 'semiannual';

ALTER TABLE public.campers
  DROP CONSTRAINT IF EXISTS campers_rent_payment_plan_check;

ALTER TABLE public.campers
  ADD CONSTRAINT campers_rent_payment_plan_check
  CHECK (rent_payment_plan IN ('quarterly', 'semiannual'));

-- Everyone defaults to half-and-half. Preserve grandfathered quarterly terms
-- when the current contract year contains at least three distinct rent due
-- dates (tolerating one missing installment) or an invoice explicitly says
-- quarterly. Admins can correct the saved choice from the camper profile.
WITH inferred_quarterly AS (
  SELECT DISTINCT renewal.camper_id
  FROM public.season_renewals renewal
  JOIN public.invoices invoice ON invoice.camper_id = renewal.camper_id
  WHERE renewal.contract_end_date IS NOT NULL
    AND invoice.due_date >= (renewal.contract_end_date - INTERVAL '1 year')::date
    AND invoice.due_date < renewal.contract_end_date
    AND lower(coalesce(invoice.invoice_type, '')) LIKE '%rent%'
    AND (
      lower(coalesce(invoice.invoice_type, '')) LIKE '%lot%'
      OR lower(coalesce(invoice.invoice_type, '')) LIKE '%site%'
    )
    AND lower(coalesce(invoice.status, '')) NOT IN ('cancelled', 'canceled', 'void', 'refunded')
  GROUP BY renewal.camper_id
  HAVING count(DISTINCT invoice.due_date) >= 3
     OR bool_or(lower(coalesce(invoice.invoice_type, '')) LIKE '%quarter%')
)
UPDATE public.campers camper
SET rent_payment_plan = 'quarterly'
FROM inferred_quarterly inferred
WHERE camper.id = inferred.camper_id;

COMMENT ON COLUMN public.campers.rent_payment_plan IS
  'Renewal lot-rent installments: quarterly is grandfathered; semiannual is the standard half-and-half plan.';
