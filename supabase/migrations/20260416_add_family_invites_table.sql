-- ============================================================================
-- 12. FAMILY INVITE CODES (GENERAL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_invites (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  family_id UUID REFERENCES public.family_groups(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('pending', 'used', 'expired')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.family_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invite codes" ON public.family_invites
  FOR ALL TO authenticated
  USING (
    family_id IN (
      SELECT f.family_id FROM public.profiles f 
      WHERE f.id = auth.uid() 
      AND (f.role::text = 'admin' OR f.role::text = 'super_admin')
    )
  )
  WITH CHECK (
    family_id IN (
      SELECT f.family_id FROM public.profiles f 
      WHERE f.id = auth.uid() 
      AND (f.role::text = 'admin' OR f.role::text = 'super_admin')
    )
  );

CREATE POLICY "Anyone can check a code" ON public.family_invites
  FOR SELECT USING (true);

-- Index for fast lookup
CREATE INDEX idx_family_invites_code ON public.family_invites(code);
