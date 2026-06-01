-- Migration: enable row level security for documents
-- Admin users may fully manage all documents.
-- Campers may only view documents assigned to their own camper record.

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS documents_camper_id_idx
  ON documents (camper_id);

CREATE POLICY documents_admin_full_access
  ON documents
  FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE POLICY documents_camper_view_own
  ON documents
  FOR SELECT
  USING (camper_id = public.current_camper_id());
