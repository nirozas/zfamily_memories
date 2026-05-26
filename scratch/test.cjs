const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n');
const url = env.find(l => l.startsWith('VITE_SUPABASE_URL')).split('=')[1].trim().replace(/^"|"$/g, '');
const key = env.find(l => l.startsWith('VITE_SUPABASE_ANON_KEY')).split('=')[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(url, key);

async function run() { 
    // Just fetch it
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } });
    console.log(res.status);
}
run();
