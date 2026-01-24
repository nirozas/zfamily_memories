import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Globe, Maximize2, Minimize2 } from 'lucide-react';

interface VideoPortalProps {
    videoUrl: string | null;
    rotation?: number;
    onClose: () => void;
    onPlay?: () => void;
}

/**
 * VideoPortal Component (Version 5.0 - CRITICAL FIX)
 * 
 * Logic:
 * 1. Event Isolation: Stops propagation to prevent flipbook interaction.
 * 2. Orientation Persistence: Goes fullscreen on Wrapper, not Video.
 * 3. Aspect Ratio Control: Special sizing for 90/270 degree rotations.
 * 4. Safe Exit: document.fullscreenElement monitoring for non-destructive esc.
 */
export function VideoPortal({ videoUrl, rotation = 0, onClose, onPlay }: VideoPortalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // 1. Monitor Fullscreen state (for Esc key support)
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

    // 2. Strict Fullscreen Toggle targeting the Container
    const toggleFullscreen = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
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
            console.warn("[VideoPortal] Fullscreen error:", err);
        }
    };

    const handlePureExit = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
        }

        // Close fullscreen if active, but don't navigate
        if (document.fullscreenElement) {
            try {
                await document.exitFullscreen();
            } catch (err) {
                console.warn("[VideoPortal] Exit FS error:", err);
            }
        }
        onClose();
    };

    // Auto-enter fullscreen on open (user expectation for portal mode)
    useEffect(() => {
        if (videoUrl && !document.fullscreenElement) {
            const timer = setTimeout(() => {
                // Only auto-trigger if not already in portal flow
                toggleFullscreen();
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [videoUrl]);

    if (!videoUrl) return null;

    // 3. Rotation Logic: Apply specific size constraints for vertical/portrait videos in landscape screens
    const isRotated = rotation === 90 || rotation === 270 || rotation === -90;

    // Style applied directly to the video element to maintain orientation visibility
    const videoTransformStyle: React.CSSProperties = {
        transform: `rotate(${rotation}deg)`,
        objectFit: 'contain',
        backgroundColor: 'black',
        zIndex: 10,
        display: 'block',
        // Critical Fix: Aspect Ratio Correction for Rotated Videos
        width: isRotated ? 'auto' : '100%',
        height: isRotated ? 'auto' : '100%',
        maxWidth: isRotated ? '100vh' : '100vw',
        maxHeight: isRotated ? '100vw' : '100vh',
    };

    return createPortal(
        <AnimatePresence mode="wait">
            <motion.div
                ref={containerRef}
                key="video-portal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                // Base container styles: Flex centering as requested
                className="fixed inset-0 z-[1000] bg-black flex items-center justify-center p-0 overflow-hidden"
                style={{ backgroundColor: '#000' }}
                onClick={handlePureExit}
            >
                {/* 4. Controls Isolation Overlay */}
                <div className="absolute top-6 right-6 flex items-center gap-4 z-[1100] pointer-events-auto">
                    {/* Fullscreen Toggle Button */}
                    <button
                        className="p-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white transition-all border border-white/10 shadow-2xl"
                        onClick={toggleFullscreen}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                    >
                        {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
                    </button>

                    {/* Exit Button */}
                    <button
                        className="p-3 bg-red-600/90 hover:bg-red-600 rounded-full text-white transition-all shadow-2xl hover:scale-110 active:scale-95 border border-white/10"
                        onClick={handlePureExit}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                    >
                        <X className="w-8 h-8" />
                    </button>
                </div>

                {/* Main Video Stage */}
                <div
                    className="w-full h-full flex items-center justify-center bg-black relative"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                >
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        controls={true}
                        autoPlay
                        playsInline
                        crossOrigin="anonymous"
                        preload="metadata"
                        onPlay={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('globalPlay', { detail: videoUrl }));
                            if (e.currentTarget.muted) e.currentTarget.muted = false;
                            onPlay?.();
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                        onPointerDown={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                        onEnded={() => handlePureExit()}
                        style={videoTransformStyle}
                    />

                    {/* Metadata Overlay (Lower Area) */}
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 z-[1100] opacity-30 hover:opacity-100 transition-opacity">
                        <a
                            href={videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-full text-[12px] font-bold uppercase tracking-widest text-white backdrop-blur-md border border-white/5 active:scale-95 transition-all"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Globe className="w-4 h-4 text-catalog-accent" />
                            Direct Stream
                        </a>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}
