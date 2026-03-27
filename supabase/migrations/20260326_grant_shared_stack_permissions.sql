-- Refine the sharing functions to be more robust and grant execute permission to both authenticated and anonymous users
-- This allows shared links to work even for users who are not logged in

--------------------------------------------------------------------------------
-- 1. STACKS SHARING
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_shared_stack(token_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_record RECORD;
  stack_data JSONB;
BEGIN
  SELECT * INTO link_record FROM shared_links
  WHERE token = token_param AND expires_at > NOW() AND stack_id IS NOT NULL;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired link';
  END IF;

  -- Get stack data from the stacks table (which already contains media_items JSONB)
  SELECT row_to_json(s) INTO stack_data
  FROM stacks s
  WHERE s.id = link_record.stack_id;
  
  RETURN stack_data;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_stack(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_stack(TEXT) TO public;

--------------------------------------------------------------------------------
-- 2. ALBUMS SHARING
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_shared_album_content(token_param TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_record RECORD;
  album_record RECORD;
  pages_json JSONB;
BEGIN
  -- 1. Validate Token
  SELECT * INTO link_record FROM shared_links
  WHERE token = token_param
    AND is_active = TRUE
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;

  -- 2. Fetch Album
  SELECT * INTO album_record FROM albums WHERE id = link_record.album_id;
  
  -- 3. Fetch Pages with Assets
  SELECT jsonb_agg(
    to_jsonb(p) || jsonb_build_object(
      'assets', (
        SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
        FROM assets a
        WHERE a.page_id = p.id
      )
    )
  ) INTO pages_json
  FROM (
    SELECT * FROM pages WHERE album_id = link_record.album_id ORDER BY page_number
  ) p;

  RETURN jsonb_build_object(
    'success', true,
    'album', to_jsonb(album_record),
    'pages', pages_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_album_content(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_album_content(TEXT) TO public;

--------------------------------------------------------------------------------
-- 3. UNIVERSAL SHARING (Albums or Events)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_shared_content(token_param TEXT)
RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link_record RECORD;
  album_record RECORD;
  event_record RECORD;
  pages_json JSONB;
BEGIN
  -- 1. Validate Token
  SELECT * INTO link_record FROM shared_links
  WHERE token = token_param
    AND is_active = TRUE
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;

  -- 2. Fetch Content (Album or Event)
  IF link_record.album_id IS NOT NULL THEN
    SELECT * INTO album_record FROM albums WHERE id = link_record.album_id;
    
    SELECT jsonb_agg(
      to_jsonb(p) || jsonb_build_object(
        'assets', (
          SELECT COALESCE(jsonb_agg(to_jsonb(a)), '[]'::jsonb)
          FROM assets a
          WHERE a.page_id = p.id
        )
      )
    ) INTO pages_json
    FROM (
      SELECT * FROM pages WHERE album_id = link_record.album_id ORDER BY page_number
    ) p;

    RETURN jsonb_build_object(
      'success', true,
      'type', 'album',
      'album', to_jsonb(album_record),
      'pages', pages_json
    );
  ELSIF link_record.event_id IS NOT NULL THEN
    SELECT * INTO event_record FROM events WHERE id = link_record.event_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'type', 'event',
      'event', to_jsonb(event_record)
    );
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'No content associated with this link');
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_content(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_shared_content(TEXT) TO public;
