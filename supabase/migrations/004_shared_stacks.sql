-- Add stack_id to shared_links to allow sharing isolated stacks for 48h
ALTER TABLE shared_links ADD COLUMN IF NOT EXISTS stack_id UUID REFERENCES stacks(id) ON DELETE CASCADE;

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
  WHERE token = token_param AND expires_at > NOW() AND stack_id IS NOT NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  -- Get stack data
  SELECT row_to_json(s) INTO stack_data
  FROM stacks s
  WHERE s.id = link_record.stack_id;
  
  RETURN stack_data;
END;
$$;
