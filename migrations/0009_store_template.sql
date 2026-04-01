-- Add template column to stores table
ALTER TABLE stores ADD COLUMN template TEXT NOT NULL DEFAULT 'default';
