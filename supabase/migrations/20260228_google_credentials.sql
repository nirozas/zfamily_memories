-- Create google credentials table to store refresh tokens for proxying in shared views
CREATE TABLE IF NOT EXISTS user_google_credentials (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    refresh_token TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_google_credentials ENABLE ROW LEVEL SECURITY;

-- Only users can manage their own credentials
CREATE POLICY "Users can manage their own google credentials" 
ON user_google_credentials 
FOR ALL
USING (auth.uid() = user_id);

-- Add helper function to get stack by token (if not exists)
CREATE OR REPLACE FUNCTION get_shared_stack(token_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  link_record RECORD;
  stack_data JSONB;
BEGIN
  -- Find valid link
  SELECT * INTO link_record FROM shared_links
  WHERE token = token_param AND expires_at > NOW() AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get stack data
  SELECT row_to_json(s) INTO stack_data
  FROM stacks s
  WHERE s.id = link_record.stack_id;
  
  RETURN stack_data;
END;
$$;
