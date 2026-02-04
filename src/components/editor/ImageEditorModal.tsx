import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Check, Sun, Loader2, Pipette, Eye, Sparkles, Palette, Zap, Camera } from 'lucide-react';
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
    const [exposure, setExposure] = useState(asset.exposure ?? 0);
    const [highlights, setHighlights] = useState(asset.highlights ?? 0);
    const [shadows, setShadows] = useState(asset.shadows ?? 0);
    const [warmth, setWarmth] = useState(asset.warmth ?? 0);
    const [sharpness, setSharpness] = useState(asset.sharpness ?? 0);

    const [chromaKeyColors, setChromaKeyColors] = useState<string[]>(asset.chromaKeyColors || (asset.chromaKeyColor ? [asset.chromaKeyColor] : []));
    const [chromaKeyTolerance, setChromaKeyTolerance] = useState(asset.chromaKeyTolerance ?? 30);
    const [isMaskVisible, setIsMaskVisible] = useState(false);

    const [isProcessing, setIsProcessing] = useState(false);
    const [isPickingColor, setIsPickingColor] = useState(false);
    const [showCompare, setShowCompare] = useState(false);
    const [activeTab, setActiveTab] = useState<'basic' | 'advanced' | 'color' | 'effects'>('basic');

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    // Preset filters
    const presets = [
        { name: 'Original', values: { brightness: 100, contrast: 100, saturate: 100, hue: 0, sepia: 0, warmth: 0 } },
        { name: 'Vivid', values: { brightness: 105, contrast: 115, saturate: 130, hue: 0, sepia: 0, warmth: 5 } },
        { name: 'Warm', values: { brightness: 105, contrast: 100, saturate: 110, hue: 10, sepia: 0, warmth: 20 } },
        { name: 'Cool', values: { brightness: 100, contrast: 105, saturate: 95, hue: -10, sepia: 0, warmth: -15 } },
        { name: 'Vintage', values: { brightness: 95, contrast: 90, saturate: 80, hue: 5, sepia: 40, warmth: 10 } },
        { name: 'B&W', values: { brightness: 100, contrast: 110, saturate: 0, hue: 0, sepia: 0, warmth: 0 } },
        { name: 'Dramatic', values: { brightness: 95, contrast: 140, saturate: 90, hue: 0, sepia: 0, warmth: -5 } },
        { name: 'Soft', values: { brightness: 110, contrast: 85, saturate: 90, hue: 0, sepia: 10, warmth: 5 } },
    ];

    const applyPreset = (preset: typeof presets[0]) => {
        setBrightness(preset.values.brightness);
        setContrast(preset.values.contrast);
        setSaturate(preset.values.saturate);
        setHue(preset.values.hue);
        setSepia(preset.values.sepia);
        setWarmth(preset.values.warmth);
    };

    // Load image
    useEffect(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
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

        // Calculate combined filter with advanced controls
        const exposureFilter = exposure !== 0 ? `brightness(${100 + exposure}%)` : '';
        const warmthFilter = warmth !== 0 ? `hue-rotate(${warmth * 0.5}deg) saturate(${100 + warmth * 0.3}%)` : '';
        const sharpnessFilter = sharpness !== 0 ? `contrast(${100 + sharpness * 0.5}%)` : '';

        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hue}deg) sepia(${sepia}%) blur(${blur}px) ${exposureFilter} ${warmthFilter} ${sharpnessFilter}`.trim();
        ctx.drawImage(img, 0, 0);

        // Apply Chroma Key
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
                        data[i] = 255;
                        data[i + 1] = 0;
                        data[i + 2] = 255;
                        data[i + 3] = 200;
                    } else {
                        data[i + 3] = 0;
                    }
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }
    }, [brightness, contrast, saturate, hue, sepia, blur, exposure, highlights, shadows, warmth, sharpness, chromaKeyColors, chromaKeyTolerance, isMaskVisible]);

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
            updateAsset(pageId, asset.id, {
                brightness,
                contrast,
                saturate,
                hue,
                sepia,
                blur,
                exposure,
                highlights,
                shadows,
                warmth,
                sharpness,
                chromaKeyColors: chromaKeyColors.length > 0 ? chromaKeyColors : undefined,
                chromaKeyColor: chromaKeyColors[0] || undefined,
                chromaKeyTolerance,
            });
            onClose();
        } catch (err) {
            console.error('Failed to save image edits:', err);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 md:p-6 animate-in fade-in duration-300">
            <div className="bg-gradient-to-br from-white to-catalog-stone/20 w-full max-w-[95vw] h-full max-h-[95vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-catalog-accent/20">
                {/* Header */}
                <div className="flex items-center justify-between px-10 py-6 border-b border-catalog-accent/10 bg-gradient-to-r from-catalog-stone/5 to-transparent backdrop-blur-sm">
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-gradient-to-br from-catalog-accent to-catalog-accent/80 rounded-2xl shadow-lg shadow-catalog-accent/20">
                            <Sparkles className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h2 className="font-outfit font-black text-3xl text-catalog-text tracking-tight">Composition Studio 4.0</h2>
                            <p className="text-[11px] text-catalog-text/50 uppercase tracking-[0.3em] font-black mt-1">Professional Image Enhancement Suite</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-4 py-2 bg-black/5 rounded-xl border border-black/5">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black text-catalog-text/40 uppercase tracking-widest">Live Preview</span>
                        </div>
                        <button
                            onMouseDown={() => setShowCompare(true)}
                            onMouseUp={() => setShowCompare(false)}
                            onMouseLeave={() => setShowCompare(false)}
                            className={cn(
                                "flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg",
                                showCompare ? "bg-catalog-accent text-white scale-105" : "bg-white text-catalog-text/60 hover:bg-catalog-stone/10"
                            )}
                        >
                            <Eye className="w-4 h-4" /> Hold to Compare
                        </button>
                        <button onClick={onClose} className="p-3 hover:bg-catalog-stone/20 rounded-xl transition-all group">
                            <X className="w-6 h-6 text-catalog-text/40 group-hover:text-catalog-text" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Preview Area */}
                    <div className="flex-1 relative flex flex-col items-center justify-center p-10 bg-gradient-to-br from-catalog-stone/5 to-catalog-stone/10 overflow-hidden">
                        {/* Grid background */}
                        <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-30" />

                        {/* Stats Bar */}
                        <div className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                                <div className="px-4 py-2 bg-white/90 backdrop-blur-xl rounded-xl border border-black/5 shadow-lg">
                                    <span className="text-[9px] font-black text-catalog-text/40 uppercase tracking-widest">Resolution</span>
                                    <p className="text-sm font-black text-catalog-accent">{imageRef.current?.width || 0} × {imageRef.current?.height || 0}</p>
                                </div>
                                <div className="px-4 py-2 bg-white/90 backdrop-blur-xl rounded-xl border border-black/5 shadow-lg">
                                    <span className="text-[9px] font-black text-catalog-text/40 uppercase tracking-widest">Adjustments</span>
                                    <p className="text-sm font-black text-catalog-accent">
                                        {[brightness !== 100, contrast !== 100, saturate !== 100, hue !== 0, sepia !== 0, blur !== 0, exposure !== 0, warmth !== 0, sharpness !== 0].filter(Boolean).length} Active
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className={cn(
                            "relative shadow-2xl transition-all duration-300 max-w-full max-h-full",
                            isPickingColor && "cursor-crosshair ring-4 ring-catalog-accent/50 scale-[1.02]",
                            showCompare && "scale-[1.01]"
                        )}>
                            <canvas
                                ref={canvasRef}
                                onClick={handleCanvasClick}
                                className={cn(
                                    "max-w-full max-h-[calc(95vh-300px)] object-contain bg-white rounded-lg shadow-2xl transition-opacity duration-300",
                                    showCompare ? "opacity-0" : "opacity-100"
                                )}
                                style={{
                                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.05)'
                                }}
                            />
                            {showCompare && (
                                <img
                                    src={asset.url}
                                    alt="Original"
                                    className="absolute inset-0 w-full h-full object-contain bg-white rounded-lg pointer-events-none animate-in fade-in duration-200"
                                    crossOrigin="anonymous"
                                />
                            )}
                            {isPickingColor && (
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-catalog-accent text-white px-5 py-3 rounded-full text-[11px] font-black uppercase tracking-widest animate-bounce shadow-2xl">
                                    <Pipette className="w-4 h-4 inline mr-2" />
                                    Click to pick transparent color
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Controls Sidebar */}
                    <div className="w-[420px] border-l border-catalog-accent/10 bg-white flex flex-col overflow-hidden">
                        {/* Tabs */}
                        <div className="flex border-b border-catalog-accent/10 bg-catalog-stone/5 p-2 gap-1">
                            {[
                                { id: 'basic', label: 'Basic', icon: Sun },
                                { id: 'advanced', label: 'Advanced', icon: Zap },
                                { id: 'color', label: 'Color', icon: Palette },
                                { id: 'effects', label: 'Effects', icon: Sparkles }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        activeTab === tab.id
                                            ? "bg-white text-catalog-accent shadow-lg border border-catalog-accent/10"
                                            : "text-catalog-text/40 hover:bg-white/50 hover:text-catalog-text"
                                    )}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Presets */}
                        <div className="p-6 border-b border-catalog-accent/10 bg-gradient-to-b from-catalog-stone/5 to-transparent">
                            <h3 className="text-[10px] font-black text-catalog-accent uppercase tracking-widest mb-4 flex items-center gap-2">
                                <Camera className="w-3.5 h-3.5" /> Quick Presets
                            </h3>
                            <div className="grid grid-cols-4 gap-2">
                                {presets.map(preset => (
                                    <button
                                        key={preset.name}
                                        onClick={() => applyPreset(preset)}
                                        className="px-3 py-2 bg-white hover:bg-catalog-accent hover:text-white text-catalog-text/60 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all border border-black/5 hover:border-catalog-accent hover:scale-105 hover:shadow-lg"
                                    >
                                        {preset.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Controls Content */}
                        <div className="flex-1 overflow-y-auto content-scrollbar p-6 space-y-6">
                            {activeTab === 'basic' && (
                                <>
                                    <section className="space-y-5">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-catalog-accent/10">
                                            <Sun className="w-4 h-4 text-catalog-accent" /> Light & Tone
                                        </h3>
                                        <div className="space-y-5">
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Brightness</span>
                                                    <span className="text-catalog-accent">{brightness}%</span>
                                                </div>
                                                <Slider value={[brightness]} min={0} max={200} onValueChange={([v]) => setBrightness(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Contrast</span>
                                                    <span className="text-catalog-accent">{contrast}%</span>
                                                </div>
                                                <Slider value={[contrast]} min={0} max={200} onValueChange={([v]) => setContrast(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Exposure</span>
                                                    <span className="text-catalog-accent">{exposure > 0 ? '+' : ''}{exposure}</span>
                                                </div>
                                                <Slider value={[exposure]} min={-50} max={50} onValueChange={([v]) => setExposure(v)} />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="space-y-5">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-catalog-accent/10">
                                            <Palette className="w-4 h-4 text-catalog-accent" /> Color Intensity
                                        </h3>
                                        <div className="space-y-5">
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Saturation</span>
                                                    <span className="text-catalog-accent">{saturate}%</span>
                                                </div>
                                                <Slider value={[saturate]} min={0} max={200} onValueChange={([v]) => setSaturate(v)} />
                                            </div>
                                        </div>
                                    </section>
                                </>
                            )}

                            {activeTab === 'advanced' && (
                                <>
                                    <section className="space-y-5">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-catalog-accent/10">
                                            <Zap className="w-4 h-4 text-catalog-accent" /> Fine Tuning
                                        </h3>
                                        <div className="space-y-5">
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Highlights</span>
                                                    <span className="text-catalog-accent">{highlights > 0 ? '+' : ''}{highlights}</span>
                                                </div>
                                                <Slider value={[highlights]} min={-100} max={100} onValueChange={([v]) => setHighlights(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Shadows</span>
                                                    <span className="text-catalog-accent">{shadows > 0 ? '+' : ''}{shadows}</span>
                                                </div>
                                                <Slider value={[shadows]} min={-100} max={100} onValueChange={([v]) => setShadows(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Sharpness</span>
                                                    <span className="text-catalog-accent">{sharpness}</span>
                                                </div>
                                                <Slider value={[sharpness]} min={0} max={100} onValueChange={([v]) => setSharpness(v)} />
                                            </div>
                                        </div>
                                    </section>
                                </>
                            )}

                            {activeTab === 'color' && (
                                <>
                                    <section className="space-y-5">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-catalog-accent/10">
                                            <Palette className="w-4 h-4 text-catalog-accent" /> Color Grading
                                        </h3>
                                        <div className="space-y-5">
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Hue Shift</span>
                                                    <span className="text-catalog-accent">{hue}°</span>
                                                </div>
                                                <Slider value={[hue]} min={-180} max={180} onValueChange={([v]) => setHue(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Temperature</span>
                                                    <span className="text-catalog-accent">{warmth > 0 ? 'Warm' : warmth < 0 ? 'Cool' : 'Neutral'} {Math.abs(warmth)}</span>
                                                </div>
                                                <Slider value={[warmth]} min={-50} max={50} onValueChange={([v]) => setWarmth(v)} />
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Sepia</span>
                                                    <span className="text-catalog-accent">{sepia}%</span>
                                                </div>
                                                <Slider value={[sepia]} min={0} max={100} onValueChange={([v]) => setSepia(v)} />
                                            </div>
                                        </div>
                                    </section>
                                </>
                            )}

                            {activeTab === 'effects' && (
                                <>
                                    <section className="space-y-5">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2 pb-2 border-b border-catalog-accent/10">
                                            <Sparkles className="w-4 h-4 text-catalog-accent" /> Visual Effects
                                        </h3>
                                        <div className="space-y-5">
                                            <div className="space-y-2">
                                                <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                    <span>Blur</span>
                                                    <span className="text-catalog-accent">{blur}px</span>
                                                </div>
                                                <Slider value={[blur]} min={0} max={20} onValueChange={([v]) => setBlur(v)} />
                                            </div>
                                        </div>
                                    </section>

                                    <section className="space-y-4 pt-4 border-t border-catalog-accent/10">
                                        <h3 className="text-[11px] font-black text-catalog-text uppercase tracking-widest flex items-center gap-2">
                                            <Pipette className="w-4 h-4 text-catalog-accent" /> Background Removal
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setIsPickingColor(!isPickingColor)}
                                                    className={cn(
                                                        "flex-1 py-3 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg",
                                                        isPickingColor ? "bg-catalog-accent text-white scale-105" : "bg-catalog-stone/10 text-catalog-text hover:bg-catalog-stone/20"
                                                    )}
                                                >
                                                    <Pipette className="w-4 h-4" /> Pick Color
                                                </button>
                                                <button
                                                    onClick={() => setIsMaskVisible(!isMaskVisible)}
                                                    className={cn(
                                                        "px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg",
                                                        isMaskVisible ? "bg-pink-500 text-white scale-105" : "bg-catalog-stone/10 text-catalog-text/60 hover:bg-catalog-stone/20"
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
                                                            <div key={idx} className="flex items-center justify-between p-3 bg-catalog-stone/5 rounded-xl border border-catalog-accent/10 hover:border-catalog-accent/30 transition-all">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg shadow-md border-2 border-white" style={{ backgroundColor: color }} />
                                                                    <span className="text-[10px] font-mono font-bold text-catalog-text/60 uppercase">{color}</span>
                                                                </div>
                                                                <button
                                                                    onClick={() => setChromaKeyColors(chromaKeyColors.filter(c => c !== color))}
                                                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex justify-between text-xs font-bold text-catalog-text/70">
                                                            <span>Tolerance</span>
                                                            <span className="text-catalog-accent">{chromaKeyTolerance}</span>
                                                        </div>
                                                        <Slider value={[chromaKeyTolerance]} min={1} max={100} onValueChange={([v]) => setChromaKeyTolerance(v)} />
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            setIsMaskVisible(false);
                                                            render();
                                                        }}
                                                        className="w-full py-3 bg-gradient-to-r from-green-600 to-green-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        <Check className="w-4 h-4" /> Apply Transparency
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </>
                            )}

                            <button
                                onClick={() => {
                                    setBrightness(100);
                                    setContrast(100);
                                    setSaturate(100);
                                    setHue(0);
                                    setSepia(0);
                                    setBlur(0);
                                    setExposure(0);
                                    setHighlights(0);
                                    setShadows(0);
                                    setWarmth(0);
                                    setSharpness(0);
                                    setChromaKeyColors([]);
                                }}
                                className="w-full py-3 text-[10px] text-catalog-text/40 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all border-2 border-dashed border-catalog-accent/10 hover:border-red-300 uppercase font-black tracking-widest"
                            >
                                Reset All Adjustments
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-10 py-6 border-t border-catalog-accent/10 bg-gradient-to-r from-catalog-stone/5 to-transparent backdrop-blur-sm flex justify-between items-center sticky bottom-0">
                    <div className="text-[10px] text-catalog-text/40 font-black uppercase tracking-widest">
                        Composition Studio v4.0 • Professional Grade
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-8 py-3 text-[11px] font-black uppercase tracking-widest text-catalog-text/40 hover:text-catalog-text hover:bg-catalog-stone/10 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isProcessing}
                            className="min-w-[180px] px-12 py-4 bg-gradient-to-r from-catalog-accent to-catalog-accent/90 text-white rounded-xl shadow-2xl shadow-catalog-accent/30 hover:shadow-catalog-accent/40 hover:scale-105 transition-all text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                        >
                            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                            Apply Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
