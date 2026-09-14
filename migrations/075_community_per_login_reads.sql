-- Track Community post reads per signed-in person instead of once per campsite.
-- The original household-level read table remains intact for historical records.

CREATE TABLE IF NOT EXISTS public.community_login_reads (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  reader_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, camper_id, reader_id)
);

CREATE INDEX IF NOT EXISTS community_login_reads_reader_idx
  ON public.community_login_reads (camper_id, reader_id, read_at DESC);

ALTER TABLE public.community_login_reads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.community_login_reads FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.community_login_reads TO service_role;

-- Keep the existing "already seen" state during rollout so old posts do not
-- suddenly reappear as unread. Future reads are recorded per login.
INSERT INTO public.community_login_reads (post_id, camper_id, reader_id, read_at)
SELECT reads.post_id, reads.camper_id, users.id, reads.read_at
FROM public.community_reads AS reads
JOIN public.campers AS campers ON campers.id = reads.camper_id
JOIN auth.users AS users
  ON LOWER(COALESCE(users.email, '')) IN (
    LOWER(COALESCE(campers.email, '')),
    LOWER(COALESCE(campers.secondary_email, ''))
  )
WHERE COALESCE(users.email, '') <> ''
ON CONFLICT (post_id, camper_id, reader_id) DO NOTHING;
