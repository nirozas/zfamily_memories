// @locked - This file is locked. Do not edit unless requested to unlock.
import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Save, Sparkles, ImagePlus, Tag, Users, Layout, Sliders, Plus, Undo, Redo } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GooglePhotosService } from '../services/googlePhotos';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Camera, Image as ImageIcon, Link as LinkIcon, Upload, FolderOpen } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { GooglePhotosSelector } from '../components/media/GooglePhotosSelector';
import type { GoogleMediaItem } from '../services/googlePhotos';
import { UrlInputModal } from '../components/media/UrlInputModal';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import { RichTextEditor } from '../components/events/RichTextEditor';
import type { RichTextEditorRef } from '../components/events/RichTextEditor';
import { storageService } from '../services/storage';
import type { Event } from '../types/supabase';
import { HashtagInput } from '../components/ui/HashtagInput'; // ui component
import { ImageCropper } from '../components/ui/ImageCropper';
import { LocationPicker } from '../components/ui/LocationPicker';


import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableAsset } from '../components/ui/SortableAsset';

import { videoCompressionService } from '../services/videoCompression';
import { Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function EventEditor() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { familyId, googleAccessToken } = useAuth();
    const editorRef = useRef<RichTextEditorRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [compressionProgress, setCompressionProgress] = useState<number | null>(null);

    const [eventData, setEventData] = useState<Partial<Event>>({
        title: '',
        description: '',
        event_date: new Date().toISOString().split('T')[0],
        location: '',
        category: '',
        hashtags: [],
        participants: [],
        geotag: null,
        content: { assets: [], galleryMode: 'cards' }
    });

    const [croppingImage, setCroppingImage] = useState<{ src: string, file: File, target: 'story' | 'gallery' } | null>(null);
    const [uploadTarget, setUploadTarget] = useState<'story' | 'gallery'>('story');

    // Source Selection State
    const [showSourceModal, setShowSourceModal] = useState<'story' | 'gallery' | null>(null);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showGooglePhotos, setShowGooglePhotos] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Timeline/History State
    const [history, setHistory] = useState<Partial<Event>[]>([]);
    const [redoStack, setRedoStack] = useState<Partial<Event>[]>([]);

    function updateEventData(newData: Partial<Event> | ((prev: Partial<Event>) => Partial<Event>)) {
        setEventData(prev => {
            const resolved = typeof newData === 'function' ? newData(prev) : newData;
            if (prev !== resolved) {
                setHistory(h => [...h.slice(-19), prev]); // Keep last 20 states
                setRedoStack([]);
            }
            return resolved;
        });
    }

    function undo() {
        setHistory(h => {
            if (h.length === 0) return h;
            const previous = h[h.length - 1];
            setEventData(current => {
                setRedoStack(r => [...r, current]);
                return previous;
            });
            return h.slice(0, -1);
        });
    }

    function redo() {
        setRedoStack(r => {
            if (r.length === 0) return r;
            const next = r[r.length - 1];
            setEventData(current => {
                setHistory(h => [...h, current]);
                return next;
            });
            return r.slice(0, -1);
        });
    }

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const isMod = e.ctrlKey || e.metaKey;

            if (isMod && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
            if (isMod && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [history, redoStack]);

    function handleDragEnd(event: any) {
        const { active, over } = event;

        if (active.id !== over.id) {
            updateEventData((currentData) => {
                const assets = currentData.content?.assets || [];
                const oldIndex = assets.findIndex((asset: { url: string }) => asset.url === active.id);
                const newIndex = assets.findIndex((asset: { url: string }) => asset.url === over.id);

                const newAssets = arrayMove(assets, oldIndex, newIndex);
                return { ...currentData, content: { ...currentData.content, assets: newAssets } };
            });
        }
    }

    // --- Media Handling Helpers ---
    const handleSourceSelect = (source: 'upload' | 'google' | 'url' | 'library') => {
        setShowSourceModal(null);
        if (source === 'upload') {
            fileInputRef.current?.click();
        } else if (source === 'google') {
            setShowGooglePhotos(true);
        } else if (source === 'url') {
            setShowUrlInput(true);
        } else if (source === 'library') {
            setShowMediaPicker(true);
        }
    };

    const handleUrlSubmit = async (url: string) => {
        setShowUrlInput(false);
        await processRemoteAsset(url, undefined, 'url');
    };

    const handleGooglePhotosSelect = async (items: GoogleMediaItem[]) => {
        setShowGooglePhotos(false);
        if (items.length === 0) return;

        // Process sequentially
        for (const item of items) {
            const url = item.mediaFile?.baseUrl || item.baseUrl || '';
            await processRemoteAsset(url, item.id, 'google');
        }
    };

    const handleMediaPickerSelect = async (item: any) => {
        setShowMediaPicker(false);
        if (!item) return;

        // If video, we might want to check type. For now assuming item.url is valid.
        // We pass 'library' as source so we don't try to re-upload it.
        await processRemoteAsset(item.url, undefined, 'library');
    };

    const processRemoteAsset = async (url: string, googleId?: string, source: 'url' | 'google' | 'library' = 'url') => {
        if (!url) return;
        setUploading(true);
        try {
            let finalUrl = url;
            let finalGoogleId = googleId;

            // Try to persist to storage (mirrors Events.tsx logic)
            try {
                if (googleAccessToken && source === 'google') {
                    const photosService = new GooglePhotosService(googleAccessToken);
                    const blob = await photosService.downloadMediaItem(url);
                    const file = new File([blob], `google_import_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    const { url: storageUrl } = await storageService.uploadFile(file, 'event-assets', `events/${eventData.title}/`);
                    if (storageUrl) finalUrl = storageUrl;
                }
            } catch (e) {
                console.error("Failed to persist remote asset, using direct link", e);
            }

            // Log to family_media
            if (familyId && finalUrl && source !== 'library') {
                const { data: userData } = await supabase.auth.getUser();
                await supabase.from('family_media').insert({
                    family_id: familyId,
                    url: finalUrl,
                    type: 'image',
                    category: 'event',
                    folder: eventData.title || 'Events',
                    filename: googleId ? `google_import_${Date.now()}.jpg` : `imported_${Date.now()}.jpg`,
                    size: 0,
                    uploaded_by: userData.user?.id,
                    metadata: finalGoogleId ? { googlePhotoId: finalGoogleId } : undefined
                } as any);
            }

            // Add to UI
            if (uploadTarget === 'story') {
                editorRef.current?.insertImage(finalUrl);
            } else {
                const newAsset = { url: finalUrl, type: 'image', googlePhotoId: finalGoogleId }; // Assume image for simplicity
                // Use functional update to ensure fresh state
                setEventData(prev => {
                    const currentAssets = prev.content?.assets || [];
                    return { ...prev, content: { ...prev.content, assets: [...currentAssets, newAsset] } };
                });
            }

        } catch (err) {
            console.error(err);
            alert("Failed to add media");
        } finally {
            setUploading(false);
        }
    };


    const isNew = !id || id === 'new';

    useEffect(() => {
        if (!isNew && id) {
            fetchEvent(id);
        } else {
            setLoading(false);
        }
    }, [id, isNew]);

    const fetchEvent = async (eventId: string) => {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('id', eventId)
                .single();

            if (error) {
                throw error;
            }
            if (data) {
                const fetchedEvent = data as Event;
                setEventData({
                    ...fetchedEvent,
                    content: fetchedEvent.content || { assets: [], galleryMode: 'cards' }
                });
            }
        } catch (error) {
            console.error('Error fetching event:', error);
            alert('Failed to load moment');
            navigate('/events');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!familyId || !eventData.title || !eventData.event_date) {
            alert('Please fill in required fields (Title and Date)');
            return;
        }

        setIsSaving(true);
        try {
            // Extract coordinates from geotag for database columns
            let latitude = null;
            let longitude = null;
            if (eventData.geotag && typeof eventData.geotag === 'object') {
                latitude = eventData.geotag.lat ?? null;
                longitude = eventData.geotag.lng ?? null;
            }

            const payload = {
                family_id: familyId,
                title: eventData.title,
                description: eventData.description,
                event_date: eventData.event_date,
                location: eventData.location,
                category: eventData.category,
                hashtags: eventData.hashtags || [],
                participants: eventData.participants || [],
                geotag: eventData.geotag || null,
                latitude,  // Store as separate column for map queries
                longitude, // Store as separate column for map queries
                content: eventData.content || { assets: [], galleryMode: 'cards' },
            };

            if (isNew) {
                const { error } = await (supabase.from('events') as any)
                    .insert(payload as any);
                if (error) throw error;
            } else {
                const { error } = await (supabase.from('events') as any)
                    .update(payload as any)
                    .eq('id', id as string);
                if (error) throw error;
            }
            navigate('/events');
        } catch (error: any) {
            console.error('Error saving event:', error);
            alert(`Failed to save moment: ${error.message || 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // ... (rest of component rendering) ...

    return (
        <div className="min-h-screen bg-catalog-stone/5 flex flex-col animate-in fade-in duration-700 font-inter">
            {/* Top Bar Decorative Rainbow Line */}
            <div className="h-1 bg-rainbow w-full fixed top-0 z-[60] opacity-80" />

            {/* Top Bar */}
            <header className="h-20 glass border-b border-black/5 flex items-center justify-between px-8 sticky top-1 z-50 shadow-2xl shadow-black/5">
                <div className="flex items-center gap-6">
                    <Link to="/events" className="p-3 hover:bg-black/5 rounded-2xl transition-all text-catalog-text/40 hover:text-catalog-accent active:scale-95 group">
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                    </Link>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-catalog-text/30 mb-0.5">Moment Studio</p>
                        <h1 className="font-outfit font-black text-xl text-catalog-text">
                            {isNew ? 'New Chronicle' : eventData.title}
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 glass rounded-2xl p-1 border border-black/5 mr-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={history.length === 0}
                            onClick={undo}
                            className="h-9 w-9 p-0 rounded-xl hover:bg-black/5 disabled:opacity-20"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={redoStack.length === 0}
                            onClick={redo}
                            className="h-9 w-9 p-0 rounded-xl hover:bg-black/5 disabled:opacity-20"
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo className="w-4 h-4" />
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        onClick={() => navigate('/events')}
                        className="font-black uppercase tracking-widest text-[10px] text-catalog-text/40 hover:text-red-500 rounded-xl"
                    >
                        Discard
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        isLoading={isSaving}
                        disabled={uploading || isSaving}
                        className="bg-catalog-accent text-white rounded-2xl px-8 h-12 font-black uppercase tracking-widest text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                        <Save className="w-4 h-4" />
                        {isNew ? 'Archive Story' : 'Preserve Changes'}
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-auto bg-grid-pattern">
                <div className="max-w-[1600px] mx-auto p-10 pb-32">
                    <div className="flex flex-col xl:flex-row gap-12 items-start">
                        {/* Left: Metadata Sidebar */}
                        <aside className="w-full xl:w-[400px] space-y-8 sticky top-24">
                            <Card className="p-8 space-y-8 glass-card rounded-[2.5rem] border border-black/5 shadow-2xl shadow-black/5 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-5">
                                    <Sliders className="w-24 h-24 text-catalog-accent" />
                                </div>

                                <h2 className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.3em] flex items-center gap-3">
                                    <div className="p-2 bg-catalog-accent/10 rounded-lg">
                                        <Sparkles className="w-4 h-4 text-catalog-accent" />
                                    </div>
                                    Archive Meta
                                </h2>

                                <div className="space-y-6 relative z-10">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1">Chronicle Title</label>
                                        <Input
                                            value={eventData.title}
                                            onChange={(e) => updateEventData({ ...eventData, title: e.target.value })}
                                            required
                                            className="font-outfit font-black text-xl bg-black/5 border-transparent focus:bg-white focus:border-catalog-accent/30 rounded-2xl transition-all h-14"
                                            placeholder="The Sun-Kissed Wedding..."
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1">Origin Date</label>
                                            <input
                                                type="date"
                                                value={eventData.event_date}
                                                onChange={(e) => updateEventData({ ...eventData, event_date: e.target.value })}
                                                required
                                                className="w-full h-14 bg-black/5 border-transparent rounded-2xl px-4 text-sm font-black uppercase tracking-widest text-catalog-text/60 focus:bg-white focus:ring-4 focus:ring-catalog-accent/10 transition-all cursor-pointer"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1">Archetype</label>
                                            <Input
                                                value={eventData.category || ''}
                                                onChange={(e) => updateEventData({ ...eventData, category: e.target.value })}
                                                placeholder="Tradition..."
                                                className="h-14 bg-black/5 border-transparent rounded-2xl font-black uppercase tracking-widest text-[11px] focus:bg-white transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1">Coordinate Registry</label>
                                        <LocationPicker
                                            value={eventData.location || ''}
                                            onChange={(address, lat, lng) => {
                                                updateEventData({
                                                    ...eventData,
                                                    location: address,
                                                    geotag: lat && lng ? { lat, lng } : null
                                                });
                                            }}
                                            className="bg-black/5 rounded-2xl border-transparent h-14"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1 flex items-center gap-2">
                                            <Users className="w-3.5 h-3.5" /> Ancestors & Bloodline
                                        </label>
                                        <HashtagInput
                                            tags={eventData.participants || []}
                                            onChange={(tags) => updateEventData({ ...eventData, participants: tags })}
                                            placeholder="Tag family..."
                                            suggestions={['Father', 'Mother', 'Grandfather', 'Grandmother', 'Son', 'Daughter']}
                                            className="bg-black/5 border-transparent rounded-2xl min-h-[60px]"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/30 px-1 flex items-center gap-2">
                                            <Tag className="w-3.5 h-3.5" /> Essence Tags
                                        </label>
                                        <HashtagInput
                                            tags={eventData.hashtags || []}
                                            onChange={(tags) => updateEventData({ ...eventData, hashtags: tags })}
                                            suggestions={['tradition', 'vacation', 'holiday', 'birthday', 'wedding']}
                                            className="bg-black/5 border-transparent rounded-2xl min-h-[60px]"
                                        />
                                    </div>
                                </div>
                            </Card>
                        </aside>

                        {/* Right: Main Creative Area */}
                        <div className="flex-1 space-y-12">
                            <Card className="p-10 min-h-[800px] flex flex-col glass-card rounded-[3rem] border border-black/5 relative overflow-hidden group/editor transition-all hover:shadow-2xl hover:shadow-catalog-accent/5">
                                <div className="absolute top-0 right-0 p-12 opacity-[0.03] group-hover/editor:opacity-[0.08] transition-all duration-1000 rotate-12">
                                    <Sparkles className="w-48 h-48 text-catalog-accent" />
                                </div>

                                <div className="flex items-center justify-between mb-10 relative z-10">
                                    <label className="flex items-center gap-4 text-[11px] font-black text-catalog-accent uppercase tracking-[0.4em] font-outfit">
                                        <div className="w-8 h-8 rounded-full bg-catalog-accent/10 flex items-center justify-center">
                                            <Sparkles className="w-4 h-4" />
                                        </div>
                                        The Chronicle
                                    </label>

                                    <div className="flex items-center gap-6">
                                        <div className="flex glass p-1 rounded-2xl border border-black/5 shadow-inner">
                                            <button
                                                type="button"
                                                onClick={() => setUploadTarget('story')}
                                                className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${uploadTarget === 'story' ? 'bg-catalog-accent text-white shadow-xl' : 'text-catalog-text/30 hover:text-catalog-text/60'}`}
                                            >
                                                Narrative
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setUploadTarget('gallery')}
                                                className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all ${uploadTarget === 'gallery' ? 'bg-catalog-accent text-white shadow-xl' : 'text-catalog-text/30 hover:text-catalog-text/60'}`}
                                            >
                                                Visuals
                                            </button>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setUploadTarget('story');
                                                setShowSourceModal('story');
                                            }}
                                            className="w-12 h-12 bg-catalog-accent/10 hover:bg-catalog-accent text-catalog-accent hover:text-white rounded-2xl transition-all shadow-lg shadow-catalog-accent/5 flex items-center justify-center p-0 active:scale-90"
                                            title="Add Media to Story"
                                        >
                                            <Camera className="w-5 h-5" />
                                        </Button>
                                    </div>

                                    {/* Upload/Compression Indicator */}
                                    {(uploading || compressionProgress !== null) && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 glass px-8 py-4 rounded-[2rem] shadow-2xl z-50 flex items-center gap-4 border border-white/40"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-catalog-accent/10 flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 animate-spin text-catalog-accent" />
                                            </div>
                                            <span className="text-[10px] font-black text-catalog-text uppercase tracking-widest">
                                                {compressionProgress !== null ? `Refining Video ${compressionProgress}%` : 'Archiving Media...'}
                                            </span>
                                        </motion.div>
                                    )}
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        className="hidden"
                                        accept="image/*,video/*"
                                        multiple
                                        onChange={async (e) => {
                                            const files = Array.from(e.target.files || []);
                                            if (files.length === 0) return;

                                            // Determine if we need to compress videos
                                            const videoFiles = files.filter(f => f.type.startsWith('video/'));
                                            const imageFiles = files.filter(f => f.type.startsWith('image/'));

                                            // If inserting single image into story, go to cropper
                                            if (uploadTarget === 'story' && imageFiles.length === 1 && videoFiles.length === 0) {
                                                const file = imageFiles[0];
                                                const reader = new FileReader();
                                                reader.onload = (event) => {
                                                    if (event.target?.result) {
                                                        setCroppingImage({
                                                            src: event.target.result as string,
                                                            file,
                                                            target: uploadTarget
                                                        });
                                                    }
                                                };
                                                reader.readAsDataURL(file);
                                                return;
                                            }

                                            // Otherwise do bulk upload with compression
                                            setUploading(true);
                                            try {
                                                const newAssets = [...(eventData.content?.assets || [])];

                                                // Process Videos
                                                for (const file of videoFiles) {
                                                    try {
                                                        setCompressionProgress(0);
                                                        const compressedFile = await videoCompressionService.compressVideo(file, (progress) => {
                                                            setCompressionProgress(progress);
                                                        });
                                                        setCompressionProgress(null);

                                                        const { url, error: uploadError } = await storageService.uploadFile(compressedFile, 'event-assets', `events/${eventData.title}/`);
                                                        if (uploadError) throw uploadError;
                                                        if (url) {
                                                            if (uploadTarget === 'story') {
                                                                // Insert video into story (as link or video tag? Tiptap image extension handles images. For video support we might need extension-video or just link.
                                                                // For now, let's treat it as an asset if targeted for story but insert as link?)
                                                                // Actually, let's force videos to Gallery for now or just insert as asset.
                                                                // If story, maybe just alert user? Or add to gallery anyway.
                                                                // Let's add directly to gallery assets even if target is story, because story rich text might not support video embedding easily yet.
                                                                newAssets.push({ url, type: 'video', caption: file.name });
                                                            } else {
                                                                newAssets.push({ url, type: 'video', caption: file.name });
                                                            }
                                                        }
                                                    } catch (err) {
                                                        console.error('Video processing failed', err);
                                                        setCompressionProgress(null);
                                                    }
                                                }

                                                // Process Images
                                                for (const file of imageFiles) {
                                                    let finalUrl: string | null = null;
                                                    let googlePhotoId: string | undefined;

                                                    // Workflow #1: Upload to Google Photos
                                                    if (googleAccessToken) {
                                                        try {
                                                            const photosService = new GooglePhotosService(googleAccessToken);
                                                            const mediaItem = await photosService.uploadMedia(file, file.name);
                                                            // We grab ID but prefer Storage URL for display stability
                                                            googlePhotoId = mediaItem.id;
                                                        } catch (err) {
                                                            console.error('Google Photos upload failed for event:', err);
                                                        }
                                                    }

                                                    // Workflow #2: Internal Storage (Always)
                                                    const { url: storageUrl, error: uploadError } = await storageService.uploadFile(file, 'event-assets', `events/${eventData.title}/`);

                                                    if (storageUrl) {
                                                        finalUrl = storageUrl;
                                                    } else if (uploadError) {
                                                        console.error('Bulk upload error:', uploadError);
                                                    }

                                                    // Fallback: If Storage failed but Google succeeded, use Google URL (temporary but better than nothing)
                                                    // (Optional: depending on preference. Here we skip if no storage URL for consistency)

                                                    // Log to family_media
                                                    if (finalUrl && familyId) {
                                                        const { data: userData } = await supabase.auth.getUser();
                                                        await supabase.from('family_media').insert({
                                                            family_id: familyId,
                                                            url: finalUrl,
                                                            type: file.type.startsWith('image/') ? 'image' : 'video',
                                                            category: 'event',
                                                            folder: eventData.title || 'Events',
                                                            filename: file.name,
                                                            size: file.size,
                                                            uploaded_by: userData.user?.id,
                                                            metadata: googlePhotoId ? { googlePhotoId } : undefined
                                                        } as any);
                                                    }

                                                    if (finalUrl) {
                                                        if (uploadTarget === 'story') {
                                                            editorRef.current?.insertImage(finalUrl);
                                                        } else {
                                                            newAssets.push({ url: finalUrl, type: 'image', googlePhotoId } as any);
                                                        }
                                                    }
                                                }

                                                // Update gallery assets if we added any (videos always go here effectively for now)
                                                if (newAssets.length !== (eventData.content?.assets?.length || 0)) {
                                                    updateEventData(prev => ({ ...prev, content: { ...prev.content, assets: newAssets } }));
                                                }

                                            } catch (error) {
                                                console.error('Upload process failed:', error);
                                                alert('Failed to upload some files');
                                            } finally {
                                                setUploading(false);
                                                setCompressionProgress(null);
                                                if (fileInputRef.current) fileInputRef.current.value = '';
                                            }
                                        }}
                                        disabled={uploading}
                                    />
                                </div>

                                <div className="flex-1 relative z-10 glass rounded-[2rem] border border-black/5 p-2 bg-white/40 backdrop-blur-sm">
                                    <RichTextEditor
                                        ref={editorRef}
                                        value={eventData.description || ''}
                                        folderName={eventData.title}
                                        onChange={(html: string) => updateEventData({ ...eventData, description: html })}
                                    />
                                </div>
                            </Card>

                            {/* Gallery Management Section */}
                            <Card className="p-10 bg-black/5 backdrop-blur-sm border-dashed border-2 border-black/10 rounded-[3rem] relative overflow-hidden group/gallery">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 relative z-10">
                                    <h3 className="flex items-center gap-4 text-[11px] font-black text-catalog-text/30 uppercase tracking-[0.4em] font-outfit">
                                        <div className="p-2 bg-white rounded-lg shadow-sm border border-black/5">
                                            <Layout className="w-4 h-4 text-catalog-accent" />
                                        </div>
                                        Visual Matrix
                                    </h3>

                                    <div className="flex flex-wrap items-center gap-2 glass p-1.5 rounded-2xl border border-black/5">
                                        {(['cards', 'carousel', 'grid', 'masonry', 'polaroid'] as const).map(mode => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => updateEventData({
                                                    ...eventData,
                                                    content: { ...eventData.content, galleryMode: mode }
                                                })}
                                                className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${eventData.content?.galleryMode === mode ? 'bg-catalog-text text-white shadow-xl' : 'text-catalog-text/30 hover:bg-black/5'}`}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {(!eventData.content?.assets || eventData.content.assets.length === 0) ? (
                                    <div className="py-24 flex flex-col items-center justify-center bg-white/40 border-2 border-dashed border-black/5 rounded-[2.5rem] relative group/empty">
                                        <div className="w-20 h-20 bg-catalog-accent/5 rounded-[2rem] flex items-center justify-center mb-6 group-hover/empty:scale-110 transition-transform duration-500">
                                            <ImagePlus className="w-8 h-8 text-catalog-accent/30" />
                                        </div>
                                        <p className="text-[11px] font-black text-catalog-text/20 uppercase tracking-[0.3em] mb-8">Visualization is empty</p>
                                        <button
                                            type="button"
                                            onClick={() => { setUploadTarget('gallery'); setShowSourceModal('gallery'); }}
                                            className="px-10 py-4 bg-catalog-accent text-white rounded-full text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-catalog-accent/20 hover:scale-105 active:scale-95 transition-all"
                                        >
                                            Ignite Gallery
                                        </button>
                                    </div>
                                ) : (
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleDragEnd}
                                    >
                                        <SortableContext
                                            items={(eventData.content?.assets || []).map((a: { url: string }) => a.url)}
                                            strategy={rectSortingStrategy}
                                        >
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 relative z-10">
                                                {eventData.content.assets.map((asset: { url: string; type: string; caption?: string }) => (
                                                    <SortableAsset
                                                        key={asset.url}
                                                        id={asset.url}
                                                        asset={asset}
                                                        onRemove={() => {
                                                            const newAssets = eventData.content?.assets?.filter((a: { url: string }) => a.url !== asset.url);
                                                            updateEventData({ ...eventData, content: { ...eventData.content, assets: newAssets } });
                                                        }}
                                                    />
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => { setUploadTarget('gallery'); setShowSourceModal('gallery'); }}
                                                    className="aspect-square flex flex-col items-center justify-center bg-white/60 border-2 border-dashed border-black/5 rounded-[2rem] group hover:bg-white hover:border-catalog-accent/30 transition-all duration-500 shadow-sm"
                                                >
                                                    <div className="w-12 h-12 bg-catalog-accent/5 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <Plus className="w-6 h-6 text-catalog-accent" />
                                                    </div>
                                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-catalog-text/30 mt-4">Expand Matrix</span>
                                                </button>
                                            </div>
                                        </SortableContext>
                                    </DndContext>
                                )}
                            </Card>
                        </div>
                    </div>
                </div>

                {/* Cropper Overlay */}
                {croppingImage && (
                    <ImageCropper
                        src={croppingImage.src}
                        onCancel={() => setCroppingImage(null)}
                        onCropComplete={async (croppedUrl) => {
                            setCroppingImage(null);
                            setUploading(true);
                            try {
                                const response = await fetch(croppedUrl);
                                const blob = await response.blob();
                                const file = new File([blob], croppingImage.file.name, { type: 'image/jpeg' });

                                let finalUrl: string | null = null;
                                let googlePhotoId: string | undefined;

                                // Workflow #1: Upload to Google Photos
                                if (googleAccessToken) {
                                    try {
                                        const photosService = new GooglePhotosService(googleAccessToken);
                                        const mediaItem = await photosService.uploadMedia(file, file.name);
                                        googlePhotoId = mediaItem.id;
                                    } catch (err) {
                                        console.error('Google Photos upload failed for cropped image:', err);
                                    }
                                }

                                // Workflow #2: Internal Storage
                                const { url: storageUrl, error } = await storageService.uploadFile(file, 'event-assets', `events/${eventData.title}/`);
                                if (error) throw error;

                                if (storageUrl) {
                                    finalUrl = storageUrl;

                                    // Log to family_media
                                    if (familyId) {
                                        const { data: userData } = await supabase.auth.getUser();
                                        await supabase.from('family_media').insert({
                                            family_id: familyId,
                                            url: finalUrl,
                                            type: 'image',
                                            category: 'event',
                                            folder: eventData.title || 'Events',
                                            filename: file.name,
                                            size: file.size,
                                            uploaded_by: userData.user?.id,
                                            metadata: googlePhotoId ? { googlePhotoId } : undefined
                                        } as any);
                                    }

                                    if (croppingImage.target === 'story') {
                                        editorRef.current?.insertImage(finalUrl);
                                    } else {
                                        const newAssets = [...(eventData.content?.assets || [])];
                                        newAssets.push({ url: finalUrl, type: 'image', googlePhotoId } as any);
                                        updateEventData({ ...eventData, content: { ...eventData.content, assets: newAssets } });
                                    }
                                }
                            } catch (error) {
                                console.error('Error uploading cropped image:', error);
                                alert('Failed to upload image');
                            } finally {
                                setUploading(false);
                            }
                        }}
                    />
                )}
            </main>

            {/* Source Selection Modal */}
            {showSourceModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowSourceModal(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-serif italic text-catalog-text">
                                {showSourceModal === 'story' ? 'Add to Story' : 'Add to Gallery'}
                            </h3>
                            <button onClick={() => setShowSourceModal(null)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
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
                            <button
                                onClick={() => handleSourceSelect('google')}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <ImageIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Google Photos</div>
                                    <div className="text-xs text-gray-500">Import from your library</div>
                                </div>
                            </button>
                            <button
                                onClick={() => handleSourceSelect('url')}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <LinkIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Image Link</div>
                                    <div className="text-xs text-gray-500">Paste a direct URL</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showGooglePhotos && (
                <GooglePhotosSelector
                    isOpen={showGooglePhotos}
                    onClose={() => setShowGooglePhotos(false)}
                    onSelect={handleGooglePhotosSelect}
                    folders={['Events', eventData.title || ''].filter(Boolean)}
                    googleAccessToken={googleAccessToken || ''}
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
                    allowedTypes={['image', 'video']}
                />
            )}
        </div>
    );
}
