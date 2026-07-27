-- Optional camper birthday celebrations.
-- Birth years stay private; the portal API only returns month and day.

ALTER TABLE public.campers
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS second_profile_birthday date,
  ADD COLUMN IF NOT EXISTS birthday_celebration_opt_in boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.birthday_wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  recipient_camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  recipient_profile text NOT NULL CHECK (recipient_profile IN ('primary', 'secondary')),
  celebration_year integer NOT NULL CHECK (celebration_year >= 2026),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender_camper_id, recipient_camper_id, recipient_profile, celebration_year)
);

CREATE INDEX IF NOT EXISTS birthday_wishes_recipient_idx
  ON public.birthday_wishes (recipient_camper_id, recipient_profile, celebration_year);

ALTER TABLE public.birthday_wishes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS birthday_wishes_admin_full_access ON public.birthday_wishes;
CREATE POLICY birthday_wishes_admin_full_access ON public.birthday_wishes
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
