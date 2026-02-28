import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GooglePhotosService } from '../services/googlePhotos';

export function useGooglePhotosUrl(googlePhotoId?: string, initialUrl?: string, shareToken?: string | null) {
    const { googleAccessToken } = useAuth();
    const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(initialUrl);

    useEffect(() => {
        const isGoogleUrl = initialUrl && (
            initialUrl.includes('googleusercontent.com') ||
            initialUrl.includes('photoslibrary.googleapis.com')
        );

        const refreshUrl = async () => {
            if (!googlePhotoId || !googleAccessToken) {
                // If we don't have a token but have a shareToken, we can still try proxying with shareToken
                if (isGoogleUrl && shareToken) {
                    setResolvedUrl(GooglePhotosService.getProxyUrl(initialUrl!, null, shareToken));
                } else {
                    setResolvedUrl(initialUrl);
                }
                return;
            }

            try {
                const gpService = new GooglePhotosService(googleAccessToken);
                const item = await gpService.getMediaItem(googlePhotoId);
                const isVideo = item.mediaMetadata?.video || item.mimeType?.startsWith('video') || item.mediaFile?.mimeType?.startsWith('video');
                const freshUrl = isVideo ? `${item.baseUrl || item.mediaFile?.baseUrl}=dv` : `${item.baseUrl || item.mediaFile?.baseUrl}=w2048`;
                setResolvedUrl(GooglePhotosService.getProxyUrl(freshUrl, googleAccessToken, shareToken));
            } catch (err) {
                console.warn('[useGooglePhotosUrl] Refresh failed, falling back to proxying initial:', err);
                if (isGoogleUrl) {
                    setResolvedUrl(GooglePhotosService.getProxyUrl(initialUrl!, googleAccessToken, shareToken));
                } else {
                    setResolvedUrl(initialUrl);
                }
            }
        };

        if (isGoogleUrl) {
            if (googlePhotoId && googleAccessToken) {
                refreshUrl();
            } else {
                setResolvedUrl(GooglePhotosService.getProxyUrl(initialUrl!, googleAccessToken, shareToken));
            }
        } else if (googlePhotoId && (googleAccessToken || shareToken)) {
            refreshUrl();
        } else {
            setResolvedUrl(initialUrl);
        }
    }, [googlePhotoId, googleAccessToken, initialUrl, shareToken]);

    return { url: resolvedUrl };
}
