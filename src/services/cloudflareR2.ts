/**
 * Cloudflare R2 Storage Service
 * Uses S3-compatible API with AWS Signature V4 for presigned upload URLs.
 * Files are served via Cloudflare's public CDN endpoint (r2.dev).
 */

const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL as string;
const R2_S3_ENDPOINT = import.meta.env.VITE_R2_S3_ENDPOINT as string;
const R2_BUCKET = import.meta.env.VITE_R2_BUCKET_NAME as string;
const R2_ACCESS_KEY = import.meta.env.VITE_R2_ACCESS_KEY_ID as string;
const R2_SECRET_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY as string;

// ─── AWS Signature V4 helpers (pure browser, no SDK needed) ──────────────────

async function sha256(message: string | Uint8Array): Promise<ArrayBuffer> {
    const data = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : new Uint8Array(message.buffer instanceof ArrayBuffer ? message.buffer : message.buffer as unknown as ArrayBuffer);
    return crypto.subtle.digest('SHA-256', data);
}

function toHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
    const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;
    const cryptoKey = await crypto.subtle.importKey(
        'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function getSigningKey(secret: string, date: string, region: string, service: string): Promise<ArrayBuffer> {
    const kDate = await hmacSha256(`AWS4${secret}`, date);
    const kRegion = await hmacSha256(kDate, region);
    const kService = await hmacSha256(kRegion, service);
    return hmacSha256(kService, 'aws4_request');
}

// AWS S3 strictly requires these characters to be encoded, but encodeURIComponent ignores them.
function encodeAWSUri(str: string) {
    return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Generate a presigned PUT URL for direct browser-to-R2 upload */
async function createPresignedPutUrl(key: string, _contentType: string, expiresInSeconds = 3600): Promise<string> {
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    // For R2 S3 endpoints, the host is the domain part of the endpoint.
    // The bucket is used in the path of the canonical request.
    const host = R2_S3_ENDPOINT.replace('https://', '').replace('http://', '');
    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${R2_ACCESS_KEY}/${credentialScope}`;
    const contentType = _contentType;

    const queryParams = new URLSearchParams({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'content-type;host',
    });

    // Sort params for canonical query string
    const sortedParams = Array.from(queryParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const encodedKey = encodeAWSUri(key).replace(/%2F/g, '/');

    const canonicalRequest = [
        'PUT',
        `/${R2_BUCKET}/${encodedKey}`,
        sortedParams,
        `content-type:${contentType}\nhost:${host}\n`,
        'content-type;host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        toHex(await sha256(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSigningKey(R2_SECRET_KEY, datestamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    return `${R2_S3_ENDPOINT}/${R2_BUCKET}/${encodedKey}?${sortedParams}&X-Amz-Signature=${signature}`;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export class CloudflareR2Service {
    /**
     * Returns the public CDN URL for a given storage key
     */
    static getPublicUrl(key: string): string {
        return `${R2_PUBLIC_URL}/${key}`;
    }

    /**
     * Returns the public CDN URL for an HLS master playlist stored at key
     */
    static getHlsUrl(key: string): string {
        // key should be something like "media/familyId/timestamp/master.m3u8"
        return CloudflareR2Service.getPublicUrl(key);
    }

    /**
     * Checks whether an R2 URL is from our bucket
     */
    static isR2Url(url: string): boolean {
        return url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com');
    }

    /**
     * Uploads a single file directly from the browser to Cloudflare R2.
     * Uses a presigned PUT URL (presigned locally with the R2 access key).
     *
     * @param file         File to upload
     * @param pathPrefix   Key prefix, e.g. "media/familyId/"
     * @param onProgress   Progress callback (0-100)
     * @returns            Permanent public CDN URL of the uploaded file
     */
    static async uploadFile(
        file: File,
        pathPrefix: string = '',
        onProgress?: (progress: number) => void
    ): Promise<{ url: string; key: string }> {
        if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
            throw new Error('R2 credentials are not configured. Add VITE_R2_ACCESS_KEY_ID and VITE_R2_SECRET_ACCESS_KEY to .env');
        }

        const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const key = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/${safeName}` : safeName;

        const presignedUrl = await createPresignedPutUrl(key, file.type);

        await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', presignedUrl, true);
            xhr.setRequestHeader('Content-Type', file.type);

            if (onProgress) {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(Math.round((e.loaded / e.total) * 100));
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                } else {
                    reject(new Error(`R2 upload failed: ${xhr.status} ${xhr.statusText}`));
                }
            };
            xhr.onerror = () => reject(new Error('R2 upload network error'));
            xhr.send(file);
        });

        if (onProgress) onProgress(100);

        return {
            url: CloudflareR2Service.getPublicUrl(key),
            key,
        };
    }

    /**
     * Uploads raw bytes (Uint8Array or Blob) to R2, useful for FFmpeg output segments
     */
    static async uploadBytes(
        data: Uint8Array | Blob,
        key: string,
        contentType: string
    ): Promise<string> {
        if (!R2_ACCESS_KEY || !R2_SECRET_KEY) {
            throw new Error('R2 credentials not configured');
        }

        const presignedUrl = await createPresignedPutUrl(key, contentType);
        // Cast data to any to avoid TypeScript complaints about SharedArrayBuffer not being a BlobPart
        const blob = data instanceof Blob ? data : new Blob([data as any], { type: contentType });

        const response = await fetch(presignedUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: blob,
        });

        if (!response.ok) {
            throw new Error(`R2 bytes upload failed: ${response.status} ${response.statusText}`);
        }

        return CloudflareR2Service.getPublicUrl(key);
    }

    /**
     * Deletes an object from R2 by key
     */
    static async deleteObject(key: string): Promise<void> {
        if (!R2_ACCESS_KEY || !R2_SECRET_KEY) return;

        const region = 'auto';
        const service = 's3';
        const now = new Date();
        const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
        const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
        const host = R2_S3_ENDPOINT.replace('https://', '') + `/${R2_BUCKET}`;
        const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
        const emptyHash = toHex(await sha256(''));

        const canonicalRequest = [
            'DELETE',
            `/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
            '',
            `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${amzDate}\n`,
            'host;x-amz-content-sha256;x-amz-date',
            emptyHash,
        ].join('\n');

        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amzDate,
            credentialScope,
            toHex(await sha256(canonicalRequest)),
        ].join('\n');

        const signingKey = await getSigningKey(R2_SECRET_KEY, datestamp, region, service);
        const signature = toHex(await hmacSha256(signingKey, stringToSign));

        const authHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;

        await fetch(`${R2_S3_ENDPOINT}/${R2_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`, {
            method: 'DELETE',
            headers: {
                'Authorization': authHeader,
                'x-amz-date': amzDate,
                'x-amz-content-sha256': emptyHash,
            },
        });
    }
}
