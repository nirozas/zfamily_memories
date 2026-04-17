import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Star, MoreVertical, Play, Pause, Share, Edit2, Trash,
    MapPin, Volume2, VolumeX, Maximize, Minimize, Download,
    MonitorPlay, Check, Settings2, Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import Hls from 'hls.js';
import { useAuthorizedUrl } from '../../hooks/useAuthorizedUrl';
import { CloudflareR2Service } from '../../services/cloudflareR2';

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
    onEdit,
    onDelete,
}: MediaStackViewerProps) {
    const [activeIndex, setActiveIndex] = useState(initialIndex);
    const [progress, setProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    // Background music volume stuff
    const [isMuted, setIsMuted] = useState(false);
    const [bgmVolume, setBgmVolume] = useState(1);

    // Show volume slider
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);

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
    // Guard: prevent handleNext from firing more than once per slide
    const nextCalledRef = useRef(false);
    // Preloaded video elements (keyed by url)
    const preloadedVideos = useRef<Map<string, { video: HTMLVideoElement, hls?: Hls }>>(new Map());

    const activeItem = items[activeIndex];
    
    // Get authorized URL for the active item
    const { authorizedUrl: activeAuthorizedUrl, loading: authLoading } = useAuthorizedUrl(activeItem?.url);
    
    // Only use the authorized URL if it's actually ready, 
    // otherwise if it's R2 we wait to avoid 401s
    const isR2 = CloudflareR2Service.isR2Url(activeItem?.url);
    const displayUrl = activeAuthorizedUrl || (!isR2 ? activeItem?.url : null);
    const isReady = !isR2 || activeAuthorizedUrl;

    const nextItem = activeIndex < items.length - 1 ? items[activeIndex + 1] : null;

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
        priorityIndices.forEach(async (idx) => {
            const item = items[idx];
            if (item.type === 'video' && item.url && !map.has(item.url)) {
                // We need an authorized URL for preloading too if it's R2
                let preloadUrl = item.url;
                if (CloudflareR2Service.isR2Url(item.url)) {
                    try {
                        const urlObj = new URL(item.url);
                        const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
                        preloadUrl = await CloudflareR2Service.getAuthorizedUrl(decodeURIComponent(key));
                    } catch (e) {
                        console.error('[MediaStackViewer] Failed to authorize for preload:', item.url, e);
                    }
                }

                const vid = document.createElement('video');
                vid.src = preloadUrl;
                vid.preload = 'auto';
                vid.muted = false;
                vid.playsInline = true;
                // Removed crossOrigin to avoid CORS issues with presigned URLs

                let hls: Hls | undefined;
                if (preloadUrl.includes('.m3u8')) {
                    if (Hls.isSupported()) {
                        hls = new Hls({ enableWorker: true });
                        hls.loadSource(preloadUrl);
                        hls.attachMedia(vid);
                    } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
                        vid.src = preloadUrl;
                    }
                } else {
                    vid.load();
                }

                preloadedVideos.current.set(item.url, { video: vid, hls });
                console.log(`[Preload] Priming buffer for: ${item.filename || item.url.substring(0, 20)}`);
            }
        });

        return () => {
        };
    }, [items, activeIndex]);

    useEffect(() => {
        if (activeItem) {
            setCaptionText(activeItem.caption || '');
            setIsFavorite(activeItem.isFavorite || false);
            setProgress(0);
            setIsPaused(false);
            nextCalledRef.current = false; 
            
            if (audioRef.current && !isMuted) {
                audioRef.current.volume = bgmVolume;
            }
        }
    }, [activeIndex, activeItem, isMuted, bgmVolume]);

    // Handle auto-advance and progress bar
    useEffect(() => {
        if (showInfoDrawer || isPaused) {
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            if (activeItem?.type === 'video' && videoRef.current) {
                videoRef.current.pause();
            }
            if (audioRef.current) audioRef.current.pause();
            return;
        }

        // BGM Logic: If it's a video, pause BGM. If image, play BGM.
        if (audioRef.current) {
            if (activeItem?.type === 'video') {
                audioRef.current.pause();
            } else if (!isMuted) {
                audioRef.current.play().catch(e => console.error("Audio play error:", e));
            }
        }

        if (activeItem?.type === 'video' && videoRef.current) {
            const video = videoRef.current;
            const start = activeItem.videoStartTime || 0;
            const end = activeItem.videoEndTime;

            // Copy preloaded buffer into the visible video element for fast playback
            const entry = preloadedVideos.current.get(activeItem.url);
            
            // Cleanup existing HLS instance if any
            if ((video as any).hls) {
                ((video as any).hls as Hls).destroy();
                delete (video as any).hls;
            }

            if (entry) {
                // If the preloaded video has an HLS instance, we should ideally swap the element
                // but since we're using a single videoRef, we'll re-attach HLS to the visible video
                if (activeItem.url.includes('.m3u8')) {
                    if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(displayUrl || '');
                        hls.attachMedia(video);
                        (video as any).hls = hls; // store for cleanup
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = displayUrl || '';
                    }
                } else {
                    video.src = displayUrl || '';
                }
            } else if (video.src !== displayUrl) {
                if (displayUrl?.includes('.m3u8')) {
                   if (Hls.isSupported()) {
                        const hls = new Hls();
                        hls.loadSource(displayUrl);
                        hls.attachMedia(video);
                        (video as any).hls = hls;
                    } else {
                        video.src = displayUrl;
                    }
                } else {
                    video.src = displayUrl || '';
                }
            }

            const applyTrim = () => {
                if (video.currentTime < start) {
                    video.currentTime = start;
                }
            };

            if (video.readyState >= 1) {
                applyTrim();
            } else {
                video.addEventListener('loadedmetadata', applyTrim);
            }

            video.play().catch(e => {
                // Ignore AbortError - it happens when a play request is interrupted by a new item or unmount
                if (e.name === 'AbortError') return;
                
                console.error("Video play error:", e);
                // If play failed with NotSupportedError, try fallback to raw URL if it is a proxy
                if (e.name === 'NotSupportedError' && displayUrl?.includes('.m3u8')) {
                    console.warn("[MediaStackViewer] HLS play failed, checking if raw URL is better.");
                }
            });

            const updateProgress = () => {
                if (!videoRef.current || nextCalledRef.current) return;
                const durationRaw = videoRef.current.duration || 1;
                const startTime = start;
                const endTime = end || durationRaw;

                const trimmedDuration = Math.max(0.1, endTime - startTime);
                const current = Math.max(0, videoRef.current.currentTime - startTime);

                setProgress((current / trimmedDuration) * 100);

                // Auto advance
                if (videoRef.current.currentTime >= endTime && end) {
                    nextCalledRef.current = true;
                    handleNext();
                }
            };

            progressIntervalRef.current = setInterval(updateProgress, 50);

            const handleEnded = () => {
                if (!nextCalledRef.current) {
                    nextCalledRef.current = true;
                    handleNext();
                }
            };
            videoRef.current.addEventListener('ended', handleEnded);

            return () => {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                video.removeEventListener('loadedmetadata', applyTrim);
                if (videoRef.current) {
                    videoRef.current.removeEventListener('ended', handleEnded);
                    // Cleanup HLS instance if any
                    if ((videoRef.current as any).hls) {
                        (videoRef.current as any).hls.destroy();
                        delete (videoRef.current as any).hls;
                    }
                }
            };
        } else {
            // Image mode: Use item.duration (in seconds) or default to 5
            const durationMs = (activeItem?.duration || 5) * 1000;
            const intervalTime = 50;
            const step = (intervalTime / durationMs) * 100;

            progressIntervalRef.current = setInterval(() => {
                if (nextCalledRef.current) return;
                setProgress((prev) => {
                    if (prev >= 100) {
                        if (!nextCalledRef.current) {
                            nextCalledRef.current = true;
                            handleNext();
                        }
                        return 100;
                    }
                    return prev + step;
                });
            }, intervalTime);

            return () => {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
            };
        }
    }, [activeIndex, isPaused, showInfoDrawer, activeItem, isMuted, bgmVolume]);

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
        if (clientX > unscaledWidth * 0.3) {
            handleNext();
        } else {
            handlePrev();
        }
    };

    const handlePointerDown = () => {
        setIsPaused(true);
    };

    const handlePointerUp = () => {
        setIsPaused(false);
    };

    if (!items || items.length === 0 || !activeItem) return null;

    // Update video settings when active item changes or rate changes
    useEffect(() => {
        if (videoRef.current && activeItem.type === 'video') {
            videoRef.current.playbackRate = playbackRate;
            videoRef.current.muted = isVideoMuted;
        }
    }, [activeItem, playbackRate, isVideoMuted]);

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
                className="absolute inset-0 z-10 select-none flex items-center justify-center"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={handleTouchZone}
                key={activeItem.id}
            >
                {!isReady || authLoading ? (
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-12 h-12 animate-spin text-white/20" />
                        <p className="text-white/40 font-outfit font-black text-xs uppercase tracking-widest">Securing Media...</p>
                    </div>
                ) : activeItem.type === 'video' ? (
                    <>
                        <video
                            ref={videoRef}
                            playsInline
                            className={cn(
                                "w-full h-full pointer-events-none select-none transition-all duration-500", 
                                activeItem.cropMode === 'cover' ? 'object-cover' : 'object-contain'
                            )}
                        />
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPaused(p => !p); }}
                            className={cn(
                                "absolute inset-0 m-auto w-[32rem] h-[32rem] rounded-full bg-black/40 backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all duration-300 pointer-events-auto z-20 shadow-[0_0_150px_rgba(0,0,0,0.6)] active:scale-95 group/playbtn",
                                isPaused ? "opacity-100 scale-100" : "opacity-0 hover:opacity-100 scale-90 hover:scale-110"
                            )}
                        >
                            {isPaused
                                ? <Play className="w-56 h-56 fill-white text-white ml-8 group-hover/playbtn:scale-110 transition-transform" />
                                : <Pause className="w-56 h-56 fill-white text-white group-hover/playbtn:scale-110 transition-transform" />}
                        </button>
                    </>
                ) : (
                    <img
                        src={displayUrl || undefined}
                        alt={activeItem.caption || 'Media'}
                        referrerPolicy="no-referrer"
                        className={cn(
                            "w-full h-full pointer-events-none select-none transition-all duration-500", 
                            activeItem.cropMode === 'cover' ? 'object-cover' : 'object-contain'
                        )}
                    />
                )}

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

            {/* Bottom Action Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 z-20 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-4">
                {activeItem.type === 'video' && (
                    <div className="flex items-center gap-4 pointer-events-auto bg-black/20 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                        <button onClick={() => setIsPaused(!isPaused)} className="p-1.5 bg-white/10 rounded-full hover:bg-white/20 transition-all">
                            {isPaused ? <Play className="w-5 h-5 fill-white text-white" /> : <Pause className="w-5 h-5 fill-white text-white" />}
                        </button>
                        
                        <button onClick={() => setIsVideoMuted(!isVideoMuted)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                            {isVideoMuted ? <VolumeX className="w-5 h-5 text-white" /> : <Volume2 className="w-5 h-5 text-white" />}
                        </button>

                        <div className="flex-1 h-1.5 bg-white/30 rounded-full cursor-pointer relative group/progress">
                            <div className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-75" style={{ width: `${progress}%` }} />
                            <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity" style={{ left: `${progress}%` }} />
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={toggleFullscreen} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                                {isFullscreen ? <Minimize className="w-5 h-5 text-white" /> : <Maximize className="w-5 h-5 text-white" />}
                            </button>
                            
                            <div className="relative">
                                <button onClick={() => setShowVideoMenu(!showVideoMenu)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                                    <MoreVertical className="w-5 h-5 text-white" />
                                </button>
                                
                                {showVideoMenu && (
                                    <div className="absolute bottom-full right-0 mb-4 w-48 bg-[#1a1a1a] backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200 origin-bottom-right">
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
