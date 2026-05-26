async function checkVercelSupabaseUrl() {
    const jsUrl = 'https://zfammemories.vercel.app/assets/index-B-1n4FnL.js';
    console.log('Fetching JS bundle from Vercel:', jsUrl);
    
    try {
        const res = await fetch(jsUrl);
        const text = await res.text();
        
        // Find matches for "*.supabase.co"
        const regex = /https:\/\/[a-z0-9]+\.supabase\.co/gi;
        const matches = text.match(regex);
        
        if (matches) {
            console.log('Found Supabase URL(s) in Vercel bundle:', Array.from(new Set(matches)));
        } else {
            console.log('No Supabase URL found in the bundle.');
            
            // Try searching for supabase.co generally
            const generalIndex = text.indexOf('supabase.co');
            if (generalIndex !== -1) {
                console.log('Found "supabase.co" at index', generalIndex);
                console.log('Context:', text.substring(generalIndex - 50, generalIndex + 50));
            }
        }
    } catch (err: any) {
        console.error('Failed to fetch or parse bundle:', err.message);
    }
}

checkVercelSupabaseUrl();
