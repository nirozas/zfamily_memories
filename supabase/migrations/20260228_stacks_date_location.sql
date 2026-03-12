-- Add location, event_date, and geotag to stacks table
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS event_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS geotag JSONB;
