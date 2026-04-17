import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { useGlobalLightbox } from '../ui/GlobalLightbox';
import { Maximize2, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

export type GalleryMode = 'cards' | 'carousel' | 'clickable' | 'masonry' | 'grid' | 'polaroid';

interface EventMediaGalleryProps {
    assets: Array<{ url: string; type: 'image' | 'video'; caption?: string }>;
    mode: GalleryMode;
}

function GalleryItem({ asset, index, openLightbox, lightboxImages, currentMode }: any) {
    const displayUrl = asset.url;
    const isVideo = asset.type === 'video';

    const renderMedia = () => {
        if (isVideo) {
            return (
                <div className="w-full h-full relative">
                    <video
                        src={displayUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                        autoPlay
                        loop
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                        <Play className="w-8 h-8 text-white/70 fill-white/20" />
                    </div>
                </div>
            );
        }
        return (
            <motion.img
                src={displayUrl}
                alt={asset.caption || `Gallery image ${index + 1}`}
                className="w-full h-full object-cover"
                whileHover={{ scale: 1.1 }}
                transition={{ duration: 0.6 }}
                referrerPolicy="no-referrer"
            />
        );
    };

    if (currentMode === 'cards') {
        const rotation = (index % 3 === 0) ? -2 : (index % 3 === 1) ? 2 : 1;
        return (
            <motion.div
                initial={{ opacity: 0, y: 50, rotate: rotation * 2 }}
                whileInView={{ opacity: 1, y: 0, rotate: rotation }}
                viewport={{ once: true, margin: "-50px" }}
                whileHover={{ y: -10, rotate: 0, scale: 1.02 }}
                className="group relative cursor-pointer"
                onClick={() => openLightbox(index, lightboxImages)}
            >
                <div className="bg-white p-4 pb-12 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-catalog-accent/5 rounded-sm relative z-10 transition-shadow group-hover:shadow-[0_40px_80px_rgba(0,0,0,0.15)]">
                    <div className="aspect-[4/5] overflow-hidden bg-catalog-stone/5 relative">
                        {renderMedia()}
                    </div>
                    <div className="absolute bottom-4 left-0 right-0 px-6">
                        <p className="font-serif italic text-catalog-text/60 text-center text-sm truncate">
                            {asset.caption || `Moment #${index + 1}`}
                        </p>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (currentMode === 'grid') {
        return (
            <div
                className="aspect-square overflow-hidden cursor-pointer relative group"
                onClick={() => openLightbox(index, lightboxImages)}
            >
                {isVideo ? (
                    <video src={displayUrl} className="w-full h-full object-cover" muted playsInline />
                ) : (
                    <img src={displayUrl} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" referrerPolicy="no-referrer" />
                )}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity transform scale-50 group-hover:scale-100" />
                </div>
            </div>
        );
    }

    if (currentMode === 'masonry') {
        return (
            <div
                className="break-inside-avoid relative group cursor-pointer rounded-lg overflow-hidden shadow-md"
                onClick={() => openLightbox(index, lightboxImages)}
            >
                {isVideo ? (
                    <video src={displayUrl} className="w-full h-auto object-cover" muted playsInline />
                ) : (
                    <img src={displayUrl} className="w-full h-auto object-cover" alt="" referrerPolicy="no-referrer" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <p className="text-white text-xs font-medium truncate w-full">{asset.caption || 'View Media'}</p>
                </div>
            </div>
        );
    }

    if (currentMode === 'polaroid') {
        const rotation = (Math.random() - 0.5) * 12;
        return (
            <motion.div
                initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, rotate: rotation, scale: 1 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.1, rotate: 0, zIndex: 10 }}
                className="bg-white p-3 pt-3 pb-8 shadow-xl w-64 flex-none transform transition-all duration-300 cursor-pointer"
                style={{ transform: `rotate(${rotation}deg)` }}
                onClick={() => openLightbox(index, lightboxImages)}
            >
                <div className="aspect-square bg-gray-100 overflow-hidden mb-3 relative">
                    {isVideo ? (
                        <video src={displayUrl} className="w-full h-full object-cover" muted playsInline />
                    ) : (
                        <img src={displayUrl} className="w-full h-full object-cover filter sepia-[.2] contrast-[1.1]" alt="" referrerPolicy="no-referrer" />
                    )}
                </div>
                <p className="font-handwriting text-catalog-text/80 text-center text-lg leading-none transform -rotate-1">
                    {asset.caption || 'Memories'}
                </p>
            </motion.div>
        );
    }

    return (
        <motion.div
            whileHover={{ scale: 1.05 }}
            className="aspect-square relative cursor-pointer group rounded-xl overflow-hidden shadow-lg"
            onClick={() => openLightbox(index, lightboxImages)}
        >
            {isVideo ? (
                <video src={displayUrl} className="w-full h-full object-cover" muted playsInline />
            ) : (
                <img src={displayUrl} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                <Maximize2 className="w-6 h-6 text-white" />
            </div>
        </motion.div>
    );
}

export function EventMediaGallery({ assets, mode }: EventMediaGalleryProps) {
    const { openLightbox } = useGlobalLightbox();
    const [currentMode, setCurrentMode] = useState<GalleryMode>(mode);
    const [[page, direction], setPage] = useState([0, 0]);
    const [isPlaying, setIsPlaying] = useState(mode === 'carousel');

    useEffect(() => {
        setCurrentMode(mode);
    }, [mode]);

    if (!assets || assets.length === 0) return null;

    const lightboxImages = assets.map(a => ({ src: a.url, alt: a.caption, type: a.type }));

    const paginate = (newDirection: number) => {
        setPage([page + newDirection, newDirection]);
    };

    useEffect(() => {
        if (!isPlaying || currentMode !== 'carousel') return;
        const timer = setInterval(() => paginate(1), 5000);
        return () => clearInterval(timer);
    }, [isPlaying, page, currentMode]);

    useEffect(() => {
        if (currentMode !== 'carousel') return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') paginate(1);
            if (e.key === 'ArrowLeft') paginate(-1);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentMode, page]);

    const variants = {
        enter: (direction: number) => ({
            x: direction > 0 ? '100%' : '-100%',
            opacity: 0,
            scale: 0.8
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1,
            scale: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? '100%' : '-100%',
            opacity: 0,
            scale: 0.8
        })
    };

    const renderCarousel = () => {
        const activeIndex = ((page % assets.length) + assets.length) % assets.length;
        const activeAsset = assets[activeIndex];
        const isVideo = activeAsset.type === 'video';

        return (
            <div className="relative mt-16 w-full max-w-5xl mx-auto aspect-[16/9] bg-black rounded-xl overflow-hidden shadow-2xl group">
                <AnimatePresence initial={false} custom={direction}>
                    <motion.div
                        key={page}
                        custom={direction}
                        variants={variants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{
                            x: { type: "spring", stiffness: 300, damping: 30 },
                            opacity: { duration: 0.2 }
                        }}
                        className="absolute inset-0 w-full h-full flex items-center justify-center cursor-zoom-in"
                        onClick={() => openLightbox(activeIndex, lightboxImages)}
                    >
                        {isVideo ? (
                            <video
                                src={activeAsset.url}
                                className="w-full h-full object-contain"
                                autoPlay
                                muted
                                loop
                                playsInline
                            />
                        ) : (
                            <img
                                src={activeAsset.url}
                                className="w-full h-full object-contain"
                                alt={activeAsset.caption || ""}
                                referrerPolicy="no-referrer"
                            />
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-4">
                    <button
                        onClick={(e) => { e.stopPropagation(); paginate(-1); }}
                        className="pointer-events-auto p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-sm transform hover:scale-110 active:scale-95"
                    >
                        <ChevronLeft className="w-8 h-8" />
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); paginate(1); }}
                        className="pointer-events-auto p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition-colors backdrop-blur-sm transform hover:scale-110 active:scale-95"
                    >
                        <ChevronRight className="w-8 h-8" />
                    </button>
                </div>

                <button
                    onClick={(e) => { e.stopPropagation(); setIsPlaying(!isPlaying); }}
                    className="absolute top-4 right-4 z-20 p-2 text-white/50 hover:text-white bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-sm transition-all"
                >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
            </div>
        );
    };
    return (
        <section className="mt-24 pt-24 border-t border-catalog-accent/5 relative">
            <div className="flex flex-col items-center mb-12">
                <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-catalog-text/40 mb-4">
                    Gallery
                </h3>
                <div className="flex gap-2 p-1 bg-catalog-stone/10 rounded-lg">
                    {(['cards', 'carousel', 'grid', 'masonry', 'polaroid'] as const).map((m) => (
                        <button
                            key={m}
                            onClick={() => setCurrentMode(m)}
                            className={cn(
                                "px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all",
                                currentMode === m
                                    ? "bg-white text-catalog-accent shadow-sm"
                                    : "text-catalog-text/50 hover:text-catalog-text hover:bg-white/50"
                            )}
                        >
                            {m}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto">
                {currentMode === 'cards' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mt-16 px-4">
                        {assets.map((asset, index) => (
                            <GalleryItem key={index} asset={asset} index={index} openLightbox={openLightbox} lightboxImages={lightboxImages} currentMode="cards" />
                        ))}
                    </div>
                )}
                {currentMode === 'carousel' && renderCarousel()}
                {currentMode === 'grid' && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1 mt-12 bg-white p-1 shadow-sm border border-catalog-stone/10">
                        {assets.map((asset, index) => (
                            <GalleryItem key={index} asset={asset} index={index} openLightbox={openLightbox} lightboxImages={lightboxImages} currentMode="grid" />
                        ))}
                    </div>
                )}
                {currentMode === 'masonry' && (
                    <div className="columns-1 md:columns-2 lg:columns-3 gap-4 mt-12 space-y-4 px-4">
                        {assets.map((asset, index) => (
                            <GalleryItem key={index} asset={asset} index={index} openLightbox={openLightbox} lightboxImages={lightboxImages} currentMode="masonry" />
                        ))}
                    </div>
                )}
                {currentMode === 'polaroid' && (
                    <div className="flex flex-wrap justify-center gap-8 mt-16 px-8 overflow-hidden py-12">
                        {assets.map((asset, index) => (
                            <GalleryItem key={index} asset={asset} index={index} openLightbox={openLightbox} lightboxImages={lightboxImages} currentMode="polaroid" />
                        ))}
                    </div>
                )}
                {(!['cards', 'carousel', 'grid', 'masonry', 'polaroid'].includes(currentMode)) && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mt-16 px-4">
                        {assets.map((asset, index) => (
                            <GalleryItem key={index} asset={asset} index={index} openLightbox={openLightbox} lightboxImages={lightboxImages} currentMode="clickable" />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
