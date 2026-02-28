export interface GoogleMediaItem {
    id: string;
    type: 'PHOTO' | 'VIDEO';
    mediaFile: {
        baseUrl: string;
        mimeType: string;
        video?: any;
    };
    creationTime: string;
    // For compatibility with Library API during uploads
    baseUrl?: string;
    mimeType?: string;
    filename?: string;
    description?: string;
    mediaMetadata?: {
        width: string;
        height: string;
        photo?: any;
        video?: any;
    };
}

export interface GooglePhotosSearchResponse {
    mediaItems?: GoogleMediaItem[];
    nextPageToken?: string;
}

export class GooglePhotosService {
    private accessToken: string | null = null;
    private pickerBaseUrl = 'https://photospicker.googleapis.com/v1';
    private libraryBaseUrl = 'https://photoslibrary.googleapis.com/v1';

    constructor(accessToken: string | null) {
        this.accessToken = accessToken;
    }

    private async fetchWithAuth(endpoint: string, options: RequestInit = {}, api: 'picker' | 'library' = 'picker') {
        if (!this.accessToken) {
            throw new Error('Google access token is missing. Please sign in with Google.');
        }

        const baseUrl = api === 'picker' ? this.pickerBaseUrl : this.libraryBaseUrl;
        const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

        // Professional Header Handling: Only set Content-Type for requests with bodies
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.accessToken}`,
            ...((options.method && options.method !== 'GET') ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers as Record<string, string> || {}),
        };

        const response = await fetch(url, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            throw new Error('Google session expired. Please sign in again.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = errorData.error?.message || response.statusText;
            const status = errorData.error?.status;

            // Log detailed violations for 400/403 errors
            if (response.status === 400 || response.status === 403) {
                console.error(`[GooglePhotos] ${api.toUpperCase()} API ERROR DETAILS:`, JSON.stringify(errorData, null, 2));
            }

            if (status === 'FAILED_PRECONDITION' || message.includes('PENDING_USER_ACTION')) {
                // This is a race condition expected state - user hasn't finished selection
                throw new Error('PENDING_USER_ACTION');
            }

            if (response.status === 403) {
                throw new Error(`INSUFFICIENT_PERMISSIONS: ${message}`);
            }

            throw new Error(message || `Google Photos ${api} API error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Step 1: Create a Picker Session
     */
    async createPickerSession() {
        return this.fetchWithAuth('/sessions', {
            method: 'POST',
            body: JSON.stringify({
                pollingConfig: { timeoutIn: '600s' }
            })
        }, 'picker');
    }

    /**
     * List media items from the Library (Library API)
     */
    async listLibraryMediaItems(pageSize = 50, pageToken?: string): Promise<GooglePhotosSearchResponse> {
        let url = `/mediaItems?pageSize=${pageSize}`;
        if (pageToken) url += `&pageToken=${pageToken}`;
        return this.fetchWithAuth(url, {}, 'library');
    }

    /**
     * Step 2: List items from a specific session (Picker API)
     */
    async listMediaItems(sessionId: string, pageSize = 50, pageToken?: string): Promise<GooglePhotosSearchResponse> {
        let url = `/mediaItems?sessionId=${sessionId}&pageSize=${pageSize}`;
        if (pageToken) url += `&pageToken=${pageToken}`;

        return this.fetchWithAuth(url, {}, 'picker');
    }

    /**
     * Search media items (Uses Picker API)
     */
    async searchMediaItems(params: {
        filters?: any;
        pageSize?: number;
        pageToken?: string;
    }): Promise<GooglePhotosSearchResponse> {
        return this.fetchWithAuth('/mediaItems:search', {
            method: 'POST',
            body: JSON.stringify(params),
        }, 'picker');
    }

    /**
     * Get a single media item by ID
     */
    async getMediaItem(itemId: string): Promise<GoogleMediaItem> {
        return this.fetchWithAuth(`/mediaItems/${itemId}`, {}, 'picker');
    }

    /**
     * Batch get media items
     */
    async batchGetMediaItems(itemIds: string[]): Promise<{ mediaItemResults: { mediaItem: GoogleMediaItem }[] }> {
        const ids = itemIds.map(id => `mediaItemIds=${id}`).join('&');
        return this.fetchWithAuth(`/mediaItems:batchGet?${ids}`, {}, 'picker');
    }

    /**
     * Upload a file to Google Photos (Uses Library API)
     * 1. Upload bytes to get an uploadToken
     * 2. Create the media item using the token
     */
    async uploadMedia(file: File, description?: string): Promise<GoogleMediaItem> {
        if (!this.accessToken) throw new Error('Not authenticated');

        // 1. Upload bytes (Library API)
        const uploadResponse = await fetch(`${this.libraryBaseUrl}/uploads`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-type': 'application/octet-stream',
                'X-Goog-Upload-Protocol': 'raw',
                'X-Goog-Upload-File-Name': file.name,
            },
            body: file,
        });

        if (!uploadResponse.ok) {
            throw new Error('Failed to upload bytes to Google Photos');
        }

        const uploadToken = await uploadResponse.text();

        // 2. Create media item (Library API)
        const createResponse = await this.fetchWithAuth('/mediaItems:batchCreate', {
            method: 'POST',
            body: JSON.stringify({
                newMediaItems: [
                    {
                        description: description || file.name,
                        simpleMediaItem: {
                            uploadToken: uploadToken,
                        },
                    },
                ],
            }),
        }, 'library');

        const result = createResponse.newMediaItemResults[0];
        if (result.status.code !== 0 && result.status.code !== undefined) {
            throw new Error(result.status.message || 'Failed to create media item in Google Photos');
        }

        return result.mediaItem;
    }

    static getCleanUrl(url: string | undefined | null): string {
        if (!url) return '';
        // Google Photos baseUrls are fragile. If they have a suffix starting with = or -, we strip it.
        // This ensures that when we append =w400 or =dv, we don't end up with broken URLs.
        return url.split('=')[0];
    }

    static getProxyUrl(googleUrl: string, token?: string | null, shareToken?: string | null): string {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!googleUrl) return '';

        // DO NOT use getCleanUrl here.
        // The caller constructs googleUrl precisely with the suffixes they need (=dv, =w400, etc).
        let url = `${supabaseUrl}/functions/v1/get-google-media?url=${encodeURIComponent(googleUrl)}`;
        if (token) {
            url += `&token=${encodeURIComponent(token)}`;
        }
        if (shareToken) {
            url += `&share_token=${encodeURIComponent(shareToken)}`;
        }
        return url;
    }

    async downloadMediaItem(itemOrUrl: GoogleMediaItem | string): Promise<Blob> {
        const baseUrl = typeof itemOrUrl === 'string' ? itemOrUrl : (itemOrUrl.mediaFile?.baseUrl || itemOrUrl.baseUrl || '');
        const cleanBaseUrl = GooglePhotosService.getCleanUrl(baseUrl);

        const isVideo = typeof itemOrUrl === 'object' && (
            itemOrUrl.mimeType?.startsWith('video') ||
            itemOrUrl.mediaFile?.mimeType?.startsWith('video') ||
            (baseUrl && baseUrl.includes('=dv'))
        );

        const suffix = isVideo ? '=dv' : '=d';
        const primary = `${cleanBaseUrl}${suffix}`;
        const highRes = `${cleanBaseUrl}=w9999-h9999`;

        const tryFetch = async (url: string) => {
            try {
                // IMPORTANT: Always use our proxy to bypass CORS
                const proxyUrl = GooglePhotosService.getProxyUrl(url, this.accessToken);
                const res = await fetch(proxyUrl);

                if (res.ok) {
                    const blob = await res.blob();
                    if (blob.size > 0) return blob;
                }
            } catch (e) {
                // Ignore errors in attempts
            }
            return null;
        };

        try {
            // Try primary (usually with =d or =dv)
            let blob = await tryFetch(primary);
            if (blob) return blob;

            // Try raw baseUrl
            blob = await tryFetch(baseUrl);
            if (blob) return blob;

            // Try high res fallback
            blob = await tryFetch(highRes);
            if (blob) return blob;

            throw new Error('All download attempts failed to retrieve a valid media blob via proxy.');
        } catch (error) {
            console.error('[GooglePhotos] Download failed:', error);
            throw new Error('Failed to download media item from Google through proxy');
        }
    }
}
