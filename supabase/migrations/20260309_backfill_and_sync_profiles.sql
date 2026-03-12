-- ============================================================================
-- 20260309_backfill_and_sync_profiles.sql
-- ============================================================================

-- 1. Ensure the email column exists in profiles (just in case)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Update the handle_new_user_signup function to sync more data
CREATE OR REPLACE FUNCTION public.handle_new_user_signup()
RETURNS TRIGGER AS $$
BEGIN
    -- Create profile for new user, syncing email and full_name from auth.users
    INSERT INTO public.profiles (id, full_name, role, email)
    VALUES (
        NEW.id, 
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'New User'), 
        'member',
        NEW.email
    )
    ON CONFLICT (id) DO UPDATE 
    SET email = EXCLUDED.email,
        full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Backfill missing profiles from auth.users
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN (SELECT * FROM auth.users) LOOP
        INSERT INTO public.profiles (id, full_name, role, email)
        VALUES (
            user_record.id, 
            COALESCE(user_record.raw_user_meta_data->>'full_name', user_record.raw_user_meta_data->>'name', 'User'), 
            'member',
            user_record.email
        )
        ON CONFLICT (id) DO UPDATE 
        SET email = EXCLUDED.email,
            full_name = COALESCE(profiles.full_name, EXCLUDED.full_name);
    END LOOP;
END $$;

-- 4. Set Niroz as admin if not already
UPDATE profiles 
SET role = 'super_admin', is_superadmin = true 
WHERE email = 'asniroz@gmail.com';

NOTIFY pgrst, 'reload schema';
