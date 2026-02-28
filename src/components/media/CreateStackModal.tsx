import { useState, useRef, useCallback, useEffect } from 'react';
import {
    X, Plus, Music, Upload, Grid, Hash, Users, ChevronRight, ChevronLeft,
    Check, Loader2, Trash2, ExternalLink, Type, Star, Sparkles, Bold,
    Palette, AlignCenter, Video, Clock, Eye, Play
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { MediaPickerModal } from './MediaPickerModal';
import { GooglePhotosSelector } from './GooglePhotosSelector';
import { MusicPickerModal } from './MusicPickerModal';
import { GooglePhotosService } from '../../services/googlePhotos';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Slider } from '../ui/Slider';
import { useGooglePhotosUrl } from '../../hooks/useGooglePhotosUrl';

// ── Types ──────────────────────────────────────────────────────────────────
interface TextLayer {
    id: string; text: string;
    x: number; y: number; // % of container
    fontSize: number; fontFamily: string; color: string; bold: boolean;
    rotation?: number; // rotation in degrees
}
interface StickerLayer {
    id: string; emoji: string;
    x: number; y: number; size: number; // size in px
}
interface StackMediaItem {
    id: string; url: string; type: 'image' | 'video'; filename: string;
    caption: string; captionX: number; captionY: number;
    captionFontSize: number; captionColor: string; captionRotation?: number;
    textLayers: TextLayer[];
    stickerLayers: StickerLayer[];
    duration?: number; // duration in seconds
    cropMode?: 'contain' | 'cover'; // crop mode for videos and images
    videoStartTime?: number;
    videoEndTime?: number;
    totalVideoDuration?: number;
    googlePhotoId?: string;
    isSyncedToGoogle?: boolean;
}

type SelectedLayer = { kind: 'text' | 'sticker' | 'caption'; id: string } | null;

const STICKERS = ['❤️', '⭐', '🌟', '🎉', '🥰', '🌸', '🎶', '🌈', '🏡', '👨‍👩‍👧‍👦', '📸', '🎬', '🔥', '🌺', '💫', '🦋'];
const FONTS = ['Inter', 'Georgia', 'Courier New', 'cursive'];
const FREE_MUSIC_SITE = { name: 'Mobiles24 – Free Music', url: 'https://www.mobiles24.co/' };

function makeText(text = 'New text'): TextLayer {
    return { id: crypto.randomUUID(), text, x: 50, y: 50, fontSize: 28, fontFamily: 'Inter', color: '#ffffff', bold: true, rotation: 0 };
}
function makeSticker(emoji: string): StickerLayer {
    return { id: crypto.randomUUID(), emoji, x: 50, y: 50, size: 60 };
}
function makeItem(id: string, url: string, type: 'image' | 'video', filename: string, googlePhotoId?: string): StackMediaItem {
    return {
        id, url, type, filename,
        caption: '', captionX: 50, captionY: 85, captionFontSize: 20, captionColor: '#ffffff', captionRotation: 0,
        textLayers: [], stickerLayers: [],
        duration: type === 'image' ? 5 : undefined,
        cropMode: 'contain',
        googlePhotoId,
        isSyncedToGoogle: !!googlePhotoId
    };
}

// ── Draggable layer hook ──────────────────────────────────────────────────
function useDrag(
    containerRef: React.RefObject<HTMLDivElement | null>,
    onDragEnd: (id: string, kind: string, x: number, y: number) => void
) {
    const startRef = useRef<{ id: string; kind: string; ox: number; oy: number; mx: number; my: number } | null>(null);

    const begin = (e: React.PointerEvent, id: string, kind: string, ox: number, oy: number) => {
        e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId);
        startRef.current = { id, kind, ox, oy, mx: e.clientX, my: e.clientY };
    };

    const move = (e: React.PointerEvent) => {
        if (!startRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const dx = ((e.clientX - startRef.current.mx) / rect.width) * 100;
        const dy = ((e.clientY - startRef.current.my) / rect.height) * 100;
        onDragEnd(startRef.current.id, startRef.current.kind,
            Math.max(2, Math.min(98, startRef.current.ox + dx)),
            Math.max(2, Math.min(98, startRef.current.oy + dy)));
    };

    const end = () => { startRef.current = null; };
    return { begin, move, end };
}

// ── Main Component ────────────────────────────────────────────────────────
interface CreateStackModalProps {
    isOpen: boolean; onClose: () => void; onCreated: () => void; folders?: string[];
    initialStack?: any; // Stack object for edit mode
    initialSelected?: any[]; // Items pre-selected in media library
}

export function CreateStackModal({ isOpen, onClose, onCreated, folders = [], initialStack, initialSelected }: CreateStackModalProps) {
    const { familyId, user, googleAccessToken } = useAuth();
    const [step, setStep] = useState<1 | 2>(1);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);

    // Step 1
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [participantInput, setParticipantInput] = useState('');
    const [participants, setParticipants] = useState<string[]>([]);
    const [hashtagInput, setHashtagInput] = useState('');
    const [hashtags, setHashtags] = useState<string[]>([]);
    const [selectedMusic, setSelectedMusic] = useState<{ url: string; name: string } | null>(null);
    const [mediaItems, setMediaItems] = useState<StackMediaItem[]>([]);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const [showGooglePicker, setShowGooglePicker] = useState(false);
    const [showMusicPicker, setShowMusicPicker] = useState(false);
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const [showFreeMusic, setShowFreeMusic] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [lightboxItem, setLightboxItem] = useState<StackMediaItem | null>(null);

    // Step 2
    const [editingIdx, setEditingIdx] = useState(0);
    const [selectedLayer, setSelectedLayer] = useState<SelectedLayer>(null);
    const [saving, setSaving] = useState(false);
    const [isImporting, setIsImporting] = useState(false);

    // ── Load Initial Stack for Edit Mode ─────────────────────────────────
    useEffect(() => {
        if (isOpen && initialSelected && initialSelected.length > 0 && mediaItems.length === 0) {
            const mapped = initialSelected.map(m => makeItem(m.id, m.url, m.type, m.filename));
            setMediaItems(mapped);
        }
    }, [isOpen, initialSelected, mediaItems.length]);

    useEffect(() => {
        if (initialStack) {
            setTitle(initialStack.title || '');
            setDescription(initialStack.description || '');
            setParticipants(initialStack.participants || []);
            setHashtags(initialStack.hashtags || []);
            setSelectedMusic(initialStack.music_url ? { url: initialStack.music_url, name: initialStack.music_name || 'Music' } : null);
            setMediaItems(initialStack.media_items || []);
            setStep(1);
            setEditingIdx(0);
        } else if (!isOpen) {
            resetForm();
        }
    }, [isOpen, initialStack]);

    const currentItem = mediaItems[editingIdx];
    const { url: displayUrl } = useGooglePhotosUrl(undefined, currentItem?.url);

    // ── Drag ──────────────────────────────────────────────────────────────
    const handleDragUpdate = useCallback((id: string, kind: string, x: number, y: number) => {
        setMediaItems(prev => prev.map((item, i) => {
            if (i !== editingIdx) return item;
            if (kind === 'text') return { ...item, textLayers: item.textLayers.map(l => l.id === id ? { ...l, x, y } : l) };
            if (kind === 'sticker') return { ...item, stickerLayers: item.stickerLayers.map(l => l.id === id ? { ...l, x, y } : l) };
            if (kind === 'caption') return { ...item, captionX: x, captionY: y };
            return item;
        }));
    }, [editingIdx]);

    const drag = useDrag(previewRef, handleDragUpdate);

    // ── Update helpers ───────────────────────────────────────────────────
    const updateItem = useCallback((patch: Partial<StackMediaItem>) => {
        setMediaItems(prev => prev.map((it, i) => i === editingIdx ? { ...it, ...patch } : it));
    }, [editingIdx]);

    const updateTextLayer = (id: string, patch: Partial<TextLayer>) => {
        updateItem({ textLayers: currentItem.textLayers.map(l => l.id === id ? { ...l, ...patch } : l) });
    };
    const updateStickerLayer = (id: string, patch: Partial<StickerLayer>) => {
        updateItem({ stickerLayers: currentItem.stickerLayers.map(l => l.id === id ? { ...l, ...patch } : l) });
    };

    const addTextLayer = () => {
        const layer = makeText();
        updateItem({ textLayers: [...(currentItem.textLayers || []), layer] });
        setSelectedLayer({ kind: 'text', id: layer.id });
    };
    const addSticker = (emoji: string) => {
        const layer = makeSticker(emoji);
        updateItem({ stickerLayers: [...(currentItem.stickerLayers || []), layer] });
        setSelectedLayer({ kind: 'sticker', id: layer.id });
    };
    const removeTextLayer = (id: string) => {
        updateItem({ textLayers: currentItem.textLayers.filter(l => l.id !== id) });
        if (selectedLayer?.id === id) setSelectedLayer(null);
    };
    const removeStickerLayer = (id: string) => {
        updateItem({ stickerLayers: currentItem.stickerLayers.filter(l => l.id !== id) });
        if (selectedLayer?.id === id) setSelectedLayer(null);
    };
    const showCaption = () => setSelectedLayer({ kind: 'caption', id: 'caption' });

    // ── Media Reordering (Drag & Drop) ───────────────────────────────────
    const dragIdx = useRef<number | null>(null);

    const onDragStart = (idx: number) => { dragIdx.current = idx; };
    const onDragOver = (e: React.DragEvent, idx: number) => {
        e.preventDefault();
        if (dragIdx.current === null || dragIdx.current === idx) return;
        const from = dragIdx.current;
        dragIdx.current = idx; // Update BEFORE setState so next onDragOver uses correct index
        setMediaItems(prev => {
            const arr = [...prev];
            const [moved] = arr.splice(from, 1);
            arr.splice(idx, 0, moved);
            return arr;
        });
    };
    const onDragEnd = () => { dragIdx.current = null; };

    // ── Media import ─────────────────────────────────────────────────────
    const handleDeviceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !familyId) return;
        setIsImporting(true);
        for (const file of Array.from(e.target.files)) {
            const isVideo = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|mov|webm|mkv|avi)$/i);
            let googlePhotoId: string | undefined;

            // Show file as queued at 0%
            setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));

            if (googleAccessToken) {
                try {
                    setUploadProgress(prev => ({ ...prev, [file.name]: 20 }));
                    const gpService = new GooglePhotosService(googleAccessToken);
                    const mediaItem = await gpService.uploadMedia(file, file.name);
                    googlePhotoId = mediaItem.id;
                    const googleUrl = isVideo ? `${mediaItem.baseUrl}=dv` : `${mediaItem.baseUrl}=w2048`;

                    setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
                    setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; }), 800);

                    const newItem = makeItem(`gp-${Date.now()}`, googleUrl, isVideo ? 'video' : 'image', file.name, googlePhotoId);
                    setMediaItems(prev => [...prev, newItem]);

                    // Still record in family_media for indexing, but URL points to Google
                    await supabase.from('family_media').insert({
                        family_id: familyId,
                        url: googleUrl,
                        type: isVideo ? 'video' : 'image',
                        category: 'stacks',
                        folder: 'Stacks',
                        filename: file.name,
                        size: file.size,
                        uploaded_by: user?.id,
                        metadata: { googlePhotoId, syncedToGoogle: true, isExternal: true }
                    } as any);
                } catch (err) {
                    console.error('Google Photos upload failed:', err);
                    alert(`Failed to upload to Google Photos: ${err instanceof Error ? err.message : 'Unknown error'}`);
                    setUploadProgress(prev => { const n = { ...prev }; delete n[file.name]; return n; });
                }
            } else {
                alert('Google integration required for upload. Please sign in with Google.');
            }
        }
        setIsImporting(false);
        if (e.target) e.target.value = '';
    };

    const handleLibrarySelect = (item: any) => {
        setShowMediaPicker(false);
        const isVideo = item.type === 'video' || item.url?.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i);
        setMediaItems(prev => [...prev, makeItem(item.id, item.url, isVideo ? 'video' : 'image', item.filename)]);
    };

    const handleLibraryMultiSelect = (items: any[]) => {
        setShowMediaPicker(false);
        setMediaItems(prev => [
            ...prev,
            ...items.map(item => {
                const isVideo = item.type === 'video' || item.url?.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i);
                return makeItem(item.id, item.url, isVideo ? 'video' : 'image', item.filename);
            })
        ]);
    };

    const handleGooglePhotosSelect = async (selected: any[], _folder: string) => {
        setShowGooglePicker(false);
        if (!googleAccessToken || !familyId) return;
        setIsImporting(true);
        for (const item of selected) {
            try {
                const typeStr = (item.type || '').toUpperCase();
                const isItemVideo = typeStr === 'VIDEO'
                    || item.mimeType?.toLowerCase().startsWith('video')
                    || item.mediaFile?.mimeType?.toLowerCase().startsWith('video')
                    || !!item.mediaMetadata?.video;

                const baseUrl = item.mediaFile?.baseUrl || item.baseUrl || '';

                const googleUrl = isItemVideo ? `${baseUrl}=dv` : `${baseUrl}=w2048`;

                setUploadProgress(prev => ({ ...prev, [item.id]: 100 }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[item.id]; return n; }), 800);

                const newItem = makeItem(item.id, googleUrl, isItemVideo ? 'video' : 'image', item.filename || `gp_${item.id}`, item.id);
                setMediaItems(prev => [...prev, newItem]);

                // Record in family_media for consistency
                await supabase.from('family_media').upsert({
                    family_id: familyId,
                    url: googleUrl,
                    type: isItemVideo ? 'video' : 'image',
                    category: 'stacks',
                    folder: 'Stacks',
                    filename: item.filename || `gp_${item.id}`,
                    uploaded_by: user?.id,
                    metadata: { googlePhotoId: item.id, syncedToGoogle: true, isExternal: true }
                } as any);
            } catch (_) { }
        }
    };

    const removeMedia = (idx: number) => {
        setMediaItems(prev => prev.filter((_, i) => i !== idx));
        if (editingIdx >= idx && editingIdx > 0) setEditingIdx(e => e - 1);
    };

    // ── Finalize ─────────────────────────────────────────────────────────
    const handleFinalize = async () => {
        if (!familyId || !user || !title.trim()) return;
        setSaving(true);
        try {
            const payload = {
                family_id: familyId, user_id: user.id,
                title: title.trim(), description, participants, hashtags,
                music_url: selectedMusic?.url || null, music_name: selectedMusic?.name || null,
                cover_url: mediaItems[0]?.url || null,
                media_items: mediaItems
            };

            if (initialStack?.id) {
                // Update existing
                const { error } = await (supabase.from('stacks') as any).update(payload).eq('id', initialStack.id);
                if (error) throw error;
            } else {
                // Insert new
                const { error } = await (supabase.from('stacks') as any).insert(payload);
                if (error) throw error;
            }

            resetForm(); onCreated();
        } catch (err: any) {
            console.error('Failed to save stack:', err);
            alert(`Failed to save stack: ${err.message}`);
        } finally { setSaving(false); }
    };

    const resetForm = () => {
        if (initialStack) return; // Keep form if just closing/opening while editing potentially
        setStep(1); setTitle(''); setDescription(''); setParticipants([]); setHashtags([]);
        setSelectedMusic(null); setMediaItems([]); setEditingIdx(0); setSelectedLayer(null);
    };

    const handleClose = () => {
        if (!initialStack) resetForm();
        onClose();
    };

    // Clear selection when switching item
    useEffect(() => { setSelectedLayer(null); }, [editingIdx]);

    if (!isOpen) return null;

    const canProceed = title.trim() && mediaItems.length > 0;

    // ── Selected layer controls (right panel step 2) ──────────────────────
    const selText = selectedLayer?.kind === 'text' ? currentItem?.textLayers?.find(l => l.id === selectedLayer.id) : null;
    const selSticker = selectedLayer?.kind === 'sticker' ? currentItem?.stickerLayers?.find(l => l.id === selectedLayer.id) : null;
    const selCaption = selectedLayer?.kind === 'caption';

    return (
        <>
            <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleClose} />
                <div className="relative bg-[#fafaf9] w-[95vw] max-w-[1800px] h-[93vh] rounded-[3rem] shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-300 border border-white/20">

                    {/* Header */}
                    <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 shrink-0 bg-gradient-to-r from-white to-catalog-stone/10">
                        <div className="flex items-center gap-3">
                            {[{ n: 1, label: 'Details' }, { n: 2, label: 'Annotate' }].map(({ n, label }, i) => (
                                <div key={n} className="flex items-center gap-2">
                                    {i > 0 && <ChevronRight className="w-4 h-4 text-gray-300" />}
                                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-sm font-black", step >= n ? "bg-catalog-accent text-white" : "bg-gray-100 text-gray-400")}>{n}</div>
                                    <span className={cn("text-xs font-black uppercase tracking-widest hidden sm:block", step === n ? "text-catalog-accent" : "text-gray-400")}>{label}</span>
                                </div>
                            ))}
                        </div>
                        <h2 className="text-lg font-outfit font-black text-catalog-text">
                            {initialStack ? '✏️ Edit Memory Stack' : (step === 1 ? '✨ New Memory Stack' : '🎨 Annotate Media')}
                        </h2>
                        <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-400" /></button>
                    </div>

                    {/* ========== STEP 1 ========== */}
                    {step === 1 && (
                        <div className="flex-1 overflow-hidden grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-0 h-full">
                            {/* Left: form */}
                            <div className="p-8 space-y-5 border-r border-gray-100 overflow-y-auto">
                                {/* Title */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Title *</label>
                                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Our Summer Adventure..."
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all" />
                                </div>
                                {/* Description */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Description</label>
                                    <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell the story..." rows={2}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all resize-none" />
                                </div>
                                {/* Participants */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1"><Users className="w-3 h-3" /> Participants</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={participantInput} onChange={e => setParticipantInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { const n = participantInput.trim(); if (n && !participants.includes(n)) setParticipants(p => [...p, n]); setParticipantInput(''); } }}
                                            placeholder="Add name + Enter" className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all" />
                                    </div>
                                    {participants.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">
                                        {participants.map(p => <span key={p} className="flex items-center gap-1 px-3 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs font-bold border border-purple-100">{p}<button onClick={() => setParticipants(ps => ps.filter(x => x !== p))}><X className="w-3 h-3" /></button></span>)}
                                    </div>}
                                </div>
                                {/* Hashtags */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" /> Hashtags</label>
                                    <div className="flex gap-2">
                                        <input type="text" value={hashtagInput} onChange={e => setHashtagInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') { const t = hashtagInput.trim().replace(/^#/, ''); if (t && !hashtags.includes(t)) setHashtags(h => [...h, t]); setHashtagInput(''); } }}
                                            placeholder="#family + Enter" className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all" />
                                    </div>
                                    {hashtags.length > 0 && <div className="flex flex-wrap gap-1.5 mt-2">
                                        {hashtags.map(t => <span key={t} className="flex items-center gap-1 px-3 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-bold border border-blue-100">#{t}<button onClick={() => setHashtags(ts => ts.filter(x => x !== t))}><X className="w-3 h-3" /></button></span>)}
                                    </div>}
                                </div>
                                {/* Music */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1"><Music className="w-3 h-3" /> Music</label>
                                    {selectedMusic ? (
                                        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                            <Music className="w-5 h-5 text-emerald-500" />
                                            <span className="flex-1 text-sm font-bold text-emerald-800 truncate">{selectedMusic.name}</span>
                                            <button onClick={() => setSelectedMusic(null)}><X className="w-4 h-4 text-emerald-400 hover:text-red-400 transition-colors" /></button>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            <button onClick={() => setShowMusicPicker(true)} className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 border border-dashed border-gray-200 rounded-2xl hover:border-catalog-accent/40 hover:bg-catalog-accent/5 transition-all group text-left">
                                                <Music className="w-4 h-4 text-gray-400 group-hover:text-catalog-accent transition-colors" />
                                                <span className="text-sm font-medium text-gray-500 group-hover:text-catalog-accent">Search Jamendo or upload file...</span>
                                            </button>
                                            <button onClick={() => setShowFreeMusic(!showFreeMusic)} className="text-xs text-catalog-accent/70 hover:text-catalog-accent font-bold flex items-center gap-1 transition-colors">
                                                <ExternalLink className="w-3 h-3" /> {FREE_MUSIC_SITE.name}
                                            </button>
                                            {showFreeMusic && (
                                                <a href={FREE_MUSIC_SITE.url} target="_blank" rel="noreferrer" className="block px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-sm font-bold text-amber-700 hover:text-catalog-accent transition-colors">
                                                    → {FREE_MUSIC_SITE.url}
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {/* Right: media */}
                            <div className="p-8 flex flex-col gap-6 overflow-y-auto bg-gray-50/30">
                                {/* Upload Progress Overlay/Banner */}
                                {Object.keys(uploadProgress).length > 0 && (
                                    <div className="space-y-3 p-6 bg-white rounded-3xl border border-catalog-accent/10 shadow-xl shadow-catalog-accent/5 animate-in slide-in-from-top-4 duration-500">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-catalog-accent animate-pulse" />
                                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-catalog-accent">Syncing with Google Photos</p>
                                            </div>
                                            <span className="text-[10px] font-black text-catalog-accent/50">{Object.keys(uploadProgress).length} ITEM(S)</span>
                                        </div>
                                        <div className="space-y-3">
                                            {Object.entries(uploadProgress).map(([name, progress]) => (
                                                <div key={name} className="space-y-1.5">
                                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-gray-500">
                                                        <span className="truncate max-w-[200px]">{name}</span>
                                                        <span>{progress}%</span>
                                                    </div>
                                                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-catalog-accent transition-all duration-500 ease-out shadow-[0_0_8px_rgba(var(--catalog-accent-rgb),0.5)]"
                                                            style={{ width: `${progress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-2">
                                    <div className="space-y-1">
                                        <h3 className="text-xl font-serif italic text-gray-800">Media Content</h3>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Arrange and configure your story</p>
                                    </div>

                                    <button onClick={() => setShowSourcePicker(true)}
                                        className="flex items-center gap-2 px-5 py-2.5 bg-catalog-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-catalog-accent/90 transition-all shadow-lg shadow-catalog-accent/20 active:scale-95">
                                        <Plus className="w-4 h-4" /> Add Media
                                    </button>
                                </div>
                                {mediaItems.length === 0 ? (
                                    <button onClick={() => setShowSourcePicker(true)} className="flex-1 border-2 border-dashed border-gray-200 rounded-[3rem] flex flex-col items-center justify-center gap-4 hover:border-catalog-accent/40 hover:bg-catalog-accent/5 transition-all group min-h-[400px] bg-white/50">
                                        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center group-hover:scale-110 transition-all shadow-sm border border-gray-100"><Plus className="w-10 h-10 text-gray-300 group-hover:text-catalog-accent" /></div>
                                        <div className="text-center">
                                            <p className="text-lg font-bold text-gray-600">Start your story</p>
                                            <p className="text-sm text-gray-400 font-medium">Import from Library, Google Photos, or Device</p>
                                        </div>
                                    </button>
                                ) : (
                                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                        {mediaItems.map((item, idx) => (
                                            <div
                                                key={item.id + idx}
                                                draggable
                                                onDragStart={() => onDragStart(idx)}
                                                onDragOver={(e) => onDragOver(e, idx)}
                                                onDragEnd={onDragEnd}
                                                className="relative aspect-[3/4.5] rounded-3xl overflow-hidden group shadow-md border border-white bg-white flex flex-col cursor-grab active:cursor-grabbing hover:shadow-xl transition-all"
                                            >
                                                <div className="flex-1 relative overflow-hidden bg-gray-50">
                                                    {item.type === 'video' ? (
                                                        <div className="w-full h-full bg-neutral-900 flex items-center justify-center">
                                                            <video
                                                                src={item.url.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(item.url, googleAccessToken) : item.url}
                                                                className="w-full h-full object-cover opacity-80"
                                                                muted
                                                                playsInline
                                                                crossOrigin="anonymous"
                                                            />
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20">
                                                                    <Play className="w-6 h-6 text-white fill-white" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <img src={item.url.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(item.url, googleAccessToken) : item.url} alt="" className={cn("w-full h-full transition-transform duration-700 group-hover:scale-110", item.cropMode === 'cover' ? 'object-cover' : 'object-contain')} crossOrigin="anonymous" />
                                                    )}

                                                    {/* Position badge */}
                                                    <div className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/50 backdrop-blur-md text-white text-[10px] font-black flex items-center justify-center border border-white/20 shadow-xl">{idx + 1}</div>

                                                    {/* Hover Overlay */}
                                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setLightboxItem(item); }}
                                                            className="p-3 bg-white text-gray-900 rounded-2xl hover:scale-110 transition-transform shadow-xl pointer-events-auto"
                                                        >
                                                            <Eye className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); removeMedia(idx); }}
                                                            className="p-3 bg-red-500 text-white rounded-2xl hover:scale-110 transition-transform shadow-xl pointer-events-auto"
                                                        >
                                                            <Trash2 className="w-5 h-5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="p-3 space-y-2 bg-white border-t border-gray-50">
                                                    {item.type === 'image' && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5 text-gray-400">
                                                                <Clock className="w-3.5 h-3.5" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest">Duration</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="number"
                                                                    min={1} max={30}
                                                                    value={item.duration || 5}
                                                                    onChange={e => {
                                                                        const val = parseInt(e.target.value) || 5;
                                                                        setMediaItems(prev => prev.map((it, i) => i === idx ? { ...it, duration: val } : it));
                                                                    }}
                                                                    className="w-12 text-xs font-black text-center bg-gray-50 border border-gray-100 rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-catalog-accent/20"
                                                                />
                                                                <span className="text-[10px] font-black text-gray-400">s</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {item.type === 'video' && (
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-1.5 text-blue-500">
                                                                <Video className="w-3.5 h-3.5" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest">Frame Fix</span>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    setMediaItems(prev => prev.map((it, i) => i === idx ? { ...it, cropMode: it.cropMode === 'cover' ? 'contain' : 'cover' } : it));
                                                                }}
                                                                className={cn("px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all", item.cropMode === 'cover' ? "bg-blue-500 text-white shadow-md shadow-blue-200" : "bg-gray-100 text-gray-400")}
                                                            >
                                                                {item.cropMode === 'cover' ? 'Full' : 'Fit'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ========== STEP 2: ANNOTATE ========== */}
                    {step === 2 && currentItem && (
                        <div className="flex-1 flex overflow-hidden">
                            {/* Thumbnail strip */}
                            <div className="w-24 bg-gray-50 border-r border-gray-100 flex flex-col gap-2 p-2.5 overflow-y-auto shrink-0">
                                {mediaItems.map((item, idx) => (
                                    <button key={idx} onClick={() => setEditingIdx(idx)}
                                        className={cn("relative aspect-square rounded-xl overflow-hidden border-2 transition-all bg-gray-200", editingIdx === idx ? "border-catalog-accent shadow-lg scale-105" : "border-transparent opacity-60 hover:opacity-100")}>
                                        {item.type === 'video' ? <video src={item.url.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(item.url, googleAccessToken) : item.url} className="w-full h-full object-cover" autoPlay loop muted playsInline crossOrigin="anonymous" />
                                            : <img src={item.url.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(item.url, googleAccessToken) : item.url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />}
                                        <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] font-black text-center py-0.5">{idx + 1}</div>
                                    </button>
                                ))}
                            </div>

                            {/* Preview canvas */}
                            <div
                                ref={previewRef}
                                className="flex-1 relative bg-black overflow-hidden select-none"
                                onPointerMove={drag.move}
                                onPointerUp={drag.end}
                                onClick={() => setSelectedLayer(null)}
                            >
                                {currentItem.type === 'video'
                                    ? <video
                                        src={displayUrl} controls={selectedLayer?.kind !== 'trim' as any}
                                        className={cn("absolute inset-0 w-full h-full pointer-events-auto", currentItem.cropMode === 'cover' ? 'object-cover' : 'object-contain')}
                                        autoPlay loop playsInline crossOrigin="anonymous"
                                        onLoadedMetadata={(e) => {
                                            const dur = e.currentTarget.duration;
                                            if (dur && dur !== currentItem.totalVideoDuration) {
                                                updateItem({ totalVideoDuration: dur });
                                            }
                                        }}
                                        onTimeUpdate={(e) => {
                                            const video = e.currentTarget;
                                            const start = currentItem.videoStartTime || 0;
                                            const end = currentItem.videoEndTime || currentItem.totalVideoDuration || video.duration;
                                            if (end && video.currentTime >= end) {
                                                video.currentTime = start;
                                            } else if (video.currentTime < start) {
                                                video.currentTime = start;
                                            }
                                        }}
                                    />
                                    : <img src={displayUrl} alt="" className={cn("absolute inset-0 w-full h-full", currentItem.cropMode === 'cover' ? 'object-cover' : 'object-contain')} crossOrigin="anonymous" />}

                                {/* Text layers */}
                                {(currentItem.textLayers || []).map(layer => (
                                    <div key={layer.id}
                                        className={cn("absolute cursor-grab active:cursor-grabbing select-none rounded px-1", selectedLayer?.id === layer.id ? "ring-2 ring-white/60 ring-offset-1 ring-offset-black/20" : "")}
                                        style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%,-50%) rotate(${layer.rotation || 0}deg)`, fontSize: layer.fontSize, fontFamily: layer.fontFamily, color: layer.color, fontWeight: layer.bold ? 'bold' : 'normal', textShadow: '0 1px 4px rgba(0,0,0,0.6)', whiteSpace: 'nowrap' }}
                                        onClick={e => { e.stopPropagation(); setSelectedLayer({ kind: 'text', id: layer.id }); }}
                                        onPointerDown={e => { setSelectedLayer({ kind: 'text', id: layer.id }); drag.begin(e, layer.id, 'text', layer.x, layer.y); }}
                                    >
                                        {layer.text}
                                    </div>
                                ))}

                                {/* Caption layer */}
                                {currentItem.caption && (
                                    <div
                                        className={cn("absolute cursor-grab active:cursor-grabbing select-none px-4 py-2 rounded-2xl", selectedLayer?.kind === 'caption' ? "ring-2 ring-white/60" : "")}
                                        style={{ left: `${currentItem.captionX}%`, top: `${currentItem.captionY}%`, transform: `translate(-50%,-50%) rotate(${currentItem.captionRotation || 0}deg)`, fontSize: currentItem.captionFontSize, color: currentItem.captionColor, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', fontWeight: 600, whiteSpace: 'nowrap', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                                        onClick={e => { e.stopPropagation(); showCaption(); }}
                                        onPointerDown={e => { showCaption(); drag.begin(e, 'caption', 'caption', currentItem.captionX, currentItem.captionY); }}
                                    >
                                        {currentItem.caption}
                                    </div>
                                )}

                                {/* Sticker layers */}
                                {(currentItem.stickerLayers || []).map(layer => (
                                    <div key={layer.id}
                                        className={cn("absolute cursor-grab active:cursor-grabbing select-none", selectedLayer?.id === layer.id ? "ring-2 ring-white/60 ring-offset-1 ring-offset-black/20 rounded-xl" : "")}
                                        style={{ left: `${layer.x}%`, top: `${layer.y}%`, transform: 'translate(-50%,-50%)', fontSize: layer.size, lineHeight: 1, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))' }}
                                        onClick={e => { e.stopPropagation(); setSelectedLayer({ kind: 'sticker', id: layer.id }); }}
                                        onPointerDown={e => { setSelectedLayer({ kind: 'sticker', id: layer.id }); drag.begin(e, layer.id, 'sticker', layer.x, layer.y); }}
                                    >
                                        {layer.emoji}
                                    </div>
                                ))}

                                {/* Nav arrows */}
                                <button className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all", editingIdx === 0 && "opacity-20 pointer-events-none")}
                                    onClick={() => setEditingIdx(i => Math.max(0, i - 1))}><ChevronLeft className="w-5 h-5" /></button>
                                <button className={cn("absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all", editingIdx === mediaItems.length - 1 && "opacity-20 pointer-events-none")}
                                    onClick={() => setEditingIdx(i => Math.min(mediaItems.length - 1, i + 1))}><ChevronRight className="w-5 h-5" /></button>

                                {/* Trim overlay on video */}
                                {selectedLayer?.kind === 'trim' as any && currentItem.type === 'video' && (
                                    <div className="absolute bottom-16 inset-x-12 z-[100] p-5 bg-black/70 backdrop-blur-xl rounded-[2rem] border border-white/20 shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
                                        <div className="flex items-center justify-between mb-4 px-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 bg-blue-500 rounded-lg flex items-center justify-center">
                                                    <Video className="w-3.5 h-3.5 text-white" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white">Adjust Duration</span>
                                            </div>
                                            <div className="flex items-center gap-3 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                                <span className="text-[10px] font-black text-blue-400">{(currentItem.videoStartTime || 0).toFixed(1)}s</span>
                                                <div className="w-1 h-1 bg-white/20 rounded-full" />
                                                <span className="text-[10px] font-black text-blue-400">{(currentItem.videoEndTime || currentItem.totalVideoDuration || 0).toFixed(1)}s</span>
                                            </div>
                                        </div>
                                        <Slider
                                            min={0}
                                            max={currentItem.totalVideoDuration || 100}
                                            step={0.1}
                                            value={[currentItem.videoStartTime || 0, currentItem.videoEndTime || currentItem.totalVideoDuration || 100]}
                                            onValueChange={(vals) => {
                                                updateItem({
                                                    videoStartTime: vals[0],
                                                    videoEndTime: vals[1]
                                                });
                                            }}
                                            className="h-8"
                                        />
                                        <div className="flex justify-between mt-2.5 px-1">
                                            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">Start</span>
                                            <span className="text-[8px] font-black uppercase tracking-widest text-white/40">End</span>
                                        </div>
                                    </div>
                                )}

                                {/* Dots */}
                                <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">
                                    {mediaItems.map((_, i) => <div key={i} className={cn("rounded-full transition-all", i === editingIdx ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/40")} />)}
                                </div>
                            </div>

                            {/* Right panel — tools */}
                            <div className="w-72 bg-white border-l border-gray-100 flex flex-col overflow-hidden shrink-0">
                                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                    {/* Toolbar buttons */}
                                    <div className="grid grid-cols-4 gap-2">
                                        <button onClick={addTextLayer} className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-2xl hover:bg-catalog-accent/10 hover:text-catalog-accent transition-all group border border-gray-100 hover:border-catalog-accent/20">
                                            <Type className="w-5 h-5 text-gray-400 group-hover:text-catalog-accent" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 group-hover:text-catalog-accent">Text</span>
                                        </button>
                                        <button onClick={showCaption} className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-2xl hover:bg-catalog-accent/10 transition-all group border border-gray-100 hover:border-catalog-accent/20">
                                            <AlignCenter className="w-5 h-5 text-gray-400 group-hover:text-catalog-accent" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 group-hover:text-catalog-accent">Caption</span>
                                        </button>
                                        <button className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-2xl hover:bg-catalog-accent/10 transition-all group border border-gray-100 hover:border-catalog-accent/20" onClick={() => setSelectedLayer({ kind: 'sticker', id: 'picker' })}>
                                            <Star className="w-5 h-5 text-gray-400 group-hover:text-catalog-accent" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 group-hover:text-catalog-accent">Sticker</span>
                                        </button>
                                        {currentItem.type === 'video' && (
                                            <button className="flex flex-col items-center gap-1 p-3 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-all group border border-gray-100 hover:border-blue-200"
                                                onClick={() => setSelectedLayer({ kind: 'trim' as any, id: 'trim' })}>
                                                <Video className="w-5 h-5 text-gray-400 group-hover:text-blue-500" />
                                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 group-hover:text-blue-500">Trim</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* ── Video Trim controls ── */}
                                    {selectedLayer?.kind === 'trim' as any && currentItem.type === 'video' && (
                                        <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-1.5"><Video className="w-3.5 h-3.5" /> Trim Video</p>
                                                <div className="text-[10px] font-bold text-gray-400">
                                                    {(currentItem.videoEndTime || currentItem.totalVideoDuration || 0).toFixed(1)}s
                                                </div>
                                            </div>

                                            <div className="px-2">
                                                <Slider
                                                    min={0}
                                                    max={currentItem.totalVideoDuration || 100}
                                                    step={0.1}
                                                    value={[currentItem.videoStartTime || 0, currentItem.videoEndTime || currentItem.totalVideoDuration || 100]}
                                                    onValueChange={(vals) => {
                                                        updateItem({
                                                            videoStartTime: vals[0],
                                                            videoEndTime: vals[1]
                                                        });
                                                    }}
                                                />
                                            </div>

                                            <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest px-1">
                                                <span>Start: {(currentItem.videoStartTime || 0).toFixed(1)}s</span>
                                                <span>Total: {(currentItem.totalVideoDuration || 0).toFixed(1)}s</span>
                                            </div>

                                            <p className="text-[10px] text-gray-400 italic">💡 Drag handles to crop the part of video you want to keep.</p>
                                        </div>
                                    )}

                                    {/* ── Text layer controls ── */}
                                    {selText && (
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-catalog-accent">✏️ Text</p>
                                                <button onClick={() => removeTextLayer(selText.id)} className="p-1 hover:bg-red-50 text-red-400 rounded-full transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                            </div>
                                            <textarea value={selText.text} onChange={e => updateTextLayer(selText.id, { text: e.target.value })} rows={2}
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 resize-none" />
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Font</label>
                                                <select value={selText.fontFamily} onChange={e => updateTextLayer(selText.id, { fontFamily: e.target.value })}
                                                    className="w-full mt-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-catalog-accent/20">
                                                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Size: {selText.fontSize}px</label>
                                                <input type="range" min={12} max={96} value={selText.fontSize} onChange={e => updateTextLayer(selText.id, { fontSize: +e.target.value })}
                                                    className="w-full mt-1 accent-catalog-accent" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tilt: {selText.rotation || 0}°</label>
                                                <input type="range" min={-90} max={90} value={selText.rotation || 0} onChange={e => updateTextLayer(selText.id, { rotation: +e.target.value })}
                                                    className="w-full mt-1 accent-catalog-accent" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1"><Palette className="w-3 h-3" /> Color</label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <input type="color" value={selText.color} onChange={e => updateTextLayer(selText.id, { color: e.target.value })}
                                                        className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {['#ffffff', '#000000', '#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3'].map(c => (
                                                            <button key={c} onClick={() => updateTextLayer(selText.id, { color: c })}
                                                                className={cn("w-7 h-7 rounded-full border-2 transition-all hover:scale-110", selText.color === c ? "border-catalog-accent scale-110" : "border-transparent")}
                                                                style={{ background: c }} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => updateTextLayer(selText.id, { bold: !selText.bold })}
                                                className={cn("flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold transition-all", selText.bold ? "bg-catalog-accent text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-catalog-accent/30")}>
                                                <Bold className="w-4 h-4" /> Bold
                                            </button>
                                        </div>
                                    )}

                                    {/* ── Caption controls ── */}
                                    {selCaption && (
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-catalog-accent">📝 Caption</p>
                                            <textarea value={currentItem.caption} onChange={e => updateItem({ caption: e.target.value })} rows={2}
                                                placeholder="Caption shown on slide..."
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 resize-none" />
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Size: {currentItem.captionFontSize}px</label>
                                                <input type="range" min={12} max={48} value={currentItem.captionFontSize} onChange={e => updateItem({ captionFontSize: +e.target.value })}
                                                    className="w-full mt-1 accent-catalog-accent" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tilt: {currentItem.captionRotation || 0}°</label>
                                                <input type="range" min={-90} max={90} value={currentItem.captionRotation || 0} onChange={e => updateItem({ captionRotation: +e.target.value })}
                                                    className="w-full mt-1 accent-catalog-accent" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1"><Palette className="w-3 h-3" /> Color</label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <input type="color" value={currentItem.captionColor} onChange={e => updateItem({ captionColor: e.target.value })}
                                                        className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {['#ffffff', '#000000', '#FFD700', '#FF6B6B', '#4ECDC4', '#95E1D3'].map(c => (
                                                            <button key={c} onClick={() => updateItem({ captionColor: c })}
                                                                className={cn("w-7 h-7 rounded-full border-2 transition-all hover:scale-110", currentItem.captionColor === c ? "border-catalog-accent scale-110" : "border-transparent")}
                                                                style={{ background: c }} />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-gray-400 italic">💡 Drag the caption on the canvas to reposition it</p>
                                        </div>
                                    )}

                                    {/* ── Sticker picker / controls ── */}
                                    {selectedLayer?.kind === 'sticker' && (
                                        <div className="space-y-3 p-3 bg-gray-50 rounded-2xl border border-gray-100">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-catalog-accent">⭐ Sticker</p>
                                                {selSticker && <button onClick={() => removeStickerLayer(selSticker.id)} className="p-1 hover:bg-red-50 text-red-400 rounded-full transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>}
                                            </div>
                                            {selSticker && (
                                                <div>
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Size: {selSticker.size}px</label>
                                                    <input type="range" min={20} max={140} value={selSticker.size} onChange={e => updateStickerLayer(selSticker.id, { size: +e.target.value })}
                                                        className="w-full mt-1 accent-catalog-accent" />
                                                    <p className="text-[10px] text-gray-400 italic mt-1">💡 Drag the sticker on the canvas to move it</p>
                                                </div>
                                            )}
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Add sticker</p>
                                            <div className="grid grid-cols-6 gap-1.5">
                                                {STICKERS.map(emoji => (
                                                    <button key={emoji} onClick={() => addSticker(emoji)}
                                                        className="text-xl aspect-square flex items-center justify-center rounded-xl hover:scale-125 hover:bg-white transition-all">
                                                        {emoji}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Default hint */}
                                    {!selectedLayer && (
                                        <div className="text-center space-y-3 py-4">
                                            <Sparkles className="w-8 h-8 text-gray-200 mx-auto" />
                                            <p className="text-xs text-gray-400 font-medium">Click a button above to add text, caption or sticker.<br />Click any layer on the canvas to edit it.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0">
                        {step === 1 ? (
                            <>
                                <button onClick={handleClose} className="px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all">Cancel</button>
                                <Button variant="primary" onClick={() => setStep(2)} disabled={!canProceed} className="rounded-2xl gap-2 px-7 shadow-lg shadow-catalog-accent/20">
                                    Next: Annotate <ChevronRight className="w-4 h-4" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all">
                                    <ChevronLeft className="w-4 h-4" /> Back
                                </button>
                                <Button variant="primary" onClick={handleFinalize} disabled={saving} className="rounded-2xl gap-2 px-7 shadow-lg !bg-emerald-600 hover:!bg-emerald-700">
                                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <><Check className="w-4 h-4" /> {initialStack ? 'Save Changes' : 'Finalize Stack'}</>}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div >

            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleDeviceUpload} />

            {showMediaPicker && <MediaPickerModal isOpen={showMediaPicker} onClose={() => setShowMediaPicker(false)} onSelect={handleLibrarySelect} onSelectMultiple={handleLibraryMultiSelect} multiSelect allowedTypes={['image', 'video']} />}
            {showGooglePicker && googleAccessToken && <GooglePhotosSelector googleAccessToken={googleAccessToken} isOpen={showGooglePicker} onClose={() => setShowGooglePicker(false)} onSelect={handleGooglePhotosSelect} folders={folders} />}
            {showMusicPicker && <MusicPickerModal onClose={() => setShowMusicPicker(false)} onSelect={(url: string, name: string) => { setSelectedMusic({ url, name }); setShowMusicPicker(false); }} />}

            {
                showSourcePicker && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isImporting && setShowSourcePicker(false)} />
                        <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-xs p-2 overflow-hidden">
                            <div className="p-5 text-center border-b border-gray-100">
                                <h3 className="text-xl font-black text-gray-800">
                                    {isImporting ? 'Importing...' : 'Add Media'}
                                </h3>
                            </div>
                            <div className={cn("p-3 flex flex-col gap-1 transition-opacity", isImporting && "opacity-50 pointer-events-none")}>
                                {[
                                    { label: 'Library', sub: 'From your vault', icon: <Grid className="w-5 h-5" />, color: 'bg-emerald-50 text-emerald-600', action: () => { setShowSourcePicker(false); setShowMediaPicker(true); } },
                                    { label: 'Google Photos', sub: 'Import from cloud', icon: <span className="font-black text-xs text-blue-600">GP</span>, color: 'bg-blue-50', action: () => { setShowSourcePicker(false); setShowGooglePicker(true); } },
                                    { label: 'Device', sub: 'Upload from disk', icon: <Upload className="w-5 h-5" />, color: 'bg-purple-50 text-purple-600', action: () => { setShowSourcePicker(false); fileInputRef.current?.click(); } },
                                ].map(opt => (
                                    <button key={opt.label} onClick={opt.action} className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-[1.25rem] flex items-center gap-3 transition-all group">
                                        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", opt.color)}>{opt.icon}</div>
                                        <div><div className="font-bold text-sm text-gray-700">{opt.label}</div><div className="text-[10px] text-gray-400">{opt.sub}</div></div>
                                    </button>
                                ))}
                            </div>
                            {isImporting && (
                                <div className="absolute inset-0 flex items-center justify-center pt-16">
                                    <Loader2 className="w-8 h-8 text-catalog-accent animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Lightbox Modal */}
            {
                lightboxItem && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300" onClick={() => setLightboxItem(null)}>
                        <button className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white z-10" onClick={() => setLightboxItem(null)}>
                            <X className="w-6 h-6" />
                        </button>
                        <div className="relative w-full max-w-5xl aspect-video md:aspect-[4/3] rounded-3xl overflow-hidden shadow-2xl bg-black" onClick={e => e.stopPropagation()}>
                            {lightboxItem?.type === 'video' ? (
                                <video
                                    src={lightboxItem?.url?.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(lightboxItem.url, googleAccessToken) : lightboxItem?.url}
                                    className="w-full h-full object-contain"
                                    controls
                                    autoPlay
                                    crossOrigin="anonymous"
                                />
                            ) : (
                                <img
                                    src={lightboxItem?.url.includes('googleusercontent.com') ? GooglePhotosService.getProxyUrl(lightboxItem.url, googleAccessToken) : lightboxItem?.url}
                                    alt=""
                                    className="w-full h-full object-contain"
                                    crossOrigin="anonymous"
                                />
                            )}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-white text-sm font-medium">
                                {lightboxItem?.filename}
                            </div>
                        </div>
                    </div>
                )
            }
        </>
    );
}
