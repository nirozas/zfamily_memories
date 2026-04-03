-- Add missing column hero_image_id to family_settings if it doesn't exist
ALTER TABLE public.family_settings 
ADD COLUMN IF NOT EXISTS hero_image_id TEXT;

-- Verify the table structure
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'family_settings';
