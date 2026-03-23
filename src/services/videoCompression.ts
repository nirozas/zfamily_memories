import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { CloudflareR2Service } from './cloudflareR2';

// ─── FFmpeg loader ────────────────────────────────────────────────────────────

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

async function getFFmpeg(): Promise<FFmpeg> {
    if (ffmpegLoaded && ffmpegInstance) return ffmpegInstance;

    ffmpegInstance = new FFmpeg();

    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpegInstance.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegLoaded = true;
    return ffmpegInstance;
}

// ─── HLS Adaptive Streaming ───────────────────────────────────────────────────

export interface HlsUploadResult {
    /** Public CDN URL to master.m3u8 */
    masterUrl: string;
    /** R2 key prefix used for all segments */
    r2KeyPrefix: string;
    /** All uploaded R2 keys */
    keys: string[];
}

/**
 * Encodes a video into three quality tiers (1080p / 720p / 480p) as HLS segments
 * and uploads them to Cloudflare R2.
 *
 * @param file        Raw input video file
 * @param keyPrefix   R2 path prefix, e.g. "hls/familyId/1234567890"
 * @param onProgress  Progress callback (0-100)
 */
export async function encodeAndUploadHls(
    file: File,
    keyPrefix: string,
    onProgress?: (progress: number) => void
): Promise<HlsUploadResult> {
    const ff = await getFFmpeg();

    const inputName = 'input_video';
    await ff.writeFile(inputName, await fetchFile(file));

    // ── Encode three quality renditions ─────────────────────────────────────
    const renditions = [
        { name: '1080p', vf: 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2', vb: '5000k', ab: '192k' },
        { name: '720p',  vf: 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',   vb: '2800k', ab: '128k' },
        { name: '480p',  vf: 'scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2',     vb: '1400k', ab: '96k'  },
    ];

    const phasePerRendition = 30; // Each rendition encoding = 30% progress
    const keys: string[] = [];

    for (let ri = 0; ri < renditions.length; ri++) {
        const r = renditions[ri];
        const segmentPattern = `${r.name}_%03d.ts`;
        const playlistName = `${r.name}.m3u8`;

        // Report progress for each phase
        ff.on('progress', ({ progress }) => {
            const base = ri * phasePerRendition;
            onProgress?.(Math.min(base + Math.round(progress * phasePerRendition), 90));
        });

        await ff.exec([
            '-i', inputName,
            '-vf', r.vf,
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-b:v', r.vb,
            '-maxrate', r.vb,
            '-bufsize', String(parseInt(r.vb) * 2) + 'k',
            '-c:a', 'aac',
            '-b:a', r.ab,
            '-hls_time', '6',
            '-hls_playlist_type', 'vod',
            '-hls_segment_filename', segmentPattern,
            '-f', 'hls',
            playlistName,
        ]);

        // Read & upload the m3u8 playlist
        const m3u8Data = await ff.readFile(playlistName) as Uint8Array;
        const playlistKey = `${keyPrefix}/${r.name}.m3u8`;
        await CloudflareR2Service.uploadBytes(m3u8Data, playlistKey, 'application/vnd.apple.mpegurl');
        keys.push(playlistKey);

        // Read & upload all .ts segment files
        let segIdx = 0;
        while (true) {
            const segFile = `${r.name}_${String(segIdx).padStart(3, '0')}.ts`;
            try {
                const segData = await ff.readFile(segFile) as Uint8Array;
                const segKey = `${keyPrefix}/${segFile}`;
                await CloudflareR2Service.uploadBytes(segData, segKey, 'video/MP2T');
                keys.push(segKey);
                await ff.deleteFile(segFile);
                segIdx++;
            } catch {
                break; // No more segments
            }
        }

        // Cleanup
        await ff.deleteFile(playlistName).catch(() => {});
    }

    await ff.deleteFile(inputName).catch(() => {});

    // ── Build & upload master playlist ───────────────────────────────────────
    // m3u8 playlists reference segments by relative path, so the master
    // just needs to point to each rendition playlist name
    const masterContent = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '',
        '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
        '1080p.m3u8',
        '',
        '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720',
        '720p.m3u8',
        '',
        '#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=854x480',
        '480p.m3u8',
    ].join('\n');

    const masterKey = `${keyPrefix}/master.m3u8`;
    await CloudflareR2Service.uploadBytes(
        new TextEncoder().encode(masterContent),
        masterKey,
        'application/vnd.apple.mpegurl'
    );
    keys.push(masterKey);

    onProgress?.(100);

    return {
        masterUrl: CloudflareR2Service.getPublicUrl(masterKey),
        r2KeyPrefix: keyPrefix,
        keys,
    };
}

// ─── Simple single-file compression (no HLS) ─────────────────────────────────

class VideoCompressionService {
    /**
     * Compress a video for upload. Used as a pre-processing step before
     * full HLS encoding, or as a lightweight fallback.
     */
    async compressVideo(file: File, onProgress: (progress: number) => void): Promise<File> {
        const ff = await getFFmpeg();
        const { name } = file;

        await ff.writeFile(name, await fetchFile(file));

        ff.on('progress', ({ progress }) => {
            onProgress(Math.round(progress * 100));
        });

        // Preset 'ultrafast' for speed in browser; crf 28 = good quality/size
        // Scale to max 720p width while keeping aspect ratio
        await ff.exec([
            '-i', name,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-vf', 'scale=min(1280\\,iw):-2',
            '-c:a', 'aac',
            '-b:a', '128k',
            'output.mp4',
        ]);

        const data = await ff.readFile('output.mp4');

        await ff.deleteFile(name).catch(() => {});
        await ff.deleteFile('output.mp4').catch(() => {});

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return new File([data as any], `compressed_${name.split('.')[0]}.mp4`, { type: 'video/mp4' });
    }
}

export const videoCompressionService = new VideoCompressionService();
