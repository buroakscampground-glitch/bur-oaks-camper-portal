-- Holding-tank sites use a $15 sewer pump-out charge.
-- This updates open/unbilled requests that may have been created before the app-side rule was added.

UPDATE public.sewer_pump_out_requests
SET charge_amount = 15
WHERE billed_at IS NULL
  AND status <> 'cancelled'
  AND UPPER(TRIM(BOTH FROM lot_number::text)) IN (
    'F1',
    '4',
    '8',
    '9',
    '11',
    '12',
    '22',
    '25',
    '26',
    '30',
    '31',
    '33',
    '35',
    '35B',
    '37',
    '39',
    '44',
    '47',
    '48',
    '48A',
    '50',
    '51',
    '54',
    '57'
  );
