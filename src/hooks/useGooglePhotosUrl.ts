import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GooglePhotosService } from '../services/googlePhotos';

export function useGooglePhotosUrl(googlePhotoId?: string, initialUrl?: string, shareToken?: string | null, isThumbnail?: boolean) {
    const { googleAccessToken } = useAuth();
    const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(() => {
        const isGoogleUrl = initialUrl && (
            initialUrl.includes('googleusercontent.com') ||
            initialUrl.includes('photoslibrary.googleapis.com') ||
            initialUrl.includes('drive.google.com') ||
            initialUrl.includes('/functions/v1/get-google-media') // Already proxied
        );
        
        if (isGoogleUrl || (!initialUrl && googlePhotoId)) {
            return GooglePhotosService.getProxyUrl(initialUrl || '', googleAccessToken, shareToken, googlePhotoId, isThumbnail);
        }
        return initialUrl;
    });

    useEffect(() => {
        const isGoogleUrl = initialUrl && (
            initialUrl.includes('googleusercontent.com') ||
            initialUrl.includes('photoslibrary.googleapis.com') ||
            initialUrl.includes('drive.google.com') ||
            initialUrl.includes('/functions/v1/get-google-media')
        );

        const refreshUrl = async () => {
            if (!isGoogleUrl && initialUrl) {
                setResolvedUrl(initialUrl);
                return;
            }

            // Always use proxy for Google content (ID or URL)
            setResolvedUrl(GooglePhotosService.getProxyUrl(initialUrl || '', googleAccessToken, shareToken, googlePhotoId, isThumbnail));
        };

        refreshUrl();
    }, [googlePhotoId, googleAccessToken, initialUrl, shareToken, isThumbnail]);

    return { url: resolvedUrl };
}
