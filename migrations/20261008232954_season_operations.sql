-- Protected, year-specific staff completion state for season opening and closing.
CREATE TABLE IF NOT EXISTS public.season_operation_tasks (
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  season_year integer NOT NULL CHECK (season_year BETWEEN 2020 AND 2100),
  phase text NOT NULL CHECK (phase IN ('opening', 'closing')),
  task_key text NOT NULL CHECK (task_key IN (
    'opening_site_inspection', 'opening_utilities_ready',
    'opening_insurance_not_required', 'opening_gate_not_required',
    'closing_gate_resolved', 'closing_site_secured',
    'closing_water_winterized', 'closing_property_confirmed',
    'closing_final_walkthrough'
  )),
  completed_at timestamptz,
  completed_by text,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (camper_id, season_year, phase, task_key)
);

CREATE TABLE IF NOT EXISTS public.season_operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  season_year integer NOT NULL CHECK (season_year BETWEEN 2020 AND 2100),
  phase text NOT NULL CHECK (phase IN ('opening', 'closing')),
  task_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('completed', 'reopened')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS season_operation_tasks_queue_idx
  ON public.season_operation_tasks (season_year, phase, completed_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS season_operation_events_camper_idx
  ON public.season_operation_events (camper_id, season_year, phase, created_at DESC);

ALTER TABLE public.season_operation_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_operation_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.season_operation_tasks, public.season_operation_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.season_operation_tasks, public.season_operation_events TO authenticated;
GRANT ALL ON TABLE public.season_operation_tasks, public.season_operation_events TO service_role;

DROP POLICY IF EXISTS season_operation_tasks_admin_select ON public.season_operation_tasks;
CREATE POLICY season_operation_tasks_admin_select ON public.season_operation_tasks
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));
DROP POLICY IF EXISTS season_operation_events_admin_select ON public.season_operation_events;
CREATE POLICY season_operation_events_admin_select ON public.season_operation_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.set_season_operation_task_atomic(
  p_camper_id uuid, p_season_year integer, p_phase text, p_task_key text,
  p_completed boolean, p_note text DEFAULT NULL, p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  normalized_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  action_name text := CASE WHEN p_completed THEN 'completed' ELSE 'reopened' END;
BEGIN
  IF p_season_year NOT BETWEEN 2020 AND 2100 OR p_phase NOT IN ('opening', 'closing') THEN
    RAISE EXCEPTION 'Unsupported season operation';
  END IF;
  IF p_task_key NOT IN (
    'opening_site_inspection', 'opening_utilities_ready',
    'opening_insurance_not_required', 'opening_gate_not_required',
    'closing_gate_resolved', 'closing_site_secured',
    'closing_water_winterized', 'closing_property_confirmed',
    'closing_final_walkthrough'
  ) OR split_part(p_task_key, '_', 1) <> p_phase THEN
    RAISE EXCEPTION 'Unsupported season task';
  END IF;
  IF normalized_note IS NOT NULL AND char_length(normalized_note) > 1000 THEN
    RAISE EXCEPTION 'Season task note is too long';
  END IF;
  PERFORM 1 FROM public.campers WHERE id = p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper record not found'; END IF;

  INSERT INTO public.season_operation_tasks (
    camper_id, season_year, phase, task_key, completed_at, completed_by, note, updated_at
  ) VALUES (
    p_camper_id, p_season_year, p_phase, p_task_key,
    CASE WHEN p_completed THEN now() ELSE NULL END,
    CASE WHEN p_completed THEN NULLIF(btrim(COALESCE(p_actor, '')), '') ELSE NULL END,
    normalized_note, now()
  ) ON CONFLICT (camper_id, season_year, phase, task_key) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    note = EXCLUDED.note,
    updated_at = now();

  INSERT INTO public.season_operation_events
    (camper_id, season_year, phase, task_key, action, note, actor)
  VALUES
    (p_camper_id, p_season_year, p_phase, p_task_key, action_name, normalized_note,
     NULLIF(btrim(COALESCE(p_actor, '')), ''));

  RETURN jsonb_build_object('camperId', p_camper_id, 'seasonYear', p_season_year,
    'phase', p_phase, 'taskKey', p_task_key, 'completed', p_completed);
END;
$$;

REVOKE ALL ON FUNCTION public.set_season_operation_task_atomic(uuid, integer, text, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_season_operation_task_atomic(uuid, integer, text, text, boolean, text, text) TO service_role;

COMMENT ON TABLE public.season_operation_tasks IS 'Current manual opening and closing completion state by camper and season.';
COMMENT ON TABLE public.season_operation_events IS 'Append-only history for seasonal operations task changes.';
COMMENT ON FUNCTION public.set_season_operation_task_atomic(uuid, integer, text, text, boolean, text, text) IS 'Server-only atomic season task update with append-only history.';
