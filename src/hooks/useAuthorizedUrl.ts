import { useState, useEffect } from 'react';
import { CloudflareR2Service } from '../services/cloudflareR2';

/**
 * A hook that converts a potentially private R2 URL into an authorized presigned URL.
 */
export function useAuthorizedUrl(url?: string | null) {
    const [authorizedUrl, setAuthorizedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        
        async function load() {
            if (!url) {
                setAuthorizedUrl(null);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(false);

                // 1. If it's already an authorized URL (has signature), use it directly
                if (url.includes('X-Amz-Signature')) {
                    setAuthorizedUrl(url);
                    setLoading(false);
                    return;
                }

                // 2. If it's an R2 URL, get a fresh authorized URL
                if (CloudflareR2Service.isR2Url(url)) {
                    let key = '';
                    try {
                        const urlObj = new URL(url);
                        // Extract key from pathname
                        key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                        
                        if (key) {
                            try {
                                key = decodeURIComponent(key);
                            } catch (e) {
                                // Ignore decode errors
                            }
                        }
                    } catch (e) {
                        // Fallback: try manual strip
                        key = url.replace(CloudflareR2Service.publicUrl, '').replace(/^\//, '');
                    }

                    if (key) {
                        const authed = await CloudflareR2Service.getAuthorizedUrl(key);
                        if (isMounted) setAuthorizedUrl(authed);
                    } else {
                        if (isMounted) setAuthorizedUrl(url); // Fallback to raw
                    }
                } else {
                    // Not an R2 URL, use as is
                    if (isMounted) setAuthorizedUrl(url);
                }
            } catch (err) {
                console.error('[useAuthorizedUrl] Error:', err);
                if (isMounted) {
                    setError(true);
                    setAuthorizedUrl(url || null); // Last resort fallback
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        load();
        return () => { isMounted = false; };
    }, [url]);

    return { authorizedUrl, loading, error };
}
