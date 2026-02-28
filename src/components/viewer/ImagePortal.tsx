import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react';

interface ImagePortalProps {
    imageUrl: string | null;
    onClose: () => void;
}

export function ImagePortal({ imageUrl, onClose }: ImagePortalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [zoom, setZoom] = useState(1);

    // 1. Monitor Fullscreen state
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        };
    }, []);

    const toggleFullscreen = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (!containerRef.current) return;

        try {
            const container = containerRef.current;
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            } else {
                if (container.requestFullscreen) await container.requestFullscreen();
                else if ((container as any).webkitRequestFullscreen) await (container as any).webkitRequestFullscreen();
            }
        } catch (err) {
            console.warn("[ImagePortal] Fullscreen error:", err);
        }
    };

    const handleClose = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch (err) {
                console.warn("[ImagePortal] Exit FS error:", err);
            }
        }
        onClose();
    };

    if (!imageUrl) return null;

    return createPortal(
        <AnimatePresence mode="wait">
            <motion.div
                ref={containerRef}
                key="image-portal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[1000] bg-black/95 flex items-center justify-center p-0 overflow-hidden backdrop-blur-md"
                onClick={handleClose}
            >
                {/* Controls Overlay */}
                <div className="absolute top-6 right-6 flex items-center gap-3 z-[1100] pointer-events-auto">
                    {/* Zoom Controls */}
                    <div className="flex items-center gap-1 bg-white/10 backdrop-blur-md rounded-full p-1 border border-white/10">
                        <button
                            className="p-2 hover:bg-white/10 rounded-full text-white transition-all"
                            onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.max(0.5, prev - 0.25)); }}
                        >
                            <ZoomOut className="w-5 h-5" />
                        </button>
                        <span className="text-[10px] font-bold text-white w-12 text-center uppercase tracking-tighter">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            className="p-2 hover:bg-white/10 rounded-full text-white transition-all"
                            onClick={(e) => { e.stopPropagation(); setZoom(prev => Math.min(3, prev + 0.25)); }}
                        >
                            <ZoomIn className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Fullscreen Toggle */}
                    <button
                        className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/10"
                        onClick={toggleFullscreen}
                    >
                        {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
                    </button>

                    {/* Exit Button */}
                    <button
                        className="p-3 bg-red-600/90 hover:bg-red-600 rounded-full text-white transition-all shadow-xl hover:scale-105 active:scale-95 border border-white/10"
                        onClick={handleClose}
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>

                {/* Main Image Stage */}
                <div
                    className="w-full h-full flex items-center justify-center relative touch-none"
                    onClick={(e) => e.stopPropagation()}
                >
                    <motion.img
                        src={imageUrl}
                        alt="Full screen"
                        className="max-w-full max-h-full object-contain shadow-2xl"
                        crossOrigin="anonymous"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: zoom, opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        style={{ transformOrigin: 'center center' }}
                        draggable={false}
                    />
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
