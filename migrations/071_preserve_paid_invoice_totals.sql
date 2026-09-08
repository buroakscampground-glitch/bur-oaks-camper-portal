-- A paid invoice is historical proof of the full charge, not a $0 invoice.
-- Open invoices continue to use total_due as their remaining balance. When a
-- payment closes an invoice, preserve the original subtotal plus any late fee.

CREATE OR REPLACE FUNCTION public.preserve_paid_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS preserve_paid_invoice_total_trigger ON public.invoices;
CREATE TRIGGER preserve_paid_invoice_total_trigger
BEFORE INSERT OR UPDATE OF status, total_due ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.preserve_paid_invoice_total();

-- Repair only invoices that were reduced to zero by the atomic office-payment
-- allocator and still have the allocation audit proving the payment.
UPDATE public.invoices AS invoice
SET total_due = ROUND(COALESCE(invoice.subtotal, 0) + COALESCE(invoice.late_fee, 0), 2)
WHERE lower(COALESCE(invoice.status, '')) = 'paid'
  AND COALESCE(invoice.total_due, 0) = 0
  AND COALESCE(invoice.subtotal, 0) + COALESCE(invoice.late_fee, 0) > 0
  AND EXISTS (
    SELECT 1
    FROM public.manual_payment_allocations AS allocation
    WHERE allocation.invoice_id = invoice.id
  );

COMMENT ON FUNCTION public.preserve_paid_invoice_total() IS
  'Keeps paid invoices at their original charge total while open invoices retain a remaining balance.';
