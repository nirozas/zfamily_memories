export type SystemAssetCategory = 'background' | 'sticker' | 'frame' | 'ribbon';

const SYSTEM_ASSET_FOLDER = 'Z-Fam System Assets';
const SUBFOLDER_MAP: Record<SystemAssetCategory, string> = {
    background: 'Backgrounds',
    sticker: 'Stickers',
    frame: 'Frames',
    ribbon: 'Ribbons',
};

export class GoogleDriveService {
    private accessToken: string | null = null;
    private driveBaseUrl = 'https://www.googleapis.com/drive/v3';
    private uploadBaseUrl = 'https://www.googleapis.com/upload/drive/v3';

    constructor(accessToken: string | null) {
        this.accessToken = accessToken;
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}) {
        if (!this.accessToken) {
            throw new Error('Google access token is missing. Please sign in with Google.');
        }

        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.accessToken}`,
            ...((options.method && options.method !== 'GET') ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers as Record<string, string> || {}),
        };

        const response = await fetch(url.startsWith('http') ? url : `${this.driveBaseUrl}${url}`, {
            ...options,
            headers,
        });

        if (response.status === 401) {
            throw new Error('Google session expired. Please sign in again.');
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Google Drive API error: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Find or create a folder by name (optionally within a parent folder)
     */
    private async getOrCreateFolder(name: string, parentId?: string): Promise<string> {
        const parentQuery = parentId ? ` and '${parentId}' in parents` : '';
        const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentQuery}`;
        const searchResponse = await this.fetchWithAuth(`/files?q=${encodeURIComponent(query)}&fields=files(id)`);

        if (searchResponse.files && searchResponse.files.length > 0) {
            return searchResponse.files[0].id;
        }

        const body: any = { name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];
        const createResponse = await this.fetchWithAuth('/files', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        return createResponse.id;
    }

    /**
     * Find or create the Z-Fam Memories folder
     */
    async getOrCreateWebsiteFolder(): Promise<string> {
        return this.getOrCreateFolder('Z-Fam Memories Website');
    }

    /**
     * Get or create the system asset subfolder for backgrounds, stickers, frames, ribbons.
     * Structure: Z-Fam System Assets / Backgrounds|Stickers|Frames|Ribbons
     */
    async getOrCreateSystemAssetFolder(category: SystemAssetCategory): Promise<string> {
        const rootId = await this.getOrCreateFolder(SYSTEM_ASSET_FOLDER);
        const subfolderName = SUBFOLDER_MAP[category];
        return this.getOrCreateFolder(subfolderName, rootId);
    }

    /**
     * Upload a file to a specific Drive folder. Returns the Drive file ID.
     */
    async uploadFile(file: File, folderId: string, _onProgress?: (p: number) => void): Promise<string> {
        const metadata = {
            name: `${Date.now()}-${file.name}`,
            parents: [folderId],
        };

        const formData = new FormData();
        formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        formData.append('file', file);

        const response = await fetch(`${this.uploadBaseUrl}/files?uploadType=multipart&fields=id`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.accessToken}` },
            body: formData,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || 'Failed to upload to Google Drive');
        }

        const { id } = await response.json();

        // Make it publicly readable (no sign-in required to view)
        await this.setFilePublic(id);

        return id;
    }

    /**
     * Upload a system asset (background/sticker/frame/ribbon) to the correct Drive subfolder.
     * Returns the stable public URL for that file.
     */
    async uploadSystemAsset(file: File, category: SystemAssetCategory): Promise<string> {
        const folderId = await this.getOrCreateSystemAssetFolder(category);
        const fileId = await this.uploadFile(file, folderId);
        // Use the thumbnail URL format which is more reliable as a stable embed URL
        return GoogleDriveService.getDirectUrl(fileId);
    }

    /**
     * Set file as public so it can be viewed by anyone with the link
     */
    async setFilePublic(fileId: string) {
        return this.fetchWithAuth(`/files/${fileId}/permissions`, {
            method: 'POST',
            body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        });
    }

    /**
     * Get the direct view link — works for images embedded in <img> tags.
     * Uses the /uc?export=view format which is stable and not session-based.
     */
    static getDirectUrl(fileId: string): string {
        return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }

    /**
     * For thumbnails with width control
     */
    static getThumbnailUrl(fileId: string, width = 1000): string {
        return `https://lh3.googleusercontent.com/u/0/d/${fileId}=w${width}`;
    }
}
