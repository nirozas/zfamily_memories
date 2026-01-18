
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanup() {
    console.log('Starting cleanup...');

    // 1. Delete from library_assets where category = 'layout'
    const { data: assets, error: fetchError } = await supabase
        .from('library_assets')
        .select('*')
        .eq('category', 'layout');

    if (fetchError) {
        console.error('Error fetching layout assets:', fetchError);
    } else {
        console.log(`Found ${assets.length} layout assets.`);
        if (assets.length > 0) {
            const { error: deleteError } = await supabase
                .from('library_assets')
                .delete()
                .eq('category', 'layout');

            if (deleteError) {
                console.error('Error deleting layout assets:', deleteError);
            } else {
                console.log('Successfully deleted layout assets.');
            }
        }
    }

    // 2. Check and delete from album_layouts if it exists
    // We'll try to select first to see if table exists
    const { error: tableError } = await supabase.from('album_layouts').select('id').limit(1);
    if (!tableError || tableError.code !== '42P01') { // 42P01 is undefined_table in Postgres
        console.log('album_layouts table exists (or accessible). Attempting cleanup.');
        const { error: deleteLayoutsError } = await supabase
            .from('album_layouts')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (deleteLayoutsError) {
            console.error('Error deleting from album_layouts:', deleteLayoutsError);
        } else {
            console.log('Successfully cleaned album_layouts table.');
        }
    } else {
        console.log('album_layouts table does not exist or is not accessible.');
    }

    console.log('Cleanup complete.');
}

cleanup();
