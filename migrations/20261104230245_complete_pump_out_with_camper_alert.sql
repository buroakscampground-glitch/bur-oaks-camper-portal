-- Complete a pump-out and create the camper's unread portal alert in one short
-- transaction. External text delivery happens afterward so no provider call
-- can hold a database lock.

CREATE UNIQUE INDEX IF NOT EXISTS text_reminders_pump_out_completion_once_idx
  ON public.text_reminders (automation_key)
  WHERE reminder_type = 'Pump-Out Complete'
    AND automation_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_sewer_pump_out_with_notification(
  p_request_id uuid,
  p_actor_email text
)
RETURNS TABLE(request_row jsonb, duplicate boolean, message_row jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  completed_on timestamptz := now();
  pump_request public.sewer_pump_out_requests%ROWTYPE;
  camper_message public.office_messages%ROWTYPE;
  portal_message text;
BEGIN
  SELECT * INTO pump_request
  FROM public.sewer_pump_out_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pump-out request not found.' USING ERRCODE = 'P0002';
  END IF;

  IF pump_request.status = 'completed' THEN
    RETURN QUERY SELECT to_jsonb(pump_request), true, NULL::jsonb;
    RETURN;
  END IF;

  IF pump_request.status <> 'requested' OR pump_request.billed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This pump-out is no longer pending.' USING ERRCODE = '22023';
  END IF;

  IF pump_request.camper_id IS NULL THEN
    RAISE EXCEPTION 'This pump-out is not connected to a camper account.' USING ERRCODE = '23502';
  END IF;

  UPDATE public.sewer_pump_out_requests
  SET status = 'completed', completed_at = completed_on, updated_at = completed_on
  WHERE id = pump_request.id
  RETURNING * INTO pump_request;

  portal_message := 'Your sewer pump-out for Site '
    || COALESCE(NULLIF(BTRIM(pump_request.lot_number), ''), 'your campsite')
    || ' has been completed. The service charge will be added to your next electric bill.';

  INSERT INTO public.office_messages (
    camper_id,
    lot_number,
    sender_role,
    sender_name,
    sender_email,
    body,
    read_by_admin_at,
    read_by_camper_at,
    created_at
  ) VALUES (
    pump_request.camper_id,
    pump_request.lot_number,
    'admin',
    'Bur Oaks Office',
    COALESCE(NULLIF(BTRIM(p_actor_email), ''), 'Bur Oaks Office'),
    portal_message,
    completed_on,
    NULL,
    completed_on
  )
  RETURNING * INTO camper_message;

  RETURN QUERY SELECT to_jsonb(pump_request), false, to_jsonb(camper_message);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_sewer_pump_out_with_notification(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_sewer_pump_out_with_notification(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.complete_sewer_pump_out_with_notification(uuid, text) IS
  'Atomically completes one pending pump-out and creates one unread camper portal message. Service role only.';

-- Rollback: keep existing completion messages and text history, then drop the
-- function and partial index after application code no longer calls the RPC.
