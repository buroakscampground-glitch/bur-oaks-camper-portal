-- Private maintenance-ticket photos with authenticated, role-aware access.

ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-photos',
  'maintenance-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS maintenance_photos_camper_upload ON storage.objects;
CREATE POLICY maintenance_photos_camper_upload
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS maintenance_photos_authorized_view ON storage.objects;
CREATE POLICY maintenance_photos_authorized_view
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'maintenance-photos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1
        FROM public.campers c
        WHERE LOWER(c.email) = LOWER(auth.jwt() ->> 'email')
          AND LOWER(COALESCE(c.role, '')) IN ('admin', 'maintenance')
      )
    )
  );

DROP POLICY IF EXISTS maintenance_photos_camper_delete ON storage.objects;
CREATE POLICY maintenance_photos_camper_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'maintenance-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
