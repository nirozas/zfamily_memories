import { useState, useEffect } from 'react';
import { CloudflareR2Service } from '../../services/cloudflareR2';
import { Loader2, ImageOff, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

import { type UploadedItem } from '../../hooks/useUploadManager';

interface SecureImageProps extends React.ImgHTMLAttributes<HTMLImageElement | HTMLVideoElement> {
    url?: string;
    objectKey?: string;
    fallback?: React.ReactNode;
    isVideo?: boolean;
}

/**
 * A component that handles loading images from restricted R2 storage.
 * It automatically fetches an authorized presigned URL if the provided URL is an R2 link.
 */
export function SecureMedia({ url, objectKey, className, fallback, isVideo = false, ...rest }: SecureImageProps) {
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
                            key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                        } catch (e) {
                            // Fallback for relative paths or bad URLs
                            key = url.replace(CloudflareR2Service.publicUrl, '').replace(/^\//, '');
                        }
                    }

                    if (key) {
                        const authorizedUrl = await CloudflareR2Service.getAuthorizedUrl(key);
                        if (isMounted) setSrc(authorizedUrl);
                    } else if (url) {
                        if (isMounted) setSrc(url);
                    }
                } else if (url) {
                    // Normalize proxies or Cloudinary if any
                    if (url.includes('cloudinary')) {
                         setSrc(url);
                    } else {
                         setSrc(url);
                    }
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
                        muted 
                        playsInline 
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
