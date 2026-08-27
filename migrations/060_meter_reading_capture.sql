-- Private field-captured meter photos and readings waiting for office review.

CREATE TABLE IF NOT EXISTS public.meter_reading_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  lot_number text NOT NULL,
  meter_number text,
  meter_code text NOT NULL,
  photo_path text NOT NULL,
  detected_reading numeric,
  submitted_reading numeric NOT NULL CHECK (submitted_reading >= 0),
  reviewed_reading numeric CHECK (reviewed_reading IS NULL OR reviewed_reading >= 0),
  ocr_confidence numeric,
  ocr_text text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retake', 'ready', 'used', 'cancelled')),
  captured_by uuid,
  captured_by_email text,
  captured_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meter_reading_submissions_status_idx
  ON public.meter_reading_submissions (status, captured_at DESC);

CREATE INDEX IF NOT EXISTS meter_reading_submissions_lot_idx
  ON public.meter_reading_submissions (lot_number, captured_at DESC);

ALTER TABLE public.meter_reading_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_reading_submissions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meter_reading_submissions_admin_access ON public.meter_reading_submissions;
CREATE POLICY meter_reading_submissions_admin_access
  ON public.meter_reading_submissions
  FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meter-reading-photos',
  'meter-reading-photos',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS meter_reading_photos_admin_view ON storage.objects;
CREATE POLICY meter_reading_photos_admin_view
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'meter-reading-photos' AND public.is_admin_user());
