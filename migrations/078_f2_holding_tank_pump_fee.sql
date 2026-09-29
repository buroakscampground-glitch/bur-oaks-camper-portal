-- Lot F2 is a holding-tank site and uses the $15 / 150-gallon pump-out rate.

UPDATE public.sewer_pump_out_requests
SET charge_amount = 15,
    gallons_used = 150,
    updated_at = now()
WHERE billed_at IS NULL
  AND status <> 'cancelled'
  AND UPPER(TRIM(BOTH FROM lot_number::text)) = 'F2'
  AND charge_amount = 10;
