-- Add a protected manual-completion layer for the new-camper onboarding checklist.
CREATE TABLE IF NOT EXISTS public.camper_onboarding_tasks (
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  task_key text NOT NULL CHECK (task_key IN (
    'orientation_completed', 'welcome_completed',
    'insurance_not_required', 'gate_access_not_required'
  )),
  completed_at timestamptz,
  completed_by text,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (camper_id, task_key)
);

CREATE TABLE IF NOT EXISTS public.camper_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  task_key text NOT NULL CHECK (task_key IN (
    'orientation_completed', 'welcome_completed',
    'insurance_not_required', 'gate_access_not_required'
  )),
  action text NOT NULL CHECK (action IN ('completed', 'reopened')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS camper_onboarding_tasks_status_idx
  ON public.camper_onboarding_tasks (completed_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS camper_onboarding_events_camper_idx
  ON public.camper_onboarding_events (camper_id, created_at DESC);

ALTER TABLE public.camper_onboarding_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camper_onboarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.camper_onboarding_tasks, public.camper_onboarding_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.camper_onboarding_tasks, public.camper_onboarding_events TO authenticated;
GRANT ALL ON TABLE public.camper_onboarding_tasks, public.camper_onboarding_events TO service_role;

DROP POLICY IF EXISTS camper_onboarding_tasks_admin_select ON public.camper_onboarding_tasks;
CREATE POLICY camper_onboarding_tasks_admin_select ON public.camper_onboarding_tasks
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));
DROP POLICY IF EXISTS camper_onboarding_events_admin_select ON public.camper_onboarding_events;
CREATE POLICY camper_onboarding_events_admin_select ON public.camper_onboarding_events
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.set_camper_onboarding_task_atomic(
  p_camper_id uuid,
  p_task_key text,
  p_completed boolean,
  p_note text DEFAULT NULL,
  p_actor text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  normalized_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  action_name text := CASE WHEN p_completed THEN 'completed' ELSE 'reopened' END;
BEGIN
  IF p_task_key NOT IN (
    'orientation_completed', 'welcome_completed',
    'insurance_not_required', 'gate_access_not_required'
  ) THEN
    RAISE EXCEPTION 'Unsupported onboarding task';
  END IF;
  IF normalized_note IS NOT NULL AND char_length(normalized_note) > 1000 THEN
    RAISE EXCEPTION 'Onboarding note is too long';
  END IF;
  PERFORM 1 FROM public.campers WHERE id = p_camper_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Camper record not found'; END IF;

  INSERT INTO public.camper_onboarding_tasks (
    camper_id, task_key, completed_at, completed_by, note, updated_at
  ) VALUES (
    p_camper_id, p_task_key, CASE WHEN p_completed THEN now() ELSE NULL END,
    CASE WHEN p_completed THEN NULLIF(btrim(COALESCE(p_actor, '')), '') ELSE NULL END,
    normalized_note, now()
  ) ON CONFLICT (camper_id, task_key) DO UPDATE SET
    completed_at = EXCLUDED.completed_at,
    completed_by = EXCLUDED.completed_by,
    note = EXCLUDED.note,
    updated_at = now();

  INSERT INTO public.camper_onboarding_events (camper_id, task_key, action, note, actor)
  VALUES (p_camper_id, p_task_key, action_name, normalized_note, NULLIF(btrim(COALESCE(p_actor, '')), ''));

  RETURN jsonb_build_object('camperId', p_camper_id, 'taskKey', p_task_key, 'completed', p_completed);
END;
$$;

REVOKE ALL ON FUNCTION public.set_camper_onboarding_task_atomic(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_camper_onboarding_task_atomic(uuid, text, boolean, text, text) TO service_role;

COMMENT ON TABLE public.camper_onboarding_tasks IS 'Current manual completion state for new-camper orientation and physical handoffs.';
COMMENT ON TABLE public.camper_onboarding_events IS 'Append-only history of manual new-camper onboarding task changes.';
COMMENT ON FUNCTION public.set_camper_onboarding_task_atomic(uuid, text, boolean, text, text) IS 'Server-only atomic onboarding task update with append-only history.';
