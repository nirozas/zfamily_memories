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
        const photoId = url.searchParams.get('id') || url.searchParams.get('photo_id')
        const shareToken = url.searchParams.get('share_token')

        // Handle both query param token and Authorization header
        const tokenParam = url.searchParams.get('token')
        const authHeader = req.headers.get('Authorization')
        let accessToken = tokenParam || authHeader?.replace('Bearer ', '')
        const isThumbnail = url.searchParams.get('is_thumb') === 'true' || url.searchParams.get('thumbnail') === 'true'

        if (!mediaUrl && !photoId) {
            return new Response(JSON.stringify({ error: 'Missing url or id parameter' }), {
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

        let effectiveUrl = mediaUrl;
        let effectiveContentType = null;

        // 3. If photoId is provided, we MUST fetch a fresh baseUrl
        if (photoId) {
            console.log(`[Proxy] Fetching fresh baseUrl for item: ${photoId}`);
            if (!accessToken) {
                return new Response(JSON.stringify({ error: 'Authentication required to fetch photo ID' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // TRY BOTH APIs: Library API (uploaded items) and Picker API (browsed items)
            const apis = [
                `https://photoslibrary.googleapis.com/v1/mediaItems/${photoId}`,
                `https://photospicker.googleapis.com/v1/mediaItems/${photoId}`
            ];

            let resolvedItem = null;
            let resolutionErrors: string[] = [];
            for (const apiUrl of apis) {
                try {
                    const apiResponse = await fetch(apiUrl, {
                        headers: { 'Authorization': `Bearer ${accessToken}` }
                    });

                    if (apiResponse.ok) {
                        resolvedItem = await apiResponse.json();
                        console.log(`[Proxy] Resolved via ${apiUrl.includes('picker') ? 'Picker' : 'Library'} API`);
                        break;
                    } else {
                        const errText = await apiResponse.text().catch(() => 'No body');
                        resolutionErrors.push(`${apiUrl} returned ${apiResponse.status}: ${errText}`);
                    }
                } catch (e: any) {
                    resolutionErrors.push(`${apiUrl} fetch failed: ${e.message}`);
                }
            }

            if (!resolvedItem) {
                console.error(`[Proxy] Failed to resolve photoId ${photoId}. Errors:`, resolutionErrors);
                // Fallback to mediaUrl if available
                if (!mediaUrl || !mediaUrl.startsWith('http')) {
                    return new Response(JSON.stringify({ 
                        error: "Could not resolve Google Photo ID", 
                        details: resolutionErrors,
                        photoId
                    }), {
                        status: 404,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } else {
                const item = resolvedItem;
                let baseUrl = item.mediaFile?.baseUrl || item.baseUrl || '';
                
                // If it has a suffix like =dv or =w, strip it for consistent suffixing below
                if (baseUrl.includes('=')) baseUrl = baseUrl.split('=')[0];

                const isVideo = item.mediaMetadata?.video ||
                    item.mediaFile?.video ||
                    item.mimeType?.startsWith('video') ||
                    item.mediaFile?.mimeType?.startsWith('video');

                if (isThumbnail) {
                    effectiveUrl = `${baseUrl}=w800-h800`; // Standard high quality thumb
                } else {
                    effectiveUrl = isVideo ? `${baseUrl}=dv` : `${baseUrl}=w9999-h9999`;
                }
                
                effectiveContentType = item.mimeType || item.mediaFile?.mimeType;
                console.log(`[Proxy] Resolved ID ${photoId} -> ${effectiveUrl.substring(0, 50)}... (isThumb: ${isThumbnail})`);
            }
        }

        // Detect Google Drive URLs and use API endpoint for better auth support
        if (effectiveUrl && effectiveUrl.includes('drive.google.com')) {
            const driveIdMatch = effectiveUrl.match(/[?&]id=([^&]+)/) || effectiveUrl.match(/\/file\/d\/([^/]+)/);
            if (driveIdMatch && driveIdMatch[1]) {
                const driveId = driveIdMatch[1];
                if (isThumbnail) {
                    // Fetch thumbnailLink for Drive items
                    console.log(`[Proxy] Fetching thumbnail metadata for Drive ID: ${driveId}`);
                    try {
                        const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${driveId}?fields=thumbnailLink`, {
                            headers: { 'Authorization': `Bearer ${accessToken}` }
                        });
                        if (metaRes.ok) {
                            const meta = await metaRes.json();
                            if (meta.thumbnailLink) {
                                // Google Drive thumbnailLink can take size params too
                                effectiveUrl = meta.thumbnailLink.replace(/=s[0-9]+$/, '=s800');
                                console.log(`[Proxy] Drive thumbnail resolved: ${effectiveUrl.substring(0, 50)}...`);
                            }
                        }
                    } catch (e: any) {
                        console.error(`[Proxy] Drive thumbnail fetch error: ${e.message}`);
                    }
                } else {
                    effectiveUrl = `https://www.googleapis.com/drive/v3/files/${driveId}?alt=media`;
                    console.log(`[Proxy] Detected Drive URL, using API media endpoint: ${effectiveUrl}`);
                }
            }
        }

        // --- NEW: Apply thumbnail suffix to generic Google Photos/UserContent URLs if no ID logic hit it ---
        if (isThumbnail && effectiveUrl && (effectiveUrl.includes('googleusercontent.com') || effectiveUrl.includes('photoslibrary.googleapis.com'))) {
            const isVideoDownloadUrl = effectiveUrl.includes('video-downloads') || effectiveUrl.includes('/video-');
            
            // Only apply size suffixes to non-video-download URLs (they usually 403 or ignore suffixes)
            if (!isVideoDownloadUrl) {
                if (!effectiveUrl.includes('=')) {
                    effectiveUrl += '=w800-h800';
                } else if (!effectiveUrl.includes('=w') && !effectiveUrl.includes('=s')) {
                    // Replace existing suffix (like =dv) with high-res thumb suffix
                    const parts = effectiveUrl.split('=');
                    effectiveUrl = parts[0] + '=w800-h800';
                }
            }
        }

        if (!effectiveUrl || !effectiveUrl.startsWith('http')) {
            return new Response(JSON.stringify({ 
                error: 'Invalid or missing target URL after resolution',
                effectiveUrl,
                photoId,
                mediaUrl 
            }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // 4. Fetch from Google
        let googleResponse;
        try {
            // TypeScript/Deno guard
            if (!effectiveUrl) throw new Error('No target URL resolved');

            googleResponse = await fetch(effectiveUrl, {
                headers: fetchHeaders,
                redirect: 'follow'
            });

            // If 401/403 with Auth header, try WITHOUT it.
            // Some Google Photos baseUrls (direct links) reject Authorization header if they were generated for public use or specific parameters.
            if ((googleResponse.status === 401 || googleResponse.status === 403) && fetchHeaders['Authorization']) {
                console.log(`[Proxy] Auth rejected for ${effectiveUrl.substring(0, 30)}... trying without Auth header`);
                const { Authorization, ...noAuthHeaders } = fetchHeaders;
                googleResponse = await fetch(effectiveUrl, {
                    headers: noAuthHeaders,
                    redirect: 'follow'
                });
            }
        } catch (e: any) {
            console.error(`[Proxy] Network error fetching from Google: ${e.message}`);
            return new Response(JSON.stringify({ error: `Network error: ${e.message}` }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        if (!googleResponse.ok && googleResponse.status !== 206) {
            const errText = await googleResponse.text().catch(() => 'No error body');
            console.error(`[Google Error] status: ${googleResponse.status} body: ${errText.substring(0, 200)}`);
            return new Response(errText, {
                status: googleResponse.status,
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
            const value = googleResponse.headers.get(header);
            if (value) responseHeaders.set(header, value);
        }

        const contentType = responseHeaders.get('content-type') || '';
        const isVideo = contentType.startsWith('video/') || contentType.startsWith('audio/');

        // 5. Apply Streaming Optimizations
        if (isVideo) {
            responseHeaders.set('X-Accel-Buffering', 'no');
            responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache for media
            responseHeaders.set('Accept-Ranges', 'bytes');
        } else {
            responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
        }

        // 6. Stream the response
        return new Response(googleResponse.body, {
            status: googleResponse.status,
            statusText: googleResponse.statusText,
            headers: responseHeaders,
        })

    } catch (error: any) {
        console.error(`[Proxy] Critical Exception: ${error.message}`);
        console.error(`[Proxy] Stack Trace: ${error.stack}`);
        return new Response(JSON.stringify({ 
            error: error.message,
            stack: error.stack,
            url: req.url 
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
