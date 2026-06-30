-- Admin-adjustable card processing fee settings.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

INSERT INTO public.app_settings (key, value, description)
VALUES
  ('card_processing_fee_percent', '3', 'Card processing fee percentage charged to online card payments.'),
  ('card_processing_fee_flat_cents', '30', 'Flat card processing fee in cents charged to online card payments.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_settings_authenticated_select ON public.app_settings;
CREATE POLICY app_settings_authenticated_select
  ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS app_settings_admin_full_access ON public.app_settings;
CREATE POLICY app_settings_admin_full_access
  ON public.app_settings
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
