-- Migration to add metadata column to family_media
ALTER TABLE public.family_media ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Also ensure media_items is fully aligned
ALTER TABLE public.media_items ALTER COLUMN size_mb SET DEFAULT 0;
ALTER TABLE public.media_items ALTER COLUMN filename SET DEFAULT 'unnamed';
