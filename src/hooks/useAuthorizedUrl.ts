import { useState, useEffect } from 'react';
import { CloudflareR2Service } from '../services/cloudflareR2';

/**
 * A hook that converts a potentially private R2 URL into an authorized presigned URL.
 */
export function useAuthorizedUrl(url?: string | null) {
    const [authorizedUrl, setAuthorizedUrl] = useState<string | null>(() => {
        if (!url) return null;
        // Public R2 CDN URLs are accessible directly
        if (url.includes('pub-') && url.includes('.r2.dev')) return url;
        if (CloudflareR2Service.isR2Url(url)) {
            const key = CloudflareR2Service.extractKey(url);
            if (key) {
                const cached = CloudflareR2Service.getCachedUrl(key);
                if (cached) return cached;
            }
        }
        return url;
    });
    
    const [loading, setLoading] = useState(() => {
        if (!url) return false;
        // Public R2 CDN URLs are immediately accessible
        if (url.includes('pub-') && url.includes('.r2.dev')) return false;
        if (CloudflareR2Service.isR2Url(url)) {
            const key = CloudflareR2Service.extractKey(url);
            if (key && CloudflareR2Service.getCachedUrl(key)) return false;
            return true;
        }
        return false;
    });
    
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
                // 1. Public R2 CDN URLs (pub-*.r2.dev) are publicly accessible — use directly
                if (url.includes('pub-') && url.includes('.r2.dev')) {
                    if (isMounted) {
                        setAuthorizedUrl(url);
                        setLoading(false);
                    }
                    return;
                }

                // 2. If it's a private R2 URL, get a fresh authorized URL
                if (CloudflareR2Service.isR2Url(url)) {
                    const key = CloudflareR2Service.extractKey(url);
                    
                    if (key) {
                        const cached = CloudflareR2Service.getCachedUrl(key);
                        if (cached) {
                            if (isMounted) {
                                setAuthorizedUrl(cached);
                                setLoading(false);
                            }
                            return;
                        }

                        if (isMounted) setLoading(true);
                        const authed = await CloudflareR2Service.getAuthorizedUrl(key);
                        if (isMounted) {
                            setAuthorizedUrl(authed);
                            setLoading(false);
                        }
                    } else {
                        if (isMounted) {
                            setAuthorizedUrl(url);
                            setLoading(false);
                        }
                    }
                } else {
                    // Not an R2 URL, use as is
                    if (isMounted) {
                        setAuthorizedUrl(url);
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error('[useAuthorizedUrl] Error:', err);
                if (isMounted) {
                    setError(true);
                    setAuthorizedUrl(url || null); // Last resort fallback
                    setLoading(false);
                }
            }
        }

        load();
        return () => { isMounted = false; };
    }, [url]);

    return { authorizedUrl, loading, error };
}
