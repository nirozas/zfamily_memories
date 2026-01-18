# Cloudinary Setup Guide

This project now uses **Cloudinary** for image and video storage, replacing Supabase Storage.

## 1. Get Your Credentials

1.  Sign up or log in to [Cloudinary](https://cloudinary.com/).
2.  Go to your **Dashboard**.
3.  Copy your **Cloud Name**.
4.  Go to **Settings** (gear icon) -> **Upload**.
5.  Scroll down to **Upload presets** and click **Add upload preset**.
6.  Set:
    *   **Upload preset name**: (You can keep the random one or name it `family_zoabi`)
    *   **Signing Mode**: **Unsigned** (CRITICAL)
    *   **Folder**: (Optional, e.g., `family_zoabi`)
7.  Click **Save**.

## 2. Update .env

Open your `.env` file and fill in your credentials:

```env
VITE_CLOUDINARY_CLOUD_NAME="your_cloud_name_here"
VITE_CLOUDINARY_UPLOAD_PRESET="your_unsigned_preset_name_here"
```

## 3. Why Unsigned?

We use **Unsigned Uploads** to allow the frontend to upload directly to Cloudinary without needing a backend server to sign the request. This is safe as long as you use an Unsigned Upload Preset in Cloudinary, which restricts how files can be uploaded.

## 4. Deleting Files

Currently, deleting a media item in the app removes it from the **Supabase Database**, but it will NOT automatically delete the file from Cloudinary (for security reasons, client-side deletion requires an API Secret which should not be exposed). You can manually manage your Cloudinary storage through their dashboard.

## 5. Migration of Old Images

Existing images stored in Supabase will still work as long as their URLs are valid. New uploads will automatically go to Cloudinary.
