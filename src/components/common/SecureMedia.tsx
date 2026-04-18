import { useState, useEffect } from 'react';
import { CloudflareR2Service } from '../../services/cloudflareR2';
import { Loader2, ImageOff, Play } from 'lucide-react';
import { cn } from '../../lib/utils';


interface SecureImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'onLoadedMetadata'> {
    url?: string;
    objectKey?: string;
    fallback?: React.ReactNode;
    isVideo?: boolean;
    // Video-specific props that might be passed
    autoPlay?: boolean;
    loop?: boolean;
    muted?: boolean;
    playsInline?: boolean;
    controls?: boolean;
    onLoadedMetadata?: (e: React.SyntheticEvent<HTMLVideoElement, Event>) => void;
}

/**
 * A component that handles loading images from restricted R2 storage.
 * It automatically fetches an authorized presigned URL if the provided URL is an R2 link.
 */
export function SecureMedia({ 
    url, objectKey, className, fallback, isVideo = false, 
    autoPlay, loop, muted, playsInline, controls, onLoadedMetadata,
    ...rest 
}: SecureImageProps) {
    // Filter out component-specific props from reaching the DOM
    const { 
        alt, crossOrigin, decoding, height, loading: imgLoading, 
        referrerPolicy, sizes, srcSet, useMap, width,
        onLoad, onError, 
        ...domProps 
    } = rest as any;

    const [src, setSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;
        
        async function loadUrl() {
            if (!url && !objectKey) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(false);

                // If it's already an authorized URL (has signature), use it directly
                if (url?.includes('X-Amz-Signature')) {
                    setSrc(url);
                    setLoading(false);
                    return;
                }

                // If it's a public R2 URL or we have a key, get a fresh authorized URL
                if (objectKey || CloudflareR2Service.isR2Url(url)) {
                    // Extract key from URL if not provided
                    let key = objectKey;
                    if (!key && url) {
                        try {
                            const urlObj = new URL(url);
                            // If the URL is using the public domain, the path is the key
                            if (url.includes('r2.dev') || (CloudflareR2Service.publicUrl && url.includes(CloudflareR2Service.publicUrl))) {
                                key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                            } else {
                                // Fallback: try to strip the base URL
                                key = url.replace(CloudflareR2Service.publicUrl, '').replace(/^\//, '');
                            }
                            
                            // Decode the key since URL paths are encoded, 
                            // but the Edge Function will re-encode it.
                            if (key) {
                                try {
                                    key = decodeURIComponent(key);
                                } catch (e) {
                                    // Ignore decode errors, use as is
                                }
                            }
                        } catch (e) {
                            console.error('[SecureMedia] Failed to parse URL:', url, e);
                        }
                    }

                    if (key) {
                        // console.log(`[SecureMedia] Authorizing R2 key: "${key}"`);
                        const authorizedUrl = await CloudflareR2Service.getAuthorizedUrl(key);
                        
                        // Check if we got a different URL (success) or just the fallback
                        if (authorizedUrl && (authorizedUrl.includes('X-Amz-Signature') || !CloudflareR2Service.isR2Url(authorizedUrl))) {
                            if (isMounted) setSrc(authorizedUrl);
                        } else {
                            console.warn('[SecureMedia] getAuthorizedUrl returned fallback for key:', key);
                            if (isMounted) {
                                // We don't setSrc here if we want to avoid 401s, 
                                // but we might want to show an error instead
                                setError(true);
                            }
                        }
                    } else {
                        console.warn('[SecureMedia] Identified as R2 but could not extract key:', url);
                        if (isMounted) setError(true);
                    }
                } else if (url) {
                    // Not an R2 URL, use as is
                    if (isMounted) setSrc(url);
                }
            } catch (err) {
                console.error('[SecureMedia] Error loading secure URL:', err);
                if (isMounted) setError(true);
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        loadUrl();
        return () => { isMounted = false; };
    }, [url, objectKey]);

    if (loading) {
        return (
            <div className={cn("flex items-center justify-center bg-gray-50 animate-pulse", className)}>
                <Loader2 className="w-4 h-4 animate-spin text-catalog-accent/20" />
            </div>
        );
    }

    if (error || !src) {
        return (
            <div className={cn("flex items-center justify-center bg-gray-50 text-gray-300", className)}>
                {fallback || <ImageOff className="w-8 h-8 opacity-20" />}
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className={cn("relative w-full h-full", className)}>
                    <video 
                        src={src ? `${src}#t=0.1` : ''} 
                        className={cn("w-full h-full object-cover transition-opacity duration-300", loading ? "opacity-0" : "opacity-100")} 
                        muted={muted ?? true} 
                        playsInline={playsInline} 
                        autoPlay={autoPlay}
                        loop={loop}
                        controls={controls}
                        onLoadedMetadata={onLoadedMetadata as any}
                        preload="metadata"
                        {...domProps}
                    />
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 pointer-events-none">
                    <div className="bg-white/90 p-1.5 rounded-full shadow-lg">
                        <Play className="w-3.5 h-3.5 text-catalog-accent fill-current" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <img 
            src={src} 
            className={cn("transition-opacity duration-300", loading ? "opacity-0" : "opacity-100", className)} 
            {...domProps} 
        />
    );
}
