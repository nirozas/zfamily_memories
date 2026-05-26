async function checkVercelAnonKey() {
    const jsUrl = 'https://zfammemories.vercel.app/assets/index-B-1n4FnL.js';
    console.log('Fetching JS bundle from Vercel:', jsUrl);
    
    try {
        const res = await fetch(jsUrl);
        const text = await res.text();
        
        // Find JWT-like strings in the bundle (eyJhbGciOi...)
        const regex = /eyJhbGciOi[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+\.[a-zA-Z0-9-_]+/g;
        const matches = text.match(regex);
        
        if (matches) {
            console.log('Found JWT keys in Vercel bundle:', matches.length);
            
            // Deduplicate
            const uniqueKeys = Array.from(new Set(matches));
            console.log('Unique keys found:');
            uniqueKeys.forEach((key, index) => {
                // Decode payload (middle part) to see what it is
                try {
                    const payloadPart = key.split('.')[1];
                    // Base64Url decode
                    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
                    const decoded = Buffer.from(base64, 'base64').toString('utf8');
                    console.log(`Key ${index + 1}:`);
                    console.log(`- Decoded payload:`, decoded);
                    console.log(`- Key (first 15 chars):`, key.substring(0, 15) + '...');
                    console.log(`- Key (last 15 chars):`, '...' + key.substring(key.length - 15));
                } catch (e) {
                    console.log(`Key ${index + 1} could not be decoded as JWT. First 15 chars:`, key.substring(0, 15));
                }
            });
        } else {
            console.log('No JWT keys found in the bundle.');
        }
    } catch (err: any) {
        console.error('Failed to fetch or parse bundle:', err.message);
    }
}

checkVercelAnonKey();
