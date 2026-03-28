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

            // ── Image (Google Photos MIRRORED to Cloudflare R2) ────────────────
            if (file.type.startsWith('image/')) {
                let fileToUpload = file;
                try {
                    fileToUpload = await imageCompression(file, {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 2040,
                        useWebWorker: true,
                        onProgress: (p) => reportProgress(p * 0.4), // 0-40%
                    });
                } catch (e) {
                    console.warn('[Storage] Image compression failed, using original:', e);
                }

                let googlePhotoId: string | undefined;
                let googleUrl: string | null = null;

                // 1. Try to upload to Google Photos if token available
                if (googleAccessToken) {
                    try {
                        const { GooglePhotosService } = await import('./googlePhotos');
                        const photosService = new GooglePhotosService(googleAccessToken);
                        const mediaItem = await photosService.uploadMedia(fileToUpload);
                        if (mediaItem?.id) {
                            googlePhotoId = mediaItem.id;
                            const baseUrl = mediaItem.mediaFile?.baseUrl || mediaItem.baseUrl || '';
                            googleUrl = `${baseUrl}=w9999-h9999`;
                        }
                    } catch (e) {
                        console.error('[Storage] Google Photos mirror failed:', e);
                    }
                }
                reportProgress(50); // 50%

                // 2. Mirror to R2 ONLY if Google upload failed or wasn't attempted
                // (Supporting user request: "does not save images in a different storage platform")
                // 2. Photos strictly on Google Photos: NO R2 Mirroring
                // (Per user request: "does not save photos in a different storage platform")
                if (googleUrl) {
                    return { url: googleUrl, error: null, googlePhotoId };
                }

                // Fallback for cases without Google Token (internal use only)
                const { url: r2Url, key: r2Key } = await CloudflareR2Service.uploadFile(
                    fileToUpload,
                    pathPrefix || `media/uploads/${Date.now()}`,
                    (p) => reportProgress(50 + p * 0.5) // 50-100%
                );

                if (!r2Url) throw new Error('Failed to upload image to R2');
                return { url: r2Url, error: null, r2Key, googlePhotoId };
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
     * Resolves a Google Photos item for permanent use.
     * 
     * IMPORTANT: We now prefer a "Direct Proxy" model where we save the googlePhotoId
     * instead of copying the file to R2. This avoids timeouts, respects user storage 
     * preferences, and stays permanent via the ID resolution in our Edge Function.
     */
    /**
     * Resolves a Google Photos item for permanent use.
     * 
     * STRATEGY:
     * - Photos → Stay on Google Photos via secure ID resolution (Zero-storage/CORS bypass).
     * - Videos → Transferred to Cloudflare R2 + FFmpeg for high-speed HLS streaming.
     */
    async persistGoogleMedia(
        item: any,
        googleAccessToken: string,
        familyId?: string,
        folderName?: string,
        onProgress?: (progress: number) => void,
        useHls: boolean = false
    ): Promise<{ url: string; googlePhotoId: string; type: 'image' | 'video'; r2Key?: string }> {
        const typeStr = (item.type || '').toUpperCase();
        const isVideo = typeStr === 'VIDEO'
            || item.mimeType?.toLowerCase().startsWith('video')
            || item.mediaMetadata?.video
            || item.mediaFile?.mimeType?.toLowerCase().startsWith('video');

        const finalId = item.id || '';
        const rawUrl = item.url || item.mediaFile?.baseUrl || item.baseUrl || '';

        // --- Photos: Permanent Identity via Google ID (Direct Link) ---
        if (!isVideo) {
            return { url: rawUrl, googlePhotoId: finalId, type: 'image' };
        }

        // --- Videos: High-Performance HLS Persistence to Cloudflare R2 ---
        try {
            const uploadPrefix = familyId
                ? `media/${familyId}/vault/${folderName || 'Unsorted'}/imported_gp`
                : `media/unsorted/${Date.now()}`;

            const { GooglePhotosService } = await import('./googlePhotos');
            // Videos need download URL (=dv)
            let proxyInputUrl = rawUrl;
            if (proxyInputUrl && !proxyInputUrl.includes('=dv') && !proxyInputUrl.includes('drive.google.com')) {
                proxyInputUrl = proxyInputUrl.split('=')[0] + '=dv';
            }

            const proxyUrl = GooglePhotosService.getProxyUrl(proxyInputUrl, googleAccessToken, null, finalId);
            
            console.log(`[Storage] Persisting VIDEO to R2 + HLS: ${finalId}`);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error(`Google Photos video fetch failed: ${response.status}`);
            
            const blob = await response.blob();
            const mimeType = item.mimeType || item.mediaFile?.mimeType || 'video/mp4';
            const file = new File([blob], item.filename || `gp-video-${Date.now()}.mp4`, { type: mimeType });
            
            if (useHls) {
                const result = await encodeAndUploadHls(file, uploadPrefix, onProgress);
                if (result.masterUrl) {
                    return { url: result.masterUrl, googlePhotoId: finalId, type: 'video', r2Key: result.r2KeyPrefix };
                }
            } else {
                const { url, key } = await CloudflareR2Service.uploadFile(file, uploadPrefix, (p) => {
                    if (onProgress) onProgress(p);
                });
                if (url) return { url, googlePhotoId: finalId, type: 'video', r2Key: key };
            }
        } catch (err) {
            console.error('[Storage] Video transfer failed, falling back to Google ID.', err);
        }

        return { url: rawUrl, googlePhotoId: finalId, type: 'video' };
    },
};
