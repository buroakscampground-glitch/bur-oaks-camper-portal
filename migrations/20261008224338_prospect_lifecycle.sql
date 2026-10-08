-- Add a durable, admin-only prospect lifecycle without changing existing waitlist rows.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_contact_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_follow_up_on date,
  ADD COLUMN IF NOT EXISTS tour_scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS tour_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_made_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS waitlist_follow_up_queue_idx
  ON public.waitlist (next_follow_up_on, status, created_at)
  WHERE removed_at IS NULL AND status NOT IN ('Converted', 'Declined', 'Removed');

CREATE TABLE IF NOT EXISTS public.waitlist_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_id uuid NOT NULL REFERENCES public.waitlist(id) ON DELETE CASCADE,
  activity_type text NOT NULL CHECK (activity_type IN (
    'note', 'call', 'email', 'tour_scheduled', 'tour_completed',
    'follow_up', 'offer_made', 'status_changed', 'converted'
  )),
  detail text CHECK (detail IS NULL OR char_length(detail) <= 2000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  follow_up_on date,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS waitlist_activities_timeline_idx
  ON public.waitlist_activities (waitlist_id, occurred_at DESC, created_at DESC);

ALTER TABLE public.waitlist_activities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.waitlist_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.waitlist_activities TO authenticated;
GRANT ALL ON TABLE public.waitlist_activities TO service_role;

DROP POLICY IF EXISTS waitlist_activities_admin_select ON public.waitlist_activities;
CREATE POLICY waitlist_activities_admin_select
  ON public.waitlist_activities
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.record_waitlist_activity_atomic(
  p_waitlist_id uuid,
  p_activity_type text,
  p_detail text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT now(),
  p_follow_up_on date DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_recorded_by text DEFAULT NULL,
  p_converted_camper_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  activity_id uuid;
  normalized_detail text := NULLIF(btrim(COALESCE(p_detail, '')), '');
BEGIN
  IF p_activity_type NOT IN (
    'note', 'call', 'email', 'tour_scheduled', 'tour_completed',
    'follow_up', 'offer_made', 'status_changed', 'converted'
  ) THEN
    RAISE EXCEPTION 'Unsupported prospect activity type';
  END IF;

  IF normalized_detail IS NOT NULL AND char_length(normalized_detail) > 2000 THEN
    RAISE EXCEPTION 'Prospect activity detail is too long';
  END IF;

  IF p_new_status IS NOT NULL AND p_new_status NOT IN ('Waiting', 'Contacted', 'Accepted', 'Converted', 'Declined', 'Removed') THEN
    RAISE EXCEPTION 'Unsupported prospect status';
  END IF;

  IF p_activity_type = 'converted' AND (p_new_status IS DISTINCT FROM 'Converted' OR p_converted_camper_id IS NULL) THEN
    RAISE EXCEPTION 'Converted activity requires the camper record';
  END IF;

  PERFORM 1 FROM public.waitlist WHERE id = p_waitlist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prospect record not found';
  END IF;

  INSERT INTO public.waitlist_activities (
    waitlist_id, activity_type, detail, occurred_at, follow_up_on, recorded_by
  ) VALUES (
    p_waitlist_id, p_activity_type, normalized_detail, COALESCE(p_occurred_at, now()),
    p_follow_up_on, NULLIF(btrim(COALESCE(p_recorded_by, '')), '')
  ) RETURNING id INTO activity_id;

  UPDATE public.waitlist
  SET
    status = COALESCE(p_new_status, status),
    removed_at = CASE
      WHEN p_new_status = 'Removed' THEN COALESCE(removed_at, now())
      WHEN p_new_status IS NOT NULL THEN NULL
      ELSE removed_at
    END,
    last_contact_at = CASE
      WHEN p_activity_type IN ('call', 'email', 'tour_completed', 'offer_made', 'converted')
        THEN COALESCE(p_occurred_at, now())
      ELSE last_contact_at
    END,
    next_follow_up_on = CASE
      WHEN p_activity_type = 'converted' OR p_new_status IN ('Declined', 'Removed') THEN NULL
      WHEN p_follow_up_on IS NOT NULL OR p_activity_type = 'follow_up' THEN p_follow_up_on
      ELSE next_follow_up_on
    END,
    tour_scheduled_at = CASE WHEN p_activity_type = 'tour_scheduled' THEN COALESCE(p_occurred_at, now()) ELSE tour_scheduled_at END,
    tour_completed_at = CASE WHEN p_activity_type = 'tour_completed' THEN COALESCE(p_occurred_at, now()) ELSE tour_completed_at END,
    offer_made_at = CASE WHEN p_activity_type = 'offer_made' THEN COALESCE(p_occurred_at, now()) ELSE offer_made_at END,
    converted_at = CASE WHEN p_activity_type = 'converted' THEN COALESCE(p_occurred_at, now()) ELSE converted_at END,
    converted_camper_id = CASE WHEN p_activity_type = 'converted' THEN p_converted_camper_id ELSE converted_camper_id END,
    updated_at = now()
  WHERE id = p_waitlist_id;

  RETURN jsonb_build_object('activityId', activity_id, 'waitlistId', p_waitlist_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_waitlist_activity_atomic(uuid, text, text, timestamptz, date, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_waitlist_activity_atomic(uuid, text, text, timestamptz, date, text, text, uuid) TO service_role;

COMMENT ON TABLE public.waitlist_activities IS 'Append-only office history for prospect calls, emails, tours, follow-ups, offers, status changes, and camper conversion.';
COMMENT ON FUNCTION public.record_waitlist_activity_atomic(uuid, text, text, timestamptz, date, text, text, uuid) IS 'Server-only atomic prospect activity and lifecycle update.';
