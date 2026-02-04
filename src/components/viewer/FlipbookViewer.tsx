import { useState, useEffect, useRef, useCallback } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2, Download, FileText, Globe, BookOpen, Moon } from 'lucide-react';
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
    const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
    const [zoom, setZoom] = useState(1);
    const [selectedVideo, setSelectedVideo] = useState<{ url: string, rotation?: number } | null>(null);
    const [isTheaterMode, setIsTheaterMode] = useState(false);
    const [flippingTime, setFlippingTime] = useState(1000);
    const [showPageNumbers, setShowPageNumbers] = useState(true);
    const [showShadows, setShowShadows] = useState(true);
    const [_layouts, _setLayouts] = useState<Record<string, any>>({});

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const bookRef = useRef<any>(null);
    const pageRefs = useRef<(HTMLElement | null)[]>([]);

    const title = album?.title || 'Untitled Album';
    const dimensions = album?.config?.dimensions || { width: 1000, height: 700 };

    useEffect(() => {
        const calculateFitZoom = () => {
            const container = document.getElementById('flipbook-container');
            if (!container) return;

            const { width: containerW, height: containerH } = container.getBoundingClientRect();

            const bookW = isMobile ? dimensions.width : dimensions.width * 2;
            const bookH = dimensions.height;

            const zoomW = (containerW - 80) / bookW;
            const zoomH = (containerH - 120) / bookH;

            const initialZoom = Math.max(0.2, Math.min(zoomW, zoomH, 1.2));
            setZoom(initialZoom);
        };

        const timer = setTimeout(calculateFitZoom, 300);
        window.addEventListener('resize', calculateFitZoom);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', calculateFitZoom);
        };
    }, [isMobile, dimensions.width, dimensions.height, isFullscreen]);

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
    }, [onClose, selectedVideo]);

    const handleSetSelectedVideo = useCallback((url: string, rotation?: number) => {
        setSelectedVideo({ url, rotation });
    }, []);

    return (
        <div className={cn(
            "fixed inset-0 z-[100] flex flex-col transition-all duration-500",
            "bg-[#000000]",
            isFullscreen ? "p-0" : "p-4 md:p-8",
            "flipbook-viewer",
            isTheaterMode && "theater-active"
        )}>
            <audio id={FLIP_SOUND_ID} preload="auto" style={{ display: 'none' }}>
                <source src="/sounds/flip.mp3" type="audio/mpeg" />
                <source src={FLIP_SOUND_URL} type="audio/mpeg" />
            </audio>

            <header className="flex items-center justify-between h-16 px-6 text-white z-[110] bg-black/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="font-serif text-xl tracking-tight leading-none mb-1 text-gray-100">{title}</h2>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-sans">
                            Page {currentPageIndex + 1} of {pages.length}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setShowExportMenu(!showExportMenu)}
                            className="bg-catalog-accent hover:bg-catalog-accent/90 gap-2 shadow-lg shadow-catalog-accent/20 border border-white/10"
                        >
                            <Download className="w-4 h-4" />
                            {isExporting ? 'Exporting...' : 'Export'}
                        </Button>

                        <AnimatePresence>
                            {showExportMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-2 w-56 bg-zinc-900 rounded-xl shadow-2xl border border-white/10 py-2 overflow-hidden z-[120]"
                                >
                                    <div className="px-4 py-2 border-b border-white/5 mb-2">
                                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Select Quality</p>
                                    </div>
                                    <div className="flex px-2 gap-1 mb-2">
                                        {[300, 450, 600].map((dpi) => (
                                            <button
                                                key={dpi}
                                                onClick={() => setExportDpi(dpi as any)}
                                                className={cn(
                                                    "flex-1 py-1 text-[10px] font-bold rounded-md transition-all",
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
                                        className="w-full px-4 py-2 hover:bg-white/5 flex items-center gap-3 text-white text-left transition-colors"
                                    >
                                        <FileText className="w-4 h-4 text-red-400" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">Interactive PDF</span>
                                            <span className="text-[10px] text-white/40">Visual fidelity</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={async () => {
                                            setShowExportMenu(false);
                                            await printService.exportToHTML5({ title, pages });
                                        }}
                                        className="w-full px-4 py-2 hover:bg-white/5 flex items-center gap-3 text-white text-left transition-colors"
                                    >
                                        <Globe className="w-4 h-4 text-blue-400" />
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium">HTML5 Bundle</span>
                                            <span className="text-[10px] text-white/40">Offline interactive</span>
                                        </div>
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
                    >
                        {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                    </button>
                </div>
            </header>

            <div id="flipbook-container" className={cn(
                "flex-1 flex items-center justify-center p-4 overflow-visible relative min-h-0",
                isTheaterMode && "album-canvas pointer-events-none opacity-50"
            )}>
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
                        usePortrait={isMobile}
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
                        {pages.map((page, index) => {
                            const isFrontCover = index === 0;
                            const isBackCover = index === pages.length - 1;
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

            <footer className="h-14 flex items-center justify-between px-6 text-white/60 bg-black/20 backdrop-blur-sm border-t border-white/5">
                <div className="flex items-center gap-4">
                    <button onClick={goToPrev} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all hover:scale-110 active:scale-95">
                        <ChevronLeft className="w-5 h-5 text-gray-200" />
                    </button>
                    <div className="flex items-center bg-white/5 rounded-full px-4 py-1.5 gap-3 border border-white/5">
                        <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="text-lg font-bold hover:text-white transition-colors w-6">-</button>
                        <span className="text-sm font-bold tracking-wider min-w-[50px] text-center text-white">{Math.round(zoom * 100)}%</span>
                        <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} className="text-lg font-bold hover:text-white transition-colors w-6">+</button>
                    </div>
                    <button onClick={goToNext} className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-all hover:scale-110 active:scale-95">
                        <ChevronRight className="w-5 h-5 text-gray-200" />
                    </button>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowPageNumbers(!showPageNumbers)}
                        className={cn(
                            "p-2 rounded-full transition-all flex items-center gap-2 px-3",
                            showPageNumbers ? "bg-catalog-accent text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                        )}
                        title="Toggle Page Numbers"
                    >
                        <BookOpen className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Numbers</span>
                    </button>

                    <button
                        onClick={() => setShowShadows(!showShadows)}
                        className={cn(
                            "p-2 rounded-full transition-all flex items-center gap-2 px-3",
                            showShadows ? "bg-catalog-accent text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"
                        )}
                        title="Toggle Shadows"
                    >
                        <Moon className="w-4 h-4" />
                        <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Shadows</span>
                    </button>

                    <button
                        onClick={() => {
                            const container = document.getElementById('flipbook-container');
                            if (!container) return;
                            const { width: containerW, height: containerH } = container.getBoundingClientRect();
                            const bookW = isMobile ? dimensions.width : dimensions.width * 2;
                            const bookH = dimensions.height;
                            const zoomW = (containerW - 100) / bookW;
                            const zoomH = (containerH - 100) / bookH;
                            setZoom(Math.max(0.2, Math.min(zoomW, zoomH, 1.5)));
                        }}
                        className="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest bg-white/5 hover:bg-white/10 rounded-full transition-colors text-gray-300"
                    >
                        Fit to Screen
                    </button>
                    <div className="hidden md:block text-[9px] font-medium tracking-[0.2em] uppercase opacity-40 text-gray-400">
                        Arrows to Flip • +/- to Zoom
                    </div>
                </div>
            </footer>

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
