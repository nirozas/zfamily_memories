import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Star, MoreVertical, Play, Pause, Share, Edit2, Trash,
    MapPin, Volume2, VolumeX, Maximize, Minimize, Download,
    MonitorPlay, Check, Settings2, ZoomIn, ZoomOut
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGooglePhotosUrl } from '../../hooks/useGooglePhotosUrl';
import { GooglePhotosService } from '../../services/googlePhotos';
import { useAuth } from '../../contexts/AuthContext';
import Hls from 'hls.js';

export interface MediaItem {
    id: string;
    url: string;
    type: 'image' | 'video';
    date: string | Date;
    isFavorite?: boolean;
    caption?: string;
    filename?: string;
    resolution?: string;
    sizeMegabytes?: number;
    storageStatus?: 'On device' | 'Backed up';
    location?: string;
    duration?: number;
    cropMode?: 'contain' | 'cover';
    captionRotation?: number;
    captionX?: number;
    captionY?: number;
    captionFontSize?: number;
    captionColor?: string;
    textLayers?: any[];
    stickerLayers?: any[];
    videoStartTime?: number;
    videoEndTime?: number;
    googlePhotoId?: string;
}

interface MediaStackViewerProps {
    items: MediaItem[];
    onClose: () => void;
    initialIndex?: number;
    backgroundMusicUrl?: string;
    backgroundMusicName?: string;
    readOnly?: boolean;
    shareToken?: string | null;
    onShare?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
}

export function MediaStackViewer({
    items,
    onClose,
    initialIndex = 0,
    backgroundMusicUrl,
    readOnly,
    shareToken,
    onShare,
    onEdit,
    onDelete,
}: MediaStackViewerProps) {
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Background music volume stuff
    const [isMuted, setIsMuted] = useState(false);
    const [bgmVolume, setBgmVolume] = useState(0.3);
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);
    const [videoTime, setVideoTime] = useState(0);
    const [videoDuration, setVideoDuration] = useState(0);
    const [videoVolume, setVideoVolume] = useState(1);
    const [viewerZoom, setViewerZoom] = useState(1);
    const [viewerPos, setViewerPos] = useState({ x: 0, y: 0 });
    const contentRef = useRef<HTMLDivElement>(null);

    const [showInfoDrawer, setShowInfoDrawer] = useState(false);
    const [captionText, setCaptionText] = useState('');
    const [isFavorite, setIsFavorite] = useState(false);
    
    // Video-specific controls
    const [isVideoMuted, setIsVideoMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [showVideoMenu, setShowVideoMenu] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pressTimeRef = useRef<number>(0);
    // Guard: prevent handleNext from firing more than once per slide
    const nextCalledRef = useRef(false);

    // Preloaded video elements (keyed by url)
    const preloadedVideos = useRef<Map<string, { video: HTMLVideoElement, hls?: Hls }>>(new Map());

    const { googleAccessToken } = useAuth();
    const activeItem = items[activeIndex];
    
    const isGoogleUrl = activeItem.url && (
        activeItem.url.includes('googleusercontent.com') ||
        activeItem.url.includes('photoslibrary.googleapis.com') ||
        activeItem.url.includes('drive.google.com') ||
        activeItem.url.includes('ggpht.com') ||
        activeItem.url.startsWith('google-photos://')
    );

    const rawDisplayUrl = useGooglePhotosUrl(activeItem.googlePhotoId, activeItem.url, shareToken).url;
    // CRITICAL: Strip #t=0.1 from Google URLs to prevent 403 Forbidden errors
    const displayUrl = (isGoogleUrl && rawDisplayUrl) ? rawDisplayUrl.replace('#t=0.1', '') : rawDisplayUrl;

    const nextItem = activeIndex < items.length - 1 ? items[activeIndex + 1] : null;
    const isNextGoogle = nextItem?.url && (nextItem.url.includes('googleusercontent.com') || nextItem.url.includes('photoslibrary.googleapis.com') || nextItem.url.includes('drive.google.com') || nextItem.url.startsWith('google-photos://'));
    const nextProxiedUrl = (nextItem && isNextGoogle)
        ? GooglePhotosService.getProxyUrl(nextItem.url, googleAccessToken, shareToken, nextItem.googlePhotoId)
        : nextItem?.url;

    // 1. Sliding Window Preload: Focus bandwidth on current and next 2 items
    useEffect(() => {
        const map = preloadedVideos.current;
        const windowSize = 3; // current + next 2
        const priorityIndices = Array.from({ length: windowSize }, (_, i) => activeIndex + i)
            .filter(i => i < items.length);

        // Cleanup: remove videos that are no longer in the sliding window to save memory/bandwidth
        map.forEach((entry, url) => {
            const isPriority = priorityIndices.some(idx => items[idx]?.url === url);
            if (!isPriority) {
                entry.video.pause();
                entry.video.src = '';
                entry.video.load();
                entry.hls?.destroy();
                map.delete(url);
            }
        });

        // Preload priority items
        priorityIndices.forEach((idx) => {
            const item = items[idx];
            if (item.type === 'video' && item.url && !map.has(item.url)) {
                const isGoogle = item.url.includes('googleusercontent.com') || 
                               item.url.includes('photoslibrary.googleapis.com') || 
                               item.url.includes('drive.google.com') ||
                               item.url.startsWith('google-photos://');
                const proxiedUrl = isGoogle ? 
                    GooglePhotosService.getProxyUrl(item.url, googleAccessToken, shareToken, item.googlePhotoId) : 
                    item.url;

                const vid = document.createElement('video');
                vid.src = proxiedUrl;
                vid.preload = 'auto';
                vid.muted = true;
                vid.playsInline = true;
                if (isGoogle) vid.crossOrigin = 'anonymous';

                let hls: Hls | undefined;
                if (proxiedUrl.includes('.m3u8')) {
                    if (Hls.isSupported()) {
                        hls = new Hls({ enableWorker: true });
                        hls.loadSource(proxiedUrl);
                        hls.attachMedia(vid);
                    } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                        vid.src = proxiedUrl;
                    }
                } else {
                    vid.load();
                }

                preloadedVideos.current.set(item.url, { video: vid, hls });
                console.log(`[Preload] Priming buffer for: ${item.filename || item.url.substring(0, 20)}`);
            }
        });

        return () => {
            // Optional: don't clear everything on every index change, 
            // the sliding window logic above handles partial cleanup.
        };
    }, [googleAccessToken, shareToken, items, activeIndex]);

    useEffect(() => {
        if (activeItem) {
            setCaptionText(activeItem.caption || '');
            setIsFavorite(activeItem.isFavorite || false);
            setProgress(0);
            setIsPaused(false);
            nextCalledRef.current = false; 
            
            // Reset zoom on item change
            setViewerZoom(1);
            setViewerPos({ x: 0, y: 0 });
            setVideoTime(0);
            setVideoDuration(0);

            if (audioRef.current && !isMuted) {
                audioRef.current.volume = bgmVolume;
            }
        }
    }, [activeIndex, activeItem, isMuted, bgmVolume]);

    // Handle Zoom and Pinch-to-zoom
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                setViewerZoom(prev => {
                    const delta = e.deltaY > 0 ? 0.9 : 1.1;
                    const next = prev * delta;
                    return Math.max(1, Math.min(5, next));
                });
            }
        };

        let initialDist = 0;
        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                initialDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && initialDist > 0) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const factor = dist / initialDist;
                setViewerZoom(prev => Math.max(1, Math.min(5, prev * factor)));
                initialDist = dist;
                if (e.cancelable) e.preventDefault();
            }
        };

        const handleTouchEnd = () => { initialDist = 0; };

        el.addEventListener('wheel', handleWheel, { passive: false });
        el.addEventListener('touchstart', handleTouchStart);
        el.addEventListener('touchmove', handleTouchMove, { passive: false });
        el.addEventListener('touchend', handleTouchEnd);

        return () => {
            el.removeEventListener('wheel', handleWheel);
            el.removeEventListener('touchstart', handleTouchStart);
            el.removeEventListener('touchmove', handleTouchMove);
            el.removeEventListener('touchend', handleTouchEnd);
        };
    }, [activeIndex]);

    // Preload next image in background to avoid console warnings and improve perceived speed
    useEffect(() => {
        if (nextItem && nextItem.type === 'image' && nextProxiedUrl) {
            const img = new Image();
            img.src = nextProxiedUrl;
        }
    }, [nextProxiedUrl, nextItem]);

    // Fix: Clear previous edits/metadata UI on item switch
    useEffect(() => {
        // Any reset logic needed for layers when activeIndex changes
    }, [activeIndex]);



    // 1. Source Initialization Effect (Runs on activeIndex or activeItem change)
    useEffect(() => {
        if (!activeItem || activeItem.type !== 'video' || !videoRef.current) return;

        const video = videoRef.current;


        // Cleanup existing HLS instance
        if ((video as any).hls) {
            ((video as any).hls as Hls).destroy();
            delete (video as any).hls;
        }

        const setupVideo = (url: string) => {
            if (url.includes('.m3u8')) {
                if (Hls.isSupported()) {
                    const hls = new Hls({ enableWorker: true });
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    (video as any).hls = hls;

                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        if (!isPaused && !showInfoDrawer) {
                            video.play().catch(e => console.error("[MediaStackViewer] HLS play failed:", e));
                        }
                    });

                    hls.on(Hls.Events.ERROR, (_, data) => {
                        if (data.fatal) {
                            console.error("[MediaStackViewer] Fatal HLS error:", data.type, data.details);
                        }
                    });
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                }
            } else {
                video.src = url;
            }
        };

        setupVideo(displayUrl || '');

        const applyTrim = () => {
            const start = activeItem.videoStartTime || 0;
            if (video.currentTime < start) {
                video.currentTime = start;
            }
        };

        if (video.readyState >= 1) {
            applyTrim();
        } else {
            video.addEventListener('loadedmetadata', applyTrim);
        }

        const handleEnded = () => {
            if (!nextCalledRef.current) {
                nextCalledRef.current = true;
                handleNext();
            }
        };
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('loadedmetadata', applyTrim);
            video.removeEventListener('ended', handleEnded);
            if ((video as any).hls) {
                ((video as any).hls as Hls).destroy();
                delete (video as any).hls;
            }
            video.src = '';
        };
    }, [activeIndex, activeItem.url, displayUrl]); // Only re-run when the item or URL actually changes

    // 2. Playback Control Effect (Handles Pause/Info Drawer/Progress)
    useEffect(() => {
        if (!activeItem || !videoRef.current) return;

        if (showInfoDrawer || isPaused) {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (activeItem.type === 'video') {
                videoRef.current.pause();
            }
            if (audioRef.current) audioRef.current.pause();
            return;
        }

        // BGM Logic
        if (audioRef.current) {
            if (activeItem.type === 'video') {
                audioRef.current.pause();
            } else if (!isMuted) {
                audioRef.current.play().catch(e => console.warn("[MediaStackViewer] BGM play blocked:", e.message));
            }
        }

        if (activeItem.type === 'video') {
            const video = videoRef.current;
            
            // Re-trigger play if we unpaused (HLS might already be attached)
            if (video.readyState >= 2) {
                video.play().catch(e => {
                    if (e.name !== 'AbortError') console.error("[MediaStackViewer] Video play failed:", e);
                });
            }

            const updateProgress = () => {
                if (!videoRef.current || nextCalledRef.current) return;
                const v = videoRef.current;
                const start = activeItem.videoStartTime || 0;
                const end = activeItem.videoEndTime || v.duration || 1;

                const trimmedDuration = Math.max(0.1, end - start);
                const current = Math.max(0, v.currentTime - start);

                setProgress((current / trimmedDuration) * 100);

                if (v.currentTime >= end && activeItem.videoEndTime) {
                    nextCalledRef.current = true;
                    handleNext();
                }
            };

            progressIntervalRef.current = setInterval(updateProgress, 50);
        } else {
            // Image mode
            const durationMs = (activeItem.duration || 5) * 1000;
            const intervalTime = 50;
            const step = (intervalTime / durationMs) * 100;

            progressIntervalRef.current = setInterval(() => {
                if (nextCalledRef.current) return;
                setProgress((prev) => {
                    if (prev >= 100) {
                        nextCalledRef.current = true;
                        handleNext();
                        return 100;
                    }
                    return prev + step;
                });
            }, intervalTime);
        }

        return () => {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
        };
    }, [activeIndex, isPaused, showInfoDrawer, isMuted, activeItem.videoStartTime, activeItem.videoEndTime]);


    const handleNext = useCallback(() => {
        if (activeIndex < items.length - 1) {
            setActiveIndex((prev) => prev + 1);
        } else {
            onClose(); // Close if we reached the end
        }
    }, [activeIndex, items.length, onClose]);

    const handlePrev = useCallback(() => {
        if (activeIndex > 0) {
            setActiveIndex((prev) => prev - 1);
        }
    }, [activeIndex]);

    // Handle keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (showInfoDrawer) return;
            
            // Don't navigate if user is typing in an input/textarea
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === 'ArrowRight') {
                handleNext();
            } else if (e.key === 'ArrowLeft') {
                handlePrev();
            } else if (e.key === 'Escape') {
                onClose();
            } else if (e.key === ' ') {
                e.preventDefault(); // Prevent scrolling
                setIsPaused(p => !p);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleNext, handlePrev, onClose, showInfoDrawer]);

    // Set audio volume on change
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = bgmVolume;
        }
    }, [bgmVolume]);


    const handleTouchZone = (e: React.MouseEvent | React.TouchEvent) => {
        if (showInfoDrawer) return;

        let clientX = 0;
        if ('touches' in e) {
            clientX = e.changedTouches[0].clientX;
        } else {
            clientX = (e as React.MouseEvent).clientX;
        }

        const unscaledWidth = window.innerWidth;
        const clickRatio = clientX / unscaledWidth;
        
        // --- Action Zone Detection ---
        // Center area (30% to 70%) toggles play/pause for videos
        if (activeItem.type === 'video' && clickRatio > 0.3 && clickRatio < 0.7) {
            setIsPaused(p => !p);
            return;
        }

        // Navigation
        if (clickRatio > 0.3) {
            handleNext();
        } else {
            handlePrev();
        }
    };


    const handlePointerDown = () => {
        pressTimeRef.current = Date.now();
        setIsPaused(true);
    };

    const handlePointerUp = () => {
        const duration = Date.now() - pressTimeRef.current;
        // Only resume if it was a real "peek" hold (longer than 200ms)
        if (duration > 200) {
            setIsPaused(false);
        }
    };


    if (!items || items.length === 0 || !activeItem) return null;

    // Update video settings when active item changes or rate changes
    useEffect(() => {
        if (videoRef.current && activeItem.type === 'video') {
            videoRef.current.playbackRate = playbackRate;
            videoRef.current.muted = isVideoMuted;
            videoRef.current.volume = videoVolume;
        }
    }, [activeItem, playbackRate, isVideoMuted, videoVolume]);

    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(err => console.error(err));
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    const handleDownload = async () => {
        if (!displayUrl) return;
        try {
            const response = await fetch(displayUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = activeItem.filename || `video_${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download failed', err);
            window.open(displayUrl, '_blank');
        }
    };

    const togglePiP = async () => {
        if (!videoRef.current) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else {
                await videoRef.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error('PiP failed', err);
        }
    };

    return (
        <div 
            ref={containerRef}
            className="fixed top-16 inset-x-0 bottom-0 z-[200] bg-black text-white flex flex-col justify-between font-sans overflow-hidden"
        >
            {/* Background Music */}
            {backgroundMusicUrl && (
                <audio
                    ref={audioRef}
                    src={backgroundMusicUrl}
                    loop
                    muted={isMuted}
                />
            )}

            {/* Progress Bars */}
            <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 pt-4 z-20 bg-gradient-to-b from-black/60 to-transparent">
                {items.map((_, idx) => (
                    <div key={idx} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-white transition-all duration-75 ease-linear"
                            style={{
                                width: idx < activeIndex ? '100%' : idx === activeIndex ? `${progress}%` : '0%',
                            }}
                        />
                    </div>
                ))}
            </div>

            {/* Top Nav */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-20 pointer-events-none">
                <button onClick={onClose} className="p-2 pointer-events-auto bg-black/20 hover:bg-black/40 rounded-full transition-colors backdrop-blur-md">
                    <X className="w-6 h-6" />
                </button>
                <div className="text-center drop-shadow-md">
                    <span className="text-sm font-semibold block px-3 py-1 bg-black/20 backdrop-blur-md rounded-full">
                        {activeItem.date instanceof Date ? activeItem.date.toLocaleDateString() : typeof activeItem.date === 'string' ? activeItem.date : ''}
                    </span>
                </div>
                <div className="flex items-center gap-4 pointer-events-auto">
                    {backgroundMusicUrl && (
                        <div className="relative" onMouseLeave={() => setShowVolumeSlider(false)}>
                            <button
                                onClick={() => setIsMuted(!isMuted)}
                                onMouseEnter={() => setShowVolumeSlider(true)}
                                className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors"
                            >
                                {isMuted || bgmVolume === 0 ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                            </button>
                            {showVolumeSlider && !isMuted && activeItem.type !== 'video' && (
                                <div className="absolute top-full right-0 mt-2 bg-black/60 backdrop-blur-md p-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in zoom-in w-32 border border-white/10">
                                    <VolumeX className="w-3 h-3 text-gray-400" />
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.05"
                                        value={bgmVolume}
                                        onChange={e => setBgmVolume(Number(e.target.value))}
                                        className="flex-1 accent-white"
                                    />
                                    <Volume2 className="w-3 h-3 text-gray-400" />
                                </div>
                            )}
                        </div>
                    )}
                    <button 
                        onClick={() => setViewerZoom(prev => Math.max(1, prev === 1 ? 2 : 1))} 
                        className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10"
                        title="Zoom Toggle"
                    >
                        {viewerZoom > 1 ? <ZoomOut className="w-5 h-5 text-white" /> : <ZoomIn className="w-5 h-5 text-white" />}
                    </button>
                    <button onClick={() => setIsFavorite(!isFavorite)} className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10">
                        <Star className={`w-5 h-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={() => setShowInfoDrawer(true)} className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors border border-white/10">
                        <MoreVertical className="w-5 h-5 text-white" />
                    </button>
                </div>
            </div>

            {/* Media Overlay Mechanics */}
            <div
                ref={contentRef}
                className="absolute inset-0 z-10 select-none overflow-hidden touch-none"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={handleTouchZone}
            >
                <div 
                    className="w-full h-full flex items-center justify-center transition-transform duration-200"
                    style={{ 
                        transform: `scale(${viewerZoom}) translate(${viewerPos.x}px, ${viewerPos.y}px)` 
                    }}
                >
                    {activeItem.type === 'video' ? (
                        <>
                            <video
                                ref={videoRef}
                                src={displayUrl}
                                playsInline
                                className={cn(
                                    "max-w-full max-h-full pointer-events-auto transition-all duration-500", 
                                    activeItem.cropMode === 'cover' ? 'w-full h-full object-cover' : 'object-contain'
                                )}
                                onTimeUpdate={(e) => setVideoTime(e.currentTarget.currentTime)}
                                onDurationChange={(e) => setVideoDuration(e.currentTarget.duration)}
                            />
                            {isPaused && (
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                                    <div className="w-24 h-24 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center animate-pulse">
                                        <Play className="w-12 h-12 fill-white text-white ml-2" />
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <img
                            src={displayUrl}
                            alt={activeItem.caption || 'Media'}
                            className={cn(
                                "max-w-full max-h-full pointer-events-none select-none transition-all duration-500", 
                                activeItem.cropMode === 'cover' ? 'w-full h-full object-cover' : 'object-contain'
                            )}
                        />
                    )}
                </div>

                {/* Overlays (Keep them static even when zoomed?) 
                    Actually, it's better if they zoom with the content if they are spatial. */}
                <div 
                   className="absolute inset-0 pointer-events-none"
                   style={{ transform: `scale(${viewerZoom}) translate(${viewerPos.x}px, ${viewerPos.y}px)` }}
                >
                    {(activeItem.textLayers || []).map(layer => (
                        <div key={layer.id}
                            className="absolute pointer-events-none select-none px-1"
                            style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%,-50%) rotate(${layer.rotation || 0}deg)`, fontSize: layer.fontSize, fontFamily: layer.fontFamily, color: layer.color, fontWeight: layer.bold ? 'bold' : 'normal', textShadow: '0 1px 4px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}
                        >
                            {layer.text}
                        </div>
                    ))}

                    {activeItem.caption && (
                        <div
                            className="absolute pointer-events-none select-none px-4 py-2 rounded-2xl"
                            style={{ left: `${activeItem.captionX || 50}%`, top: `${activeItem.captionY || 85}%`, transform: `translate(-50%,-50%) rotate(${activeItem.captionRotation || 0}deg)`, fontSize: activeItem.captionFontSize || 20, color: activeItem.captionColor || '#ffffff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                        >
                            {activeItem.caption}
                        </div>
                    )}

                    {(activeItem.stickerLayers || []).map(layer => (
                        <div key={layer.id}
                            className="absolute pointer-events-none select-none"
                            style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: 'translate(-50%,-50%)', fontSize: layer.size, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                        >
                            {layer.emoji}
                        </div>
                    ))}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 z-50 bg-gradient-to-t from-black/90 to-transparent flex flex-col gap-4">
                {activeItem.type === 'video' && (
                    <div className="flex items-center gap-6 pointer-events-auto bg-black/40 backdrop-blur-xl p-4 rounded-[2rem] border border-white/10 shadow-2xl">
                        <button onClick={() => setIsPaused(!isPaused)} className="p-2.5 bg-white/10 rounded-full hover:bg-white/20 transition-all active:scale-90 shrink-0">
                            {isPaused ? <Play className="w-5 h-5 fill-white text-white ml-1" /> : <Pause className="w-5 h-5 fill-white text-white" />}
                        </button>
                        
                        <div className="flex-1 flex flex-col gap-1.5 pt-1">
                            <div className="relative h-1.5 w-full bg-white/20 rounded-full group/seek">
                                <input 
                                    type="range"
                                    min={0}
                                    max={videoDuration || 100}
                                    step={0.1}
                                    value={videoTime}
                                    onChange={(e) => {
                                        if (videoRef.current) {
                                            const time = Number(e.target.value);
                                            videoRef.current.currentTime = time;
                                            setVideoTime(time);
                                        }
                                    }}
                                    className="absolute inset-x-0 -top-1 bottom-0 w-full h-4 opacity-0 cursor-pointer z-10"
                                />
                                <div 
                                    className="absolute left-0 top-0 h-full bg-catalog-accent rounded-full transition-all duration-75"
                                    style={{ width: `${(videoTime / (videoDuration || 1)) * 100}%` }}
                                />
                                <div 
                                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg opacity-0 group-hover/seek:opacity-100 transition-opacity"
                                    style={{ left: `${(videoTime / (videoDuration || 1)) * 100}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] font-black text-white/40 tracking-[0.2em] uppercase">
                                <span>{new Date(videoTime * 1000).toISOString().substr(14, 5)}</span>
                                <span>{new Date(videoDuration * 1000).toISOString().substr(14, 5)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                            <div className="group/vol relative flex items-center pr-2">
                                <button 
                                    onClick={() => {
                                        const newMute = !isVideoMuted;
                                        setIsVideoMuted(newMute);
                                        if (videoRef.current) videoRef.current.muted = newMute;
                                        if (!newMute && videoVolume === 0) {
                                            setVideoVolume(0.5);
                                            if (videoRef.current) videoRef.current.volume = 0.5;
                                        }
                                    }}
                                    className="p-2 hover:bg-white/10 rounded-full transition-all text-white/60 hover:text-white"
                                >
                                    {isVideoMuted || videoVolume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                                </button>
                                
                                <div className="absolute bottom-[90%] right-0 pb-4 opacity-0 group-hover/vol:opacity-100 transition-all pointer-events-none group-hover/vol:pointer-events-auto z-[70] translate-y-2 group-hover/vol:translate-y-0 duration-300">
                                    <div className="p-4 bg-[#1a1a1a]/95 backdrop-blur-xl rounded-[1.5rem] border border-white/10 w-40 shadow-2xl flex items-center gap-3">
                                        <VolumeX className="w-3.5 h-3.5 text-white/30" />
                                        <input 
                                            type="range"
                                            min="0" max="1" step="0.05"
                                            value={isVideoMuted ? 0 : videoVolume}
                                            onChange={(e) => {
                                                const v = Number(e.target.value);
                                                setVideoVolume(v);
                                                if (videoRef.current) videoRef.current.volume = v;
                                                const shouldMute = v === 0;
                                                setIsVideoMuted(shouldMute);
                                                if (videoRef.current) videoRef.current.muted = shouldMute;
                                            }}
                                            onPointerDown={(e) => e.stopPropagation()}
                                            className="flex-1 accent-catalog-accent h-1.5 rounded-full appearance-none bg-white/10 cursor-pointer"
                                        />
                                        <Volume2 className="w-3.5 h-3.5 text-white/30" />
                                    </div>
                                </div>
                            </div>

                            <div className="w-px h-6 bg-white/10" />

                            <button onClick={toggleFullscreen} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/60 hover:text-white">
                                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                            </button>
                            
                            <div className="relative">
                                <button onClick={() => setShowVideoMenu(!showVideoMenu)} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/60 hover:text-white">
                                    <MoreVertical className="w-5 h-5" />
                                </button>
                                
                                {showVideoMenu && (
                                    <div className="absolute bottom-full right-0 mb-4 w-48 bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[60] animate-in fade-in slide-in-from-bottom-2 duration-200 origin-bottom-right">
                                        <div className="p-1.5 border-b border-white/5">
                                            <div className="px-3 py-2 text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                                                <Settings2 className="w-3 h-3" /> Playback Speed
                                            </div>
                                            {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                                                <button key={rate} onClick={() => { setPlaybackRate(rate); setShowVideoMenu(false); }} className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-white hover:bg-white/10 rounded-xl transition-colors">
                                                    <span>{rate === 1 ? 'Normal' : `${rate}x`}</span>
                                                    {playbackRate === rate && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="p-1.5">
                                            <button onClick={() => { handleDownload(); setShowVideoMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/10 rounded-xl transition-colors">
                                                <Download className="w-4 h-4" /> <span>Download</span>
                                            </button>
                                            <button onClick={() => { togglePiP(); setShowVideoMenu(false); }} className="w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold text-white hover:bg-white/10 rounded-xl transition-colors">
                                                <MonitorPlay className="w-4 h-4" /> <span>Picture-in-Picture</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {!readOnly && (
                    <div className="flex items-center justify-between pointer-events-auto">
                        <div className="flex gap-4">
                            <button onClick={onShare} className="flex items-center gap-2 p-2 px-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors border border-white/5">
                                <Share className="w-5 h-5" />
                                <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Share</span>
                            </button>
                            <button onClick={onEdit} className="flex items-center gap-2 p-2 px-3 bg-white/10 rounded-full hover:bg-white/20 transition-colors border border-white/5">
                                <Edit2 className="w-5 h-5 pt-0" />
                                <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Edit</span>
                            </button>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={onDelete} className="flex items-center gap-2 p-2 px-3 bg-white/10 rounded-full hover:bg-white/20 text-red-400 transition-colors border border-white/5">
                                <Trash className="w-5 h-5 pt-0" />
                                <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline">Delete</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Info Drawer */}
            {showInfoDrawer && (
                <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowInfoDrawer(false); }}>
                    <div className="bg-neutral-900 rounded-t-3xl p-6 flex flex-col gap-6 animate-in slide-in-from-bottom h-3/4 overflow-y-auto">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-semibold">Info</h3>
                            <button className="bg-neutral-800 rounded-full p-1 border border-white/5" onClick={() => setShowInfoDrawer(false)}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-medium text-neutral-400">Caption</label>
                            <textarea
                                value={captionText}
                                onChange={(e) => setCaptionText(e.target.value)}
                                placeholder="Add a caption..."
                                className="w-full bg-neutral-800 rounded-xl p-4 text-white border border-neutral-700 focus:outline-none focus:border-blue-500 font-medium"
                                rows={3}
                            />
                        </div>

                        <div className="flex flex-col gap-3 p-4 bg-neutral-800 rounded-xl border border-white/5">
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-neutral-400">Filename</span>
                                <span className="truncate max-w-[200px]">{activeItem.filename || 'unknown'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-neutral-400">Resolution</span>
                                <span>{activeItem.resolution || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-neutral-400">Size</span>
                                <span>{activeItem.sizeMegabytes ? `${activeItem.sizeMegabytes.toFixed(2)} MB` : 'N/A'}</span>
                            </div>
                            {activeItem.duration && (
                                <div className="flex justify-between items-center text-sm font-medium">
                                    <span className="text-neutral-400">Duration</span>
                                    <span>{activeItem.duration}s</span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 p-4 bg-neutral-800 rounded-xl border border-white/5">
                            <div className="flex justify-between items-center text-sm font-medium">
                                <span className="text-neutral-400">Storage</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${activeItem.storageStatus === 'Backed up' ? 'bg-green-500' : 'bg-yellow-500'}`} />
                                    <span>{activeItem.storageStatus || 'On device'}</span>
                                </div>
                            </div>
                        </div>

                        {activeItem.location && (
                            <div className="flex items-center gap-3 p-4 bg-neutral-800 rounded-xl border border-white/5">
                                <MapPin className="w-5 h-5 text-blue-400" />
                                <span className="text-sm font-medium">{activeItem.location}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default MediaStackViewer;

