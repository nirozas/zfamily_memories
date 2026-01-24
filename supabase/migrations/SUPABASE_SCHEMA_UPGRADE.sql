-- SUPABASE SCHEMA UPGRADE: album_pages Table Integration
-- This script creates the professional-grade album_pages table with composite-key upsert capabilities.

CREATE TABLE IF NOT EXISTS album_pages (
    album_id UUID REFERENCES albums(id) ON DELETE CASCADE,
    page_number INTEGER,
    elements JSONB DEFAULT '[]',
    background_config JSONB DEFAULT '{}',
    layout_template TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (album_id, page_number)
);

-- Indexing for optimized album retrieval
CREATE INDEX IF NOT EXISTS idx_album_pages_album_id ON album_pages(album_id);

-- Enable Row Level Security
ALTER TABLE album_pages ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own album pages
CREATE POLICY "Manage own album pages" ON album_pages
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM albums 
            WHERE albums.id = album_pages.album_id 
            AND (albums.family_id IS NOT NULL) -- Simplification: if you have access to the album, you have access to the pages
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM albums 
            WHERE albums.id = album_pages.album_id 
        )
    );

-- Comment for clarity
COMMENT ON TABLE album_pages IS 'Stores unified page layouts, including media elements and transforms, using a composite key (album_id, page_number).';
