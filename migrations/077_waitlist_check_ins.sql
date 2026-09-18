ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS last_check_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

CREATE INDEX IF NOT EXISTS waitlist_check_in_eligibility_idx
  ON public.waitlist (status, removed_at, last_check_in_at, created_at)
  WHERE email IS NOT NULL;

COMMENT ON COLUMN public.waitlist.last_check_in_at IS
  'Most recent successful periodic waitlist check-in email.';

COMMENT ON COLUMN public.waitlist.removed_at IS
  'When an applicant used the email removal option or was removed by staff.';
