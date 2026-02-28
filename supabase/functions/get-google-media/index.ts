import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
    'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
}

serve(async (req) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const mediaUrl = url.searchParams.get('url')
        const shareToken = url.searchParams.get('share_token')

        // Handle both query param token and Authorization header
        const tokenParam = url.searchParams.get('token')
        const authHeader = req.headers.get('Authorization')
        let accessToken = tokenParam || authHeader?.replace('Bearer ', '')

        if (!mediaUrl) {
            return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // --- NEW: Handle Share Token for unauthenticated viewers ---
        if (!accessToken && shareToken) {
            console.log(`[Proxy] Using share_token: ${shareToken}`);
            try {
                // Initialize Supabase client with Service Role Key to bypass RLS
                const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0")
                const supabaseAdmin = createClient(
                    Deno.env.get('SUPABASE_URL') ?? '',
                    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                )

                // 1. Validate share token and get creator
                const { data: shareLink, error: shareError } = await supabaseAdmin
                    .from('shared_links')
                    .select('created_by, expires_at, is_active')
                    .eq('token', shareToken)
                    .single()

                if (shareError || !shareLink || !shareLink.is_active || new Date(shareLink.expires_at) < new Date()) {
                    console.error("[Proxy] Invalid or expired share token", shareError);
                    // Continue anyway, maybe it's a public URL? 
                } else {
                    // 2. Get creator's refresh token
                    const { data: creds, error: credError } = await supabaseAdmin
                        .from('user_google_credentials')
                        .select('refresh_token')
                        .eq('user_id', shareLink.created_by)
                        .single()

                    if (creds?.refresh_token) {
                        // 3. Refresh Google Token (Supabase secrets should be set in the function environment)
                        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: new URLSearchParams({
                                client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
                                client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
                                refresh_token: creds.refresh_token,
                                grant_type: 'refresh_token',
                            }),
                        })

                        const refreshData = await refreshResponse.json()
                        if (refreshData.access_token) {
                            accessToken = refreshData.access_token
                            console.log("[Proxy] Successfully refreshed creator token");
                        }
                    }
                }
            } catch (e) {
                console.error("[Proxy] Share token auth failed:", e);
            }
        }
        // -------------------------------------------------------------

        // 2. Prepare headers for Google
        // IMPORTANT: We REMOVE Referer because Google blocks mismatched referers
        const fetchHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }

        if (accessToken) {
            fetchHeaders['Authorization'] = `Bearer ${accessToken}`
        }

        // Support video seeking
        const range = req.headers.get('range')
        if (range) {
            fetchHeaders['Range'] = range
        }

        // 3. Fetch from Google
        const response = await fetch(mediaUrl, {
            headers: fetchHeaders,
            redirect: 'follow'
        })

        if (!response.ok && response.status !== 206) {
            const errText = await response.text();
            console.error(`[Google Error] status: ${response.status} body: ${errText.substring(0, 200)}`);
            return new Response(errText, {
                status: response.status,
                headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
            });
        }

        // 4. Prepare response headers
        const responseHeaders = new Headers(corsHeaders);
        const headersToProxy = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'content-disposition',
            'etag'
        ];

        for (const header of headersToProxy) {
            const value = response.headers.get(header);
            if (value) responseHeaders.set(header, value);
        }

        const contentType = responseHeaders.get('content-type') || '';
        const isVideo = contentType.startsWith('video/') || contentType.startsWith('audio/');

        // 5. Apply Streaming Optimizations
        if (isVideo) {
            responseHeaders.set('X-Accel-Buffering', 'no');
            responseHeaders.set('Cache-Control', 'public, max-age=3600, no-transform');
            if (!responseHeaders.has('accept-ranges')) {
                responseHeaders.set('accept-ranges', 'bytes');
            }
        } else {
            responseHeaders.set('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        }

        // 6. Stream the response
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
        })

    } catch (error: any) {
        console.error(`Proxy exception: ${error.message}`);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
