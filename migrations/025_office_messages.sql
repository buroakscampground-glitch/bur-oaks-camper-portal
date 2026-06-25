-- Private camper <-> office inbox messages.

CREATE TABLE IF NOT EXISTS public.office_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  lot_number text,
  sender_role text NOT NULL DEFAULT 'camper' CHECK (sender_role IN ('camper', 'admin')),
  sender_name text,
  sender_email text,
  body text NOT NULL CHECK (char_length(trim(body)) > 0),
  read_by_admin_at timestamptz,
  read_by_camper_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS office_messages_camper_created_idx
  ON public.office_messages (camper_id, created_at DESC);

CREATE INDEX IF NOT EXISTS office_messages_admin_unread_idx
  ON public.office_messages (sender_role, read_by_admin_at, created_at DESC)
  WHERE sender_role = 'camper';

CREATE INDEX IF NOT EXISTS office_messages_camper_unread_idx
  ON public.office_messages (camper_id, sender_role, read_by_camper_at, created_at DESC)
  WHERE sender_role = 'admin';

ALTER TABLE public.office_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS office_messages_admin_full_access ON public.office_messages;
CREATE POLICY office_messages_admin_full_access
  ON public.office_messages
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS office_messages_camper_view_own ON public.office_messages;
CREATE POLICY office_messages_camper_view_own
  ON public.office_messages
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS office_messages_camper_insert_own ON public.office_messages;
CREATE POLICY office_messages_camper_insert_own
  ON public.office_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    camper_id = (SELECT public.current_camper_id())
    AND sender_role = 'camper'
  );
