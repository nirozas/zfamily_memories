import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { X, Check, RotateCw, RotateCcw, Move, Target, AlertTriangle, Scissors, Loader2 } from 'lucide-react';
import { Slider } from '../ui/Slider';
import { cn } from '../../lib/utils';
import type { Asset } from '../../contexts/AlbumContext';
import { getTransformedUrl } from '../../lib/assetUtils';

interface FocalPointEditorModalProps {
    asset: Asset;
    pageId: string;
    onSave: (updates: Partial<Asset>) => void;
    onClose: () => void;
}

/**
 * Composition Studio 4.0 - Database Schema Expansion & Vividness Masking
 * 
 * Implements the "Vividness Filter" where the safe area is 100% vivid 
 * and the bleed area is desaturated (30%) and dimmed (70%).
 * 
 * Ensures transform metadata (zoom, translateX, translateY, rotation) 
 * is correctly packaged for Supabase JSON persistence.
 */
export function FocalPointEditorModal({ asset, onSave, onClose }: FocalPointEditorModalProps) {
    const [zoom, setZoom] = useState(asset.crop?.zoom || 1);
    const [focalPoint, setFocalPoint] = useState({
        x: asset.crop?.x ?? 50,
        y: asset.crop?.y ?? 50
    });
    const [rotation, setRotation] = useState(asset.rotation || 0);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState<'image' | 'reticle' | null>(null);

    const frameAspectRatio = asset.width / asset.height;

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number | null>(null);

    // 1. Resource Handshake & Schema Re-binding
    useEffect(() => {
        if (!asset.url) {
            setRenderError("SOURCE_TEXTURE_MISSING: Asset URL is undefined.");
            return;
        }

        const runHandshake = async () => {
            const cleanUrl = getTransformedUrl(asset.url, asset);

            const img = new Image();
            img.crossOrigin = "anonymous";
            img.src = cleanUrl;

            img.onload = async () => {
                try {
                    if ('decode' in img) await img.decode();
                    imageRef.current = img;
                    setIsImageLoaded(true);
                    setRenderError(null);
                } catch (err) {
                    setRenderError("DECODE_FAILURE: GPU handshake failed.");
                }
            };

            img.onerror = () => {
                setRenderError("HANDSHAKE_ERROR: Asset link severed.");
            };
        };

        runHandshake();
    }, [asset.url, asset.id]);

    // 2. The Vividness Render Engine
    const render = useCallback(() => {
        if (!canvasRef.current || !imageRef.current || !isImageLoaded) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        const img = imageRef.current;
        const rect = canvas.getBoundingClientRect();

        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, rect.width, rect.height);

        // Calculate Image Bounds & Transforms
        const imgAspect = img.width / img.height;
        let drawW, drawH;

        if (imgAspect > frameAspectRatio) {
            drawH = rect.height * zoom;
            drawW = drawH * imgAspect;
        } else {
            drawW = rect.width * zoom;
            drawH = drawW / imgAspect;
        }

        const offX = -(drawW * (focalPoint.x / 100));
        const offY = -(drawH * (focalPoint.y / 100));

        // --- STEP 1: Draw the "Outside" Dimmed/Desaturated Area ---
        ctx.save();
        ctx.filter = 'saturate(30%) brightness(70%) opacity(0.6)';
        ctx.translate(rect.width / 2, rect.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, offX, offY, drawW, drawH);

        // Finalize Image Borders (Dashed white line around the file edges)
        ctx.setLineDash([10, 5]);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(offX, offY, drawW, drawH);
        ctx.restore();

        // --- STEP 2: Draw the "Active Frame" Vivid Area ---
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, rect.width, rect.height);
        ctx.clip();

        ctx.save();
        ctx.translate(rect.width / 2, rect.height / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.drawImage(img, offX, offY, drawW, drawH);
        ctx.restore();

        ctx.restore();

        // --- STEP 3: Draw Bold Frame Borders ---
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 4;
        ctx.strokeRect(0, 0, rect.width, rect.height);

        ctx.restore();
    }, [isImageLoaded, zoom, focalPoint, rotation, frameAspectRatio]);

    useLayoutEffect(() => {
        const animate = () => {
            render();
            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [render]);

    // 3. Control Interaction Layer
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        if (isDragging === 'image') {
            const sensitivity = 0.15 / zoom;
            setFocalPoint(prev => ({
                x: Math.max(-100, Math.min(200, prev.x - e.movementX * sensitivity)),
                y: Math.max(-100, Math.min(200, prev.y - e.movementY * sensitivity))
            }));
        } else if (isDragging === 'reticle' && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            setFocalPoint({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
        }
    }, [isDragging, zoom]);

    const handleMouseUp = useCallback(() => setIsDragging(null), []);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleRotate = (dir: 'cw' | 'ccw') => {
        setRotation(prev => (prev + (dir === 'cw' ? 90 : -90)) % 360);
    };

    const handleInternalSave = () => {
        onSave({
            rotation,
            crop: {
                zoom,
                x: focalPoint.x,
                y: focalPoint.y,
                width: 1,
                height: 1
            },
            ...({
                translateX: focalPoint.x,
                translateY: focalPoint.y,
                image_url: asset.url
            } as any)
        });
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95 backdrop-blur-3xl animate-in fade-in transition-all duration-700">
            <div className="bg-white w-[65%] h-[92vh] rounded-[4rem] shadow-[0_0_200px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden border border-white/10 ring-1 ring-white/5">
                {/* Header */}
                <div className="flex items-center justify-between px-12 py-8 border-b border-catalog-accent/10 bg-catalog-stone/5">
                    <div className="flex items-center gap-8">
                        <div className="w-16 h-16 bg-catalog-accent rounded-3xl flex items-center justify-center shadow-2xl shadow-catalog-accent/30 ring-4 ring-catalog-accent/10">
                            <Target className="w-8 h-8 text-white animate-pulse" />
                        </div>
                        <div>
                            <h2 className="font-serif text-4xl text-catalog-text tracking-tight">Composition Studio 4.0</h2>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-catalog-text/50 uppercase tracking-[0.4em] font-black italic">DATABASE TRANSFORM ENGINE</span>
                                <div className={cn("h-2 w-2 rounded-full bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]")} />
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-6 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-catalog-text/20 active:scale-90">
                        <X className="w-10 h-10" />
                    </button>
                </div>

                {/* Workspace */}
                <div className="flex-1 flex overflow-hidden">
                    <div
                        className="flex-1 relative bg-[#020202] overflow-hidden flex items-center justify-center"
                        onWheel={(e) => {
                            const delta = -e.deltaY;
                            const zoomStep = 0.04;
                            setZoom(prev => Math.max(1, Math.min(10, prev + (delta > 0 ? zoomStep : -zoomStep))));
                        }}
                    >
                        {!isImageLoaded && !renderError && (
                            <div className="flex flex-col items-center gap-8 text-catalog-accent/40">
                                <Loader2 className="w-16 h-16 animate-spin" />
                                <p className="text-[12px] uppercase font-black tracking-[0.5em]">Initializing Schema Alignment...</p>
                            </div>
                        )}

                        {renderError && (
                            <div className="flex flex-col items-center gap-8 text-red-500/80 max-w-sm text-center p-12">
                                <AlertTriangle className="w-16 h-16" />
                                <p className="text-sm uppercase font-black tracking-widest leading-relaxed">{renderError}</p>
                                <button onClick={() => window.location.reload()} className="w-full bg-red-500 text-white py-5 rounded-2xl text-[11px] font-black uppercase tracking-[0.3em]">RE-LINK CDN KERNEL</button>
                            </div>
                        )}

                        <div
                            ref={containerRef}
                            className={cn(
                                "relative transition-all duration-[800ms] transform cursor-grab active:cursor-grabbing",
                                isImageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
                            )}
                            onMouseDown={() => setIsDragging('image')}
                            style={{
                                width: `min(85%, ${85 * frameAspectRatio}vh)`,
                                aspectRatio: frameAspectRatio,
                                zIndex: 10
                            }}
                        >
                            <canvas
                                id="Composition_Preview"
                                ref={canvasRef}
                                className="w-full h-full block"
                            />

                            <div
                                className="absolute z-50 cursor-move"
                                style={{
                                    left: `${focalPoint.x}%`,
                                    top: `${focalPoint.y}%`,
                                    transform: 'translate(-50%, -50%)'
                                }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsDragging('reticle');
                                }}
                            >
                                <div className="w-20 h-20 border-4 border-catalog-accent rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(194,65,12,0.5)]">
                                    <div className="w-3 h-3 bg-catalog-accent rounded-full shadow-[0_0_20px_rgba(194,65,12,1)]" />
                                </div>
                            </div>
                        </div>

                        {/* Floating Control Side Panel */}
                        <div className="absolute top-10 right-10 bg-white/10 backdrop-blur-2xl border border-white/20 p-10 rounded-[3rem] w-80 space-y-12 shadow-[0_0_100px_rgba(0,0,0,0.5)] z-50">
                            <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Zoom Level</h3>
                                    <div className="px-3 py-1 bg-catalog-accent text-white rounded-lg text-[10px] font-black">
                                        {zoom.toFixed(2)}x
                                    </div>
                                </div>
                                <div className="h-[200px] flex justify-center py-4 bg-white/5 rounded-2xl">
                                    <Slider
                                        orientation="vertical"
                                        value={[zoom]}
                                        min={1}
                                        max={10}
                                        step={0.01}
                                        onValueChange={([v]) => setZoom(v)}
                                    />
                                </div>
                            </section>

                            <section className="space-y-6">
                                <h3 className="text-[11px] font-black text-white uppercase tracking-[0.3em]">Orientation</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => handleRotate('ccw')} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/20 transition-all flex flex-col items-center gap-3 active:scale-95 group">
                                        <RotateCcw className="w-6 h-6 text-white/40 group-hover:text-catalog-accent transition-colors" />
                                        <span className="text-[8px] font-black text-white/50">-90°</span>
                                    </button>
                                    <button onClick={() => handleRotate('cw')} className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/20 transition-all flex flex-col items-center gap-3 active:scale-95 group">
                                        <RotateCw className="w-6 h-6 text-white/40 group-hover:text-catalog-accent transition-colors" />
                                        <span className="text-[8px] font-black text-white/50">+90°</span>
                                    </button>
                                </div>
                            </section>
                        </div>

                        {/* Telemetry HUD */}
                        <div className="absolute bottom-40 left-1/2 -translate-x-1/2 bg-white/5 backdrop-blur-xl border border-white/10 px-10 py-6 rounded-[2.5rem] flex items-center gap-10 text-white text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl z-50">
                            <div className="flex items-center gap-3 text-catalog-accent"><Move className="w-6 h-6" /> Pan Frame</div>
                            <div className="w-[1px] h-6 bg-white/20" />
                            <div className="flex items-center gap-3 text-white/60"><Scissors className="w-6 h-6" /> Focus Mask Active</div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-12 py-10 border-t border-catalog-accent/10 bg-catalog-stone/5 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="px-6 py-2 bg-black/5 rounded-full border border-black/5">
                            <span className="text-[10px] font-black text-catalog-text/40 uppercase tracking-[0.2em]">Asset: {asset.url.split('/').pop()?.substring(0, 15)}...</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <button
                            onClick={onClose}
                            className="px-10 py-6 bg-catalog-stone/10 text-catalog-text/40 rounded-[2rem] font-black uppercase tracking-[0.5em] text-[11px] hover:bg-red-50 hover:text-red-500 transition-all active:scale-95"
                        >
                            Discard Session
                        </button>
                        <button
                            onClick={handleInternalSave}
                            className="px-16 py-6 bg-catalog-accent text-white rounded-[2rem] font-black uppercase tracking-[0.5em] text-[11px] shadow-2xl shadow-catalog-accent/40 hover:scale-[1.03] active:scale-95 transition-all flex items-center gap-4"
                        >
                            <Check className="w-6 h-6" /> Commit & Synchronize
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
