-- Fix the RLS policy for inserting shared links so members can share items they have access to
DROP POLICY IF EXISTS "Users can create own family links" ON shared_links;

CREATE POLICY "Users can create own family links" ON shared_links
  FOR INSERT WITH CHECK (
    -- Allow insert if the user is authenticated AND the item belongs to their family
    (album_id IS NOT NULL AND album_id IN (
      SELECT id FROM albums WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    ))
    OR
    (event_id IS NOT NULL AND event_id IN (
      SELECT id FROM events WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    ))
    OR
    (stack_id IS NOT NULL AND stack_id IN (
      SELECT id FROM stacks WHERE family_id IN (SELECT family_id FROM profiles WHERE id = auth.uid())
    ))
  );
