-- Add R2 configuration columns to family_settings
ALTER TABLE public.family_settings 
ADD COLUMN IF NOT EXISTS r2_access_key_id TEXT,
ADD COLUMN IF NOT EXISTS r2_secret_access_key TEXT,
ADD COLUMN IF NOT EXISTS r2_endpoint TEXT,
ADD COLUMN IF NOT EXISTS r2_bucket_name TEXT,
ADD COLUMN IF NOT EXISTS r2_public_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN public.family_settings.r2_endpoint IS 'Cloudflare R2 S3 API Endpoint (e.g., https://<accountid>.r2.cloudflarestorage.com)';
COMMENT ON COLUMN public.family_settings.r2_public_url IS 'The public distribution URL or custom domain for this bucket';
