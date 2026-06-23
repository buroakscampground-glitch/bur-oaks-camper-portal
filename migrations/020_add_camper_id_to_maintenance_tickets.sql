-- Add the missing camper link used by maintenance requests, notes, and alerts.
-- This fixes: "Could not find the 'camper_id' column of 'maintenance_tickets' in the schema cache"

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_tickets_camper_id_idx
  ON public.maintenance_tickets (camper_id);

-- Backfill existing tickets by matching their lot number to the camper list.
UPDATE public.maintenance_tickets AS ticket
SET camper_id = camper.id
FROM public.campers AS camper
WHERE ticket.camper_id IS NULL
  AND NULLIF(TRIM(ticket.lot_number), '') IS NOT NULL
  AND LOWER(TRIM(ticket.lot_number)) = LOWER(TRIM(camper.lot_number));

-- Ask PostgREST/Supabase API to refresh its schema cache right away.
NOTIFY pgrst, 'reload schema';
