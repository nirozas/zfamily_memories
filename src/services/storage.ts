import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';
import { CloudflareR2Service } from './cloudflareR2';
import { encodeAndUploadHls } from './videoCompression';

/**
 * Unified media storage service:
 * 
 * Images  → compressed, then uploaded to Google Photos
 * Videos  → optionally HLS-encoded and segmented → uploaded to Cloudflare R2 (master.m3u8)
 *           (falls back to single compressed mp4 on R2 if HLS is disabled)
 */
export const storageService = {
    /**
     * Upload a file. Images go to Google Photos, Videos go to Cloudflare R2.
     *
     * @param file              The file to upload (image or video)
     * @param _bucket           Legacy param – ignored
     * @param pathPrefix        R2 key prefix (used for videos only)
     * @param onProgress        Progress callback (0-100 mapped to {loaded, total})
     * @param googleAccessToken Required for Google Photos (image uploads)
     * @param useHls            For videos: encode as HLS adaptive streams on R2
     */
    async uploadFile(
        file: File,
        _bucket: string = 'album-assets',
        pathPrefix: string = '',
        onProgress?: (progress: { loaded: number; total: number }) => void,
        googleAccessToken?: string | null,
        useHls: boolean = false
    ): Promise<{ url: string | null; error: string | null; r2Key?: string; googlePhotoId?: string }> {
        try {
            const reportProgress = (pct: number) => {
                onProgress?.({ loaded: Math.round(pct), total: 100 });
            };

            // ── Image (Google Photos) ──────────────────────────────────────────
            if (file.type.startsWith('image/')) {
                if (!googleAccessToken) {
                    console.error('No Google Access Token provided for image upload. Sign in required.');
                    return { url: null, error: 'Authentication required for Google Photos image upload.' };
                }

                let fileToUpload = file;
                try {
                    fileToUpload = await imageCompression(file, {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 2040,
                        useWebWorker: true,
                        onProgress: (p) => reportProgress(p * 0.9),
                    });
                } catch (e) {
                    console.warn('[Storage] Image compression failed, using original:', e);
                }

                reportProgress(90);
                const { GooglePhotosService } = await import('./googlePhotos');
                const photosService = new GooglePhotosService(googleAccessToken);

                const mediaItem = await photosService.uploadMedia(fileToUpload);
                if (!mediaItem || !mediaItem.id) {
                    throw new Error('No media item returned from Google Photos');
                }

                reportProgress(100);

                const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl || '';
                const finalUrl = `${baseUrl}=w9999-h9999`;

                return { url: finalUrl, error: null, googlePhotoId: mediaItem.id };
            }

            // ── Video (Cloudflare R2) ────────────────────────────────────────────
            if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
                if (useHls) {
                    // Full HLS adaptive bitrate encoding + upload
                    const keyPrefix = `${pathPrefix.replace(/\/$/, '')}/hls_${Date.now()}`;
                    const result = await encodeAndUploadHls(
                        file,
                        keyPrefix,
                        reportProgress
                    );
                    return { url: result.masterUrl, error: null, r2Key: result.r2KeyPrefix };
                } else {
                    // Single-file compressed upload (faster, no HLS)
                    reportProgress(5);
                    let videoToUpload = file;
                    try {
                        const { videoCompressionService } = await import('./videoCompression');
                        videoToUpload = await videoCompressionService.compressVideo(file, (p) => {
                            reportProgress(5 + p * 0.8);
                        });
                    } catch (e) {
                        console.warn('[R2] Video compression failed, uploading original:', e);
                    }

                    reportProgress(85);
                    const { url, key } = await CloudflareR2Service.uploadFile(
                        videoToUpload,
                        pathPrefix,
                        (p) => reportProgress(85 + p * 0.15)
                    );
                    reportProgress(100);
                    return { url, error: null, r2Key: key };
                }
            }

            // ── Generic binary (audio, docs, etc. -> R2) ────────────────────────────
            const { url, key } = await CloudflareR2Service.uploadFile(file, pathPrefix, (p) => reportProgress(p));
            return { url, error: null, r2Key: key };

        } catch (error: any) {
            console.error('[Storage] Upload error:', error);
            return { url: null, error: error.message || 'Upload failed' };
        }
    },

    /**
     * Delete a file from storage.
     * Supports R2 URLs and legacy Supabase Storage URLs.
     */
    async deleteFile(url: string): Promise<{ error: string | null }> {
        try {
            if (CloudflareR2Service.isR2Url(url)) {
                const r2PublicUrl = import.meta.env.VITE_R2_PUBLIC_URL as string;
                const key = url.replace(`${r2PublicUrl}/`, '');
                if (key) await CloudflareR2Service.deleteObject(key);
                return { error: null };
            }

            // Legacy Supabase Storage cleanup
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
        } catch (err: any) {
            return { error: err.message || 'Delete failed' };
        }
        return { error: null };
    },

    /**
     * Returns a permanent public CDN URL for a given R2 key.
     * Useful when you have the key from a previous upload but not the URL.
     */
    getPublicUrl(key: string): string {
        return CloudflareR2Service.getPublicUrl(key);
    },

    /**
     * Legacy shim — kept for compatibility with components converting Google Photos
     * to persistent library URLs.
     */
    async persistGoogleMedia(
        item: any,
        googleAccessToken: string,
        familyId?: string,
        folderName?: string,
        onProgress?: (progress: number) => void,
        useHls: boolean = false
    ): Promise<{ url: string; googlePhotoId: string; type: 'image' | 'video'; r2Key?: string }> {
        // If already an R2 URL, just pass through
        let finalUrl = item.url || item.mediaFile?.baseUrl || item.baseUrl || '';
        const typeStr = (item.type || '').toUpperCase();
        const isVideo = typeStr === 'VIDEO'
            || item.mimeType?.toLowerCase().startsWith('video')
            || item.mediaMetadata?.video
            || item.mediaFile?.mimeType?.toLowerCase().startsWith('video');

        const finalId = item.id || '';

        if (CloudflareR2Service.isR2Url(finalUrl)) {
            return { url: finalUrl, googlePhotoId: finalId, type: isVideo ? 'video' : 'image' };
        }

        // For videos, download from Google Photos and upload directly to Cloudflare R2!
        if (isVideo) {
            if (finalUrl && !finalUrl.includes('=dv') && !finalUrl.includes('drive.google.com')) {
                finalUrl = finalUrl.split('=')[0] + '=dv';
            }

            try {
                // Determine destination
                const uploadPrefix = familyId
                    ? `media/${familyId}/vault/${folderName || 'Unsorted'}/imported_gp`
                    : `media/unsorted/${Date.now()}`;

                // Import proxy
                const { GooglePhotosService } = await import('./googlePhotos');
                const proxyUrl = GooglePhotosService.getProxyUrl(finalUrl, googleAccessToken);
                
                // Active Download
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`Google Photos fetch failed: ${response.status}`);
                
                const blob = await response.blob();
                const mimeType = item.mimeType || item.mediaFile?.mimeType || 'video/mp4';
                const file = new File([blob], item.filename || `gp-vid-${Date.now()}.mp4`, { type: mimeType });
                
                // Seamlessly push to R2 Storage bucket!
                if (useHls) {
                    const result = await encodeAndUploadHls(file, uploadPrefix, onProgress);
                    if (result.masterUrl) {
                        return { url: result.masterUrl, googlePhotoId: finalId, type: 'video', r2Key: result.r2KeyPrefix };
                    }
                } else {
                    const { url, key } = await CloudflareR2Service.uploadFile(file, uploadPrefix, (p) => {
                        if (onProgress) onProgress(p);
                    });
                    
                    if (url) {
                        return { url, googlePhotoId: finalId, type: 'video', r2Key: key };
                    }
                }
            } catch (err) {
                console.error('[Storage] Failed to transfer Google Photos Video to R2. Falling back to native URL.', err);
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
