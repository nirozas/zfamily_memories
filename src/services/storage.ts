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

            // 2. Upload to appropriate storage
            if (fileToUpload.type.startsWith('video/')) {
                const { GoogleDriveService } = await import('./googleDrive');
                const driveService = new GoogleDriveService(googleAccessToken);
                const driveFolderId = await driveService.getOrCreateWebsiteFolder();
                const driveFileId = await driveService.uploadFile(fileToUpload, driveFolderId);
                const finalUrl = GoogleDriveService.getDirectUrl(driveFileId);
                
                if (onProgress) onProgress({ loaded: 100, total: 100 });
                return { url: finalUrl, error: null, googlePhotoId: driveFileId };
            } else {
                const { GooglePhotosService } = await import('./googlePhotos');
                const photosService = new GooglePhotosService(googleAccessToken);

                if (onProgress) onProgress({ loaded: 50, total: 100 }); // Partial progress

                const mediaItem = await photosService.uploadMedia(fileToUpload);

                if (onProgress) onProgress({ loaded: 100, total: 100 });

                if (!mediaItem || !mediaItem.id) {
                    throw new Error('No media item returned from Google Photos');
                }

                const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl || '';
                const finalUrl = (mediaItem.type === 'VIDEO' || mediaItem.mediaMetadata?.video) ? `${baseUrl}=dv` : `${baseUrl}=w9999-h9999`;

                return { url: finalUrl, error: null, googlePhotoId: mediaItem.id };
            }

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
     * If it's a video, it migrates it to Google Drive.
     * If it's an image, it returns the baseUrl with a large size parameter.
     */
    async persistGoogleMedia(
        item: any,
        googleAccessToken: string
    ): Promise<{ url: string; googlePhotoId: string; type: 'image' | 'video' }> {
        const typeStr = (item.type || '').toUpperCase();
        const isVideo = typeStr === 'VIDEO'
            || item.mimeType?.toLowerCase().startsWith('video')
            || (item.mediaMetadata?.video)
            || (item.mediaFile?.mimeType?.toLowerCase().startsWith('video'));

        let finalUrl = item.mediaFile?.baseUrl || item.baseUrl || item.url || '';
        let finalId = item.id;

        if (isVideo && googleAccessToken) {
            try {
                const { GooglePhotosService } = await import('./googlePhotos');
                const { GoogleDriveService } = await import('./googleDrive');
                
                const photosService = new GooglePhotosService(googleAccessToken);
                // The item object might be from different pickers, ensure it's compatible
                const photoItem = {
                    id: item.id,
                    baseUrl: item.mediaFile?.baseUrl || item.baseUrl || item.url || '',
                    filename: item.filename || item.name || 'video.mp4',
                    mimeType: item.mimeType || item.mediaFile?.mimeType || 'video/mp4'
                };
                
                console.log(`[Storage] Migrating video ${item.id} to Drive. Source: ${photoItem.baseUrl.substring(0, 30)}...`);
                const blob = await photosService.downloadMediaItem(photoItem as any);
                const file = new File([blob], photoItem.filename, { type: blob.type || 'video/mp4' });

                const driveService = new GoogleDriveService(googleAccessToken);
                const driveFolderId = await driveService.getOrCreateWebsiteFolder();
                const driveFileId = await driveService.uploadFile(file, driveFolderId);
                
                finalUrl = GoogleDriveService.getDirectUrl(driveFileId);
                finalId = driveFileId;
                console.log(`[Storage] Successfully migrated video to Drive: ${driveFileId}`);
            } catch (err) {
                console.error('[Storage] Failed to migrate video to Drive:', err);
                // Fallback to proxy URL if migration fails
                if (finalUrl && !finalUrl.includes('=dv') && !finalUrl.includes('drive.google.com')) {
                    finalUrl += '=dv';
                }
            }
        } else {
             // For images, suggest full resolution
             if (finalUrl && !finalUrl.includes('=w') && !finalUrl.includes('drive.google.com')) {
                 finalUrl += '=w9999-h9999';
             }
        }
        
        return { url: finalUrl, googlePhotoId: finalId, type: isVideo ? 'video' : 'image' };
    }
};
