-- RSVPs are informational and belong on the RSVP organizer, not in Needs Attention.
UPDATE public.admin_notifications
SET read_at = COALESCE(read_at, now())
WHERE type = 'event_rsvp'
  AND read_at IS NULL;

-- A pump-out alert is handled once the request is pumped, cancelled, or billed.
UPDATE public.admin_notifications notification
SET read_at = COALESCE(notification.read_at, now())
WHERE notification.type = 'sewer_pump_out'
  AND notification.read_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.sewer_pump_out_requests request
    WHERE request.id::text = notification.source_id
      AND (
        request.status IN ('completed', 'cancelled')
        OR request.billed_at IS NOT NULL
      )
  );
