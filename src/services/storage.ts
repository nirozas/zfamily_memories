import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';

export const storageService = {
    /**
     * Uploads a file to Google Photos (primary).
     * @param file The file to upload
     * @param _bucket Unused
     * @param _pathPrefix Unused
     * @param onProgress Optional progress callback
     * @param googleAccessToken Required for Google Photos upload
     */
    async uploadFile(
        file: File,
        _bucket: string = 'album-assets',
        _pathPrefix: string = '',
        onProgress?: (progress: { loaded: number; total: number }) => void,
        googleAccessToken?: string | null
    ): Promise<{ url: string | null; error: string | null; googlePhotoId?: string }> {
        if (!googleAccessToken) {
            console.error('No Google Access Token provided. Sign in required.');
            return { url: null, error: 'Authentication required for Google Photos storage.' };
        }

        try {
            // 1. Compress image or video if it is one
            let fileToUpload = file;
            if (file.type.startsWith('image/')) {
                try {
                    const options = {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 2040,
                        useWebWorker: true
                    };
                    fileToUpload = await imageCompression(file, options);
                } catch (e) {
                    console.error('Image compression failed, using original:', e);
                }
            } else if (file.type.startsWith('video/')) {
                try {
                    const { videoCompressionService } = await import('./videoCompression');
                    if (onProgress) onProgress({ loaded: 10, total: 100 });
                    fileToUpload = await videoCompressionService.compressVideo(file, (p) => {
                        if (onProgress) onProgress({ loaded: Math.min(10 + (p * 0.8), 90), total: 100 });
                    });
                } catch (e) {
                    console.error('Video compression failed, using original:', e);
                }
            }

            // 2. Upload to Google Photos
            const { GooglePhotosService } = await import('./googlePhotos');
            const photosService = new GooglePhotosService(googleAccessToken);

            if (onProgress) onProgress({ loaded: 50, total: 100 });

            const mediaItem = await photosService.uploadMedia(fileToUpload);

            if (onProgress) onProgress({ loaded: 100, total: 100 });

            if (!mediaItem || !mediaItem.id) {
                throw new Error('No media item returned from Google Photos');
            }

            const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl || '';
            const isVideoResult = mediaItem.type === 'VIDEO' || 
                                mediaItem.mediaMetadata?.video || 
                                fileToUpload.type.startsWith('video/');
            
            const finalUrl = isVideoResult ? `${baseUrl}=dv` : `${baseUrl}=w9999-h9999`;

            return { url: finalUrl, error: null, googlePhotoId: mediaItem.id };

        } catch (error: any) {
            console.error('Storage upload error:', error);
            return { url: null, error: error.message || 'Upload failed' };
        }
    },

    async deleteFile(url: string): Promise<{ error: string | null }> {
        // Fallback or legacy cleanup
        if (url.includes('supabase.co')) {
            const path = url.split('/storage/v1/object/public/')[1];
            if (path) {
                const parts = path.split('/');
                const bucket = parts[0];
                const filePath = parts.slice(1).join('/');
                const { error } = await supabase.storage.from(bucket).remove([filePath]);
                return { error: error?.message || null };
            }
        }
        return { error: null };
    },

    /**
     * Ensures a Google Photos item is persistent.
     * Simply returns the item's info. No more Drive migration.
     */
    async persistGoogleMedia(
        item: any,
        _googleAccessToken: string
    ): Promise<{ url: string; googlePhotoId: string; type: 'image' | 'video' }> {
        const typeStr = (item.type || '').toUpperCase();
        const isVideo = typeStr === 'VIDEO'
            || item.mimeType?.toLowerCase().startsWith('video')
            || (item.mediaMetadata?.video)
            || (item.mediaFile?.mimeType?.toLowerCase().startsWith('video'));

        let finalUrl = item.mediaFile?.baseUrl || item.baseUrl || item.url || '';
        const finalId = item.id;

        // For videos, suggest video-download param (=dv)
        if (isVideo) {
            if (finalUrl && !finalUrl.includes('=dv') && !finalUrl.includes('drive.google.com')) {
                finalUrl = finalUrl.split('=')[0] + '=dv';
            }
        } else {
             // For images, suggest full resolution
             if (finalUrl && !finalUrl.includes('=w') && !finalUrl.includes('drive.google.com')) {
                 finalUrl = finalUrl.split('=')[0] + '=w9999-h9999';
             }
        }
        
        return { url: finalUrl, googlePhotoId: finalId, type: isVideo ? 'video' : 'image' };
    },
};
