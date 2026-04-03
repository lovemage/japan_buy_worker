-- Allow Pro members to change slug once in admin
ALTER TABLE stores ADD COLUMN slug_change_used INTEGER NOT NULL DEFAULT 0;
