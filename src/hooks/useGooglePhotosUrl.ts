/**
 * useMediaUrl — resolves the correct display URL for any media item.
 *
 * Cloudflare R2 URLs are permanent and public — no auth proxy needed.
 * Legacy Google Photos URLs are redirected through the Supabase proxy.
 * All other URLs are returned as-is.
 */
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GooglePhotosService } from '../services/googlePhotos';
import { CloudflareR2Service } from '../services/cloudflareR2';

export function useMediaUrl(
    url?: string | null,
    /** Legacy: Google Photo ID for proxy lookup */
    googlePhotoId?: string,
    shareToken?: string | null,
    isThumbnail?: boolean
) {
    const { googleAccessToken, user } = useAuth();

    const resolvedUrl = useMemo(() => {
        if (!url && !googlePhotoId) return undefined;

        // ── Cloudflare R2 URLs: permanent public CDN — no proxy needed ────────
        if (url && CloudflareR2Service.isR2Url(url)) {
            return url;
        }

        // ── Handle our custom Google Photos ID scheme ─────────────────────────
        if (url && url.startsWith('google-photos://')) {
            const explicitId = url.replace('google-photos://', '');
            return GooglePhotosService.getProxyUrl(
                url,
                googleAccessToken,
                shareToken,
                googlePhotoId || explicitId,
                isThumbnail,
                user?.id
            );
        }

        // ── Already a non-Google direct URL or ALREADY proxied ────────────────
        const isProxyUrl = url && url.includes('/functions/v1/get-google-media');
        const isGoogleUrl = url && (
            url.includes('googleusercontent.com') ||
            url.includes('photoslibrary.googleapis.com') ||
            url.includes('drive.google.com') ||
            url.includes('ggpht.com')
        );

        if (isProxyUrl) {
            return url;
        }

        if (!isGoogleUrl && !googlePhotoId && url) {
            return url;
        }

        // ── Legacy Google Photos items — proxy through Supabase Edge Function ─
        return GooglePhotosService.getProxyUrl(
            url || '',
            googleAccessToken,
            shareToken,
            googlePhotoId,
            isThumbnail,
            user?.id
        );
    }, [url, googlePhotoId, googleAccessToken, shareToken, isThumbnail, user?.id]);

    return { url: resolvedUrl };
}

/**
 * @deprecated Use useMediaUrl instead.
 * Kept for backward compatibility with components that import useGooglePhotosUrl.
 */
export function useGooglePhotosUrl(googlePhotoId?: string, initialUrl?: string, shareToken?: string | null, isThumbnail?: boolean) {
    return useMediaUrl(initialUrl, googlePhotoId, shareToken, isThumbnail);
}
