-- Add tags column to products (JSON array, e.g. ["hot","limited"])
ALTER TABLE products ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
