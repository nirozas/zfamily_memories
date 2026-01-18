import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Droplets, Sun, Loader2, Pipette, Eye } from 'lucide-react';
import { Slider } from '../ui/Slider';
import { cn } from '../../lib/utils';
import type { Asset } from '../../contexts/AlbumContext';

interface ImageEditorModalProps {
    asset: Asset;
    pageId: string;
    updateAsset: (pageId: string, assetId: string, updates: Partial<Asset>) => void;
    onClose: () => void;
}

export function ImageEditorModal({ asset, pageId, updateAsset, onClose }: ImageEditorModalProps) {
    const [brightness, setBrightness] = useState(asset.brightness ?? 100);
    const [contrast, setContrast] = useState(asset.contrast ?? 100);
    const [saturate, setSaturate] = useState(asset.saturate ?? 100);
    const [hue, setHue] = useState(asset.hue ?? 0);
    const [sepia, setSepia] = useState(asset.sepia ?? 0);
    const [blur, setBlur] = useState(asset.blur ?? 0);
    const [chromaKeyColors, setChromaKeyColors] = useState<string[]>(asset.chromaKeyColors || (asset.chromaKeyColor ? [asset.chromaKeyColor] : []));
    const [chromaKeyTolerance, setChromaKeyTolerance] = useState(asset.chromaKeyTolerance ?? 30);
    const [isMaskVisible, setIsMaskVisible] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isPickingColor, setIsPickingColor] = useState(false);
    const [showCompare, setShowCompare] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    // Load image
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Important for canvas access
        img.src = asset.url;
        img.onload = () => {
            imageRef.current = img;
            render();
        };
    }, [asset.url]);

    const render = useCallback(() => {
        if (!canvasRef.current || !imageRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        const img = imageRef.current;
        canvas.width = img.width;
        canvas.height = img.height;

        // Apply filters
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%) blur(${blur}px)`;
        ctx.drawImage(img, 0, 0);

        // Apply Chroma Key (if colors selected)
        if (chromaKeyColors.length > 0) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const targets = chromaKeyColors.map(c => hexToRgb(c)).filter(Boolean);

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                let isSelected = false;
                for (const target of targets) {
                    if (!target) continue;
                    const dr = r - target.r;
                    const dg = g - target.g;
                    const db = b - target.b;
                    const dist = Math.sqrt(dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11);
                    if (dist < chromaKeyTolerance) {
                        isSelected = true;
                        break;
                    }
                }

                if (isSelected) {
                    if (isMaskVisible) {
                        // Highlight selected area in bright red/pink for precision
                        data[i] = 255;
                        data[i + 1] = 0;
                        data[i + 2] = 255;
                        data[i + 3] = 200;
                    } else {
                        data[i + 3] = 0; // Transparent
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }
    }, [brightness, contrast, saturate, hue, sepia, blur, chromaKeyColors, chromaKeyTolerance, isMaskVisible]);

    useEffect(() => {
        render();
    }, [render]);

    const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    };

    const rgbToHex = (r: number, g: number, b: number) => {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isPickingColor || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) * (canvas.width / rect.width);
        const y = (e.clientY - rect.top) * (canvas.height / rect.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        if (!chromaKeyColors.includes(hex)) {
            setChromaKeyColors([...chromaKeyColors, hex]);
        }
        setIsPickingColor(false);
    };

    const handleSave = async () => {
        setIsProcessing(true);
        try {
            // Update the asset with the new properties
            // If the user wants to "remove color to transparent" permanently, we should ideally
            // save the dataURL or re-upload. For now, we'll store the properties so the 
            // renderer can apply them dynamically.
            updateAsset(pageId, asset.id, {
                brightness,
                contrast,
                saturate,
                hue,
                sepia,
                chromaKeyColors: chromaKeyColors.length > 0 ? chromaKeyColors : undefined,
                chromaKeyColor: chromaKeyColors[0] || undefined, // Fallback for backward compatibility
                chromaKeyTolerance,
                blur
            });
            onClose();
        } catch (err) {
            console.error('Failed to save image edits:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 md:p-8 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-catalog-accent/10">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-catalog-accent/10 bg-catalog-stone/5">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-catalog-accent/10 rounded-xl">
                            <Droplets className="w-6 h-6 text-catalog-accent" />
                        </div>
                        <div>
                            <h2 className="font-serif text-2xl text-catalog-text">Pro Image Studio</h2>
                            <p className="text-[10px] text-catalog-text/40 uppercase tracking-widest font-bold">Pixel-perfect adjustments</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onMouseDown={() => setShowCompare(true)}
                            onMouseUp={() => setShowCompare(false)}
                            onMouseLeave={() => setShowCompare(false)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all",
                                showCompare ? "bg-catalog-accent text-white" : "bg-catalog-stone/10 text-catalog-text/60 hover:bg-catalog-stone/20"
                            )}
                        >
                            <Eye className="w-4 h-4" /> Hold to Compare
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-catalog-stone/20 rounded-full transition-all">
                            <X className="w-6 h-6 text-catalog-text/40" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Preview Area */}
                    <div className="flex-1 relative flex items-center justify-center p-8 bg-catalog-stone/10 overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
                        <div className={cn(
                            "relative shadow-2xl transition-all duration-300",
                            isPickingColor && "cursor-crosshair ring-4 ring-catalog-accent/50",
                            showCompare && "scale-[1.02]"
                        )}>
                            <canvas
                                ref={canvasRef}
                                onClick={handleCanvasClick}
                                className={cn(
                                    "max-w-full max-h-full object-contain bg-white bg-[url('https://www.transparenttextures.com/patterns/checkerboard-light.png')] transition-opacity duration-300",
                                    showCompare ? "opacity-0" : "opacity-100"
                                )}
                                style={{
                                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                                }}
                            />
                            {showCompare && (
                                <img
                                    src={asset.url}
                                    alt="Original"
                                    className="absolute inset-0 w-full h-full object-contain bg-white pointer-events-none animate-in fade-in duration-300"
                                    crossOrigin="anonymous"
                                />
                            )}
                            {isPickingColor && (
                                <div className="absolute top-4 left-4 bg-catalog-accent text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest animate-bounce">
                                    Click to pick transparent color
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Controls Sidebar */}
                    <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-catalog-accent/10 bg-white p-6 space-y-6 overflow-y-auto content-scrollbar">
                        <section className="space-y-4">
                            <h3 className="text-[10px] font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Sun className="w-3.5 h-3.5" /> Basic Adjustments
                            </h3>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Brightness</span>
                                        <span>{brightness}%</span>
                                    </div>
                                    <Slider value={[brightness]} min={0} max={200} onValueChange={([v]) => setBrightness(v)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Contrast</span>
                                        <span>{contrast}%</span>
                                    </div>
                                    <Slider value={[contrast]} min={0} max={200} onValueChange={([v]) => setContrast(v)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Saturation</span>
                                        <span>{saturate}%</span>
                                    </div>
                                    <Slider value={[saturate]} min={0} max={200} onValueChange={([v]) => setSaturate(v)} />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 pt-4 border-t border-catalog-accent/5">
                            <h3 className="text-[10px] font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Droplets className="w-3.5 h-3.5" /> Color Styling
                            </h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Hue Shift</span>
                                        <span>{hue}°</span>
                                    </div>
                                    <Slider value={[hue]} min={-180} max={180} onValueChange={([v]) => setHue(v)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Sepia</span>
                                        <span>{sepia}%</span>
                                    </div>
                                    <Slider value={[sepia]} min={0} max={100} onValueChange={([v]) => setSepia(v)} />
                                </div>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                        <span>Blur</span>
                                        <span>{blur}px</span>
                                    </div>
                                    <Slider value={[blur]} min={0} max={20} onValueChange={([v]) => setBlur(v)} />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4 pt-4 border-t border-catalog-accent/5">
                            <h3 className="text-[10px] font-bold text-catalog-accent uppercase tracking-widest flex items-center gap-2">
                                <Pipette className="w-3.5 h-3.5" /> Chroma Key (Transparency)
                            </h3>
                            <div className="space-y-4">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsPickingColor(!isPickingColor)}
                                        className={cn(
                                            "flex-1 py-3 px-4 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                                            isPickingColor ? "bg-catalog-accent text-white shadow-lg" : "bg-catalog-stone/10 text-catalog-text hover:bg-catalog-stone/20"
                                        )}
                                    >
                                        <Pipette className="w-4 h-4" /> Pick Color
                                    </button>
                                    <button
                                        onClick={() => setIsMaskVisible(!isMaskVisible)}
                                        className={cn(
                                            "px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all",
                                            isMaskVisible ? "bg-pink-500 text-white" : "bg-catalog-stone/10 text-catalog-text/60"
                                        )}
                                        title="Show Selection Mask"
                                    >
                                        <Eye className="w-4 h-4" /> Mask
                                    </button>
                                </div>

                                {chromaKeyColors.length > 0 && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2 max-h-32 overflow-y-auto px-1">
                                            {chromaKeyColors.map((color, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-2 bg-catalog-stone/5 rounded-lg border border-catalog-accent/5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded shadow-sm border border-white" style={{ backgroundColor: color }} />
                                                        <span className="text-[9px] font-mono text-catalog-text/60 uppercase">{color}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => setChromaKeyColors(chromaKeyColors.filter(c => c !== color))}
                                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between text-xs font-medium text-catalog-text/60">
                                                <span>Fuzziness (Tolerance)</span>
                                                <span>{chromaKeyTolerance}</span>
                                            </div>
                                            <Slider value={[chromaKeyTolerance]} min={1} max={100} onValueChange={([v]) => setChromaKeyTolerance(v)} />
                                        </div>

                                        <button
                                            onClick={() => {
                                                setIsMaskVisible(false);
                                                render();
                                            }}
                                            className="w-full py-3 bg-green-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                                        >
                                            <Check className="w-4 h-4" /> Perform Transparency
                                        </button>
                                    </div>
                                )}
                            </div>
                        </section>

                        <button
                            onClick={() => {
                                setBrightness(100);
                                setContrast(100);
                                setSaturate(100);
                                setHue(0);
                                setSepia(0);
                                setBlur(0);
                                setChromaKeyColors([]);
                            }}
                            className="w-full py-3 text-[10px] text-catalog-text/40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border border-dashed border-catalog-accent/10 uppercase font-black tracking-widest"
                        >
                            Reset All Studio tools
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-6 border-t border-catalog-accent/10 bg-catalog-stone/5 flex justify-end gap-3 sticky bottom-0">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 text-[11px] font-bold uppercase tracking-widest text-catalog-text/40 hover:text-catalog-text rounded-xl transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isProcessing}
                        className="min-w-[160px] px-10 py-3 bg-catalog-accent text-white rounded-xl shadow-xl shadow-catalog-accent/20 hover:shadow-2xl hover:bg-catalog-accent/90 transition-all text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Apply Artifacts
                    </button>
                </div>
            </div>
        </div>
    );
}
