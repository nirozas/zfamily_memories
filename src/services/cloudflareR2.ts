import { supabase } from '../lib/supabase';

export interface R2UploadResult {
    url: string;
    key: string;
}

/**
 * Service for interacting with Cloudflare R2 via Supabase Edge Function proxy.
 * Ensures credentials remain secure on the server.
 */
export class CloudflareR2Service {
    private static _publicUrl = import.meta.env.VITE_R2_PUBLIC_URL as string;
    private static _authCache = new Map<string, string>();

    /**
     * Updates the public URL used to resolve media assets.
     * This allows for family-specific private storage domains.
     */
    static setPublicUrl(url: string) {
        if (!url) return;
        // Ensure no trailing slash
        this._publicUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    }

    /**
     * Gets the currently active R2 Public CDN URL.
     */
    static get publicUrl(): string {
        return this._publicUrl;
    }

    /**
     * Checks if a given URL belongs to our Cloudflare R2 bucket.
     */
    static isR2Url(url?: string | null): boolean {
        if (!url) return false;
        const lowerUrl = url.toLowerCase();
        
        // Check if it matches our configured public URL
        if (this._publicUrl && lowerUrl.includes(this._publicUrl.toLowerCase())) return true;
        
        // Generic check for R2 domains
        if (lowerUrl.includes('r2.dev')) return true;
        if (lowerUrl.includes('r2.cloudflarestorage.com')) return true;
        
        return false;
    }

    /**
     * Extracts the object key from a public R2 URL.
     */
    static extractKey(url?: string | null): string | null {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            let key = '';
            const lowerUrl = url.toLowerCase();
            
            if (lowerUrl.includes('r2.dev') || (this._publicUrl && lowerUrl.includes(this._publicUrl.toLowerCase()))) {
                key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
            } else {
                key = url.replace(this._publicUrl, '').replace(/^\//, '');
            }
            
            if (key) {
                try {
                    return decodeURIComponent(key);
                } catch (e) {
                    return key;
                }
            }
        } catch (e) {
            const key = url.replace(this._publicUrl, '').replace(/^\//, '');
            if (key) {
                try {
                    return decodeURIComponent(key);
                } catch (e) {
                    return key;
                }
            }
        }
        return null;
    }

    /**
     * Gets a cached authorized URL if present.
     */
    static getCachedUrl(key: string): string | null {
        return this._authCache.get(key) || null;
    }

    /**
     * Converts an R2 object key into its full public CDN URL.
     */
    static getPublicUrl(key: string): string {
        if (!key) return '';
        // Remove leading slash if present
        const cleanKey = key.startsWith('/') ? key.substring(1) : key;
        return `${this.publicUrl}/${cleanKey}`;
    }

    /**
     * Requests a presigned PUT URL from Supabase and uploads the file directly to R2.
     */
    static async uploadFile(
        file: File | Blob, 
        key: string, 
        contentType: string, 
        signal?: AbortSignal,
        onProgress?: (pct: number) => void
    ): Promise<string> {
        // 1. Get current session token
        const { data: { session } } = await supabase.auth.getSession();

        // 2. Get presigned URL from Edge Function
        const { data: { presignedUrl }, error: presignError } = await supabase.functions.invoke('get-r2-presigned-url', {
            body: { operation: 'PUT', key, contentType },
            headers: {
                Authorization: `Bearer ${session?.access_token}`
            }
        });

        if (presignError || !presignedUrl) {
            throw new Error(`Failed to get presigned URL: ${presignError?.message || 'Unknown error'}`);
        }

        // 2. Upload directly to R2 using XMLHttpRequest to track upload progress
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', presignedUrl);

            if (signal) {
                signal.addEventListener('abort', () => {
                    xhr.abort();
                    reject(new Error('Upload aborted'));
                });
            }

            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        onProgress(pct);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(this.getPublicUrl(key));
                } else {
                    reject(new Error(`R2 Upload failed: ${xhr.statusText} (${xhr.status})`));
                }
            };

            xhr.onerror = () => reject(new Error('R2 Upload failed (Network Error)'));
            xhr.onabort = () => reject(new Error('Upload aborted'));

            xhr.send(file);
        });
    }

    /**
     * Helper for uploading raw bytes (Uint8Array).
     */
    static async uploadBytes(data: Uint8Array, key: string, contentType: string): Promise<string> {
        const blob = new Blob([data as any], { type: contentType });
        return this.uploadFile(blob, key, contentType);
    }

    /**
     * Requests a presigned GET URL for secure, restricted access.
     * This is used when the R2 bucket public access is disabled.
     */
    static async getAuthorizedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        if (!key) return '';
        
        // 0. Check cache first
        if (this._authCache.has(key)) {
            return this._authCache.get(key)!;
        }

        // 1. Get presigned GET URL from Edge Function
        const { data: { session } } = await supabase.auth.getSession();
        
        const { data, error } = await supabase.functions.invoke('get-r2-presigned-url', {
            body: { operation: 'GET', key, expiresIn },
            headers: {
                Authorization: `Bearer ${session?.access_token}`
            }
        });

        if (error || !data?.presignedUrl) {
            console.error('[R2] Failed to get authorized URL for key:', key, 'Error:', error, 'Data:', data);
            return this.getPublicUrl(key);
        }

        // Store in cache
        this._authCache.set(key, data.presignedUrl);
        return data.presignedUrl;
    }

    /**
     * Requests an image via the Edge Function PROXY_GET.
     * This bypasses S3 API CORS issues by attaching CORS headers server-side,
     * and returns a local blob URL that will never taint a canvas.
     */
    static async getProxiedObjectUrl(key: string): Promise<string> {
        if (!key) return '';
        
        // 0. Check cache first
        if (this._authCache.has(`proxy_${key}`)) {
            return this._authCache.get(`proxy_${key}`)!;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Unauthorized");
        
        // We use raw fetch here because we need to extract the binary Blob, not JSON.
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/get-r2-presigned-url`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ operation: 'PROXY_GET', key, expiresIn: 3600 })
        });

        if (!response.ok) {
            console.error('[R2] Failed to get proxied URL for key:', key);
            return this.getPublicUrl(key);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        
        // Store in cache
        this._authCache.set(`proxy_${key}`, objectUrl);
        return objectUrl;
    }

    /**
     * Pre-authorizes a key to speed up future access.
     */
    static preAuthorize(key: string): void {
        if (!key || this._authCache.has(key)) return;
        this.getAuthorizedUrl(key).catch(() => {});
    }

    /**
     * Deletes an object from R2.
     */
    static async deleteObject(key: string): Promise<void> {
        const { data: { session } } = await supabase.auth.getSession();

        // 1. Get presigned URL for DELETE
        const { data: { presignedUrl }, error: presignError } = await supabase.functions.invoke('get-r2-presigned-url', {
            body: { operation: 'DELETE', key },
            headers: {
                Authorization: `Bearer ${session?.access_token}`
            }
        });

        if (presignError || !presignedUrl) {
            throw new Error(`Failed to get presigned URL for DELETE: ${presignError?.message || 'Unknown error'}`);
        }

        // 2. Perform DELETE request
        const response = await fetch(presignedUrl, {
            method: 'DELETE'
        });

        if (!response.ok && response.status !== 404) {
            throw new Error(`R2 Delete failed: ${response.statusText}`);
        }
    }
}
