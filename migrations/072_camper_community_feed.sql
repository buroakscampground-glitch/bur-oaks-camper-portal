-- A private campground conversation feed with calm, email-first notifications.
-- All reads and writes go through authenticated server routes; no table is public.

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  lot_number text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  photo_path text,
  is_official boolean NOT NULL DEFAULT false,
  comments_enabled boolean NOT NULL DEFAULT true,
  request_id text UNIQUE,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_feed_idx
  ON public.community_posts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  lot_number text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 800),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_comments_post_idx
  ON public.community_comments (post_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, camper_id)
);

CREATE TABLE IF NOT EXISTS public.community_reads (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, camper_id)
);

CREATE TABLE IF NOT EXISTS public.community_notification_preferences (
  camper_id uuid PRIMARY KEY REFERENCES public.campers(id) ON DELETE CASCADE,
  community_mode text NOT NULL DEFAULT 'daily_summary' CHECK (community_mode IN ('daily_summary', 'right_away', 'portal_only')),
  replies_mode text NOT NULL DEFAULT 'right_away' CHECK (replies_mode IN ('daily_summary', 'right_away', 'portal_only')),
  official_mode text NOT NULL DEFAULT 'right_away' CHECK (official_mode IN ('daily_summary', 'right_away', 'portal_only')),
  quiet_hours_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reply', 'official')),
  message text NOT NULL,
  email_status text NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  email_provider_id text,
  email_error text,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_notifications_unread_idx
  ON public.community_notifications (camper_id, read_at, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS community_notifications_official_once_idx
  ON public.community_notifications (camper_id, post_id, kind)
  WHERE kind = 'official';

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  post_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.community_comments(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT 'Please review this content.',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS community_reports_status_idx
  ON public.community_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_digest_deliveries (
  camper_id uuid NOT NULL REFERENCES public.campers(id) ON DELETE CASCADE,
  digest_date date NOT NULL,
  post_count integer NOT NULL DEFAULT 0,
  email_status text NOT NULL DEFAULT 'sending' CHECK (email_status IN ('sending', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (camper_id, digest_date)
);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_digest_deliveries ENABLE ROW LEVEL SECURITY;
