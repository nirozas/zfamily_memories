
export const storageService = {
    async uploadFile(
        file: File,
        bucket: 'event-assets' | 'album-assets' | 'system-assets',
        pathPrefix: string = '',
        onProgress?: (progress: { loaded: number; total: number }) => void
    ): Promise<{ url: string | null; error: string | null }> {
        try {
            const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
            const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

            if (!cloudName || !uploadPreset || cloudName === 'your_cloud_name') {
                throw new Error('Cloudinary environment variables are not configured correctly in .env');
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', uploadPreset);

            // Map bucket and pathPrefix to Cloudinary folder
            // Clean up the folder path (remove leading/trailing slashes)
            const folderPath = `${bucket}/${pathPrefix}`.replace(/\/+$/, '').replace(/^\/+/, '');
            formData.append('folder', folderPath);

            return new Promise((resolve) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/upload`);

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable && onProgress) {
                        onProgress({ loaded: event.loaded, total: event.total });
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const response = JSON.parse(xhr.responseText);
                        resolve({ url: response.secure_url, error: null });
                    } else {
                        let errorMessage = 'Upload failed';
                        try {
                            const errorResponse = JSON.parse(xhr.responseText);
                            errorMessage = errorResponse.error?.message || errorMessage;
                        } catch (e) {
                            errorMessage = xhr.statusText || errorMessage;
                        }
                        resolve({ url: null, error: errorMessage });
                    }
                };

                xhr.onerror = () => {
                    resolve({ url: null, error: 'Network error during upload' });
                };

                xhr.send(formData);
            });
        } catch (error: any) {
            console.error('Upload error:', error);
            return { url: null, error: error.message };
        }
    },

    async deleteFile(url: string): Promise<{ success: boolean; error: string | null }> {
        try {
            const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
            const apiKey = import.meta.env.VITE_CLOUDINARY_API_KEY;
            const apiSecret = import.meta.env.VITE_CLOUDINARY_API_SECRET;

            if (!cloudName || !apiKey || !apiSecret) {
                console.warn('Cloudinary API Key/Secret not configured. Skipping cloud deletion.');
                return { success: false, error: 'Missing Cloudinary credentials' };
            }

            // Extract Public ID from URL
            // URL Format: https://res.cloudinary.com/<cloud_name>/image/upload/v<version>/<folder>/<id>.<ext>
            const regex = /\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/;
            const match = url.match(regex);
            if (!match) {
                return { success: false, error: 'Invalid Cloudinary URL' };
            }
            const publicId = match[1];

            // Generate Signature
            const timestamp = Math.round(new Date().getTime() / 1000);
            const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

            // SHA-1 hashing using Web Crypto API
            const msgBuffer = new TextEncoder().encode(paramsToSign);
            const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            const formData = new FormData();
            formData.append('public_id', publicId);
            formData.append('api_key', apiKey);
            formData.append('timestamp', timestamp.toString());
            formData.append('signature', signature);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            if (data.result === 'ok') {
                return { success: true, error: null };
            } else {
                return { success: false, error: data.error?.message || 'Deletion failed' };
            }
        } catch (error: any) {
            console.error('Delete error:', error);
            return { success: false, error: error.message };
        }
    }
};

