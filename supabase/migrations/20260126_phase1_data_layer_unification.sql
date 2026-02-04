-- Phase 1: Data Layer Unification - Database Schema Fixes
-- Date: 2026-01-26
-- Purpose: Add missing columns and ensure schema integrity for album system refactor

-- ============================================================================
-- 1. Add total_pages to albums table (if not exists)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'albums' AND column_name = 'total_pages'
    ) THEN
        ALTER TABLE albums ADD COLUMN total_pages INTEGER DEFAULT 0;
        COMMENT ON COLUMN albums.total_pages IS 'Cached count of pages in this album for performance';
    END IF;
END $$;

-- ============================================================================
-- 2. Ensure creator_id exists in events table (Status 400 fix)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'events' AND column_name = 'creator_id'
    ) THEN
        ALTER TABLE events ADD COLUMN creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
        COMMENT ON COLUMN events.creator_id IS 'User who created this event';
    END IF;
END $$;

-- Note: created_by already exists as string | null, creator_id is the proper FK version

-- ============================================================================
-- 3. Add background_opacity to pages table (used in code but missing from types)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pages' AND column_name = 'background_opacity'
    ) THEN
        ALTER TABLE pages ADD COLUMN background_opacity NUMERIC(3,2) DEFAULT 1.0 CHECK (background_opacity >= 0 AND background_opacity <= 1);
        COMMENT ON COLUMN pages.background_opacity IS 'Opacity of background image (0.0 to 1.0)';
    END IF;
END $$;

-- ============================================================================
-- 4. Add layout_metadata to albums table (for caching layout info)
-- ============================================================================
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'albums' AND column_name = 'layout_metadata'
    ) THEN
        ALTER TABLE albums ADD COLUMN layout_metadata JSONB DEFAULT '{}';
        COMMENT ON COLUMN albums.layout_metadata IS 'Cached metadata about layouts used in album';
    END IF;
END $$;

-- ============================================================================
-- 5. Create function to auto-update total_pages
-- ============================================================================
CREATE OR REPLACE FUNCTION update_album_total_pages()
RETURNS TRIGGER AS $$
BEGIN
    -- Update total_pages count when album_pages are modified
    UPDATE albums
    SET total_pages = (
        SELECT COUNT(DISTINCT page_number)
        FROM album_pages
        WHERE album_id = COALESCE(NEW.album_id, OLD.album_id)
    )
    WHERE id = COALESCE(NEW.album_id, OLD.album_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_album_total_pages ON album_pages;

CREATE TRIGGER trigger_update_album_total_pages
AFTER INSERT OR UPDATE OR DELETE ON album_pages
FOR EACH ROW
EXECUTE FUNCTION update_album_total_pages();

-- ============================================================================
-- 6. Backfill total_pages for existing albums
-- ============================================================================
UPDATE albums
SET total_pages = (
    SELECT COUNT(DISTINCT page_number)
    FROM album_pages
    WHERE album_pages.album_id = albums.id
)
WHERE total_pages IS NULL OR total_pages = 0;

-- Also count from legacy pages table if album_pages is empty
UPDATE albums
SET total_pages = (
    SELECT COUNT(*)
    FROM pages
    WHERE pages.album_id = albums.id
)
WHERE total_pages = 0 AND EXISTS (
    SELECT 1 FROM pages WHERE pages.album_id = albums.id
);

-- ============================================================================
-- 7. Add indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_events_creator_id ON events(creator_id);
CREATE INDEX IF NOT EXISTS idx_albums_total_pages ON albums(total_pages);

-- ============================================================================
-- VALIDATION QUERIES (for testing)
-- ============================================================================
-- Run these to verify the migration worked:
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'albums' AND column_name IN ('total_pages', 'layout_metadata');
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'creator_id';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pages' AND column_name = 'background_opacity';
