const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mkrnihbjzktvgfcscyaw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rcm5paGJqemt0dmdmY3NjeWF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NjAyNTQsImV4cCI6MjA4MzEzNjI1NH0.f1c53RCEvJi1BdjbFhkAm6W-APCpPSANPDfkrXh7ZPo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log("Fetching assets table info...");
    const { data: assets, error: assetsError } = await supabase
        .from('assets')
        .select('*')
        .limit(1);

    if (assetsError) {
        console.error('Error fetching assets:', assetsError);
    } else {
        console.log('Assets Columns:', Object.keys(assets[0] || {}));
    }

    // Check for enum or constraints via a query to information_schema (if possible)
    // Actually, we can just try to insert a 'map' asset and see why it fails more specifically if needed.
    // But let's try to get more info on assets table.
}

checkSchema();
