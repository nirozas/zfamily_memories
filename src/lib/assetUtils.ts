import { type Asset } from '../contexts/AlbumContext';

/**
 * getTransformedUrl
 * 
 * Precisely inserts Cloudinary transformations into a URL without breaking the path.
 * It is designed to be idempotent and safe against multiple calls.
 */
export const getTransformedUrl = (url: string, asset: Asset) => {
    if (!url || !url.includes('cloudinary.com')) return url;

    // 1. Isolate the base and the path
    const parts = url.split('/upload/');
    if (parts.length < 2) return url;

    const baseUrl = parts[0];
    const fullPath = parts[parts.length - 1];

    // 2. Parse existing segments
    const segments = fullPath.split('/');

    // Filter out our own transformations to avoid recursive growth
    // We only remove segments that were definitively added by this studio logic.
    const cleanSegments = segments.filter(segment => {
        // Keep the filename (always has a dot extension and is usually at the end)
        if (segment.includes('.')) return true;

        // Keep version numbers (v123456789)
        if (segment.match(/^v\d+$/)) return true;

        // Strip out our specific studio segments
        const isStudioTransform =
            segment.includes('e_make_transparent') ||
            segment.includes('f_auto') ||
            segment.includes('q_auto') ||
            segment.includes('co_rgb');

        return !isStudioTransform;
    });

    // 3. Build the NEW transformation chain
    // We group f_auto and q_auto together for efficiency
    const newTransforms: string[] = ['f_auto,q_auto'];

    // Chroma Key (Transparency) logic
    const tolerance = asset.chromaKeyTolerance || 30;
    const colors = asset.chromaKeyColors || (asset.chromaKeyColor ? [asset.chromaKeyColor] : []);

    if (colors.length > 0) {
        colors.forEach(color => {
            const hex = color.replace('#', '');
            // Correct Cloudinary syntax: co_rgb:<hex>,e_make_transparent:<tolerance>
            newTransforms.push(`co_rgb:${hex},e_make_transparent:${tolerance}`);
        });
    }

    // 4. Reconstruct the URL
    // Format: baseUrl/upload/trans1/trans2/version/filename.jpg
    const transformPath = newTransforms.join('/');
    const finalPath = cleanSegments.join('/');

    return `${baseUrl}/upload/${transformPath}/${finalPath}`;
};

/**
 * getFilterStyle
 * 
 * Returns CSS filter object based on asset properties.
 */
export const getFilterStyle = (asset: Asset) => {
    let filterString = '';
    const intensity = (asset.filterIntensity ?? 100) / 100;

    switch (asset.filter) {
        case 'vintage':
            filterString += `sepia(${50 * intensity}%) contrast(${110 * intensity}%) brightness(${95 * intensity}%) `;
            break;
        case 'matte':
            filterString += `contrast(${85 * intensity}%) brightness(${105 * intensity}%) saturate(${75 * intensity}%) `;
            break;
        case 'portrait':
            filterString += `brightness(${105 * intensity}%) contrast(${105 * intensity}%) sepia(${15 * intensity}%) `;
            break;
        case 'film':
            filterString += `contrast(${115 * intensity}%) hue-rotate(${-10 * intensity}deg) saturate(${85 * intensity}%) `;
            break;
        case 'sketch':
            filterString += `grayscale(100%) contrast(${180 * intensity}%) brightness(${115 * intensity}%) `;
            break;
        case 'noir':
            filterString += `grayscale(100%) contrast(${150 * intensity}%) brightness(${90 * intensity}%) `;
            break;
        case 'cyberpunk':
            filterString += `hue-rotate(180deg) saturate(${150 * intensity}%) contrast(${110 * intensity}%) `;
            break;
        case 'golden':
            filterString += `sepia(${30 * intensity}%) saturate(${130 * intensity}%) brightness(${105 * intensity}%) `;
            break;
        case 'moody':
            filterString += `brightness(${80 * intensity}%) contrast(${130 * intensity}%) saturate(${60 * intensity}%) `;
            break;
        case 'pastel':
            filterString += `brightness(${110 * intensity}%) contrast(${85 * intensity}%) saturate(${85 * intensity}%) `;
            break;
        case 'dramatic':
            filterString += `contrast(${150 * intensity}%) brightness(${90 * intensity}%) saturate(${110 * intensity}%) `;
            break;
        case 'faded':
            filterString += `contrast(${90 * intensity}%) brightness(${105 * intensity}%) saturate(${80 * intensity}%) sepia(${10 * intensity}%) `;
            break;
        case 'vibrant':
            filterString += `saturate(${160 * intensity}%) contrast(${110 * intensity}%) `;
            break;
        case 'cinematic':
            filterString += `hue-rotate(-15deg) contrast(${115 * intensity}%) saturate(${110 * intensity}%) brightness(${95 * intensity}%) `;
            break;
        default: break;
    }

    if (asset.brightness !== undefined && asset.brightness !== 100) filterString += `brightness(${asset.brightness / 100}) `;
    if (asset.contrast !== undefined && asset.contrast !== 100) filterString += `contrast(${asset.contrast / 100}) `;
    if (asset.saturate !== undefined && asset.saturate !== 100) filterString += `saturate(${asset.saturate / 100}) `;
    if (asset.blur) filterString += `blur(${asset.blur}px) `;
    if (asset.sepia) filterString += `sepia(${asset.sepia}%) `;
    if (asset.hue) filterString += `hue-rotate(${asset.hue}deg) `;

    return filterString.trim() ? { filter: filterString.trim() } : {};
};

/**
 * getClipPathStyle
 * 
 * Returns CSS clip-path for custom masks/crops.
 */
export const getClipPathStyle = (asset: Asset) => {
    if (!asset.clipPoints || asset.clipPoints.length < 3) {
        return {};
    }

    const pointsStr = asset.clipPoints
        .map(p => `${p.x * 100}% ${p.y * 100}%`)
        .join(', ');

    return { clipPath: `polygon(${pointsStr})` };
};
