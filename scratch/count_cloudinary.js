import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function count() {
  const { count, error } = await supabase
    .from('library_assets')
    .select('*', { count: 'exact', head: true })
    .ilike('url', '%res.cloudinary.com%');

  if (error) console.error(error);
  else console.log(`Total Cloudinary assets in library_assets: ${count}`);
}

count();
