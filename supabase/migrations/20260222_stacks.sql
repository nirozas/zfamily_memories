-- Create the stacks table to store named media stacks (stories)
CREATE TABLE IF NOT EXISTS public.stacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES public.family_groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    participants TEXT[] DEFAULT '{}',
    hashtags TEXT[] DEFAULT '{}',
    music_url TEXT,
    music_name TEXT,
    cover_url TEXT,
    media_items JSONB DEFAULT '[]', -- Array of { id, url, type, caption, annotations }
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.stacks ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Family members can view stacks" ON public.stacks;
DROP POLICY IF EXISTS "Users can manage their own stacks" ON public.stacks;

CREATE POLICY "Family members can view stacks"
    ON public.stacks FOR SELECT
    USING (
        family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Users can manage their own stacks"
    ON public.stacks FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_stacks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_stacks_updated_at ON public.stacks;
CREATE TRIGGER trigger_update_stacks_updated_at
    BEFORE UPDATE ON public.stacks
    FOR EACH ROW EXECUTE FUNCTION update_stacks_updated_at();
