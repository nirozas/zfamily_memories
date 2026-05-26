import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';
// Note: We'll sign in as the user so RLS policies allow reading if they have permissions
const supabase = createClient(supabaseUrl, supabaseKey);

async function scanDb() {
    const { data: authData } = await supabase.auth.signInWithPassword({
        email: 'asniroz@gmail.com',
        password: 'Nini.0105'
    });

    if (!authData.user) {
        console.error('Could not sign in');
        return;
    }

    console.log('Signed in user:', authData.user.id);

    // List all profiles
    const { data: allProfiles, error: pErr } = await supabase.from('profiles').select('*');
    if (pErr) console.error('Profiles read error:', pErr.message);
    else console.log('All Profiles:', allProfiles);

    // List all albums
    const { data: allAlbums, error: aErr } = await supabase.from('albums').select('*');
    if (aErr) console.error('Albums read error:', aErr.message);
    else console.log('All Albums:', allAlbums?.map(a => ({ id: a.id, title: a.title, family_id: a.family_id })));

    // List all stacks
    const { data: allStacks, error: sErr } = await supabase.from('stacks').select('*');
    if (sErr) console.error('Stacks read error:', sErr.message);
    else console.log('All Stacks:', allStacks?.map(s => ({ id: s.id, name: s.name || s.title, family_id: s.family_id })));
}

scanDb();
