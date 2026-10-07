-- Add indexes for foreign-key lookups that production activity shows are used
-- frequently. These indexes contain no new data and do not modify table rows.

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx
  ON public.invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS admin_notifications_camper_type_idx
  ON public.admin_notifications (camper_id, type);

CREATE INDEX IF NOT EXISTS meter_reading_submissions_camper_idx
  ON public.meter_reading_submissions (camper_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS meter_reading_submissions_invoice_id_idx
  ON public.meter_reading_submissions (invoice_id)
  WHERE invoice_id IS NOT NULL;

-- Guard the postcondition so a partially applied migration cannot pass quietly.
DO $$
DECLARE
  expected_index text;
BEGIN
  FOREACH expected_index IN ARRAY ARRAY[
    'invoice_items_invoice_id_idx',
    'admin_notifications_camper_type_idx',
    'meter_reading_submissions_camper_idx',
    'meter_reading_submissions_invoice_id_idx'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class index_relation
      JOIN pg_namespace index_namespace
        ON index_namespace.oid = index_relation.relnamespace
      JOIN pg_index index_metadata
        ON index_metadata.indexrelid = index_relation.oid
      WHERE index_namespace.nspname = 'public'
        AND index_relation.relname = expected_index
        AND index_metadata.indisvalid
        AND index_metadata.indisready
    ) THEN
      RAISE EXCEPTION 'Expected valid index % is missing.', expected_index;
    END IF;
  END LOOP;
END $$;
