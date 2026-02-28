// @locked - This file is locked. Do not edit unless requested to unlock.
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Card } from '../components/ui/Card';
import '../HomeCarousel.css';
import { CreateAlbumModal } from '../components/catalog/CreateAlbumModal';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { storageService } from '../services/storage';
import { GooglePhotosService } from '../services/googlePhotos';
import { WorldMapPreview } from '../components/home/WorldMapPreview';
import { ImageCropper } from '../components/ui/ImageCropper';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import { Calendar, Plus, User, PlusCircle, Camera, MapPin, Image as ImageIcon, Edit, Loader2, FolderOpen, Upload } from 'lucide-react';
import type { Event, Profile } from '../types/supabase';
import { motion } from 'framer-motion';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const DEFAULT_HERO_IMAGE = 'https://images.unsplash.com/photo-1511895426328-dc8714191300?q=100&w=3840&auto=format&fit=crop';

export function Home() {
    const { familyId, userRole, googleAccessToken, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [recentEvents, setRecentEvents] = useState<Event[]>([]);
    const [recentAlbums, setRecentAlbums] = useState<any[]>([]);
    const [familyMembers, setFamilyMembers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCreateAlbumModal, setShowCreateAlbumModal] = useState(false);
    // newMemberName removed — replaced by invite code flow (Fix #4)
    const [heroImageUrl, setHeroImageUrl] = useState(DEFAULT_HERO_IMAGE);
    const [isUploadingHero, setIsUploadingHero] = useState(false);
    const [showCropper, setShowCropper] = useState<{ src: string } | null>(null);
    const heroInputRef = useRef<HTMLInputElement>(null);

    // Media Picker State
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [activeTarget, setActiveTarget] = useState<'hero' | string | null>(null); // 'hero' or eventId

    const isAdmin = userRole === 'admin';

    useDocumentTitle('Home');

    // Load hero image from DB (family_settings) on mount — persistent across devices
    useEffect(() => {
        const loadHeroImage = async () => {
            if (!familyId) return;
            try {
                const { data } = await (supabase.from('family_settings' as any) as any)
                    .select('hero_image_url')
                    .eq('family_id', familyId)
                    .maybeSingle();
                if (data?.hero_image_url) {
                    setHeroImageUrl(data.hero_image_url);
                } else {
                    // Fallback: migrate from localStorage if exists
                    const cached = localStorage.getItem(`family_hero_${familyId}`);
                    if (cached) setHeroImageUrl(cached);
                }
            } catch {
                const cached = localStorage.getItem(`family_hero_${familyId}`);
                if (cached) setHeroImageUrl(cached);
            }
        };
        loadHeroImage();
    }, [familyId]);

    const handleHeroImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !familyId) return;

        // Show cropper first
        const reader = new FileReader();
        reader.onload = () => {
            setShowCropper({ src: reader.result as string });
        };
        reader.readAsDataURL(file);
    };

    // Unified Handler for Hero Update — Fix #1 (DB) & Fix #6 (no double-upload)
    const processHeroUpdate = async (url: string | File, type: 'file' | 'url' = 'url') => {
        if (!familyId) return;
        setIsUploadingHero(true);

        try {
            let finalUrl: string | null = null;
            let googlePhotoId: string | undefined;

            if (type === 'file') {
                const file = url as File;
                // Workflow #1: Use Google Photos if connected
                if (googleAccessToken) {
                    try {
                        const photosService = new GooglePhotosService(googleAccessToken);
                        const mediaItem = await photosService.uploadMedia(file, 'Family Archive Hero Image');
                        finalUrl = mediaItem.baseUrl || null;
                        googlePhotoId = mediaItem.id;
                    } catch (err) {
                        console.error('Google Photos hero upload failed, falling back to Supabase Storage:', err);
                    }
                }

                // Workflow #2: Fallback to Supabase Storage ONLY if Google Photos did not succeed
                if (!finalUrl) {
                    const { url: storageUrl } = await storageService.uploadFile(
                        file,
                        'album-assets',
                        `hero/${familyId}/${Date.now()}/`
                    );
                    if (storageUrl) finalUrl = storageUrl;
                }
            } else {
                finalUrl = url as string;
            }

            if (finalUrl) {
                setHeroImageUrl(finalUrl);
                // Also cache locally for instant display on next load
                localStorage.setItem(`family_hero_${familyId}`, finalUrl);

                // Persist to DB so it works across devices (Fix #1)
                await (supabase.from('family_settings' as any) as any).upsert({
                    family_id: familyId,
                    hero_image_url: finalUrl,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'family_id' });

                // Register in media library
                const { data: userData } = await supabase.auth.getUser();
                await (supabase.from('family_media') as any).insert({
                    family_id: familyId,
                    url: finalUrl,
                    type: 'image',
                    category: 'hero',
                    folder: 'Archive Settings',
                    filename: type === 'file' ? (url as File).name : 'hero_image.jpg',
                    size: type === 'file' ? (url as File).size : 0,
                    uploaded_by: userData.user?.id,
                    metadata: googlePhotoId ? { googlePhotoId } : undefined
                });
            } else {
                alert('Failed to update hero image.');
            }
        } catch (err) {
            console.error('Error uploading hero image:', err);
        } finally {
            setIsUploadingHero(false);
        }
    };

    const handleCropComplete = async (croppedImageUrl: string) => {
        setShowCropper(null);
        try {
            const response = await fetch(croppedImageUrl);
            const blob = await response.blob();
            const file = new File([blob], 'cropped_image.jpg', { type: 'image/jpeg' });

            if (activeTarget === 'hero') {
                await processHeroUpdate(file, 'file');
            } else if (activeTarget) {
                // Event Cover Update
                await processEventCoverUpdate(activeTarget, file, undefined, 'file');
            }
        } catch (e) {
            console.error("Crop processing failed", e);
        }
    };

    const handleSourceSelect = (source: 'upload' | 'library') => {
        setShowSourceModal(false);
        if (source === 'upload') {
            if (activeTarget === 'hero') {
                heroInputRef.current?.click();
            } else if (activeTarget) {
                activeEventIdRef.current = activeTarget;
                eventCoverInputRef.current?.click();
            }
        } else if (source === 'library') {
            setShowMediaPicker(true);
        }
    };

    const handleMediaPickerSelect = async (item: any) => {
        setShowMediaPicker(false);
        if (!item || !activeTarget) return;

        // Open cropper with the selected URL
        // Note: For Google Photos or external URLs without CORS, this might fail on the canvas step.
        // We rely on the user selecting internal library assets or proxyable URLs.
        setShowCropper({ src: item.url });
    };

    // Refactored Event Cover Update to shared function
    const processEventCoverUpdate = async (eventId: string, source: string | File, googleId?: string, type: 'file' | 'url' = 'file') => {
        let finalUrl: string | null = null;
        let googlePhotoId: string | undefined = googleId;

        if (type === 'file') {
            const file = source as File;
            setIsUpdatingCover(eventId);
            try {
                // Workflow #1: Upload to Google Photos if connected
                if (googleAccessToken) {
                    try {
                        const photosService = new GooglePhotosService(googleAccessToken);
                        const mediaItem = await photosService.uploadMedia(file, `Event Cover: ${eventId}`);
                        // Prioritize preserving the original ID
                        googlePhotoId = mediaItem.id;
                    } catch (err) {
                        console.error('Google Photos upload failed:', err);
                    }
                }

                // Workflow #2: Internal Storage
                const { url: storageUrl } = await storageService.uploadFile(
                    file,
                    'album-assets',
                    `events/${eventId}/cover/`
                );

                if (storageUrl) {
                    finalUrl = storageUrl;

                    // Log to media library
                    const { data: userData } = await supabase.auth.getUser();
                    await supabase.from('family_media').insert({
                        family_id: familyId,
                        url: finalUrl,
                        type: 'image',
                        category: 'event',
                        folder: 'Event Covers',
                        filename: file.name,
                        size: file.size,
                        uploaded_by: userData.user?.id,
                        metadata: googlePhotoId ? { googlePhotoId } : undefined
                    } as any);
                }
            } catch (e) {
                console.error("Event cover upload failed", e);
            } finally {
                setIsUpdatingCover(null);
            }
        } else {
            finalUrl = source as string;
        }

        if (finalUrl) {
            // Fetch current event to get latest content
            const { data: event } = await (supabase as any)
                .from('events')
                .select('content')
                .eq('id', eventId)
                .single();

            let content = (event as any)?.content || {};
            if (typeof content === 'string') {
                try { content = JSON.parse(content); } catch (e) { content = {}; }
            }

            const updatedContent = {
                ...content,
                presentationUrl: finalUrl,
                googlePhotoId: googlePhotoId || content.googlePhotoId
            };

            const { error: updateError } = await (supabase as any)
                .from('events')
                .update({ content: updatedContent })
                .eq('id', eventId)
                .select();

            if (updateError) throw updateError;

            // Update local state
            setRecentEvents((prev: any[]) => prev.map((ev: any) =>
                ev.id === eventId ? { ...ev, content: updatedContent } : ev
            ));
        }
    };

    // We will only show real profiles from the database

    const [isUpdatingCover, setIsUpdatingCover] = useState<string | null>(null);
    const eventCoverInputRef = useRef<HTMLInputElement>(null);
    const activeEventIdRef = useRef<string | null>(null);

    const handleUpdateEventCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        const eventId = activeEventIdRef.current;
        if (!file || !familyId || !eventId) return;

        // Show cropper for uploaded file too
        const reader = new FileReader();
        reader.onload = () => {
            setShowCropper({ src: reader.result as string });
        };
        reader.readAsDataURL(file);

        // Clear input so same file can be selected again
        e.target.value = '';
    };

    useEffect(() => {
        async function fetchData() {
            if (!familyId) {
                setLoading(false);
                return;
            }

            try {
                // Fetch recent events
                const { data: events } = await supabase
                    .from('events')
                    .select('*')
                    .eq('family_id', familyId)
                    .order('event_date', { ascending: false })
                    .limit(6);

                if (events) setRecentEvents(events);

                // Fetch recent albums
                const { data: albums } = await supabase
                    .from('albums')
                    .select(`
                        *,
                        pages (
                            id,
                            page_number,
                            template_id,
                            assets (
                                id,
                                url,
                                asset_type
                            )
                        )
                    `)
                    .eq('family_id', familyId)
                    .order('created_at', { ascending: false })


                if (albums) {
                    const formatted = (albums || []).map((album: any) => ({
                        ...album,
                        cover_url: album.cover_image_url,
                        pages: album.pages?.map((page: any) => ({
                            ...page,
                            layoutTemplate: page.template_id,
                            assets: page.assets?.map((asset: any) => ({
                                ...asset,
                                type: asset.asset_type
                            }))
                        })).sort((a: any, b: any) => a.page_number - b.page_number)
                    }));
                    setRecentAlbums(formatted);
                }

                // Fetch family members
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('family_id', familyId);

                if (profiles) setFamilyMembers(profiles);

            } catch (error) {
                console.error('Error fetching home data:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [familyId]);

    // Fix #4: Generate invite code instead of direct DB insert (which creates orphan rows)
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

    const handleGenerateInvite = async () => {
        if (!familyId) return;
        setIsGeneratingInvite(true);
        try {
            // Generate a short, readable invite code
            const code = `${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7); // 7-day validity

            const { error } = await (supabase.from('family_invites' as any) as any).insert({
                family_id: familyId,
                code,
                expires_at: expiresAt.toISOString(),
                created_by: (await supabase.auth.getUser()).data.user?.id,
            });

            if (error) throw error;
            setInviteCode(code);
        } catch (error) {
            console.error('Error generating invite:', error);
            alert('Failed to generate invite code. Please try again.');
        } finally {
            setIsGeneratingInvite(false);
        }
    };

    const displayMembers = familyMembers;

    if (loading || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!familyId) {
        return (
            <div className="space-y-12 pb-12">
                <section className="relative h-[40vh] bg-catalog-stone/20 flex flex-col items-center justify-center text-center p-8">
                    <h1 className="text-4xl md:text-5xl font-serif italic text-catalog-text mb-4">Welcome to Your Archive</h1>
                    <p className="text-lg text-catalog-text/60 max-w-xl">
                        To begin preserving your family's legacy, please join a family group using an invite code or create a new group.
                    </p>
                    <div className="mt-8">
                        <Link to="/settings">
                            <Button variant="primary" size="lg">
                                Get Started
                            </Button>
                        </Link>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-12">
            {/* 1. Hero Section */}
            <section className="relative h-[65vh] w-full overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/20 to-catalog-stone/5 z-10" />
                <img
                    src={heroImageUrl}
                    alt="Family Archive"
                    className="w-full h-full object-cover transition-transform duration-[3s] group-hover:scale-110"
                    style={{ imageRendering: '-webkit-optimize-contrast' }}
                />
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6 bg-black/5 backdrop-blur-[2px]">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 1 }}
                        className="space-y-6"
                    >
                        <h1 className="text-6xl md:text-9xl font-outfit font-black text-white mb-4 drop-shadow-2xl tracking-tighter uppercase leading-[0.8]">
                            The <span className="text-rainbow bg-clip-text text-transparent brightness-125">Family</span> <br />
                            <span className="opacity-90">Chronicle</span>
                        </h1>
                        <p className="text-sm md:text-base text-white/60 font-black uppercase tracking-[0.5em] max-w-2xl drop-shadow-md mx-auto">
                            The Living Legacy of {familyMembers[0]?.full_name?.split(' ').pop() || 'Our'} Ancestors
                        </p>
                    </motion.div>
                </div>

                {/* Admin Edit Hero Button */}
                {isAdmin && (
                    <>
                        <input
                            ref={heroInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleHeroImageChange}
                        />
                        <button
                            onClick={() => {
                                setActiveTarget('hero');
                                setShowSourceModal(true);
                            }}
                            disabled={isUploadingHero}
                            className="absolute bottom-10 right-10 z-30 flex items-center gap-3 px-6 py-3 glass hover:bg-white text-catalog-text rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-500 hover:scale-105 active:scale-95 border border-white/20"
                        >
                            {isUploadingHero ? (
                                <Loader2 className="w-5 h-5 animate-spin text-catalog-accent" />
                            ) : (
                                <Camera className="w-5 h-5 text-catalog-accent" />
                            )}
                            <span className="text-[10px] font-black uppercase tracking-widest leading-none">
                                {isUploadingHero ? 'Processing...' : 'Alter Reality'}
                            </span>
                        </button>
                    </>
                )}
            </section>

            <div className="container-fluid max-w-[1400px] mx-auto px-6 space-y-24">

                {/* 2. Highlights Section (Recent Events) */}
                <section className="space-y-10">
                    <div className="flex items-center justify-between border-b border-black/5 pb-8 relative">
                        <div className="space-y-2">
                            <h2 className="text-sm font-black text-catalog-accent uppercase tracking-[0.4em] font-outfit">Timeline Fragments</h2>
                            <p className="text-3xl md:text-5xl font-outfit font-black text-catalog-text tracking-tighter">Recent Highlights</p>
                        </div>
                        <Link to="/events" className="group flex items-center gap-4 bg-catalog-stone/10 px-6 py-3 rounded-2xl hover:bg-catalog-accent hover:text-white transition-all duration-500 hover:-translate-y-1 shadow-sm">
                            <span className="text-[10px] font-black uppercase tracking-widest">Chronicle Grid</span>
                            <div className="w-6 h-6 bg-catalog-accent group-hover:bg-white rounded-lg flex items-center justify-center transition-colors">
                                <Calendar className="w-3 h-3 text-white group-hover:text-catalog-accent" />
                            </div>
                        </Link>
                        <div className="absolute bottom-0 left-0 w-32 h-[2px] bg-catalog-accent" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-8">
                        <input
                            ref={eventCoverInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleUpdateEventCover}
                        />
                        {recentEvents.length > 0 ? (
                            recentEvents.map((event, idx) => {
                                const presentationImages = [
                                    'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
                                    'https://images.unsplash.com/photo-1526749837599-b4eba9fd855e?auto=format&fit=crop&w=800&q=80'
                                ];

                                const fallbackImage = presentationImages[event.id.charCodeAt(0) % presentationImages.length];

                                let content = event.content;
                                if (typeof content === 'string') {
                                    try { content = JSON.parse(content); } catch (e) { content = {}; }
                                }
                                const firstImg = content?.assets?.find((a: any) => a.type === 'image' || a.type === 'video');
                                const displayUrl = content?.presentationUrl || firstImg?.url || fallbackImage;

                                return (
                                    <motion.div
                                        key={event.id}
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                    >
                                        <Link to={`/event/${event.id}/view`} className="block h-full group/card relative">
                                            <Card className="h-full flex flex-col group p-0 overflow-hidden relative glass-card rounded-[2rem] border border-black/5 transition-all duration-[0.6s] hover:scale-105 hover:shadow-2xl hover:shadow-catalog-accent/10 active:scale-95">
                                                {/* Image Container */}
                                                <div className="aspect-[4/5] w-full bg-catalog-stone/10 overflow-hidden relative">
                                                    <img
                                                        src={displayUrl}
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 grayscale-[0.2] group-hover:grayscale-0"
                                                        alt={event.title}
                                                    />

                                                    {/* Category Chip */}
                                                    {event.category && (
                                                        <div className="absolute top-4 left-4 z-20">
                                                            <div className="glass px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest text-catalog-accent border border-white/20">
                                                                {event.category}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Admin Edit Overlay */}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                setActiveTarget(event.id);
                                                                setShowSourceModal(true);
                                                            }}
                                                            className="absolute top-4 right-4 p-2.5 glass rounded-xl shadow-lg opacity-0 group-hover/card:opacity-100 transition-all hover:scale-110 z-20 hover:bg-white"
                                                            title="Change Cover Image"
                                                        >
                                                            {isUpdatingCover === event.id ? (
                                                                <Loader2 className="w-3 h-3 animate-spin text-catalog-accent" />
                                                            ) : (
                                                                <Edit className="w-3 h-3 text-catalog-accent" />
                                                            )}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Content Overlay */}
                                                <div className="p-5 flex-1 flex flex-col space-y-3 bg-gradient-to-b from-white to-catalog-stone/5">
                                                    <h3 className="text-[11px] font-black font-outfit text-catalog-text group-hover:text-catalog-accent transition-colors line-clamp-2 leading-[1.3] uppercase tracking-wider">
                                                        {event.title}
                                                    </h3>

                                                    <div className="mt-auto pt-3 border-t border-black/5 space-y-2">
                                                        <div className="flex items-center gap-2 text-catalog-text/40 text-[9px] font-black uppercase tracking-[0.2em] font-outfit">
                                                            <Calendar className="w-3 h-3 text-catalog-accent/40" />
                                                            {new Date(event.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </div>

                                                        {event.location && (
                                                            <div className="flex items-center gap-2 text-catalog-text/30 text-[9px] font-medium truncate font-outfit italic">
                                                                <MapPin className="w-3 h-3 text-catalog-accent/20" />
                                                                {event.location}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Card>
                                        </Link>
                                    </motion.div>
                                );
                            })
                        ) : (
                            [1, 2, 3, 4, 5, 6].map(i => (
                                <Card key={i} className="aspect-[4/5] opacity-20 p-0 glass-card rounded-[2rem] border border-black/5">
                                    <div className="h-2/3 bg-catalog-stone/10 flex items-center justify-center">
                                        <ImageIcon className="w-8 h-8 text-catalog-text/10" />
                                    </div>
                                    <div className="p-5 space-y-3">
                                        <div className="h-2 w-full bg-catalog-stone/10 rounded-full" />
                                        <div className="h-2 w-2/3 bg-catalog-stone/10 rounded-full" />
                                    </div>
                                </Card>
                            ))
                        )}
                    </div>
                </section>

                {/* 3. Recent Albums */}
                {/* 3. Recent Albums - 3D Carousel */}
                <div className="home-carousel-wrapper">
                    <section className="section3">
                        <div className="container">
                            <h2 className="title">Latest Chapters</h2>
                            <div className="subtitle">From the Archives</div>

                            {recentAlbums.length > 0 ? (
                                <div className="loop-images">
                                    <div
                                        className="carousel-track"
                                        style={{
                                            '--total': recentAlbums.length,
                                            '--time': `${Math.max(20, recentAlbums.length * 5)}s`
                                        } as React.CSSProperties}
                                    >
                                        {recentAlbums.map((album, index) => {
                                            // Determine cover image
                                            let coverImage = album.cover_url;
                                            if (!coverImage && album.pages && album.pages.length > 0) {
                                                const firstImg = album.pages[0].assets?.find((a: any) => a.type === 'image');
                                                if (firstImg) coverImage = firstImg.url;
                                            }

                                            return (
                                                <div
                                                    key={`${album.id}-${index}`}
                                                    className="carousel-item"
                                                    style={{ '--i': index + 1 } as React.CSSProperties}
                                                    onClick={() => navigate(`/album/${album.id}`)}
                                                    title={album.title}
                                                >
                                                    <div className="carousel-3d-container">
                                                        <img
                                                            src={coverImage || 'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?auto=format&fit=crop&w=800&q=80'}
                                                            alt={album.title}
                                                        />
                                                        <h3 className="carousel-title">{album.title}</h3>
                                                        <p className="carousel-date">
                                                            {new Date(album.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                                                        </p>
                                                        {(album.location || (album.config && album.config.location)) && (
                                                            <div className="carousel-location" onClick={(e) => {
                                                                e.stopPropagation();
                                                                const loc = album.location || album.config.location;
                                                                navigate(`/map?location=${encodeURIComponent(loc)}`);
                                                            }}>
                                                                <MapPin size={10} />
                                                                {album.location || album.config.location}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="py-12 text-center text-white/50 italic text-2xl">
                                    Start your first album to see it here...
                                </div>
                            )}

                            {/* Features Grid from CSS */}
                            <div className="features">
                                <div className="feature" onClick={() => navigate('/library')}>
                                    <div className="feature-icon">📚</div>
                                    <h3>Library</h3>
                                    <p>Browse your complete collection of family memories organized by year.</p>
                                </div>
                                <div className="feature" onClick={() => navigate('/events')}>
                                    <div className="feature-icon">✨</div>
                                    <h3>Events</h3>
                                    <p>Interactive chronological view of every significant milestone.</p>
                                </div>
                                <div className="feature" onClick={() => setShowCreateAlbumModal(true)}>
                                    <div className="feature-icon">🎨</div>
                                    <h3>Create</h3>
                                    <p>Design beautiful new albums with our professional tools.</p>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                {/* 3.5 World Map Preview */}
                {familyId && (
                    <WorldMapPreview familyId={familyId} />
                )}

                {/* 4. Family Profiles */}
                <section className="space-y-6">
                    <div className="flex items-center justify-between border-b-2 border-rainbow pb-4">
                        <h2 className="text-3xl font-sans font-bold text-catalog-text">The Family</h2>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12 py-8">
                        {displayMembers.map((member: any) => (
                            <div key={member.id} className="group relative flex flex-col items-center gap-3">
                                <Link to={`/profile/${member.id}`} className="relative w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white shadow-lg transition-transform group-hover:scale-105 group-hover:border-catalog-accent/30 block">
                                    {member.avatar_url ? (
                                        <img src={member.avatar_url} alt={member.full_name || 'Family Member'} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-catalog-bg flex items-center justify-center text-catalog-accent/30">
                                            <User className="w-12 h-12" />
                                        </div>
                                    )}
                                </Link>
                                <span className="font-serif text-lg text-catalog-text font-medium">{member.full_name || 'Member'}</span>
                            </div>
                        ))}

                        {/* Add Member Button — Fix #8: admin only */}
                        {isAdmin && (
                            <button
                                onClick={() => { setShowAddModal(true); setInviteCode(null); }}
                                className="flex flex-col items-center gap-3 group"
                            >
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border-2 border-dashed border-catalog-accent/30 flex items-center justify-center text-catalog-accent/50 group-hover:border-catalog-accent group-hover:text-catalog-accent group-hover:bg-catalog-accent/5 transition-all">
                                    <Plus className="w-8 h-8" />
                                </div>
                                <span className="font-sans text-sm font-medium text-catalog-accent/70 uppercase tracking-wider group-hover:text-catalog-accent">Add Member</span>
                            </button>
                        )}
                    </div>
                </section>

                {/* Invite Member Modal — Fix #4 */}
                {showAddModal && (
                    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-catalog-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Plus className="w-7 h-7 text-catalog-accent" />
                                </div>
                                <h3 className="text-2xl font-outfit font-black text-catalog-text">Invite a Family Member</h3>
                                <p className="text-catalog-text/60 text-sm mt-2">
                                    Generate a secure invite code. Share it with the person you want to add — they'll use it when they sign up.
                                </p>
                            </div>

                            {!inviteCode ? (
                                <div className="space-y-4 pt-2">
                                    <button
                                        onClick={handleGenerateInvite}
                                        disabled={isGeneratingInvite}
                                        className="w-full py-3 bg-catalog-accent text-white font-outfit font-bold rounded-xl shadow-md hover:brightness-105 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {isGeneratingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                                        {isGeneratingInvite ? 'Generating...' : 'Generate Invite Code'}
                                    </button>
                                    <button onClick={() => setShowAddModal(false)} className="w-full py-2 text-catalog-text/50 hover:text-catalog-text text-sm transition-colors">Cancel</button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 bg-catalog-accent/5 border border-catalog-accent/20 rounded-xl text-center">
                                        <p className="text-xs font-bold uppercase tracking-widest text-catalog-accent/60 mb-2">Your Invite Code (valid 7 days)</p>
                                        <p className="text-3xl font-outfit font-black text-catalog-accent tracking-[0.3em]">{inviteCode}</p>
                                    </div>
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(inviteCode); alert('Invite code copied!'); }}
                                        className="w-full py-3 bg-catalog-accent text-white font-outfit font-bold rounded-xl shadow-md hover:brightness-105 transition-all"
                                    >
                                        Copy Code
                                    </button>
                                    <button onClick={() => { setShowAddModal(false); setInviteCode(null); }} className="w-full py-2 text-catalog-text/50 hover:text-catalog-text text-sm transition-colors">Done</button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Float Action Button for Create Album */}
            <button
                onClick={() => setShowCreateAlbumModal(true)}
                className="fixed bottom-8 right-8 z-40 bg-catalog-accent text-white p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all flex items-center gap-2 group"
                title="Create New Album"
            >
                <PlusCircle className="w-6 h-6" />
                <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-500 font-serif italic pr-2">
                    Start a New Chapter
                </span>
            </button>

            {/* Create Album Modal */}
            <CreateAlbumModal
                isOpen={showCreateAlbumModal}
                onClose={() => setShowCreateAlbumModal(false)}
            />
            {/* Image Cropper for Hero and Events */}
            {showCropper && (
                <ImageCropper
                    src={showCropper.src}
                    onCropComplete={handleCropComplete}
                    onCancel={() => {
                        setShowCropper(null);
                        if (heroInputRef.current) heroInputRef.current.value = '';
                        if (eventCoverInputRef.current) eventCoverInputRef.current.value = '';
                    }}
                />
            )}
            {/* Source Selection Modal */}
            {showSourceModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowSourceModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-serif italic text-catalog-text">Change Image</h3>
                            <button onClick={() => setShowSourceModal(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-2">
                            <button
                                onClick={() => handleSourceSelect('library')}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <FolderOpen className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Media Library</div>
                                    <div className="text-xs text-gray-500">Select from uploads</div>
                                </div>
                            </button>
                            <button
                                onClick={() => handleSourceSelect('upload')}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Upload className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Upload File</div>
                                    <div className="text-xs text-gray-500">From your computer</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )
            }

            {
                showMediaPicker && (
                    <MediaPickerModal
                        isOpen={showMediaPicker}
                        onClose={() => setShowMediaPicker(false)}
                        onSelect={handleMediaPickerSelect}
                        allowedTypes={['image']}
                    />
                )
            }
        </div >
    );
}
