/**
 * Supabase Edge Function: get-r2-presigned-url
 *
 * Generates time-limited presigned URLs for Cloudflare R2 operations.
 * Supported operations: PUT (upload) and DELETE.
 *
 * Credentials are stored as Supabase secrets (never exposed to the browser).
 *
 * Usage (POST):
 *   { "operation": "PUT", "key": "media/familyId/file.mp4", "contentType": "video/mp4" }
 *   { "operation": "DELETE", "key": "media/familyId/file.mp4" }
 *
 * Returns:
 *   { "presignedUrl": "https://..." }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─── AWS Signature V4 helpers ────────────────────────────────────────────────

async function sha256(message: string | Uint8Array): Promise<ArrayBuffer> {
    const data = typeof message === 'string'
        ? new TextEncoder().encode(message)
        : message;
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

// ─── Presigned PUT URL ───────────────────────────────────────────────────────

async function createPresignedPutUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
    creds: { accessKey: string; secretKey: string; endpoint: string; bucket: string }
): Promise<string> {
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    const host = creds.endpoint.replace(/^https?:\/\//, '');
    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${creds.accessKey}/${credentialScope}`;
    const normalizedContentType = contentType.toLowerCase();

    const queryParams = new URLSearchParams({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'content-type;host',
    });

    const sortedParams = Array.from(queryParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');

    const canonicalRequest = [
        'PUT',
        `/${creds.bucket}/${encodedKey}`,
        sortedParams,
        `content-type:${normalizedContentType}\nhost:${host}\n`,
        'content-type;host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        toHex(await sha256(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSigningKey(creds.secretKey, datestamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    return `${creds.endpoint}/${creds.bucket}/${encodedKey}?${sortedParams}&X-Amz-Signature=${signature}`;
}

// ─── Presigned DELETE URL ────────────────────────────────────────────────────

async function createPresignedDeleteUrl(
    key: string,
    expiresInSeconds: number,
    creds: { accessKey: string; secretKey: string; endpoint: string; bucket: string }
): Promise<string> {
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    // host is ONLY the hostname — bucket goes in the path
    const host = creds.endpoint.replace(/^https?:\/\//, '');
    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${creds.accessKey}/${credentialScope}`;

    const queryParams = new URLSearchParams({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'host',
    });

    const sortedParams = Array.from(queryParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');

    const canonicalRequest = [
        'DELETE',
        `/${creds.bucket}/${encodedKey}`,
        sortedParams,
        `host:${host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        toHex(await sha256(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSigningKey(creds.secretKey, datestamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    return `${creds.endpoint}/${creds.bucket}/${encodedKey}?${sortedParams}&X-Amz-Signature=${signature}`;
}

// ─── Presigned GET URL ───────────────────────────────────────────────────────

async function createPresignedGetUrl(
    key: string,
    expiresInSeconds: number,
    creds: { accessKey: string; secretKey: string; endpoint: string; bucket: string }
): Promise<string> {
    const region = 'auto';
    const service = 's3';
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');

    const host = creds.endpoint.replace(/^https?:\/\//, '');
    const credentialScope = `${datestamp}/${region}/${service}/aws4_request`;
    const credential = `${creds.accessKey}/${credentialScope}`;

    const queryParams = new URLSearchParams({
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': credential,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresInSeconds),
        'X-Amz-SignedHeaders': 'host',
    });

    const sortedParams = Array.from(queryParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');

    const encodedKey = encodeURIComponent(key).replace(/%2F/g, '/');

    const canonicalRequest = [
        'GET',
        `/${creds.bucket}/${encodedKey}`,
        sortedParams,
        `host:${host}\n`,
        'host',
        'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        toHex(await sha256(canonicalRequest)),
    ].join('\n');

    const signingKey = await getSigningKey(creds.secretKey, datestamp, region, service);
    const signature = toHex(await hmacSha256(signingKey, stringToSign));

    return `${creds.endpoint}/${creds.bucket}/${encodedKey}?${sortedParams}&X-Amz-Signature=${signature}`;
}

// ─── Main handler ────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error("No authorization header");

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Server misconfiguration: Missing Supabase environment variables');
        }

        const supabaseClient = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // 1. Get user identity
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
        if (userError || !user) throw new Error("Unauthorized access");

        // 2. Get family from profile
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('family_id')
            .eq('id', user.id)
            .single();

        if (!profile?.family_id) {
            throw new Error("Could not determine family context");
        }

        // 3. Fetch family-specific R2 settings
        const { data: settings } = await supabaseClient
            .from('family_settings')
            .select('*')
            .eq('family_id', profile.family_id)
            .maybeSingle();

        // 4. Resolve credentials (Family-specific first, then fall back to Global)
        const R2_ACCESS_KEY = settings?.r2_access_key_id || Deno.env.get('R2_ACCESS_KEY_ID');
        const R2_SECRET_KEY = settings?.r2_secret_access_key || Deno.env.get('R2_SECRET_ACCESS_KEY');
        const R2_S3_ENDPOINT = settings?.r2_endpoint || Deno.env.get('R2_S3_ENDPOINT');
        const R2_BUCKET = settings?.r2_bucket_name || Deno.env.get('R2_BUCKET_NAME');

        if (!R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_S3_ENDPOINT || !R2_BUCKET) {
            return new Response(JSON.stringify({ error: 'Cloud storage not configured' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await req.json();
        const { operation = 'PUT', key, contentType, expiresIn = 3600 } = body;

        if (!key) {
            return new Response(JSON.stringify({ error: 'Missing required field: key' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const creds = {
            accessKey: R2_ACCESS_KEY,
            secretKey: R2_SECRET_KEY,
            endpoint: R2_S3_ENDPOINT,
            bucket: R2_BUCKET,
        };

        let presignedUrl: string;

        if (operation === 'PUT') {
            if (!contentType) {
                return new Response(JSON.stringify({ error: 'Missing contentType for PUT' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }
            presignedUrl = await createPresignedPutUrl(key, contentType, expiresIn, creds);
        } else if (operation === 'DELETE') {
            presignedUrl = await createPresignedDeleteUrl(key, expiresIn, creds);
        } else if (operation === 'GET') {
            presignedUrl = await createPresignedGetUrl(key, expiresIn, creds);
        } else {
            return new Response(JSON.stringify({ error: `Unsupported operation: ${operation}` }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ presignedUrl }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[R2 Presign] Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
