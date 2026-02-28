-- 1. Ensure the table exists
CREATE TABLE IF NOT EXISTS public.media_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    duration NUMERIC,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_favorite BOOLEAN DEFAULT FALSE,
    filename TEXT NOT NULL,
    resolution TEXT,
    size_mb NUMERIC(10, 2),
    storage_path TEXT,
    is_backed_up BOOLEAN DEFAULT FALSE,
    location_name TEXT,
    caption TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add family_id if it's missing (updates existing table seamlessly)
ALTER TABLE public.media_items ADD COLUMN IF NOT EXISTS family_id UUID;

-- 3. Fix the constraint for type (drops old constraints to prevent duplicates)
ALTER TABLE public.media_items DROP CONSTRAINT IF EXISTS media_items_type_check;
ALTER TABLE public.media_items ADD CONSTRAINT media_items_type_check CHECK (type IN ('image', 'video', 'photo'));

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies to prevent "already exists" errors
DROP POLICY IF EXISTS "Users can manage their own media items" ON public.media_items;
DROP POLICY IF EXISTS "Family members can view media items" ON public.media_items;
DROP POLICY IF EXISTS "Public Read Access for Background Music" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated Users can upload Background Music" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own Background Music" ON storage.objects;

-- 6. Recreate Policies
CREATE POLICY "Users can manage their own media items"
    ON public.media_items
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Family members can view media items"
    ON public.media_items
    FOR SELECT
    USING (true); 

-- 7. Triggers and Functions
CREATE OR REPLACE FUNCTION update_media_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_media_items_updated_at ON public.media_items;
CREATE TRIGGER trigger_update_media_items_updated_at
    BEFORE UPDATE ON public.media_items
    FOR EACH ROW
    EXECUTE FUNCTION update_media_items_updated_at();

-- 8. Ensure Storage Bucket exists for Custom Background Music
INSERT INTO storage.buckets (id, name, public) 
VALUES ('background_music', 'background_music', true) 
ON CONFLICT (id) DO NOTHING;

-- 9. Recreate Storage Policies
CREATE POLICY "Public Read Access for Background Music" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'background_music' );

CREATE POLICY "Authenticated Users can upload Background Music" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'background_music' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can delete their own Background Music" 
ON storage.objects FOR DELETE 
USING ( bucket_id = 'background_music' AND auth.uid() = owner);
