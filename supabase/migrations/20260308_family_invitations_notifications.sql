-- ============================================================================
-- 10. NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 11. FAMILY INVITATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.family_invitations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  family_id UUID REFERENCES public.family_groups(id) ON DELETE CASCADE,
  inviter_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  role user_role DEFAULT 'member',
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- ============================================================================
-- RLS POLICIES FOR NOTIFICATIONS
-- ============================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ============================================================================
-- RLS POLICIES FOR FAMILY INVITATIONS
-- ============================================================================

ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

-- Admins can view invitations they sent for their family
CREATE POLICY "Admins can view family invitations" ON public.family_invitations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND family_id = family_invitations.family_id AND role = 'admin'
    )
  );

-- Users can view invitations sent to their email
CREATE POLICY "Users can view invitations to them" ON public.family_invitations
  FOR SELECT USING (
    invitee_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Inviters can manage invitations they created
CREATE POLICY "Inviters can manage own invitations" ON public.family_invitations
  FOR ALL USING (inviter_id = auth.uid());

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to accept a family invitation
CREATE OR REPLACE FUNCTION accept_family_invitation(invitation_id UUID)
RETURNS JSONB AS $$
DECLARE
  invitation_record RECORD;
BEGIN
  -- Get the invitation
  SELECT * INTO invitation_record FROM public.family_invitations
  WHERE id = invitation_id AND status = 'pending' AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or expired');
  END IF;

  -- Ensure the current user is the invitee
  IF invitation_record.invitee_email != (SELECT email FROM auth.users WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This invitation was not sent to you');
  END IF;

  -- 1. Update user's profile with family and role
  UPDATE public.profiles
  SET family_id = invitation_record.family_id,
      role = invitation_record.role
  WHERE id = auth.uid();

  -- 2. Mark invitation as accepted
  UPDATE public.family_invitations
  SET status = 'accepted'
  WHERE id = invitation_id;

  -- 3. Notify the inviter
  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    invitation_record.inviter_id,
    'invitation_accepted',
    'Invitation Accepted',
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()) || ' has joined your family!',
    jsonb_build_object('family_id', invitation_record.family_id, 'invitee_id', auth.uid())
  );

  RETURN jsonb_build_object('success', true, 'family_id', invitation_record.family_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
