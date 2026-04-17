import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
  console.log("Starting cleanup of Cloudinary URLs...");
  
  // Clean library_assets
  const { data: assets, error: assetError } = await supabase
    .from('library_assets')
    .delete()
    .ilike('url', '%res.cloudinary.com%')
    .select();

  if (assetError) {
    console.error("Error cleaning library_assets:", assetError);
  } else {
    console.log(`Deleted ${assets?.length || 0} records from library_assets`);
  }

  // Clean family_media (just in case)
  const { data: media, error: mediaError } = await supabase
    .from('family_media')
    .delete()
    .ilike('url', '%res.cloudinary.com%')
    .select();

  if (mediaError) {
    console.error("Error cleaning family_media:", mediaError);
  } else {
    console.log(`Deleted ${media?.length || 0} records from family_media`);
  }
}

cleanup();
