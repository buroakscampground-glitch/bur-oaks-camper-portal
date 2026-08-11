-- Require an office review before a seasonal renewal can be sent automatically.

ALTER TABLE public.season_renewals
  ADD COLUMN IF NOT EXISTS auto_send_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_send_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_notified_at timestamptz;

CREATE INDEX IF NOT EXISTS season_renewals_review_queue_idx
  ON public.season_renewals (status, review_notified_at, contract_end_date)
  WHERE renewal_sent_at IS NULL;
