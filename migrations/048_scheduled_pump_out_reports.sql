-- Delivery log and duplicate protection for Monday pump-out reports.

CREATE TABLE IF NOT EXISTS public.scheduled_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL,
  report_date date NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'sent', 'partial', 'failed')),
  item_count integer NOT NULL DEFAULT 0,
  office_email_status text,
  printer_email_status text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_key, report_date)
);

CREATE INDEX IF NOT EXISTS scheduled_reports_recent_idx
  ON public.scheduled_reports (report_key, report_date DESC);

ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_reports_admin_access ON public.scheduled_reports;
CREATE POLICY scheduled_reports_admin_access ON public.scheduled_reports
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin_user()))
  WITH CHECK ((SELECT public.is_admin_user()));
