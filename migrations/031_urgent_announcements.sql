ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS announcements_active_urgent_created_idx
  ON public.announcements (is_active, is_urgent, created_at DESC);
