import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('--- Supabase Diagnostic ---');
    console.log('Attempting sign in for asniroz@gmail.com...');
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: 'asniroz@gmail.com',
        password: 'Nini.0105'
    });

    if (authError) {
        console.error('Sign in failed:', authError.message);
        return;
    }

    const user = authData.user;
    console.log('Sign in successful!');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);

    // Get Profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (profileError) {
        console.error('Error fetching profile:', profileError.message);
    } else {
        console.log('Profile:', profile);
    }

    if (profile && profile.family_id) {
        const familyId = profile.family_id;
        console.log('Family ID:', familyId);

        // Fetch Albums
        const { data: albums, error: albumsError } = await supabase
            .from('albums')
            .select('*')
            .eq('family_id', familyId);

        if (albumsError) {
            console.error('Error fetching albums:', albumsError.message);
        } else {
            console.log(`Albums count for family_id ${familyId}:`, albums?.length);
            albums?.forEach((a: any) => console.log(`- [Album] ID: ${a.id}, Title: ${a.title}`));
        }

        // Fetch Stacks
        const { data: stacks, error: stacksError } = await supabase
            .from('media_stacks')
            .select('*')
            .eq('family_id', familyId);

        if (stacksError) {
            console.error('Error fetching stacks:', stacksError.message);
        } else {
            console.log(`Stacks count for family_id ${familyId}:`, stacks?.length);
            stacks?.forEach((s: any) => console.log(`- [Stack] ID: ${s.id}, Name: ${s.name}`));
        }

        // Fetch Family Media
        const { data: media, error: mediaError } = await supabase
            .from('family_media')
            .select('id')
            .eq('family_id', familyId);

        if (mediaError) {
            console.error('Error fetching media:', mediaError.message);
        } else {
            console.log(`Media count for family_id ${familyId}:`, media?.length);
        }
    } else {
        console.log('User profile has no family_id associated.');
        
        // Let's check if there are other profiles
        const { data: allProfiles, error: allProfilesError } = await supabase
            .from('profiles')
            .select('*');
        if (allProfilesError) {
            console.error('Error fetching all profiles:', allProfilesError.message);
        } else {
            console.log('All Profiles:', allProfiles);
        }
    }
}

checkData();
