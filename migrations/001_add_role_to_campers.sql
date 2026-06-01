-- Migration: add role support to campers
-- Default role is camper. Supported values are admin and camper.

ALTER TABLE campers
ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'camper';

ALTER TABLE campers
ADD CONSTRAINT IF NOT EXISTS campers_role_check CHECK (role IN ('admin', 'camper'));
