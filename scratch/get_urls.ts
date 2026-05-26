import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
    const { data } = await supabase.from('media_library').select('id, url, title').limit(20);
    console.log(data);
}
run().catch(console.error);
