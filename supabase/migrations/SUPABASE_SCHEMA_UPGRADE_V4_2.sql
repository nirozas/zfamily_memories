-- SUPABASE SCHEMA UPGRADE V4.2: Deep Layout Persistence
-- This script updates the album_pages table to align with the nested content architecture.

ALTER TABLE album_pages RENAME COLUMN elements TO layout_json;

-- Ensure layout_json is initialized if it was null
UPDATE album_pages SET layout_json = '[]' WHERE layout_json IS NULL;

COMMENT ON COLUMN album_pages.layout_json IS 'Stores nested frame-and-content JSON structures to prevent stacking errors.';
