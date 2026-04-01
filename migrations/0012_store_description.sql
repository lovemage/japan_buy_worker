-- Add store description field
ALTER TABLE stores ADD COLUMN description TEXT NOT NULL DEFAULT '';
