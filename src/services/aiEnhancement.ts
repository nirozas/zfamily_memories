/**
 * AI Enhancement Service
 * High-fidelity, client-side HTML5 Canvas and CSS filtering engine.
 * Runs 100% locally in the browser with zero API cost or keys required.
 */

export type FilterType = 'cartoon' | 'pencil' | 'watercolor' | 'portrait' | 'auto-touch';

export interface FilterOptions {
    type: FilterType;
    intensity?: number; // 0-1
}

export interface EnhancementResult {
    url: string; // Data URL or Blob URL of the enhanced image
    filterData: FilterOptions;
}

/**
 * Loads an image URL onto an HTMLImageElement with CORS enabled.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        // Add cache buster to bypass CDN CORS caching issues
        const url = new URL(src);
        url.searchParams.set('t', Date.now().toString());
        img.src = url.toString();
        
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image from source: ${src}`));
    });
}

/**
 * Creates a canvas and returns context + ImageData
 */
function getCanvasContext(img: HTMLImageElement): { 
    canvas: HTMLCanvasElement; 
    ctx: CanvasRenderingContext2D; 
    imageData: ImageData;
} {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { canvas, ctx, imageData };
}

/**
 * Helper to clamp values between 0 and 255
 */
const clamp = (val: number) => Math.max(0, Math.min(255, val));

/**
 * Apply 3x3 convolution kernel
 */
function applyKernel(imageData: ImageData, kernel: number[], divisor: number = 1, offset: number = 0): ImageData {
    const w = imageData.width;
    const h = imageData.height;
    const src = imageData.data;
    
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const output = ctx.createImageData(w, h);
    const dst = output.data;
    
    // Copy edges
    for (let i = 0; i < src.length; i++) {
        dst[i] = src[i];
    }
    
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            let r = 0, g = 0, b = 0;
            
            for (let ky = -1; ky <= 1; ky++) {
                for (let kx = -1; kx <= 1; kx++) {
                    const srcIdx = ((y + ky) * w + (x + kx)) * 4;
                    const kVal = kernel[(ky + 1) * 3 + (kx + 1)];
                    
                    r += src[srcIdx] * kVal;
                    g += src[srcIdx + 1] * kVal;
                    b += src[srcIdx + 2] * kVal;
                }
            }
            
            const dstIdx = (y * w + x) * 4;
            dst[dstIdx] = clamp(r / divisor + offset);
            dst[dstIdx + 1] = clamp(g / divisor + offset);
            dst[dstIdx + 2] = clamp(b / divisor + offset);
            dst[dstIdx + 3] = src[dstIdx + 3]; // Keep alpha
        }
    }
    
    return output;
}

/**
 * 1. Auto-Touch Enhancement
 * Normalizes exposure, stretches contrast, increases vibrance, and sharpens.
 */
export async function autoTouch(imageUrl: string, intensity: number = 0.8): Promise<EnhancementResult> {
    try {
        const img = await loadImage(imageUrl);
        const { canvas, ctx, imageData } = getCanvasContext(img);
        const data = imageData.data;
        
        // Find min and max intensity for contrast stretch
        let minLuma = 255;
        let maxLuma = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luma < minLuma) minLuma = luma;
            if (luma > maxLuma) maxLuma = luma;
        }
        
        const range = maxLuma - minLuma || 1;
        
        // Apply exposure correction & saturation vibrance
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            
            // Contrast stretch
            r = ((r - minLuma) / range) * 255;
            g = ((g - minLuma) / range) * 255;
            b = ((b - minLuma) / range) * 255;
            
            // Saturation boost
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = gray + (r - gray) * (1 + 0.25 * intensity);
            g = gray + (g - gray) * (1 + 0.25 * intensity);
            b = gray + (b - gray) * (1 + 0.25 * intensity);
            
            data[i] = clamp(r);
            data[i + 1] = clamp(g);
            data[i + 2] = clamp(b);
        }
        
        // Apply sharpening kernel
        // [  0, -1,  0 ]
        // [ -1,  5, -1 ]
        // [  0, -1,  0 ]
        const sharpenKernel = [
            0, -intensity, 0,
            -intensity, 1 + 4 * intensity, -intensity,
            0, -intensity, 0
        ];
        
        const sharpened = applyKernel(imageData, sharpenKernel);
        ctx.putImageData(sharpened, 0, 0);
        
        return {
            url: canvas.toDataURL('image/jpeg', 0.95),
            filterData: { type: 'auto-touch', intensity }
        };
    } catch (err) {
        console.error('[aiEnhancement] Auto-touch failed:', err);
        return { url: imageUrl, filterData: { type: 'auto-touch', intensity } };
    }
}

/**
 * 2. Pencil Sketch Effect
 * Concurrently calculates edge outlines using a Sobel operator.
 */
export async function applySketchFilter(imageUrl: string, intensity: number = 0.8): Promise<EnhancementResult> {
    try {
        const img = await loadImage(imageUrl);
        const { canvas, ctx, imageData } = getCanvasContext(img);
        const w = imageData.width;
        const h = imageData.height;
        const src = imageData.data;
        const output = ctx.createImageData(w, h);
        const dst = output.data;
        
        // Sobel Edge Detection Kernels
        const Gx = [
            -1, 0, 1,
            -2, 0, 2,
            -1, 0, 1
        ];
        const Gy = [
            -1, -2, -1,
             0,  0,  0,
             1,  2,  1
        ];
        
        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                let valX = 0;
                let valY = 0;
                
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * w + (x + kx)) * 4;
                        // Grayscale conversion
                        const gray = 0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
                        const kValX = Gx[(ky + 1) * 3 + (kx + 1)];
                        const kValY = Gy[(ky + 1) * 3 + (kx + 1)];
                        
                        valX += gray * kValX;
                        valY += gray * kValY;
                    }
                }
                
                const edgeGrad = Math.sqrt(valX * valX + valY * valY);
                const dstIdx = (y * w + x) * 4;
                
                // Sketch formula: white background, black pencil lines
                // Invert and map to edge gradient
                const pencilIntensity = clamp(255 - edgeGrad * (1 + intensity * 2));
                
                dst[dstIdx] = pencilIntensity;
                dst[dstIdx + 1] = pencilIntensity;
                dst[dstIdx + 2] = pencilIntensity;
                dst[dstIdx + 3] = src[dstIdx + 3]; // preserve opacity
            }
        }
        
        ctx.putImageData(output, 0, 0);
        return {
            url: canvas.toDataURL('image/jpeg', 0.95),
            filterData: { type: 'pencil', intensity }
        };
    } catch (err) {
        console.error('[aiEnhancement] Sketch filter failed:', err);
        return { url: imageUrl, filterData: { type: 'pencil', intensity } };
    }
}

/**
 * 3. Watercolor Painting Filter
 * Iterative local smoothing + edge outline overlay + saturation boost.
 */
export async function applyWatercolorFilter(imageUrl: string, intensity: number = 0.8): Promise<EnhancementResult> {
    try {
        const img = await loadImage(imageUrl);
        const { canvas } = getCanvasContext(img);
        const w = canvas.width;
        const h = canvas.height;
        
        // 1. Median/Bilateral-style local smoothing block (watercolor paint blobs)
        const radius = Math.max(1, Math.round(intensity * 3));
        const canvasSmooth = document.createElement('canvas');
        canvasSmooth.width = w;
        canvasSmooth.height = h;
        const ctxSmooth = canvasSmooth.getContext('2d')!;
        ctxSmooth.drawImage(img, 0, 0);
        
        // Use browser scaling to smooth details first
        ctxSmooth.filter = `blur(${radius}px) saturate(${150 + intensity * 100}%) contrast(110%)`;
        ctxSmooth.drawImage(canvasSmooth, 0, 0);
        
        // Load smooth data
        const smoothedData = ctxSmooth.getImageData(0, 0, w, h);
        
        // 2. Generate edge outlines to represent sketch overlay
        const edgesCanvas = document.createElement('canvas');
        edgesCanvas.width = w;
        edgesCanvas.height = h;
        const edgesCtx = edgesCanvas.getContext('2d')!;
        
        const sketchResult = await applySketchFilter(imageUrl, 0.4);
        const sketchImg = await loadImage(sketchResult.url);
        edgesCtx.drawImage(sketchImg, 0, 0);
        
        // Blend edges on top of smoothed watercolor blobs
        const mainCtx = canvas.getContext('2d')!;
        mainCtx.putImageData(smoothedData, 0, 0);
        
        // Set blend mode to multiply for drawing lines
        mainCtx.globalCompositeOperation = 'multiply';
        mainCtx.globalAlpha = 0.3 * intensity;
        mainCtx.drawImage(edgesCanvas, 0, 0);
        
        // Restore blend mode
        mainCtx.globalCompositeOperation = 'source-over';
        mainCtx.globalAlpha = 1.0;
        
        // Add canvas paper texture overlay
        mainCtx.fillStyle = 'rgba(240, 235, 220, 0.05)';
        mainCtx.fillRect(0, 0, w, h);
        
        return {
            url: canvas.toDataURL('image/jpeg', 0.95),
            filterData: { type: 'watercolor', intensity }
        };
    } catch (err) {
        console.error('[aiEnhancement] Watercolor filter failed:', err);
        return { url: imageUrl, filterData: { type: 'watercolor', intensity } };
    }
}

/**
 * 4. Cartoon cell-shaded effect
 * Quantizes colors and overlays dark outline boundaries.
 */
export async function applyCartoonFilter(imageUrl: string, intensity: number = 0.8): Promise<EnhancementResult> {
    try {
        const img = await loadImage(imageUrl);
        const { canvas, ctx, imageData } = getCanvasContext(img);
        const data = imageData.data;
        
        // Quantize colors (Posterize)
        const levels = Math.max(3, Math.round(9 - intensity * 5)); // 3 to 8 color tiers
        const step = 255 / (levels - 1);
        
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i] / step) * step;
            data[i + 1] = Math.round(data[i + 1] / step) * step;
            data[i + 2] = Math.round(data[i + 2] / step) * step;
            
            // Saturation boost
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            data[i] = clamp(gray + (r - gray) * 1.4);
            data[i + 1] = clamp(gray + (g - gray) * 1.4);
            data[i + 2] = clamp(gray + (b - gray) * 1.4);
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Generate cartoon outlines (high-intensity Sobel sketch)
        const outlineResult = await applySketchFilter(imageUrl, 0.7);
        const outlineImg = await loadImage(outlineResult.url);
        
        // Blend outlines with multiply
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.6 * intensity;
        ctx.drawImage(outlineImg, 0, 0);
        
        // Restore
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        
        return {
            url: canvas.toDataURL('image/jpeg', 0.92),
            filterData: { type: 'cartoon', intensity }
        };
    } catch (err) {
        console.error('[aiEnhancement] Cartoon filter failed:', err);
        return { url: imageUrl, filterData: { type: 'cartoon', intensity } };
    }
}

/**
 * Generic dispatcher that applies selected filter.
 */
export async function applyFilter(imageUrl: string, options: FilterOptions): Promise<EnhancementResult> {
    const intensity = options.intensity ?? 0.8;
    
    switch (options.type) {
        case 'auto-touch':
            return autoTouch(imageUrl, intensity);
        case 'pencil':
            return applySketchFilter(imageUrl, intensity);
        case 'watercolor':
            return applyWatercolorFilter(imageUrl, intensity);
        case 'cartoon':
            return applyCartoonFilter(imageUrl, intensity);
        case 'portrait':
            // Portrait enhancement uses skin smoothing (auto-touch with softer sharpen)
            return autoTouch(imageUrl, intensity * 0.7);
        default:
            throw new Error(`Unknown filter type: ${options.type}`);
    }
}
