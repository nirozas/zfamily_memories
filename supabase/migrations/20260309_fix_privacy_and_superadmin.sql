-- ============================================================================
-- 20260309_fix_privacy_and_superadmin.sql
-- ============================================================================

-- Helper functions to avoid RLS recursion on the profiles table
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
    SELECT role IN ('admin', 'super_admin') FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
    SELECT role = 'super_admin' OR is_superadmin = true FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 1. Profiles: Allow admins and super admins to see all profiles (for searching and management)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    id = auth.uid() OR public.is_admin()
  );

-- 2. Update Update/Delete policies for profiles to include super_admin
DROP POLICY IF EXISTS "Admins can update family member profiles" ON profiles;
CREATE POLICY "Admins can update family member profiles" ON profiles
  FOR UPDATE USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND public.is_admin())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can delete family member profiles" ON profiles;
CREATE POLICY "Admins can delete family member profiles" ON profiles
  FOR DELETE USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND id != auth.uid() AND public.is_admin())
    OR public.is_super_admin()
  );

-- 3. Super Admins should be able to view EVERYTHING
-- We'll add super_admin to SELECT policies for all major tables

-- Family Groups
DROP POLICY IF EXISTS "Super admins can view all family groups" ON family_groups;
CREATE POLICY "Super admins can view all family groups" ON family_groups
  FOR SELECT USING (
    public.is_super_admin()
  );

-- Events
DROP POLICY IF EXISTS "Super admins can view all events" ON events;
CREATE POLICY "Super admins can view all events" ON events
  FOR SELECT USING (
    public.is_super_admin()
  );

-- Albums
DROP POLICY IF EXISTS "Super admins can view all albums" ON albums;
CREATE POLICY "Super admins can view all albums" ON albums
  FOR SELECT USING (
    public.is_super_admin()
  );

-- Pages
DROP POLICY IF EXISTS "Super admins can view all pages" ON pages;
CREATE POLICY "Super admins can view all pages" ON pages
  FOR SELECT USING (
    public.is_super_admin()
  );

-- Assets
DROP POLICY IF EXISTS "Super admins can view all assets" ON assets;
CREATE POLICY "Super admins can view all assets" ON assets
  FOR SELECT USING (
    public.is_super_admin()
  );

-- 4. Update existing management policies to include super_admin
-- Note: Re-using public.is_admin() and public.is_super_admin() for efficiency

DROP POLICY IF EXISTS "Admins can manage family groups" ON family_groups;
CREATE POLICY "Admins can manage family groups" ON family_groups
  FOR ALL USING (
    (id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND public.is_admin())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage invite codes" ON invite_codes;
CREATE POLICY "Admins can manage invite codes" ON invite_codes
  FOR ALL USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND public.is_admin())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Creators and admins can manage events" ON events;
CREATE POLICY "Creators and admins can manage events" ON events
  FOR ALL USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND (public.is_admin() OR public.get_my_role() = 'creator'))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage all family albums" ON albums;
CREATE POLICY "Admins can manage all family albums" ON albums
  FOR ALL USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND public.is_admin())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Admins can manage all family media" ON family_media;
CREATE POLICY "Admins can manage all family media" ON family_media
  FOR ALL USING (
    (family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid()) AND public.is_admin())
    OR public.is_super_admin()
  );

-- 5. Fix Notifications and Invitations for Super Admins
DROP POLICY IF EXISTS "Super admins can view all notifications" ON public.notifications;
CREATE POLICY "Super admins can view all notifications" ON public.notifications
  FOR SELECT USING (
    public.is_super_admin()
  );

DROP POLICY IF EXISTS "Super admins can view all family invitations" ON public.family_invitations;
CREATE POLICY "Super admins can view all family invitations" ON public.family_invitations
  FOR SELECT USING (
    public.is_super_admin()
  );

NOTIFY pgrst, 'reload schema';
