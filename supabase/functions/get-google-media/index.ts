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
        const userId = url.searchParams.get('uid')

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

        // --- REFRESH LOGIC: Get fresh token from Database if needed ---
        if (!accessToken || accessToken === 'null' || accessToken === 'undefined') {
            const lookUpId = userId || null;
            
            if (lookUpId || shareToken) {
                console.log(`[Proxy] Attempting to find refresh token for ${lookUpId ? `user: ${lookUpId}` : `share: ${shareToken}`}`);
                try {
                    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0")
                    const supabaseAdmin = createClient(
                        Deno.env.get('SUPABASE_URL') ?? '',
                        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                    )

                    let targetUserId = lookUpId;

                    // If shareToken provided but no userId, find the link creator
                    if (!targetUserId && shareToken) {
                        const { data: shareLink } = await supabaseAdmin
                            .from('shared_links')
                            .select('created_by, expires_at, is_active')
                            .eq('token', shareToken)
                            .single()
                        
                        if (shareLink?.is_active && new Date(shareLink.expires_at) > new Date()) {
                            targetUserId = shareLink.created_by;
                        }
                    }

                    if (targetUserId) {
                        const { data: creds } = await supabaseAdmin
                            .from('user_google_credentials')
                            .select('refresh_token')
                            .eq('user_id', targetUserId)
                            .single()

                        if (creds?.refresh_token) {
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
                                console.log(`[Proxy] Successfully refreshed token for user: ${targetUserId}`);
                            }
                        }
                    }
                } catch (e) {
                    console.error("[Proxy] Token refresh failed:", e);
                }
            }
        }
        // -------------------------------------------------------------

        // 2. Prepare headers for Google
        const fetchHeaders: Record<string, string> = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }

        if (accessToken && accessToken !== 'null' && accessToken !== 'undefined') {
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

            // TRY MULTIPLE APIs: Library API, Picker API, and Drive API (for legacy videos)
            const apis = [
                { url: `https://photoslibrary.googleapis.com/v1/mediaItems/${photoId}`, type: 'photos' },
                { url: `https://photospicker.googleapis.com/v1/mediaItems/${photoId}`, type: 'photos' },
                { url: `https://www.googleapis.com/drive/v3/files/${photoId}?fields=id,mimeType,thumbnailLink`, type: 'drive' }
            ];

            let resolvedItem = null;
            let resolvedType = null;
            let resolutionErrors: string[] = [];

            // Helper to try all APIs
            async function tryResolution(currentToken: string) {
                for (const api of apis) {
                    try {
                        const apiResponse = await fetch(api.url, {
                            headers: { 'Authorization': `Bearer ${currentToken}` }
                        });

                        if (apiResponse.ok) {
                            const item = await apiResponse.json();
                            return { item, type: api.type };
                        } else {
                            const errText = await apiResponse.text();
                            resolutionErrors.push(`${api.type} API ${apiResponse.status}: ${errText}`);
                        }
                    } catch (e: any) {
                        resolutionErrors.push(`${api.type} API fetch failed: ${e.message}`);
                    }
                }
                return null;
            }

            // Attempt 1 with current token
            const result = await tryResolution(accessToken);
            if (result) {
                resolvedItem = result.item;
                resolvedType = result.type;
            } else if (userId || shareToken) {
                // EXPIRED? Try refreshing once if we have IDs
                console.log(`[Proxy] Initial resolution failed, attempting token refresh for ID: ${userId || shareToken}`);
                try {
                    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.39.0")
                    const supabaseAdmin = createClient(
                        Deno.env.get('SUPABASE_URL') ?? '',
                        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
                    )

                    let targetUserId = userId;
                    if (!targetUserId && shareToken) {
                        const { data: shareLink } = await supabaseAdmin.from('shared_links').select('created_by').eq('token', shareToken).single();
                        if (shareLink) targetUserId = shareLink.created_by;
                    }

                    if (targetUserId) {
                        const { data: creds } = await supabaseAdmin.from('user_google_credentials').select('refresh_token').eq('user_id', targetUserId).single();
                        if (creds?.refresh_token) {
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
                                console.log(`[Proxy] Refreshed token after 401/fail, retrying...`);
                                accessToken = refreshData.access_token;
                                const retryResult = await tryResolution(accessToken);
                                if (retryResult) {
                                    resolvedItem = retryResult.item;
                                    resolvedType = retryResult.type;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("[Proxy] Double-refresh failed:", e);
                }
            }
            if (!resolvedItem) {
                console.error(`[Proxy] Failed to resolve photoId ${photoId}. Errors:`, resolutionErrors);
                // Fallback to mediaUrl if available
                if (!mediaUrl || !mediaUrl.startsWith('http')) {
                    return new Response(JSON.stringify({ 
                        error: "Could not resolve Google ID", 
                        details: resolutionErrors,
                        photoId
                    }), {
                        status: 404,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            } else if (resolvedType === 'drive') {
                const item = resolvedItem;
                effectiveContentType = item.mimeType;
                if (isThumbnail && item.thumbnailLink) {
                    effectiveUrl = item.thumbnailLink.replace(/=s[0-9]+$/, '=s800');
                } else {
                    effectiveUrl = `https://www.googleapis.com/drive/v3/files/${photoId}?alt=media`;
                }
                console.log(`[Proxy] Drive ID ${photoId} -> ${effectiveUrl} (mime: ${effectiveContentType})`);
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
                console.log(`[Proxy] Photos ID ${photoId} -> ${effectiveUrl.substring(0, 50)}... (isThumb: ${isThumbnail})`);
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

        // 5. Apply Streaming Optimizations & Edge Caching
        if (isVideo) {
            responseHeaders.set('X-Accel-Buffering', 'no');
            // Cache in browser for 1 year, but also tell Supabase Edge Network to cache it for 1 hour
            // This makes subsequent requests (including Range requests) much faster.
            responseHeaders.set('Cache-Control', 'public, max-age=31536000, s-maxage=3600, immutable'); 
            responseHeaders.set('Accept-Ranges', 'bytes');
        } else {
            responseHeaders.set('Cache-Control', 'public, max-age=31536000, s-maxage=3600, immutable');
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
