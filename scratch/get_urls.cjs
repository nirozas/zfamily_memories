const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const lines = env.split('\n');
const supabaseUrl = lines.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/^"|"$|'/g, '');
const supabaseKey = lines.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/^"|"$|'/g, '');

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data } = await supabase.from('media_library').select('id, url, title').limit(50);
    console.log(JSON.stringify(data, null, 2));
}
run().catch(console.error);
