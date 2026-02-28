import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    X, Star, MoreVertical, Play, Pause, Share, Edit2, Trash,
    MapPin, Volume2, VolumeX
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useGooglePhotosUrl } from '../../hooks/useGooglePhotosUrl';
import { GooglePhotosService } from '../../services/googlePhotos';
import { useAuth } from '../../contexts/AuthContext';

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
    const [bgmVolume, setBgmVolume] = useState(1);

    // Show volume slider
    const [showVolumeSlider, setShowVolumeSlider] = useState(false);

    const [showInfoDrawer, setShowInfoDrawer] = useState(false);
    const [captionText, setCaptionText] = useState('');
    const [isFavorite, setIsFavorite] = useState(false);

    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    // Guard: prevent handleNext from firing more than once per slide
    const nextCalledRef = useRef(false);
    // Preloaded video elements (keyed by url)
    const preloadedVideos = useRef<Map<string, HTMLVideoElement>>(new Map());

    const { googleAccessToken } = useAuth();
    const activeItem = items[activeIndex];
    const { url: displayUrl } = useGooglePhotosUrl(activeItem.googlePhotoId, activeItem.url, shareToken);

    const nextItem = activeIndex < items.length - 1 ? items[activeIndex + 1] : null;
    const isNextGoogle = nextItem?.url && (nextItem.url.includes('googleusercontent.com') || nextItem.url.includes('photoslibrary.googleapis.com'));
    const nextProxiedUrl = (nextItem && isNextGoogle)
        ? GooglePhotosService.getProxyUrl(nextItem.url, googleAccessToken, shareToken)
        : nextItem?.url;

    // Preload ALL videos when viewer opens
    useEffect(() => {
        const map = preloadedVideos.current;
        items.forEach(item => {
            if (item.type === 'video' && item.url && !map.has(item.url)) {
                const vid = document.createElement('video');
                // Use proxy for preloading if it's a Google URL
                const isGoogle = item.url.includes('googleusercontent.com') || item.url.includes('photoslibrary.googleapis.com');
                vid.src = isGoogle ? GooglePhotosService.getProxyUrl(item.url, googleAccessToken, shareToken) : item.url;
                vid.preload = 'auto';
                vid.muted = true;
                vid.playsInline = true;
                vid.crossOrigin = 'anonymous';
                // Start buffering immediately
                vid.load();
                map.set(item.url, vid);
            }
        });
        return () => {
            // Cleanup preloaded videos
            map.forEach(v => { v.src = ''; });
            map.clear();
        };
    }, []); // Only on mount

    useEffect(() => {
        if (activeItem) {
            setCaptionText(activeItem.caption || '');
            setIsFavorite(activeItem.isFavorite || false);
            setProgress(0);
            setIsPaused(false);
            nextCalledRef.current = false; // Reset guard for each new slide
        }
    }, [activeIndex, activeItem]);

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
            const preloaded = preloadedVideos.current.get(activeItem.url);
            if (preloaded && preloaded.readyState >= 2) {
                // The preloaded element has buffered data — just set src if different
                if (video.src !== preloaded.src && video.src !== activeItem.url) {
                    video.src = activeItem.url;
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

            video.play().catch(e => console.error("Video play error:", e));

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
                if (videoRef.current) videoRef.current.removeEventListener('ended', handleEnded);
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

    // Set audio volume on change
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = bgmVolume;
        }
    }, [bgmVolume]);

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

    return (
        <div className="fixed inset-0 z-[200] bg-black text-white flex flex-col justify-between font-sans overflow-hidden">
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
            <div className="absolute top-0 left-0 right-0 flex gap-1 p-2 pt-12 z-20 bg-gradient-to-b from-black/60 to-transparent">
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
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-16 z-20 pointer-events-none">
                <button onClick={onClose} className="p-2 pointer-events-auto bg-black/20 hover:bg-black/40 rounded-full transition-colors backdrop-blur-md">
                    <X className="w-6 h-6" />
                </button>
                <div className="text-center drop-shadow-md">
                    <span className="text-sm font-semibold block px-3 py-1 bg-black/20 backdrop-blur-md rounded-full">
                        {typeof activeItem.date === 'string' ? activeItem.date : activeItem.date.toLocaleDateString()}
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
                            {/* Volume slider popover */}
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
                    <button onClick={() => setIsFavorite(!isFavorite)} className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors">
                        <Star className={`w-5 h-5 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-white'}`} />
                    </button>
                    <button onClick={() => setShowInfoDrawer(true)} className="p-2 bg-black/20 hover:bg-black/40 rounded-full backdrop-blur-md transition-colors">
                        <MoreVertical className="w-5 h-5 text-white" />
                    </button>
                </div>
            </div>

            {/* Media Overlay Mechanics */}
            <div
                className="absolute inset-0 z-10 select-none"
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onClick={handleTouchZone}
            >
                {activeItem.type === 'video' ? (
                    <>
                        <video
                            ref={videoRef}
                            src={displayUrl}
                            playsInline
                            crossOrigin="anonymous"
                            className={cn("w-full h-full pointer-events-none select-none", activeItem.cropMode === 'cover' ? 'object-cover' : 'object-contain')}
                        />
                        {/* Centered play/pause controller */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsPaused(p => !p); }}
                            className={cn(
                                "absolute inset-0 m-auto w-72 h-72 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center transition-all duration-300 pointer-events-auto z-20 shadow-[0_0_100px_rgba(0,0,0,0.5)] active:scale-90",
                                isPaused ? "opacity-100 scale-100" : "opacity-0 hover:opacity-100 scale-90 hover:scale-110"
                            )}
                        >
                            {isPaused
                                ? <Play className="w-32 h-32 fill-white text-white ml-4" />
                                : <Pause className="w-32 h-32 fill-white text-white" />}
                        </button>
                    </>
                ) : (
                    <img
                        src={displayUrl}
                        alt={activeItem.caption || 'Media'}
                        className={cn("w-full h-full pointer-events-none select-none", activeItem.cropMode === 'cover' ? 'object-cover' : 'object-contain')}
                        crossOrigin="anonymous"
                    />
                )}

                {/* Overlays */}
                {/* Text layers */}
                {(activeItem.textLayers || []).map(layer => (
                    <div key={layer.id}
                        className="absolute pointer-events-none select-none px-1"
                        style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%,-50%) rotate(${layer.rotation || 0}deg)`, fontSize: layer.fontSize, fontFamily: layer.fontFamily, color: layer.color, fontWeight: layer.bold ? 'bold' : 'normal', textShadow: '0 1px 4px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}
                    >
                        {layer.text}
                    </div>
                ))}

                {/* Caption layer */}
                {activeItem.caption && (
                    <div
                        className="absolute pointer-events-none select-none px-4 py-2 rounded-2xl"
                        style={{ left: `${activeItem.captionX || 50}%`, top: `${activeItem.captionY || 85}%`, transform: `translate(-50%,-50%) rotate(${activeItem.captionRotation || 0}deg)`, fontSize: activeItem.captionFontSize || 20, color: activeItem.captionColor || '#ffffff', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                    >
                        {activeItem.caption}
                    </div>
                )}

                {/* Sticker layers */}
                {(activeItem.stickerLayers || []).map(layer => (
                    <div key={layer.id}
                        className="absolute pointer-events-none select-none"
                        style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: 'translate(-50%,-50%)', fontSize: layer.size, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                    >
                        {layer.emoji}
                    </div>
                ))}
            </div>

            {/* Preload next item */}
            {nextItem && nextItem.type === 'image' && (
                <link rel="preload" as="image" href={nextProxiedUrl} />
            )}

            {/* Bottom Action Bar */}
            <div className="absolute bottom-0 left-0 right-0 p-4 pb-8 z-20 bg-gradient-to-t from-black/80 to-transparent flex flex-col gap-4">
                {activeItem.type === 'video' && (
                    <div className="flex items-center gap-4 pointer-events-auto">
                        <button onClick={() => setIsPaused(!isPaused)}>
                            {isPaused ? <Play className="w-6 h-6" /> : <Pause className="w-6 h-6" />}
                        </button>
                        <div className="flex-1 h-1 bg-white/30 rounded cursor-pointer relative">
                            <div
                                className="absolute top-0 left-0 h-full bg-white rounded transition-all duration-75"
                                style={{ width: `${progress}%` }}
                            />
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

            {/* Info / Details Drawer */}
            {showInfoDrawer && (
                <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40 backdrop-blur-sm"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowInfoDrawer(false);
                    }}>
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
