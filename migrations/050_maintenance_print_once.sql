-- Print each approved maintenance work order once instead of repeating every morning.

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS work_order_printed_at timestamptz;

-- Everything that existed before this feature has already been handled or was included
-- in the August 10 test packet. Only work orders created or re-approved after this
-- migration should enter the new-print queue.
UPDATE public.maintenance_tickets
SET work_order_printed_at = now()
WHERE work_order_printed_at IS NULL;

CREATE INDEX IF NOT EXISTS maintenance_tickets_unprinted_work_orders_idx
  ON public.maintenance_tickets (created_at)
  WHERE admin_approved = true
    AND status <> 'Completed'
    AND work_order_printed_at IS NULL;
