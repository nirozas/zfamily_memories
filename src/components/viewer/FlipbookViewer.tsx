import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Download, FileText, Globe, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { type Album, type Page } from '../../contexts/AlbumContext';
import { printService } from '../../services/printService';
import { motion, AnimatePresence } from 'framer-motion';
import { VideoPortal } from './VideoPortal';
import { AlbumPage } from './AlbumPage';
interface FlipbookViewerProps {
    pages: Page[];
    album?: Album;
    onClose: () => void;
}

export function FlipbookViewer({ pages, album, onClose }: FlipbookViewerProps) {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [exportDpi, setExportDpi] = useState<300 | 450 | 600>(300);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [zoom, setZoom] = useState(1);
    const [selectedVideo, setSelectedVideo] = useState<{ url: string, rotation?: number } | null>(null);
    const [isTheaterMode, setIsTheaterMode] = useState(false);
    const [flippingTime, setFlippingTime] = useState(1000);
    const [showPageNumbers] = useState(true);
    const [showShadows] = useState(true);
    const [_layouts, _setLayouts] = useState<Record<string, any>>({});
    const [magnifierLevel, setMagnifierLevel] = useState(0);
    const [mousePos, setMousePos] = useState<{ x: number, y: number } | null>(null);

    const processedPages = useMemo(() => {
        if (!pages) return [];
        const newPages = pages.map(p => ({
            ...p,
            assets: p.assets ? [...p.assets] : [],
            textLayers: p.textLayers ? [...p.textLayers] : [],
            layoutConfig: p.layoutConfig ? [...p.layoutConfig] : [],
        }));

        for (let i = 1; i < newPages.length - 1; i += 2) {
            const leftPage = newPages[i];
            const rightPage = newPages[i + 1];
            if (!rightPage) break;

            const isSpread = leftPage.isSpreadLayout;

            // ═══════════════════════════════════════════════════════════════════
            // COORDINATE SYSTEMS:
            //
            // 1. layoutConfig boxes & textLayers (isInSlot=true in editor):
            //    Stored in 0-50% "half-spread" coordinates.
            //    Need *2 to convert to 0-100% single-page space.
            //
            // 2. Freeform assets (isInSlot=false in editor):
            //    Stored in 0-100% single-page coordinates.
            //    NO scaling needed. But cross-page spillover is needed
            //    when an asset is dragged past the page boundary.
            // ═══════════════════════════════════════════════════════════════════

            // ── STEP 1: BACKGROUND BLEEDING ───────────────────────────────────
            if (isSpread && leftPage.backgroundImage && !rightPage.backgroundImage) {
                rightPage.backgroundImage = leftPage.backgroundImage;
                rightPage.backgroundColor = leftPage.backgroundColor;
                rightPage.backgroundOpacity = leftPage.backgroundOpacity;
                rightPage.backgroundScale = leftPage.backgroundScale || 'cover';
            }

            // ── STEP 2: LAYOUT CONFIG — scale (*2) and split (spread only) ────
            if (isSpread) {
                const leftBoxes: any[] = [];
                const rightBoxes: any[] = [];
                const leftSlotMap = new Map<number, number>();
                const rightSlotMap = new Map<number, number>();

                (leftPage.layoutConfig || []).forEach((box: any, originalIdx: number) => {
                    if (!box) return;
                    const scaledLeft  = (box.left ?? box.x ?? 0) * 2;
                    const scaledWidth = (box.width ?? 100) * 2;

                    if (scaledLeft < 100) {
                        leftBoxes.push({
                            ...box,
                            left: scaledLeft,
                            top: box.top ?? box.y ?? 0,
                            width: scaledWidth,
                            _originalIdx: originalIdx,
                            _scaledLeft: scaledLeft,
                            _scaledWidth: scaledWidth,
                        });
                        leftSlotMap.set(originalIdx, leftBoxes.length - 1);
                    }

                    if (scaledLeft + scaledWidth > 100) {
                        rightBoxes.push({
                            ...box,
                            id: `spill-${box.id || originalIdx}`,
                            left: scaledLeft - 100,
                            top: box.top ?? box.y ?? 0,
                            width: scaledWidth,
                            _originalIdx: originalIdx,
                        });
                        rightSlotMap.set(originalIdx, rightBoxes.length - 1);
                    }
                });

                leftPage.layoutConfig = leftBoxes;
                rightPage.layoutConfig = [...(rightPage.layoutConfig || []), ...rightBoxes];

                // Route slotted assets to the correct page
                const leftSlotAssets: any[] = [];
                const rightSlotAssets: any[] = [];
                (leftPage.assets || []).forEach((asset: any) => {
                    if (asset.slotId !== undefined && asset.slotId !== null) {
                        if (leftSlotMap.has(asset.slotId)) {
                            leftSlotAssets.push({ ...asset, slotId: leftSlotMap.get(asset.slotId) });
                        }
                        if (rightSlotMap.has(asset.slotId)) {
                            rightSlotAssets.push({ ...asset, id: `spill-${asset.id}`, slotId: rightSlotMap.get(asset.slotId) });
                        }
                    }
                });
                // Keep only freeform assets on each page, add routed slot assets
                const leftFreeform = (leftPage.assets || []).filter((a: any) => a.slotId === undefined || a.slotId === null);
                leftPage.assets = [...leftFreeform, ...leftSlotAssets];
                rightPage.assets = [...(rightPage.assets || []), ...rightSlotAssets];
            }

            // ── STEP 3: FREEFORM ASSETS — cross-page spillover (both modes) ──
            {
                const leftSpill: any[] = [];
                const rightSpill: any[] = [];

                // Left-page freeform assets that overflow right
                (leftPage.assets || []).forEach((asset: any) => {
                    if (asset.slotId !== undefined && asset.slotId !== null) return;
                    const ax = asset.x ?? 0;
                    const aw = asset.width ?? 100;
                    if (ax + aw > 100) {
                        rightSpill.push({
                            ...asset,
                            id: `spill-${asset.id}`,
                            x: ax - 100,
                            width: aw
                        });
                    }
                });

                // Right-page freeform assets that overflow left
                (rightPage.assets || []).forEach((asset: any) => {
                    if (asset.slotId !== undefined && asset.slotId !== null) return;
                    const ax = asset.x ?? 0;
                    const aw = asset.width ?? 100;
                    if (ax < 0) {
                        leftSpill.push({
                            ...asset,
                            id: `spill-left-${asset.id}`,
                            x: ax + 100,
                            width: aw
                        });
                    }
                });

                if (leftSpill.length > 0) leftPage.assets = [...(leftPage.assets || []), ...leftSpill];
                if (rightSpill.length > 0) rightPage.assets = [...(rightPage.assets || []), ...rightSpill];
            }

            // ── STEP 4: TEXT LAYERS — scale (*2) and split ─────────────────────
            {
                const leftText:  any[] = [];
                const rightText: any[] = [];

                // Left-page text layers: scale *2 (half-spread → page coords) and split
                (leftPage.textLayers || []).forEach((layer: any) => {
                    const scaledLeft  = (layer.left ?? layer.x ?? 0) * 2;
                    const scaledWidth = (layer.width ?? 0) * 2;

                    if (scaledLeft < 100) {
                        leftText.push({
                            ...layer,
                            left: scaledLeft,
                            width: scaledWidth
                        });
                    }
                    if (scaledLeft + scaledWidth > 100) {
                        rightText.push({
                            ...layer,
                            id: `spill-${layer.id}`,
                            left: scaledLeft - 100,
                            width: scaledWidth
                        });
                    }
                });

                // Right-page text layers: scale *2 and split
                (rightPage.textLayers || []).forEach((layer: any) => {
                    const scaledLeft  = (layer.left ?? layer.x ?? 0) * 2;
                    const scaledWidth = (layer.width ?? 0) * 2;

                    if (scaledLeft < 100) {
                        rightText.push({
                            ...layer,
                            left: scaledLeft,
                            width: scaledWidth
                        });
                    }
                    if (scaledLeft + scaledWidth > 100) {
                        // Spills further right — no more pages, just include on right
                        rightText.push({
                            ...layer,
                            left: scaledLeft,
                            width: scaledWidth
                        });
                    }
                });

                leftPage.textLayers = leftText;
                rightPage.textLayers = rightText;
            }
        }
        return newPages;
    }, [pages]);

    const bookRef = useRef<any>(null);
    const pageRefs = useRef<(HTMLElement | null)[]>([]);

    const title = album?.title || 'Untitled Album';
    const dimensions = album?.config?.dimensions || { width: 1000, height: 700 };

    useEffect(() => {
        const calculateFitZoom = () => {
            const container = document.getElementById('flipbook-container');
            if (!container) return;

            const { width: containerW, height: containerH } = container.getBoundingClientRect();

            const bookW = dimensions.width * 2;
            const bookH = dimensions.height;

            const zoomW = (containerW - 80) / bookW;
            const zoomH = (containerH - 80) / bookH;

            const initialZoom = Math.max(0.2, Math.min(zoomW, zoomH, 1.2));
            setZoom(initialZoom);
        };

        const timer = setTimeout(calculateFitZoom, 300);
        window.addEventListener('resize', calculateFitZoom);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculateFitZoom);
        };
    }, [dimensions.width, dimensions.height, isFullscreen]);

    const FLIP_SOUND_ID = 'flip-sound-element';
    const FLIP_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3';

    useEffect(() => {
        const flipSound = document.getElementById(FLIP_SOUND_ID) as HTMLAudioElement;
        if (!flipSound) return;

        const unlockAudio = () => {
            flipSound.play().catch(() => { });
            flipSound.pause();
            flipSound.currentTime = 0;
            document.removeEventListener('click', unlockAudio);
        };

        document.addEventListener('click', unlockAudio);
        return () => document.removeEventListener('click', unlockAudio);
    }, []);

    const playFlipSound = useCallback(() => {
        try {
            const flipSound = document.getElementById(FLIP_SOUND_ID) as HTMLAudioElement;
            if (flipSound && flipSound.readyState >= 2) {
                flipSound.currentTime = 0;
                flipSound.play().catch(e => console.warn("Flip sound playback failed:", e));
            } else {
                const audio = new Audio('/sounds/flip.mp3');
                audio.volume = 1.0;
                audio.play().catch(e => console.warn("Flip sound playback failed:", e));
            }
        } catch (e) {
            console.warn("Flip sound initialization failed:", e);
        }
    }, []);

    const onFlip = useCallback((e: any) => {
        const nextIndex = e.data;
        setCurrentPageIndex(nextIndex);
        if (nextIndex === 0 || nextIndex >= pages.length - 2) {
            setFlippingTime(1500);
        } else {
            setFlippingTime(800);
        }
    }, [pages.length]);

    const onChangeState = useCallback((e: any) => {
        if (e.data === 'flipping' || e.data === 'user_fold') {
            const isCover = currentPageIndex === 0 || currentPageIndex >= pages.length - 1;
            if (isCover) {
                setTimeout(() => playFlipSound(), 100);
            } else {
                playFlipSound();
            }

            const audioElements = document.querySelectorAll('audio, video');
            audioElements.forEach(el => {
                if (el.id !== FLIP_SOUND_ID) (el as HTMLMediaElement).pause();
            });
        }
    }, [playFlipSound, currentPageIndex, pages.length]);

    const goToNext = () => bookRef.current?.pageFlip()?.flipNext();
    const goToPrev = () => bookRef.current?.pageFlip()?.flipPrev();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') goToNext();
            if (e.key === 'ArrowLeft') goToPrev();
            if (e.key === 'Escape') {
                if (magnifierLevel > 0) {
                    setMagnifierLevel(0);
                    return;
                }
                // 2. Fix Fullscreen Escape: If video is playing, ONLY close video.
                // If not, close the whole viewer.
                if (selectedVideo) {
                    setSelectedVideo(null);
                    setIsTheaterMode(false);
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, selectedVideo, magnifierLevel]);

    const handleSetSelectedVideo = useCallback((url: string, rotation?: number) => {
        setSelectedVideo({ url, rotation });
    }, []);

    const renderMagnifierPages = () => {
        if (!processedPages.length) return null;
        
        if (currentPageIndex === 0) {
            return (
                <>
                    <div style={{ width: dimensions.width, height: dimensions.height }} />
                    <div style={{ width: dimensions.width, height: dimensions.height, position: 'relative' }}>
                        <AlbumPage page={processedPages[0]} dimensions={dimensions} side="right" density="hard" isCover={true} onVideoClick={() => {}} showPageNumber={showPageNumbers} />
                    </div>
                </>
            );
        }

        const isBackCover = currentPageIndex >= processedPages.length - 1;
        if (isBackCover) {
            return (
                <>
                    <div style={{ width: dimensions.width, height: dimensions.height, position: 'relative' }}>
                        <AlbumPage page={processedPages[processedPages.length - 1]} dimensions={dimensions} side="left" density="hard" isCover={true} onVideoClick={() => {}} showPageNumber={showPageNumbers} />
                    </div>
                    <div style={{ width: dimensions.width, height: dimensions.height }} />
                </>
            );
        }

        const leftPage = processedPages[currentPageIndex];
        const rightPage = processedPages[currentPageIndex + 1];

        return (
            <>
                <div style={{ width: dimensions.width, height: dimensions.height, position: 'relative' }}>
                    {leftPage && <AlbumPage page={leftPage} dimensions={dimensions} side="left" density="soft" isCover={false} onVideoClick={() => {}} showPageNumber={showPageNumbers} />}
                </div>
                <div style={{ width: dimensions.width, height: dimensions.height, position: 'relative' }}>
                    {rightPage && <AlbumPage page={rightPage} dimensions={dimensions} side="right" density="soft" isCover={false} onVideoClick={() => {}} showPageNumber={showPageNumbers} />}
                </div>
            </>
        );
    };

    return (
        <div className={cn(
            "fixed inset-0 z-[100] transition-all duration-500 overflow-hidden flex items-center justify-center",
            "bg-[#000000]",
            isFullscreen ? "p-0" : "p-0 md:p-0",
            "flipbook-viewer",
            isTheaterMode && "theater-active"
        )}>
            <audio id={FLIP_SOUND_ID} preload="auto" style={{ display: 'none' }}>
                <source src="/sounds/flip.mp3" type="audio/mpeg" />
                <source src={FLIP_SOUND_URL} type="audio/mpeg" />
            </audio>

            <header className="absolute top-4 left-4 flex items-center gap-2 py-1.5 px-2 text-white z-[110] bg-black/60 backdrop-blur-md rounded-lg border border-white/10 shadow-lg">
                <div className="flex items-center gap-2 border-r border-white/10 pr-2">
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors" title="Close Viewer">
                        <X className="w-4 h-4" />
                    </button>
                    <div>
                        <h2 className="font-serif text-xs tracking-tight leading-none mb-0.5 text-gray-100 truncate max-w-[120px]">{title}</h2>
                        <p className="text-[8px] uppercase tracking-[0.1em] text-white/40 font-sans">
                            {currentPageIndex + 1} / {pages.length}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <div className="relative">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="bg-catalog-accent hover:bg-catalog-accent/90 gap-1 shadow-md h-6 px-2 text-[9px] rounded uppercase tracking-wider"
                        >
                            <Download className="w-3 h-3" />
                            {isExporting ? '...' : 'Export'}
                        </Button>

                        <AnimatePresence>
                            {showExportMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute left-0 mt-2 w-48 bg-zinc-900 rounded-xl shadow-2xl border border-white/10 py-2 overflow-hidden z-[120]"
                                >
                                    <div className="px-3 py-1.5 border-b border-white/5 mb-1">
                                        <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Select Quality</p>
                                    </div>
                                    <div className="flex px-2 gap-1 mb-1">
                                        {[300, 450, 600].map((dpi) => (
                                            <button
                                                key={dpi}
                                                onClick={() => setExportDpi(dpi as any)}
                                                className={cn(
                                                    "flex-1 py-1 text-[9px] font-bold rounded transition-all",
                                                    exportDpi === dpi ? "bg-catalog-accent text-white" : "hover:bg-white/10 text-white/60"
                                                )}
                                            >
                                                {dpi}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        disabled={isExporting}
                                        onClick={async () => {
                                            setShowExportMenu(false);
                                            setIsExporting(true);
                                            const validRefs = pageRefs.current.filter(Boolean) as HTMLElement[];
                                            const scaleFactor = exportDpi === 300 ? 4 : exportDpi === 450 ? 6 : 8;
                                            await printService.exportToPDF(validRefs, title || 'Family_Album', scaleFactor);
                                            setIsExporting(false);
                                        }}
                                        className="w-full px-3 py-1.5 hover:bg-white/5 flex items-center gap-2 text-white text-left transition-colors"
                                    >
                                        <FileText className="w-3 h-3 text-red-400" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium">Interactive PDF</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowExportMenu(false);
                                            await printService.exportToHTML5({ title, pages });
                                        }}
                                        className="w-full px-3 py-1.5 hover:bg-white/5 flex items-center gap-2 text-white text-left transition-colors"
                                    >
                                        <Globe className="w-3 h-3 text-blue-400" />
                                        <div className="flex flex-col">
                                            <span className="text-xs font-medium">HTML5 Bundle</span>
                                        </div>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors text-white"
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                    >
                        {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                    </button>
                </div>
            </header>

            <div id="flipbook-container" className={cn(
                "absolute inset-0 overflow-visible",
                isTheaterMode && "album-canvas pointer-events-none opacity-50",
                magnifierLevel > 0 && "cursor-crosshair"
            )}
            onMouseMove={(e) => {
                if (magnifierLevel === 0) return;
                const rect = e.currentTarget.getBoundingClientRect();
                setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => setMousePos(null)}
            >
                {/* Mobile/Tablet Touch Zones */}
                {!isTheaterMode && (
                    <>
                        <div className="absolute left-0 top-16 bottom-16 w-[15%] z-50 cursor-pointer lg:hidden" onClick={goToPrev} />
                        <div className="absolute right-0 top-16 bottom-16 w-[15%] z-50 cursor-pointer lg:hidden" onClick={goToNext} />
                    </>
                )}
                {magnifierLevel > 0 && mousePos && (
                    <div
                        style={{
                            position: 'absolute',
                            left: mousePos.x,
                            top: mousePos.y,
                            width: 500,
                            height: 500,
                            transform: 'translate(-50%, -50%)',
                            borderRadius: '12px',
                            border: '2px solid rgba(255,255,255,0.8)',
                            boxShadow: '0 15px 35px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.2) inset',
                            overflow: 'hidden',
                            pointerEvents: 'none',
                            zIndex: 200,
                            backgroundColor: '#fff',
                        }}
                    >
                        <div
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: 0,
                                width: '100vw',
                                height: '100vh',
                                transformOrigin: '0 0',
                                transform: `translate(${250 - magnifierLevel * mousePos.x}px, ${250 - magnifierLevel * mousePos.y}px) scale(${magnifierLevel})`
                            }}
                        >
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    top: '50%',
                                    transform: `translate(-50%, -50%) scale(${zoom})`,
                                    transformOrigin: 'center center',
                                }}
                            >
                                <div style={{ display: 'flex', width: dimensions.width * 2, height: dimensions.height, backgroundColor: '#fdfdfd', boxShadow: '0 0 20px rgba(0,0,0,0.1)' }}>
                                    {renderMagnifierPages()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <div
                    style={{
                        position: 'absolute',
                        left: '50%',
                        top: '50%',
                        transform: `translate(-50%, -50%) scale(${zoom})`,
                        transformOrigin: 'center center',
                        pointerEvents: isTheaterMode ? 'none' : 'auto',
                    }}
                >
                    <HTMLFlipBook
                        width={dimensions.width}
                        height={dimensions.height}
                        size="fixed"
                        minWidth={dimensions.width}
                        maxWidth={dimensions.width}
                        minHeight={dimensions.height}
                        maxHeight={dimensions.height}
                        showCover={true}
                        usePortrait={false}
                        mobileScrollSupport={false}
                        onFlip={onFlip}
                        onChangeState={onChangeState}
                        className="shadow-2xl"
                        style={{ margin: '0 auto' }}
                        ref={bookRef}
                        flippingTime={flippingTime}
                        useMouseEvents={!isTheaterMode}
                        swipeDistance={30}
                        showPageCorners={false}
                        disableFlipByClick={isTheaterMode}
                        drawShadow={showShadows}
                        maxShadowOpacity={0.6}
                        autoSize={false}
                        clickEventForward={!selectedVideo && !isTheaterMode}
                    >
                        {processedPages.map((page, index) => {
                            const isFrontCover = index === 0;
                            const isBackCover = index === processedPages.length - 1;
                            const isCover = isFrontCover || isBackCover;
                            const density = isCover ? 'hard' : 'soft';
                            const side = isFrontCover ? 'right' : (index % 2 !== 0 ? 'left' : 'right');

                            return (
                                <div
                                    key={page.id}
                                    ref={(el) => { pageRefs.current[index] = el; }}
                                    className="page-wrapper"
                                    data-density={density}
                                >
                                    <AlbumPage
                                        page={page}
                                        dimensions={dimensions}
                                        side={side}
                                        density={density}
                                        isCover={isCover}
                                        onVideoClick={handleSetSelectedVideo}
                                        showPageNumber={showPageNumbers}
                                    />
                                </div>
                            );
                        })}
                    </HTMLFlipBook>
                </div>
            </div>

            {/* Left Sidebar */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4 py-4 px-2 text-white/60 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-2xl z-[110]">
                <div className="flex flex-col gap-2">
                    {[2, 3, 5].map(level => (
                        <button
                            key={level}
                            onClick={() => setMagnifierLevel(prev => prev === level ? 0 : level)}
                            className={cn(
                                "flex flex-col items-center justify-center p-2 rounded-lg transition-all",
                                magnifierLevel === level ? "bg-catalog-accent text-white" : "hover:bg-white/10 text-white/60"
                            )}
                            title={`${level}x Magnifier`}
                        >
                            <Search className="w-4 h-4 mb-1" />
                            <span className="text-[10px] font-bold">{level}x</span>
                        </button>
                    ))}
                </div>

                <div className="w-full h-px bg-white/10" />

                <div className="flex flex-col items-center gap-2">
                    <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 font-bold text-lg text-white">+</button>
                    <span className="text-[10px] font-bold tracking-wider text-center text-white">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 font-bold text-lg text-white">-</button>
                </div>
            </div>

            {/* Bottom Navigation Arrows */}
            <div className="absolute bottom-6 left-6 z-[110]">
                <button onClick={goToPrev} className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-white shadow-xl">
                    <ChevronLeft className="w-6 h-6" />
                </button>
            </div>
            <div className="absolute bottom-6 right-6 z-[110]">
                <button onClick={goToNext} className="p-3 rounded-full bg-black/60 backdrop-blur-md border border-white/10 hover:bg-white/10 transition-all text-white shadow-xl">
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>

            <VideoPortal
                videoUrl={selectedVideo?.url || null}
                rotation={selectedVideo?.rotation}
                onClose={() => {
                    setSelectedVideo(null);
                    setIsTheaterMode(false);
                }}
                onPlay={() => setIsTheaterMode(true)}
            />
        </div>
    );
}

const Button = ({ variant, size, onClick, className, children, ...props }: any) => (
    <button
        onClick={onClick}
        className={cn(
            "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
            variant === 'primary' ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-accent hover:text-accent-foreground",
            size === 'sm' ? "h-9 px-3 rounded-md" : "h-11 px-8 rounded-md",
            className
        )}
        {...props}
    >
        {children}
    </button>
);
