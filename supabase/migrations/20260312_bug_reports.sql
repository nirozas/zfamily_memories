CREATE TABLE IF NOT EXISTS public.bug_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'fixed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Select policy: User can read own reports, Super Admin can read all
CREATE POLICY "Users can view their own bug reports"
ON public.bug_reports FOR SELECT
USING (
    auth.uid() = user_id OR
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
);

-- Insert policy: User can insert own reports
CREATE POLICY "Users can create their own bug reports"
ON public.bug_reports FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Update policy: Super Admins can update
CREATE POLICY "Super admins can update all bug reports"
ON public.bug_reports FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
);

-- Delete policy: Super Admins can delete
CREATE POLICY "Super admins can delete all bug reports"
ON public.bug_reports FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'super_admin'
    )
);
