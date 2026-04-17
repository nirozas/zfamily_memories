import { supabase } from '../lib/supabase';
import imageCompression from 'browser-image-compression';
import { CloudflareR2Service } from './cloudflareR2';
import { BackblazeB2Service } from './backblazeB2';

/**
 * Unified media storage service:
 * 
 * Images  → compressed, then uploaded to Cloudflare R2 (Family) or Backblaze B2 (System)
 * Videos  → optionally HLS-encoded and segmented → uploaded to Cloudflare R2
 */
export const storageService = {
    /**
     * Upload a file to Cloudflare R2 or Backblaze B2.
     *
     * @param file              The file to upload (image or video)
     * @param bucket           The bucket name
     * @param pathPrefix        R2/B2 key prefix
     * @param onProgress        Progress callback
     * @param useHls            For videos: encode as HLS
     */
    async uploadFile(
        file: File,
        _bucket: string = 'zoabimemories',
        pathPrefix: string = 'media',
        onProgress?: (progress: { loaded: number; total: number }) => void,
        useHls: boolean = false,
        isSystemAsset: boolean = false,
        signal?: AbortSignal
    ): Promise<{ url: string | null; error: string | null; r2Key?: string }> {
        try {
            const reportProgress = (pct: number) => {
                onProgress?.({ loaded: Math.round(pct), total: 100 });
            };

            let fileToUpload = file;
            
            // 1. Process Images
            if (file.type.startsWith('image/')) {
                try {
                    reportProgress(10);
                    fileToUpload = await imageCompression(file, {
                        maxSizeMB: 1,
                        maxWidthOrHeight: 2040,
                        useWebWorker: true,
                        onProgress: (p) => {
                            // Detect if p is 0-1 or 0-100
                            const normalized = p > 1 ? p / 100 : p;
                            reportProgress(10 + normalized * 40); // 10-50%
                        },
                    });
                } catch (e) {
                    console.warn('[Storage] Image compression failed, using original:', e);
                }

                const timestamp = Date.now();
                const key = `${pathPrefix}/${timestamp}_${file.name.replace(/\s+/g, '_')}`;
                
                reportProgress(60);
                
                let url: string;
                if (isSystemAsset) {
                    url = await BackblazeB2Service.uploadFile(fileToUpload, key, fileToUpload.type, signal);
                } else {
                    url = await CloudflareR2Service.uploadFile(
                        fileToUpload, 
                        key, 
                        fileToUpload.type, 
                        signal,
                        (p) => reportProgress(60 + p * 0.4) // 60-100%
                    );
                }
                
                reportProgress(100);

                return { url, error: null, r2Key: key };
            } 
            
            // 2. Process Videos
            else if (file.type.startsWith('video/') || file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i)) {
                const timestamp = Date.now();
                const cleanName = file.name.replace(/\.[^/.]+$/, "").replace(/\s+/g, '_');
                const keyPrefix = `${pathPrefix}/${timestamp}_${cleanName}`;

                if (useHls) {
                    reportProgress(5);
                    const { encodeAndUploadHls } = await import('./videoCompression');
                    const result = await encodeAndUploadHls(file, keyPrefix, (p) => {
                        const normalized = p > 1 ? p / 100 : p;
                        reportProgress(5 + normalized * 0.95); // 5-100%
                    });
                    return { url: result.masterUrl, error: null, r2Key: result.r2KeyPrefix };
                } else {
                    // Simple compression then R2 upload
                    try {
                        reportProgress(5);
                        const { videoCompressionService } = await import('./videoCompression');
                        fileToUpload = await videoCompressionService.compressVideo(file, (p) => {
                            const normalized = p > 1 ? p / 100 : p;
                            reportProgress(5 + normalized * 0.45); // 5-50%
                        });
                    } catch (e) {
                        console.warn('[Storage] Video compression failed:', e);
                    }

                    const key = `${keyPrefix}.mp4`;
                    reportProgress(60);
                    
                    let url: string;
                    if (isSystemAsset) {
                        url = await BackblazeB2Service.uploadFile(fileToUpload, key, 'video/mp4', signal);
                    } else {
                        url = await CloudflareR2Service.uploadFile(
                            fileToUpload, 
                            key, 
                            'video/mp4', 
                            signal,
                            (p) => reportProgress(60 + p * 0.4) // 60-100%
                        );
                    }

                    reportProgress(100);
                    return { url, error: null, r2Key: key };
                }
            }

            return { url: null, error: 'Unsupported file type' };

        } catch (error: any) {
            console.error('[Storage] Upload error:', error);
            return { url: null, error: error.message || 'Upload failed' };
        }
    },

    /**
     * Delete a file from storage.
     */
    async deleteFile(url: string): Promise<{ error: string | null }> {
        try {
            if (CloudflareR2Service.isR2Url(url)) {
                // Determine key from URL safely using URL API
                try {
                    const urlObj = new URL(url);
                    // Remove leading slash to get the R2 key
                    const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                    
                    if (key) {
                        await CloudflareR2Service.deleteObject(key);
                    }
                } catch (urlErr) {
                    // Fallback to simpler replace if URL parsing fails
                    const r2PublicUrl = CloudflareR2Service.publicUrl;
                    const key = url.replace(r2PublicUrl, '').split('?')[0].replace(/^\//, '');
                    if (key) await CloudflareR2Service.deleteObject(key);
                }
                return { error: null };
            }
        } catch (err: any) {
            console.error('[Storage] Delete error:', err);
            return { error: err.message || 'Delete failed' };
        }
        return { error: null };
    },

    /**
     * Returns a permanent public CDN URL for a given R2 key.
     */
    getPublicUrl(key: string): string {
        return CloudflareR2Service.getPublicUrl(key);
    },
};
