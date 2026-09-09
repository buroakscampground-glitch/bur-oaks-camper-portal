-- Owner-only controls for deleting content and restricting Community access.
-- These controls never affect billing, documents, payments, or portal access.

CREATE TABLE IF NOT EXISTS public.community_member_controls (
  camper_id uuid PRIMARY KEY REFERENCES public.campers(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'active' CHECK (access_level IN ('active', 'read_only', 'blocked')),
  reason text,
  controlled_by uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_moderation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('hide', 'restore', 'delete_post', 'delete_comment', 'set_active', 'set_read_only', 'set_blocked')),
  target_camper_id uuid REFERENCES public.campers(id) ON DELETE SET NULL,
  post_id uuid,
  comment_id uuid,
  reason text,
  content_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_member_controls_level_idx
  ON public.community_member_controls (access_level, updated_at DESC);

CREATE INDEX IF NOT EXISTS community_moderation_log_date_idx
  ON public.community_moderation_log (created_at DESC);

ALTER TABLE public.community_member_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_moderation_log ENABLE ROW LEVEL SECURITY;

