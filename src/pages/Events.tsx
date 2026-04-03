// @locked - This file is locked. Do not edit unless requested to unlock.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, Plus, Loader2, Edit, MapPin, Image, Link as LinkIcon, Upload, FolderOpen } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { slugify } from '../lib/utils';

import { ActionToolbar } from '../components/ui/ActionToolbar';
import { SharingDialog } from '../components/sharing/SharingDialog';
import { FilterBar, type FilterState } from '../components/ui/FilterBar';
import { motion } from 'framer-motion';
import { storageService } from '../services/storage';
import { GooglePhotosSelector } from '../components/media/GooglePhotosSelector';
import type { GoogleMediaItem } from '../services/googlePhotos';
import { UrlInputModal } from '../components/media/UrlInputModal';
import { ImageCropper } from '../components/ui/ImageCropper';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import { useGooglePhotosUrl } from '../hooks/useGooglePhotosUrl';

function EventCard({
    event,
    index,
    isAdmin,
    navigate,
    setShowSourceModal,
    isUpdatingCover,
    linkedAlbumSlug,
    handleDeleteEvent,
    handleShareEvent,
    handlePrintEvent,
    handleCreateAlbum,
    creatingAlbumFor
}: any) {
    let currentContent: any = event.content;
    if (typeof currentContent === 'string') {
        try { currentContent = JSON.parse(currentContent); } catch (e) { currentContent = {}; }
    }

    const assets = currentContent?.assets || [];
    let initialImage = currentContent?.presentationUrl || assets.find((a: any) => a.type === 'image')?.url;
    let googlePhotoId = currentContent?.googlePhotoId || assets.find((a: any) => a.type === 'image')?.googlePhotoId;

    if (!initialImage && event.description) {
        const imgMatch = event.description.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch) {
            initialImage = imgMatch[1];
            const idMatch = event.description.match(/data-google-id="([^"]+)"/);
            if (idMatch) googlePhotoId = idMatch[1];
        }
    }

    const fallbacks = [
        'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1526749837599-b4eba9fd855e?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1516733725897-1aa73b87c8e8?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1582234372722-50d7ccc30ebd?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1473625247510-8ceb1760943f?auto=format&fit=crop&w=800&q=80'
    ];
    const fallbackImage = fallbacks[event.id.charCodeAt(0) % fallbacks.length];

    const { url: resolvedUrl } = useGooglePhotosUrl(googlePhotoId, initialImage || fallbackImage);


    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className="h-full"
        >
            <div className="group relative glass-card rounded-[2.5rem] border border-black/5 flex flex-col h-full hover:shadow-2xl hover:shadow-catalog-accent/10 transition-all duration-500 hover:-translate-y-2 overflow-hidden">

                {/* Media Section */}
                <div
                    className="relative h-64 overflow-hidden cursor-pointer"
                    onClick={() => navigate(`/event/${event.id}/view`)}
                >
                    <motion.div
                        className="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                        style={{ backgroundImage: `url(${resolvedUrl || initialImage || fallbackImage})` }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                    {/* Category Badge */}
                    {event.category && (
                        <div className="absolute top-6 right-6 px-4 py-1.5 glass rounded-full text-[9px] font-black text-white uppercase tracking-widest border border-white/20 whitespace-nowrap">
                            {event.category}
                        </div>
                    )}

                    {/* Edit Overlay */}
                    {isAdmin && (
                        <div className="absolute top-6 left-6 opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                            <button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowSourceModal(event.id);
                                }}
                                className="p-3 bg-white text-catalog-accent rounded-full shadow-2xl hover:bg-catalog-accent hover:text-white transition-all border border-black/5"
                            >
                                {isUpdatingCover === event.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Edit className="w-4 h-4" />
                                )}
                            </button>
                        </div>
                    )}
                </div>

                {/* Content Section */}
                <div className="flex-1 flex flex-col p-8 pt-6 relative">
                    <div className="flex-1">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="px-3 py-1 bg-black/5 rounded-lg text-[9px] font-black text-catalog-text/50 uppercase tracking-widest font-outfit">
                                {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>
                        <h3 className="text-xl font-serif italic text-catalog-text mb-3 group-hover:text-catalog-accent transition-colors line-clamp-1">{event.title}</h3>
                        {event.location && (
                            <div className="flex items-center gap-2 text-catalog-text/40 text-[10px] font-black uppercase tracking-widest mb-4">
                                <MapPin className="w-3.5 h-3.5 text-catalog-accent" />
                                {event.location}
                            </div>
                        )}
                        <div
                            className="text-catalog-text/60 text-sm line-clamp-3 font-serif leading-relaxed mb-6"
                            dangerouslySetInnerHTML={{ __html: event.description?.replace(/<[^>]+>/g, ' ').substring(0, 150) || '' }}
                        />
                    </div>

                    {/* Actions Area */}
                    <div className="mt-auto flex items-center justify-between pt-6 border-t border-black/5">
                        <div className="flex items-center gap-2">
                            {linkedAlbumSlug ? (
                                <button
                                    onClick={() => navigate(`/album/${linkedAlbumSlug}`)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-catalog-text text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-catalog-accent transition-all shadow-lg shadow-black/10 active:scale-95"
                                >
                                    Archive
                                </button>
                            ) : (
                                (isAdmin || true) && ( // Basic creator check would go here
                                    <button
                                        onClick={() => handleCreateAlbum(event)}
                                        disabled={creatingAlbumFor === event.id}
                                        className="flex items-center gap-2 px-5 py-2.5 glass rounded-2xl text-[10px] font-black text-catalog-text/40 hover:text-catalog-accent uppercase tracking-widest border border-black/5 transition-all active:scale-95"
                                    >
                                        {creatingAlbumFor === event.id ? "Drafting..." : "Bind Album"}
                                    </button>
                                )
                            )}
                        </div>

                        <div className="flex items-center gap-1">
                            <ActionToolbar
                                onEdit={isAdmin ? () => navigate(`/event/${event.id}/edit`) : undefined}
                                onDelete={isAdmin ? () => handleDeleteEvent(event.id) : undefined}
                                onShare={() => handleShareEvent(event.id)}
                                onPrint={() => handlePrintEvent(event)}
                                className="bg-transparent shadow-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export function Events() {
    const { familyId, userRole, googleAccessToken, signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const [events, setEvents] = useState<any[]>([]);
    const [linkedAlbums, setLinkedAlbums] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [creatingAlbumFor, setCreatingAlbumFor] = useState<string | null>(null);
    const [sharingEventId, setSharingEventId] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>({ query: '', category: 'all', year: 'all', location: 'all' });
    const [categories, setCategories] = useState<string[]>([]);
    const [years, setYears] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);


    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const [isUpdatingCover, setIsUpdatingCover] = useState<string | null>(null);
    const eventCoverInputRef = useRef<HTMLInputElement>(null);
    const activeEventIdRef = useRef<string | null>(null);

    const [showSourceModal, setShowSourceModal] = useState<string | null>(null);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showGooglePhotos, setShowGooglePhotos] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [showCropper, setShowCropper] = useState<{ src: string } | null>(null);

    const handleSourceSelect = (source: 'upload' | 'google' | 'url' | 'library') => {
        const eventId = showSourceModal;
        if (!eventId) return;

        setShowSourceModal(null);
        activeEventIdRef.current = eventId;

        if (source === 'upload') {
            eventCoverInputRef.current?.click();
        } else if (source === 'google') {
            if (!googleAccessToken) {
                if (confirm('Sign in with Google to browse your Photos library?')) {
                    signInWithGoogle();
                }
                return;
            }
            setShowGooglePhotos(true);
        } else if (source === 'url') {
            setShowUrlInput(true);
        } else if (source === 'library') {
            setShowMediaPicker(true);
        }
    };

    const handleUrlSubmit = async (url: string) => {
        const eventId = activeEventIdRef.current;
        if (!eventId || !url) return;
        setShowUrlInput(false);
        await processCoverUpdate(eventId, url, undefined, 'url');
    };

    const handleGooglePhotosSelect = async (items: GoogleMediaItem[]) => {
        const eventId = activeEventIdRef.current;
        if (!eventId || items.length === 0) return;
        setShowGooglePhotos(false);
        const item = items[0];
        // Pass the whole item so we can use persistGoogleMedia
        await processCoverUpdate(eventId, item, item.id, 'google');
    };

    const handleMediaPickerSelect = async (item: any) => {
        setShowMediaPicker(false);
        if (!item || !activeEventIdRef.current) return;
        setShowCropper({ src: item.url });
    };

    const handleCropComplete = async (croppedImageUrl: string) => {
        const eventId = activeEventIdRef.current;
        if (!eventId) return;
        setShowCropper(null);
        try {
            const response = await fetch(croppedImageUrl);
            const blob = await response.blob();
            const file = new File([blob], 'cropped_cover.jpg', { type: 'image/jpeg' });
            await processCoverUpdate(eventId, file, undefined, 'file');
        } catch (e) {
            console.error("Crop processing failed", e);
        }
    };

    const processCoverUpdate = async (eventId: string, sourceUrlOrFile: string | File | any, googleId?: string, type: 'file' | 'url' | 'google' = 'file') => {
        if (!familyId) return;
        setIsUpdatingCover(eventId);

        try {
            let finalUrl: string | null = null;
            let googlePhotoId: string | undefined = googleId;
            let mediaType: 'image' | 'video' = 'image';

            if (type === 'file') {
                const file = sourceUrlOrFile as File;
                mediaType = file.type.startsWith('video/') ? 'video' : 'image';
                const { url: storageUrl, googlePhotoId: storagePhotoId } = await storageService.uploadFile(file, 'album-assets', `events/${eventId}/cover/`, undefined, googleAccessToken);
                if (storageUrl) finalUrl = storageUrl;
                if (storagePhotoId) googlePhotoId = storagePhotoId;
            } else if (type === 'url') {
                finalUrl = sourceUrlOrFile as string;
                mediaType = finalUrl.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i) ? 'video' : 'image';
            } else if (type === 'google') {
                const item = sourceUrlOrFile;
                try {
                    if (googleAccessToken) {
                        const { url: persistentUrl, googlePhotoId: persistentId, type: persistentType } = await storageService.persistGoogleMedia(item, googleAccessToken, familyId, 'Events');
                        finalUrl = persistentUrl;
                        googlePhotoId = persistentId;
                        mediaType = persistentType;
                    } else {
                        finalUrl = item.baseUrl || item.url || '';
                        mediaType = (item.mediaMetadata?.video || item.type === 'VIDEO') ? 'video' : 'image';
                    }
                } catch (err) {
                    console.error('Failed to process Google Photo:', err);
                    finalUrl = item.baseUrl || item.url || '';
                }
            }

            if (finalUrl) {
                const { data: eventData } = await (supabase as any)
                    .from('events')
                    .select('content, title')
                    .eq('id', eventId)
                    .single();

                let content = (eventData as any)?.content || {};
                if (typeof content === 'string') {
                    try { content = JSON.parse(content); } catch (e) { content = {}; }
                }

                const updatedContent = {
                    ...content,
                    presentationUrl: finalUrl,
                    googlePhotoId: googlePhotoId || content.googlePhotoId
                };

                const { error: updateError } = await (supabase.from('events') as any)
                    .update({ content: updatedContent })
                    .eq('id', eventId);

                if (updateError) throw updateError;

                setEvents((prev: any[]) => prev.map((ev: any) =>
                    ev.id === eventId ? ({ ...ev, content: updatedContent }) : ev
                ));

                const { data: userData } = await supabase.auth.getUser();
                await supabase.from('family_media').insert({
                    family_id: familyId,
                    url: finalUrl,
                    type: mediaType,
                    category: 'event',
                    folder: (eventData as any)?.title ? `Events/${(eventData as any).title}` : 'Events',
                    filename: type === 'file' ? (sourceUrlOrFile as File).name : 'imported_cover.jpg',
                    size: 0,
                    uploaded_by: userData.user?.id,
                    metadata: googlePhotoId ? { googlePhotoId } : undefined
                } as any);
            }
        } catch (err: any) {
            console.error('Error updating cover:', err);
            alert(`Failed: ${err.message}`);
        } finally {
            setIsUpdatingCover(null);
            activeEventIdRef.current = null;
        }
    };

    const handleUpdateEventCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setShowCropper({ src: reader.result as string });
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    useEffect(() => {
        if (familyId) fetchEventsAndAlbums();
    }, [familyId]);

    const fetchEventsAndAlbums = async () => {
        if (!familyId) {
            setLoading(false);
            return;
        }
        try {
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('*')
                .eq('family_id', familyId)
                .order('event_date', { ascending: false });

            if (eventsError) throw eventsError;
            const fetchedEvents = (eventsData || []) as any[];
            setEvents(fetchedEvents);

            const { data: albumsData } = await supabase
                .from('albums')
                .select('id, event_id, title')
                .eq('family_id', familyId)
                .not('event_id', 'is', null);

            const albumMap: Record<string, string> = {};
            if (albumsData) {
                (albumsData as any[]).forEach(album => {
                    if (album.event_id) albumMap[album.event_id] = slugify(album.title);
                });
            }
            setLinkedAlbums(albumMap);

            const cats = Array.from(new Set(fetchedEvents.map(e => e.category).filter(Boolean))) as string[];
            const yrs = Array.from(new Set(fetchedEvents.map(e => new Date(e.event_date).getFullYear().toString()))) as string[];
            const locs = Array.from(new Set(fetchedEvents.map(e => e.location).filter(Boolean))) as string[];

            setCategories(cats.sort());
            setYears(yrs.sort((a, b) => b.localeCompare(a)));
            setLocations(locs.sort());
        } catch (error) {
            console.error('Fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            const { error } = await supabase.from('events').delete().eq('id', id);
            if (error) throw error;
            setEvents(prev => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    const handleShareEvent = (id: string) => setSharingEventId(id);

    const handlePrintEvent = (event: any) => {
        const doc = new Blob([`<html><body><h1>${event.title}</h1><p>${event.description}</p></body></html>`], { type: 'text/html' });
        const url = URL.createObjectURL(doc);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${event.title}.html`;
        a.click();
    };

    const handleCreateAlbum = async (event: any) => {
        if (!familyId || creatingAlbumFor) return;
        setCreatingAlbumFor(event.id);
        try {
            const { error } = await supabase.from('albums').insert({
                family_id: familyId,
                event_id: event.id,
                title: event.title,
                description: event.description,
                category: event.category,
                is_published: false
            } as any).select().single();
            if (error) throw error;
            navigate(`/album/${slugify(event.title)}/edit`);
        } catch (error) {
            console.error('Create album error:', error);
            setCreatingAlbumFor(null);
        }
    };

    const filteredEvents = events.filter(event => {
        const matchesQuery = !filters.query || event.title.toLowerCase().includes(filters.query.toLowerCase());
        const matchesCategory = filters.category === 'all' || event.category === filters.category;
        const matchesYear = filters.year === 'all' || new Date(event.event_date).getFullYear().toString() === filters.year;
        const matchesLocation = filters.location === 'all' || event.location === filters.location;
        return matchesQuery && matchesCategory && matchesYear && matchesLocation;
    });

    const groupedEvents = filteredEvents.reduce((groups: Record<string, any[]>, event) => {
        const year = new Date(event.event_date).getFullYear().toString();
        if (!groups[year]) groups[year] = [];
        groups[year].push(event);
        return groups;
    }, {});

    const sortedYears = Object.keys(groupedEvents).sort((a, b) => b.localeCompare(a));

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const canCreate = userRole === 'admin' || userRole === 'creator';

    return (
        <div className="min-h-screen bg-catalog-stone/5 font-inter px-6 lg:px-12 pb-20">
            <input ref={eventCoverInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpdateEventCover} />

            <section className="relative pt-24 pb-16 px-6 lg:px-12 overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-catalog-accent/5 to-transparent pointer-events-none" />
                <div className="relative z-10 max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-10">
                    <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
                        <h1 className="text-8xl md:text-9xl font-outfit font-black text-catalog-text mb-6 tracking-tighter filter blur-[0.5px]">
                            The <span className="text-catalog-accent italic font-serif opacity-90">Archive</span>
                        </h1>
                        <p className="text-xl md:text-2xl font-light text-catalog-text/50 max-w-2xl leading-relaxed uppercase tracking-widest font-outfit">
                            A chronological journey through the <span className="text-catalog-text/80 font-black">moments</span> that define your family's legacy.
                        </p>
                    </motion.div>

                    <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="glass p-2 rounded-[2rem] shadow-2xl border border-white/40 flex items-center gap-2">
                            <FilterBar filters={filters} onFilterChange={setFilters} categories={categories} years={years} locations={locations} className="border-none bg-transparent shadow-none" />
                            {canCreate && (
                                <Button variant="primary" onClick={() => navigate('/event/new')} className="bg-catalog-accent text-white rounded-full px-8 h-12 font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-105 transition-all flex items-center gap-3 shrink-0">
                                    <Plus className="w-4 h-4" />
                                    Archive Moment
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {events.length === 0 ? (
                <div className="text-center py-20 bg-white/30 rounded-lg border border-catalog-accent/5">
                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar className="w-8 h-8 text-catalog-accent" />
                    </div>
                    <h3 className="text-2xl font-serif mb-3 text-catalog-text">Your Timeline is Empty</h3>
                    {canCreate && <Button variant="secondary" onClick={() => navigate('/event/new')}>Begin the Journey</Button>}
                </div>
            ) : (
                <div className="relative space-y-16">
                    <div className="absolute left-[20px] top-0 bottom-0 w-px bg-gradient-to-b from-catalog-accent/40 via-catalog-accent/20 to-transparent hidden md:block" />
                    {sortedYears.map((year, yearIndex) => {
                        const YEAR_COLORS = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];
                        const yearColor = YEAR_COLORS[yearIndex % YEAR_COLORS.length];

                        return (
                            <div key={year} className="relative space-y-8">
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-serif italic shadow-lg" style={{ backgroundColor: yearColor }}>
                                        {year.slice(-2)}
                                    </div>
                                    <h2 className="text-3xl font-serif italic text-catalog-text">{year}</h2>
                                    <div className="flex-1 h-px bg-catalog-accent/10" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-8 md:pl-14">
                                    {groupedEvents[year].map((event, index) => (
                                        <EventCard
                                            key={event.id}
                                            event={event}
                                            index={index}
                                            isAdmin={isAdmin}
                                            navigate={navigate}
                                            setShowSourceModal={setShowSourceModal}
                                            isUpdatingCover={isUpdatingCover}
                                            linkedAlbumSlug={linkedAlbums[event.id]}
                                            handleDeleteEvent={handleDeleteEvent}
                                            handleShareEvent={handleShareEvent}
                                            handlePrintEvent={handlePrintEvent}
                                            handleCreateAlbum={handleCreateAlbum}
                                            creatingAlbumFor={creatingAlbumFor}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {sharingEventId && (
                <SharingDialog
                    eventId={sharingEventId}
                    title={events.find(e => e.id === sharingEventId)?.title || 'Event'}
                    onClose={() => setSharingEventId(null)}
                />
            )}

            {showSourceModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowSourceModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-serif italic text-catalog-text">Update Moment Cover</h3>
                            <button onClick={() => setShowSourceModal(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                <Plus className="w-5 h-5 rotate-45" />
                            </button>
                        </div>
                        <div className="p-2">
                            {[
                                { id: 'upload', icon: Upload, title: 'Upload File', desc: 'From your computer', color: 'blue' },
                                { id: 'library', icon: FolderOpen, title: 'Media Library', desc: 'Select from uploads', color: 'emerald' },
                                { id: 'google', icon: Image, title: 'Google Photos', desc: 'Import from your library', color: 'amber' },
                                { id: 'url', icon: LinkIcon, title: 'Image Link', desc: 'Paste a direct URL', color: 'purple' }
                            ].map(item => (
                                <button key={item.id} onClick={() => handleSourceSelect(item.id as any)} className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group">
                                    <div className={`w-10 h-10 rounded-full bg-${item.color}-50 text-${item.color}-600 flex items-center justify-center group-hover:scale-110 transition-transform`}>
                                        <item.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 text-sm">{item.title}</div>
                                        <div className="text-xs text-gray-500">{item.desc}</div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {showGooglePhotos && (
                <GooglePhotosSelector
                    isOpen={showGooglePhotos}
                    onClose={() => setShowGooglePhotos(false)}
                    onSelect={handleGooglePhotosSelect}
                    folders={['Events']}
                    googleAccessToken={googleAccessToken || ''}
                    onReauth={signInWithGoogle}
                />
            )}

            {showUrlInput && (
                <UrlInputModal
                    isOpen={showUrlInput}
                    onClose={() => setShowUrlInput(false)}
                    onSubmit={handleUrlSubmit}
                />
            )}

            {showMediaPicker && (
                <MediaPickerModal
                    isOpen={showMediaPicker}
                    onClose={() => setShowMediaPicker(false)}
                    onSelect={handleMediaPickerSelect}
                    allowedTypes={['image']}
                />
            )}

            {showCropper && (
                <ImageCropper
                    src={showCropper.src}
                    onCropComplete={handleCropComplete}
                    onCancel={() => setShowCropper(null)}
                    initialAspectRatio={16 / 9}
                />
            )}
        </div>
    );
}
