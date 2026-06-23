-- Saturday night dinner signups and potluck tracking.

CREATE TABLE IF NOT EXISTS public.saturday_dinner_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dinner_date date NOT NULL,
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text,
  camper_name text NOT NULL,
  attending_status text NOT NULL DEFAULT 'Going',
  bringing text,
  guest_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dinner_date, camper_id),
  CONSTRAINT saturday_dinner_signups_status_check
    CHECK (attending_status IN ('Going', 'Maybe', 'Not Going'))
);

CREATE INDEX IF NOT EXISTS saturday_dinner_signups_date_idx
  ON public.saturday_dinner_signups (dinner_date, attending_status);

ALTER TABLE public.saturday_dinner_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saturday_dinner_signups_admin_full_access ON public.saturday_dinner_signups;
CREATE POLICY saturday_dinner_signups_admin_full_access
  ON public.saturday_dinner_signups
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS saturday_dinner_signups_camper_view_own ON public.saturday_dinner_signups;
CREATE POLICY saturday_dinner_signups_camper_view_own
  ON public.saturday_dinner_signups
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS saturday_dinner_signups_camper_insert_own ON public.saturday_dinner_signups;
CREATE POLICY saturday_dinner_signups_camper_insert_own
  ON public.saturday_dinner_signups
  FOR INSERT TO authenticated
  WITH CHECK (camper_id = (SELECT public.current_camper_id()));

DROP POLICY IF EXISTS saturday_dinner_signups_camper_update_own ON public.saturday_dinner_signups;
CREATE POLICY saturday_dinner_signups_camper_update_own
  ON public.saturday_dinner_signups
  FOR UPDATE TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()))
  WITH CHECK (camper_id = (SELECT public.current_camper_id()));
