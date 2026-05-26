import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStacks() {
    // Sign in
    const { data: authData } = await supabase.auth.signInWithPassword({
        email: 'asniroz@gmail.com',
        password: 'Nini.0105'
    });

    if (!authData.user) {
        console.error('Could not sign in');
        return;
    }

    const familyId = '60864013-7c66-48e6-97b9-32aac7e3a460';
    console.log('Querying table "stacks" for family_id:', familyId);

    const { data: stacks, error } = await supabase
        .from('stacks')
        .select('*')
        .eq('family_id', familyId);

    if (error) {
        console.error('Error fetching from stacks table:', error.message);
    } else {
        console.log(`Found ${stacks?.length} stacks:`);
        stacks?.forEach(s => console.log(`- Stack: ${s.name}, ID: ${s.id}`));
    }
}

checkStacks();
