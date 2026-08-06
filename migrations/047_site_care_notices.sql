-- Friendly, trackable site upkeep notices from the office to campers.

CREATE TABLE IF NOT EXISTS public.site_care_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  lot_number text,
  template_key text,
  title text NOT NULL,
  message text NOT NULL,
  priority text NOT NULL DEFAULT 'Standard' CHECK (priority IN ('Standard', 'Important')),
  status text NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'Acknowledged', 'Ready for Review', 'Resolved')),
  due_date date,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  ready_for_review_at timestamptz,
  resolved_at timestamptz,
  resolved_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS site_care_notices_active_idx
  ON public.site_care_notices (status, created_at DESC);

CREATE INDEX IF NOT EXISTS site_care_notices_camper_idx
  ON public.site_care_notices (camper_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_site_care_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS site_care_notices_touch ON public.site_care_notices;
CREATE TRIGGER site_care_notices_touch
  BEFORE UPDATE ON public.site_care_notices
  FOR EACH ROW EXECUTE FUNCTION public.touch_site_care_notice();

ALTER TABLE public.site_care_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_care_notices_admin_full_access ON public.site_care_notices;
CREATE POLICY site_care_notices_admin_full_access ON public.site_care_notices
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));

DROP POLICY IF EXISTS site_care_notices_camper_select ON public.site_care_notices;
CREATE POLICY site_care_notices_camper_select ON public.site_care_notices
  FOR SELECT TO authenticated
  USING (camper_id = (SELECT public.current_camper_id()));
