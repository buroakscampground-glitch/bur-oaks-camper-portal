-- Keep the service queue and billing queue separate:
--   requested + unbilled = waiting for service
--   completed + unbilled = waiting for the next electric invoice

CREATE UNIQUE INDEX IF NOT EXISTS sewer_pump_out_one_open_request_per_lot_idx
  ON public.sewer_pump_out_requests ((UPPER(BTRIM(lot_number))))
  WHERE status = 'requested' AND billed_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sewer_pump_out_billing_requires_completion'
      AND conrelid = 'public.sewer_pump_out_requests'::regclass
  ) THEN
    ALTER TABLE public.sewer_pump_out_requests
      ADD CONSTRAINT sewer_pump_out_billing_requires_completion
      CHECK (
        status = 'completed'
        OR (billed_at IS NULL AND billed_invoice_id IS NULL)
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.request_sewer_pump_out_atomic(
  p_camper_id uuid,
  p_lot_number text,
  p_camper_name text,
  p_charge_amount numeric,
  p_notes text
)
RETURNS TABLE(request_row jsonb, duplicate boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_lot text := UPPER(BTRIM(COALESCE(p_lot_number, '')));
  existing_row public.sewer_pump_out_requests%ROWTYPE;
  created_row public.sewer_pump_out_requests%ROWTYPE;
BEGIN
  IF normalized_lot = '' THEN
    RAISE EXCEPTION 'A service lot is required.' USING ERRCODE = '22023';
  END IF;

  -- Lock by physical service lot, not billing account. One authorized account can
  -- manage multiple lots, and simultaneous requests for the same lot must coalesce.
  PERFORM pg_advisory_xact_lock(hashtextextended('pump-out:' || normalized_lot, 0));

  SELECT * INTO existing_row
  FROM public.sewer_pump_out_requests
  WHERE UPPER(BTRIM(lot_number)) = normalized_lot
    AND billed_at IS NULL
    AND status = 'requested'
  ORDER BY requested_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT to_jsonb(existing_row), true;
    RETURN;
  END IF;

  INSERT INTO public.sewer_pump_out_requests (
    camper_id, lot_number, camper_name, status, charge_amount, gallons_used, notes
  ) VALUES (
    p_camper_id,
    BTRIM(p_lot_number),
    LEFT(COALESCE(NULLIF(BTRIM(p_camper_name), ''), 'Camper'), 200),
    'requested',
    p_charge_amount,
    CASE WHEN p_charge_amount = 15.00 THEN 150 ELSE 30 END,
    NULLIF(LEFT(BTRIM(COALESCE(p_notes, '')), 500), '')
  )
  RETURNING * INTO created_row;

  RETURN QUERY SELECT to_jsonb(created_row), false;
END;
$$;

REVOKE ALL ON FUNCTION public.request_sewer_pump_out_atomic(uuid, text, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_sewer_pump_out_atomic(uuid, text, text, numeric, text) TO service_role;
