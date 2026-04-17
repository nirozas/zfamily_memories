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
        return url.includes(this.publicUrl) || url.includes('r2.dev');
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
    static async uploadFile(file: File | Blob, key: string, contentType: string): Promise<string> {
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

        // 2. Upload directly to R2
        const response = await fetch(presignedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file
        });

        if (!response.ok) {
            throw new Error(`R2 Upload failed: ${response.statusText}`);
        }

        return this.getPublicUrl(key);
    }

    /**
     * Helper for uploading raw bytes (Uint8Array).
     */
    static async uploadBytes(data: Uint8Array, key: string, contentType: string): Promise<string> {
        const blob = new Blob([data], { type: contentType });
        return this.uploadFile(blob, key, contentType);
    }

    /**
     * Requests a presigned GET URL for secure, restricted access.
     * This is used when the R2 bucket public access is disabled.
     */
    static async getAuthorizedUrl(key: string, expiresIn: number = 3600): Promise<string> {
        if (!key) return '';
        
        const { data: { session } } = await supabase.auth.getSession();
        
        // 1. Get presigned GET URL from Edge Function
        const { data, error } = await supabase.functions.invoke('get-r2-presigned-url', {
            body: { operation: 'GET', key, expiresIn },
            headers: {
                Authorization: `Bearer ${session?.access_token}`
            }
        });

        if (error || !data?.presignedUrl) {
            console.error('[R2] Failed to get authorized URL:', error);
            // Fallback to public URL (if still active) or return empty
            return this.getPublicUrl(key);
        }

        return data.presignedUrl;
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
