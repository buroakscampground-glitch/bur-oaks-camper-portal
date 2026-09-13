-- Friendly Community feed publishing, organization, and delivery visibility.

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_status_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_status_check
  CHECK (status IN ('published', 'scheduled', 'hidden'));

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS publish_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pinned_until timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS action_url text,
  ADD COLUMN IF NOT EXISTS send_text boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_category_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_category_check
  CHECK (category IN ('general', 'office', 'event', 'dinner', 'lost_found', 'marketplace'));

ALTER TABLE public.community_posts
  DROP CONSTRAINT IF EXISTS community_posts_action_type_check;

ALTER TABLE public.community_posts
  ADD CONSTRAINT community_posts_action_type_check
  CHECK (action_type IS NULL OR action_type IN ('events', 'dinners', 'contact', 'custom'));

CREATE INDEX IF NOT EXISTS community_posts_publish_idx
  ON public.community_posts (status, publish_at, created_at DESC);

CREATE INDEX IF NOT EXISTS community_posts_pinned_idx
  ON public.community_posts (pinned_until DESC NULLS LAST, created_at DESC);
