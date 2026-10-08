-- Immutable, append-only approval receipts for the read-only daily money closeout.
-- This migration creates proof records only. It does not update or delete any
-- camper, invoice, payment, credit, payout, or meter-reading data.

CREATE TABLE IF NOT EXISTS public.daily_closeout_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  closeout_date date NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  approved_at timestamptz NOT NULL DEFAULT now(),
  approved_by_user_id uuid NOT NULL,
  approved_by text NOT NULL CHECK (char_length(btrim(approved_by)) BETWEEN 3 AND 320),
  source_verified_at timestamptz NOT NULL,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  approval_note text CHECK (approval_note IS NULL OR char_length(approval_note) BETWEEN 5 AND 1000),
  supersedes_id uuid REFERENCES public.daily_closeout_approvals(id) ON DELETE RESTRICT,
  UNIQUE (closeout_date, revision)
);

CREATE INDEX IF NOT EXISTS daily_closeout_approvals_date_idx
  ON public.daily_closeout_approvals (closeout_date DESC, revision DESC);

ALTER TABLE public.daily_closeout_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.daily_closeout_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.daily_closeout_approvals TO authenticated;
GRANT ALL ON TABLE public.daily_closeout_approvals TO service_role;

DROP POLICY IF EXISTS daily_closeout_approvals_admin_select ON public.daily_closeout_approvals;
CREATE POLICY daily_closeout_approvals_admin_select ON public.daily_closeout_approvals
  FOR SELECT TO authenticated USING ((SELECT public.is_admin_user()));

CREATE OR REPLACE FUNCTION public.block_daily_closeout_approval_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Daily closeout approvals are immutable and append-only.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS daily_closeout_approvals_immutable ON public.daily_closeout_approvals;
CREATE TRIGGER daily_closeout_approvals_immutable
  BEFORE UPDATE OR DELETE ON public.daily_closeout_approvals
  FOR EACH ROW EXECUTE FUNCTION public.block_daily_closeout_approval_mutation();

CREATE OR REPLACE FUNCTION public.approve_daily_closeout_atomic(
  p_closeout_date date,
  p_source_verified_at timestamptz,
  p_source_snapshot jsonb,
  p_approved_by_user_id uuid,
  p_approved_by text,
  p_approval_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  normalized_actor text := NULLIF(btrim(COALESCE(p_approved_by, '')), '');
  normalized_note text := NULLIF(btrim(COALESCE(p_approval_note, '')), '');
  next_revision integer;
  prior_id uuid;
  approval_row public.daily_closeout_approvals%ROWTYPE;
BEGIN
  IF p_closeout_date IS NULL OR p_source_verified_at IS NULL OR p_approved_by_user_id IS NULL THEN
    RAISE EXCEPTION 'Closeout date, verification time, and approving user are required.';
  END IF;
  IF normalized_actor IS NULL OR char_length(normalized_actor) NOT BETWEEN 3 AND 320 THEN
    RAISE EXCEPTION 'A valid approving user is required.';
  END IF;
  IF p_source_snapshot IS NULL OR jsonb_typeof(p_source_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'A valid closeout snapshot is required.';
  END IF;
  IF p_source_snapshot->>'date' IS DISTINCT FROM p_closeout_date::text THEN
    RAISE EXCEPTION 'The snapshot date does not match the requested closeout date.';
  END IF;
  IF COALESCE((p_source_snapshot->>'readyToClose')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'The daily closeout is not ready for approval.';
  END IF;
  IF normalized_note IS NOT NULL AND char_length(normalized_note) NOT BETWEEN 5 AND 1000 THEN
    RAISE EXCEPTION 'Approval notes must be between 5 and 1000 characters.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('daily-closeout:' || p_closeout_date::text, 0));
  SELECT id, revision INTO prior_id, next_revision
  FROM public.daily_closeout_approvals
  WHERE closeout_date = p_closeout_date
  ORDER BY revision DESC
  LIMIT 1;
  next_revision := COALESCE(next_revision, 0) + 1;
  IF next_revision > 1 AND normalized_note IS NULL THEN
    RAISE EXCEPTION 'A correction note is required for a revised closeout approval.';
  END IF;

  INSERT INTO public.daily_closeout_approvals (
    closeout_date, revision, approved_by_user_id, approved_by, source_verified_at,
    source_snapshot, snapshot_sha256, approval_note, supersedes_id
  ) VALUES (
    p_closeout_date, next_revision, p_approved_by_user_id, normalized_actor, p_source_verified_at,
    p_source_snapshot,
    encode(extensions.digest(convert_to(p_source_snapshot::text, 'UTF8'), 'sha256'), 'hex'),
    normalized_note, prior_id
  ) RETURNING * INTO approval_row;

  RETURN jsonb_build_object(
    'id', approval_row.id,
    'date', approval_row.closeout_date,
    'revision', approval_row.revision,
    'approvedAt', approval_row.approved_at,
    'approvedBy', approval_row.approved_by,
    'sourceVerifiedAt', approval_row.source_verified_at,
    'snapshotSha256', approval_row.snapshot_sha256,
    'approvalNote', approval_row.approval_note,
    'supersedesId', approval_row.supersedes_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.block_daily_closeout_approval_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_daily_closeout_atomic(date, timestamptz, jsonb, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_daily_closeout_atomic(date, timestamptz, jsonb, uuid, text, text) TO service_role;

COMMENT ON TABLE public.daily_closeout_approvals IS 'Immutable signed daily closeout receipts. Corrections append a new revision and preserve prior receipts.';
COMMENT ON FUNCTION public.approve_daily_closeout_atomic(date, timestamptz, jsonb, uuid, text, text) IS 'Server-only atomic append of a verified, database-hashed daily closeout receipt.';
