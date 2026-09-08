-- A completed pump-out may still be waiting to be included on the next electric
-- invoice. That pending charge must not block a new weekly pump-out request.

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
  existing_row public.sewer_pump_out_requests%ROWTYPE;
  created_row public.sewer_pump_out_requests%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_camper_id::text, 0));

  SELECT * INTO existing_row
  FROM public.sewer_pump_out_requests
  WHERE camper_id = p_camper_id
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
    p_lot_number,
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
