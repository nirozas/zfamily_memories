-- Migration to support solid Google Photos playback without Google Drive
-- 1. Add google_id column to family_media and memories
ALTER TABLE public.family_media ADD COLUMN IF NOT EXISTS google_id TEXT;
-- We use memories too? Let's check if it exists.
-- ALTER TABLE public.memories ADD COLUMN IF NOT EXISTS google_id TEXT;

-- 2. Backfill google_id from metadata if possible (checking multiple common keys)
UPDATE public.family_media 
SET google_id = COALESCE(
    metadata->>'googlePhotoId',
    metadata->>'photoId',
    metadata->>'externalId',
    metadata->>'driveFileId',
    metadata->>'id'
)
WHERE google_id IS NULL AND (
    (metadata->>'googlePhotoId') IS NOT NULL OR 
    (metadata->>'photoId') IS NOT NULL OR
    (metadata->>'externalId') IS NOT NULL OR
    (metadata->>'driveFileId') IS NOT NULL OR
    (metadata->>'id') IS NOT NULL
);

-- 3. Create index for faster resolution
CREATE INDEX IF NOT EXISTS idx_family_media_google_id ON public.family_media(google_id);
