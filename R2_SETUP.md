# Cloudflare R2 Storage Setup Guide

## What Changed

The app now stores all media (photos, videos, audio) on **Cloudflare R2** instead of Google Photos / Google Drive. Videos are optionally encoded as **HLS adaptive bitrate streams** (1080p / 720p / 480p) using FFmpeg.wasm in the browser, then served via Cloudflare's global CDN.

---

## 1. Get Your R2 API Token

You need an **R2 API Token** with write access. Here's how:

1. Go to https://dash.cloudflare.com/
2. Select your account → **R2 Object Storage**
3. Click **Manage R2 API Tokens** (top right)
4. Click **Create API Token**
5. Set permissions:
   - **Object Read & Write** on bucket `zoabimemories`
6. Copy the **Access Key ID** and **Secret Access Key**

---

## 2. Add Credentials to `.env`

Open `.env` and fill in the two missing values:

```env
VITE_R2_ACCESS_KEY_ID="<your-access-key-id>"
VITE_R2_SECRET_ACCESS_KEY="<your-secret-access-key>"
```

The other R2 values are already filled in:
- `VITE_R2_ACCOUNT_ID` = `def7b494901c22ea219f966254458ee2`
- `VITE_R2_BUCKET_NAME` = `zoabimemories`
- `VITE_R2_PUBLIC_URL` = `https://pub-97855436eeb04fa7b7fc013383e135b1.r2.dev`
- `VITE_R2_S3_ENDPOINT` = `https://def7b494901c22ea219f966254458ee2.r2.cloudflarestorage.com`

---

## 3. Enable the Public Development URL (if not done yet)

1. In the Cloudflare dashboard → R2 → bucket `zoabimemories`
2. Click **Settings** tab
3. Under **Public Access** → enable **Public Development URL**
4. Confirm the URL is `https://pub-97855436eeb04fa7b7fc013383e135b1.r2.dev`

---

## 4. Enable CORS on the R2 Bucket

The browser needs to send PUT requests directly to R2. You must configure CORS:

1. In the Cloudflare dashboard → R2 → `zoabimemories` → **Settings**
2. Under **CORS Policy**, paste:

```json
[
  {
    "AllowedOrigins": ["https://your-production-domain.com", "http://localhost:5173"],
    "AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `https://your-production-domain.com` with your actual Vercel/production URL. For development, `http://localhost:5173` is included.

---

## 5. How Uploads Work Now

### Images
- Uploads and compression rely entirely on Google Photos integration.
- You must authenticate with Google to upload images from your device.
- Images are served from Google Photos via the Supabase proxy or direct URL where applicable.

### Videos (Standard)
- Uploaded direct to Cloudflare R2 bucket.

- Served from CDN directly

### Videos (HLS Adaptive Streaming) — toggle On in UI
- FFmpeg.wasm encodes to **3 quality tiers**:
  - 1080p @ 5 Mbps
  - 720p @ 2.8 Mbps
  - 480p @ 1.4 Mbps
- Each tier is segmented into 6-second `.ts` chunks
- All files uploaded to R2 under `media/<familyId>/stacks/<ts>/hls_<ts>/`
- A `master.m3u8` playlist links the three renditions
- The browser's `<video>` tag auto-selects quality based on connection speed

### HLS Enable Toggle
In the **Create Memory Stack** modal → media section, there is a small **Adaptive Streaming (HLS)** toggle. Enable it before uploading video files when you want multi-quality delivery.

> **Note:** HLS encoding runs entirely in the browser via WebAssembly, so it takes a few minutes for long videos. The single `.mp4` upload is instant by comparison.

---

## 6. URL Structure

All media URLs follow this pattern:
```
https://pub-97855436eeb04fa7b7fc013383e135b1.r2.dev/<key>
```

Example keys:
- Image: `media/abc123/stacks/1742655555/1742655555-photo.jpg`
- Video: `media/abc123/stacks/1742655555/1742655555-video.mp4`
- HLS playlist: `media/abc123/stacks/1742655555/hls_1742655570/master.m3u8`
- HLS variant: `media/abc123/stacks/1742655555/hls_1742655570/720p.m3u8`
- HLS segment: `media/abc123/stacks/1742655555/hls_1742655570/720p_000.ts`

---

## 7. Legacy URLs (Google Photos)

Existing media items stored in the database with `googleusercontent.com` or `drive.google.com` URLs will continue to work via the existing Supabase proxy Edge Function. Old items are NOT migrated automatically — they remain accessible as long as Google tokens are valid.

To migrate old items, re-upload them through the Media Library.

---

## FFmpeg.wasm Requirements

FFmpeg runs as WebAssembly in the browser. Your web server must serve the app with these HTTP headers for the multi-threaded version to work:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

For Vercel, add to `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

The current code uses the **single-threaded** `@ffmpeg/core@0.12.6` build from unpkg, which works without these headers.
