-- ============================================================================
-- 20260308_add_super_admin_role.sql
-- ============================================================================

-- 1. Add 'super_admin' to user_role ENUM
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'user_role' AND e.enumlabel = 'super_admin') THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;
END $$;

-- 2. Add is_superadmin boolean column to profiles for UI flexibility (if not exists)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;

-- 3. Update asniroz@gmail.com to be super_admin
DO $$
DECLARE
    target_user_id UUID;
BEGIN
    SELECT id INTO target_user_id FROM auth.users WHERE email = 'asniroz@gmail.com';
    
    IF target_user_id IS NOT NULL THEN
        UPDATE profiles 
        SET role = 'super_admin',
            is_superadmin = TRUE
        WHERE id = target_user_id;
        
        RAISE NOTICE 'Updated user asniroz@gmail.com to super_admin';
    ELSE
        RAISE NOTICE 'User asniroz@gmail.com not found in auth.users';
    END IF;
END $$;
