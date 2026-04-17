import { supabase } from '../lib/supabase';

/**
 * Service for interacting with Backblaze B2.
 * Used primarily for system assets and potentially as a backup storage provider.
 */
export class BackblazeB2Service {
    private static BUCKET_NAME = 'ZFamilywebsite'; // Hardcoded based on previous migration, ideally in env

    /**
     * Uploads a file to Backblaze B2 using a Supabase Edge Function as a proxy.
     * This bypasses CORS and keeps the Application Key secure.
     */
    static async uploadFile(file: File | Blob, key: string, contentType: string, signal?: AbortSignal): Promise<string> {
        // 1. Get current session token for the Edge Function
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.access_token) {
            console.error('[B2] No active session found for upload');
            throw new Error('You must be logged in to upload system assets.');
        }

        // 2. Convert file to Base64 for transport through the Edge Function
        const fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                // Strip the "data:image/jpeg;base64," prefix
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        console.log('[B2] Sending Proxy Upload:', {
            key,
            contentType,
            fileBase64Length: fileBase64?.length
        });

        // 3. Perform Proxy Upload 
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/get-b2-upload-url`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ key, contentType, fileBase64 }),
            signal
        });

        if (!res.ok) {
            const errorText = await res.text();
            console.error('[B2] Proxy Upload Error:', res.status, errorText);
            throw new Error(`Upload failed (${res.status}): ${errorText}`);
        }

        const uploadData = await res.json();
        
        // Construct the public URL
        // Using the native B2 public URL structure
        return `https://f004.backblazeb2.com/file/${this.BUCKET_NAME}/${uploadData.fileName}`;
    }

    /**
     * Checks if a URL is a Backblaze B2 URL.
     */
    static isB2Url(url?: string | null): boolean {
        if (!url) return false;
        return url.includes('backblazeb2.com');
    }
}
