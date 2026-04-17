-- Migrate R2 settings from environment comments to family_settings for asniroz@gmail.com
DO $$
DECLARE
    v_family_id UUID;
BEGIN
    -- 1. Find the family_id for asniroz@gmail.com
    SELECT family_id INTO v_family_id 
    FROM public.profiles 
    WHERE email = 'asniroz@gmail.com' 
    LIMIT 1;

    IF v_family_id IS NOT NULL THEN
        -- 2. Upsert into family_settings
        INSERT INTO public.family_settings (
            family_id,
            r2_access_key_id,
            r2_secret_access_key,
            r2_endpoint,
            r2_bucket_name,
            r2_public_url,
            updated_at
        ) VALUES (
            v_family_id,
            'd169234f1140259ee7893d93a181f839',
            'ebd43e2404925e90b35288dc6613fd62d53b98964be88d5d02d74f9168b3b7e6',
            'https://def7b494901c22ea219f966254458ee2.r2.cloudflarestorage.com',
            'zoabimemories',
            'https://pub-97855436eeb04fa7b7fc013383e135b1.r2.dev',
            NOW()
        )
        ON CONFLICT (family_id) DO UPDATE SET
            r2_access_key_id = EXCLUDED.r2_access_key_id,
            r2_secret_access_key = EXCLUDED.r2_secret_access_key,
            r2_endpoint = EXCLUDED.r2_endpoint,
            r2_bucket_name = EXCLUDED.r2_bucket_name,
            r2_public_url = EXCLUDED.r2_public_url,
            updated_at = NOW();
            
        RAISE NOTICE 'Updated R2 settings for family of asniroz@gmail.com (ID: %)', v_family_id;
    ELSE
        RAISE WARNING 'User asniroz@gmail.com not found or not in a family';
    END IF;
END $$;
