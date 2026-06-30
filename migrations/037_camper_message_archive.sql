-- Let campers clear old office inbox messages from their own portal view
-- without deleting the office-side history.

ALTER TABLE public.office_messages
  ADD COLUMN IF NOT EXISTS camper_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS office_messages_camper_visible_idx
  ON public.office_messages (camper_id, camper_archived_at, created_at DESC);
