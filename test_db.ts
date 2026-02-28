import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('family_media').select('*');
    if (data) {
        const googlePhotos = data.filter((m: any) => m.url && m.url.includes('googleusercontent.com'));

        for (const m of googlePhotos) {
            console.log('Deleting old temporary Google URL:', m.filename);
            await supabase.from('family_media').delete().eq('id', m.id);
        }
        console.log(`Deleted ${googlePhotos.length} expired items. Users should re-import them now that it's stable.`);
    }
}
test();
