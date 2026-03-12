-- Create family_settings table
CREATE TABLE IF NOT EXISTS public.family_settings (
    family_id UUID PRIMARY KEY REFERENCES public.family_groups(id) ON DELETE CASCADE,
    hero_image_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.family_settings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Family members can view settings" ON public.family_settings
    FOR SELECT USING (
        family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())
    );

CREATE POLICY "Admins can manage settings" ON public.family_settings
    FOR ALL USING (
        family_id IN (
            SELECT family_id FROM public.profiles 
            WHERE id = auth.uid() AND (role = 'admin' OR role = 'super_admin')
        )
    );

-- Add to family_media as well to ensure type consistency if missing
ALTER TABLE IF EXISTS public.family_media 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
