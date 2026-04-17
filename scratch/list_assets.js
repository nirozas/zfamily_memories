import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function list() {
  const { data, error } = await supabase
    .from('library_assets')
    .select('id, url, category')
    .limit(20);

  if (error) console.error(error);
  else console.log("Assets sample:", JSON.stringify(data, null, 2));
}

list();
