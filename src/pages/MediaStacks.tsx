import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import {
    Plus, Play, Music, Calendar, Grid, List, Search, Loader2,
    PlaySquare, Sparkles, Pencil, Trash2, Users, Hash, Share, MapPin,
    Video, Image as ImageIcon
} from 'lucide-react';
import MediaStackViewer, { type MediaItem } from '../components/media/MediaStackViewer';
import { CreateStackModal } from '../components/media/CreateStackModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useGooglePhotosUrl } from '../hooks/useGooglePhotosUrl';
import { cn } from '../lib/utils';

function StackMiniThumbnail({ item }: { item: { url: string; google_id?: string; googlePhotoId?: string; type?: string } }) {
    const googleId = item.google_id || item.googlePhotoId;
    const { url: displayUrl } = useGooglePhotosUrl(googleId, item.url, null, true);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);

    const isGoogleUrl = item.url && (
        item.url.includes('googleusercontent.com') ||
        item.url.includes('photoslibrary.googleapis.com') ||
        item.url.includes('drive.google.com') ||
        item.url.includes('ggpht.com') ||
        item.url.startsWith('google-photos://')
    );

    return (
        <div className="w-full h-full relative bg-gray-100">
            {item.type === 'video' && !isGoogleUrl ? (
                <video
                    src={item.url.includes('.m3u8') ? item.url : `${item.url}#t=0.1`}
                    className={cn(
                        "w-full h-full object-cover transition-opacity duration-500 transition-transform duration-700 group-hover:scale-105",
                        isLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoadedData={() => setIsLoaded(true)}
                    onError={() => setIsError(true)}
                    muted
                    playsInline
                />
            ) : (
                <img
                    src={displayUrl || item.url}
                    alt=""
                    className={cn(
                        "w-full h-full object-cover transition-opacity duration-500 transition-transform duration-700 group-hover:scale-105",
                        isLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setIsError(true)}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                />
            )}
            {(!isLoaded || isError) && (
                <div className="absolute inset-0 flex items-center justify-center">
                    {item.type === 'video' ? <Video className="w-4 h-4 text-purple-200" /> : <ImageIcon className="w-4 h-4 text-purple-200" />}
                </div>
            )}
        </div>
    );
}

interface Stack {
    id: string;
    title: string;
    description: string;
    participants: string[];
    hashtags: string[];
    music_url: string | null;
    music_name: string | null;
    cover_url: string | null;
    media_items: Array<{
        id: string;
        url: string;
        type: 'image' | 'video';
        filename: string;
        caption: string;
        sticker?: string;
        textOverlay?: string;
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
        displaySize?: 'small' | 'medium' | 'original';
    }>;
    location?: string;
    geotag?: { lat: number, lng: number } | null;
    created_at: string;
    updated_at: string;
}

export function MediaStacks() {
    const { familyId } = useAuth();
    const [stacks, setStacks] = useState<Stack[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [searchParams, setSearchParams] = useSearchParams();
    const stackIdFromUrl = searchParams.get('id');

    // Modal states
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingStack, setEditingStack] = useState<Stack | null>(null);
    const [viewingStack, setViewingStack] = useState<Stack | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        fetchStacks();
    }, [familyId]);

    const fetchStacks = async () => {
        if (!familyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await (supabase
                .from('stacks')
                .select('*') as any)
                .eq('family_id', familyId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setStacks(data || []);
        } catch (err) {
            console.error('Error fetching stacks:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (stackIdFromUrl && stacks.length > 0) {
            const s = stacks.find(st => st.id === stackIdFromUrl);
            if (s) setViewingStack(s);
        }
    }, [stackIdFromUrl, stacks]);

    const handleDeleteStack = async (id: string) => {
        if (!confirm('Delete this stack? This action cannot be undone.')) return;
        setDeletingId(id);
        try {
            await (supabase.from('stacks') as any).delete().eq('id', id);
            setStacks(s => s.filter(st => st.id !== id));
            if (viewingStack?.id === id) setViewingStack(null);
        } catch (err) {
            console.error('Delete failed:', err);
        } finally {
            setDeletingId(null);
        }
    };

    const handleShareStack = async (stack: Stack) => {
        try {
            const token = crypto.randomUUID();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 48);

            const { error } = await (supabase.from('shared_links' as any) as any).insert({
                token,
                stack_id: stack.id,
                expires_at: expiresAt.toISOString(),
            });

            if (error) throw error;

            const shareUrl = `${window.location.origin}/stack/share/${token}`;

            // Premium Email helper
            const emailSubject = encodeURIComponent(`Shared Memory Stack: ${stack.title}`);
            const emailBody = encodeURIComponent(`Hi!\n\nI wanted to share this memory stack with you: ${stack.title}\n\nYou can view it here (valid for 48 hours):\n${shareUrl}\n\nEnjoy!`);
            const mailtoUrl = `mailto:?subject=${emailSubject}&body=${emailBody}`;

            if (navigator.share) {
                await navigator.share({
                    title: `Memory Stack: ${stack.title}`,
                    text: 'View this memory stack for the next 48 hours!',
                    url: shareUrl,
                });
            } else {
                const choice = confirm(`Share link created!\n\nClick OK to Copy Link to clipboard.\nClick CANCEL to Share by Email.`);
                if (choice) {
                    await navigator.clipboard.writeText(shareUrl);
                    alert('Link copied to clipboard!');
                } else {
                    window.location.href = mailtoUrl;
                }
            }
        } catch (err) {
            console.error('Error sharing stack:', err);
            alert('Failed to generate share link.');
        }
    };

    const handleViewStack = (stack: Stack) => {
        setSearchParams({ id: stack.id });
        setViewingStack(stack);
    };

    const handleCloseViewer = () => {
        setSearchParams({});
        setViewingStack(null);
    };

    const handleShufflePlay = () => {
        if (filteredStacks.length === 0) return;
        const randomStack = filteredStacks[Math.floor(Math.random() * filteredStacks.length)];
        setViewingStack(randomStack);
    };

    const handlePlayAll = () => {
        if (filteredStacks.length === 0) return;
        setViewingStack(filteredStacks[0]);
    };

    const filteredStacks = stacks.filter(stack => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            stack.title?.toLowerCase().includes(q) ||
            stack.description?.toLowerCase().includes(q) ||
            stack.participants?.some(p => p.toLowerCase().includes(q)) ||
            stack.hashtags?.some(h => h.toLowerCase().includes(q))
        );
    });

    // Convert stack to MediaStackViewer format
    const stackToViewerItems = (stack: Stack): MediaItem[] =>
        (stack.media_items || []).map(item => ({
            id: item.id,
            url: item.url,
            type: (item.type === 'video' || item.url?.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i)) ? 'video' : 'image',
            date: new Date(stack.created_at),
            caption: item.caption || item.textOverlay,
            filename: item.filename,
            duration: item.duration,
            cropMode: item.cropMode,
            captionRotation: item.captionRotation,
            captionX: item.captionX,
            captionY: item.captionY,
            captionFontSize: item.captionFontSize,
            captionColor: item.captionColor,
            textLayers: item.textLayers,
            stickerLayers: item.stickerLayers,
            videoStartTime: item.videoStartTime,
            videoEndTime: item.videoEndTime,
            googlePhotoId: item.googlePhotoId,
            displaySize: item.displaySize as any,
        }));

    return (
        <div className="min-h-screen bg-catalog-stone/5 p-4 md:p-8 pt-20">
            <div className="w-full mx-auto space-y-8 px-4 md:px-8">

                {/* ============ HEADER ============ */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/5 pb-8">
                    <div>
                        <h1 className="text-4xl font-outfit font-black text-catalog-text tracking-tight uppercase">
                            Memory <span className="text-catalog-accent">Stacks</span>
                        </h1>
                        <p className="text-catalog-text/60 font-medium">Your curated family stories</p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        <Button
                            variant="secondary"
                            className="rounded-xl gap-2 border border-black/5"
                            onClick={handleShufflePlay}
                            disabled={filteredStacks.length === 0}
                        >
                            <Sparkles className="w-4 h-4 text-purple-500" />
                            <span>Shuffle</span>
                        </Button>
                        <Button
                            variant="primary"
                            className="rounded-xl gap-2"
                            onClick={handlePlayAll}
                            disabled={filteredStacks.length === 0}
                        >
                            <Play className="w-4 h-4 fill-white" />
                            <span>Play All</span>
                        </Button>
                        <div className="w-[1px] h-8 bg-black/5 mx-1" />
                        <div className="flex bg-white/50 p-1 rounded-xl border border-black/5">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-catalog-accent' : 'text-gray-400'}`}
                            >
                                <Grid className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-catalog-accent' : 'text-gray-400'}`}
                            >
                                <List className="w-5 h-5" />
                            </button>
                        </div>
                        <Button
                            variant="primary"
                            className="rounded-2xl gap-2 shadow-lg shadow-catalog-accent/20"
                            onClick={() => setShowCreateModal(true)}
                        >
                            <Plus className="w-5 h-5" />
                            <span>Create New Stack</span>
                        </Button>
                    </div>
                </div>

                {/* ============ SEARCH ============ */}
                <div className="relative max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search stacks, participants, hashtags..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-white border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all font-medium shadow-sm"
                    />
                </div>

                {/* ============ CONTENT ============ */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-50">
                        <Loader2 className="w-12 h-12 animate-spin text-catalog-accent" />
                        <p className="font-outfit font-bold uppercase tracking-widest text-sm">Loading Stacks...</p>
                    </div>
                ) : filteredStacks.length > 0 ? (
                    <div className={viewMode === 'grid'
                        ? "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-8"
                        : "flex flex-col gap-4"
                    }>
                        {filteredStacks.map((stack, idx) => (
                            <motion.div
                                key={stack.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.06 }}
                            >
                                {viewMode === 'grid' ? (
                                    /* ===== GRID CARD ===== */
                                    <div className="group relative bg-white rounded-[2rem] overflow-hidden shadow-lg border border-black/5 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
                                        {/* Cover Image */}
                                        <div
                                            className="relative aspect-[4/3] bg-gray-900 cursor-pointer overflow-hidden"
                                            onClick={() => handleViewStack(stack)}
                                        >
                                            {/* Media mini-strip */}
                                            {stack.media_items && stack.media_items.length > 0 ? (
                                                <div className="absolute inset-0 flex gap-0.5">
                                                    {stack.media_items.slice(0, 3).map((item, i) => (
                                                        <div key={i} className="flex-1 overflow-hidden relative">
                                                            <StackMiniThumbnail item={item} />
                                                            {item.sticker && (
                                                                <div className="absolute top-1 left-1 text-base drop-shadow">{item.sticker}</div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {stack.media_items.length > 3 && (
                                                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs font-black px-2 py-1 rounded-full">
                                                            +{stack.media_items.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center">
                                                    <PlaySquare className="w-12 h-12 text-white/20" />
                                                </div>
                                            )}

                                            {/* Gradient */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                                            {/* Play button hover */}
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                                                <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-xl">
                                                    <Play className="w-7 h-7 fill-white text-white ml-1" />
                                                </div>
                                            </div>

                                            {/* Media count badge */}
                                            <div className="absolute top-3 left-3">
                                                <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm text-white text-[10px] font-black px-2.5 py-1 rounded-full border border-white/10">
                                                    <PlaySquare className="w-3 h-3" />
                                                    {stack.media_items?.length || 0} items
                                                </div>
                                            </div>

                                            {/* Music badge */}
                                            {stack.music_url && (
                                                <div className="absolute top-3 right-3">
                                                    <div className="w-8 h-8 bg-catalog-accent/90 rounded-full flex items-center justify-center shadow-lg">
                                                        <Music className="w-4 h-4 text-white" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-5">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleViewStack(stack)}>
                                                    <h3 className="font-outfit font-black text-base text-catalog-text line-clamp-1 group-hover:text-catalog-accent transition-colors">
                                                        {stack.title}
                                                    </h3>
                                                    {stack.description && (
                                                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 font-medium">
                                                            {stack.description}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleShareStack(stack); }}
                                                        className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors"
                                                        title="Share"
                                                    >
                                                        <Share className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); setEditingStack(stack); setShowCreateModal(true); }}
                                                        className="p-2 hover:bg-blue-50 text-blue-500 rounded-xl transition-colors"
                                                        title="Edit"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={e => { e.stopPropagation(); handleDeleteStack(stack.id); }}
                                                        disabled={deletingId === stack.id}
                                                        className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors"
                                                        title="Delete"
                                                    >
                                                        {deletingId === stack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Tags row */}
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {stack.participants?.slice(0, 2).map(p => (
                                                    <span key={p} className="flex items-center gap-1 text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">
                                                        <Users className="w-2.5 h-2.5" />{p}
                                                    </span>
                                                ))}
                                                {stack.hashtags?.slice(0, 2).map(h => (
                                                    <span key={h} className="flex items-center gap-0.5 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                                        <Hash className="w-2.5 h-2.5" />{h}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Footer Info: Date & Location */}
                                            <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-400 font-bold overflow-hidden">
                                                <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                    <Calendar className="w-3 h-3" />
                                                    {new Date(stack.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                                
                                                {stack.location && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const url = stack.geotag 
                                                                ? `https://www.google.com/maps/search/?api=1&query=${stack.geotag.lat},${stack.geotag.lng}`
                                                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stack.location!)}`;
                                                            window.open(url, '_blank');
                                                        }}
                                                        className="flex items-center gap-1 hover:text-catalog-accent transition-colors truncate group/loc"
                                                    >
                                                        <div className="w-px h-2.5 bg-gray-200 mx-0.5 shrink-0" />
                                                        <MapPin className="w-3 h-3 shrink-0 text-catalog-accent/60 group-hover/loc:scale-110 transition-transform" />
                                                        <span className="truncate max-w-[120px]">{stack.location}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* ===== LIST CARD ===== */
                                    <div className="bg-white p-4 rounded-3xl border border-black/5 flex items-center gap-6 hover:shadow-lg transition-all group cursor-pointer"
                                        onClick={() => handleViewStack(stack)}>
                                        {/* Thumbnail */}
                                        <div className="w-20 h-20 rounded-2xl overflow-hidden shrink-0 border border-gray-100 shadow-sm bg-gray-100 flex items-center justify-center">
                                            {stack.cover_url || (stack.media_items && stack.media_items.length > 0) ? (
                                                <StackMiniThumbnail item={{ 
                                                    url: stack.cover_url || stack.media_items[0].url,
                                                    googlePhotoId: stack.media_items[0]?.googlePhotoId
                                                }} />
                                            ) : (
                                                <PlaySquare className="w-8 h-8 text-gray-300" />
                                            )}
                                        </div>
                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-outfit font-black text-lg text-catalog-text group-hover:text-catalog-accent transition-colors truncate">{stack.title}</h3>
                                            {stack.description && <p className="text-xs text-gray-400 truncate font-medium">{stack.description}</p>}
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {stack.participants?.slice(0, 3).map(p => (
                                                    <span key={p} className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{p}</span>
                                                ))}
                                                {stack.hashtags?.slice(0, 3).map(h => (
                                                    <span key={h} className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">#{h}</span>
                                                ))}
                                            </div>
                                        </div>
                                        {/* Meta */}
                                        <div className="text-right shrink-0 space-y-1 pr-2">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{stack.media_items?.length || 0} items</p>
                                            <div className="flex items-center gap-2 justify-end">
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-gray-400">
                                                    <Calendar className="w-2.5 h-2.5" />
                                                    {new Date(stack.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>
                                                {stack.location && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const url = stack.geotag 
                                                                ? `https://www.google.com/maps/search/?api=1&query=${stack.geotag.lat},${stack.geotag.lng}`
                                                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stack.location!)}`;
                                                            window.open(url, '_blank');
                                                        }}
                                                        className="flex items-center gap-1 text-catalog-accent hover:text-catalog-accent/80 transition-colors font-bold text-[10px] truncate max-w-[120px]"
                                                    >
                                                        <MapPin className="w-2.5 h-2.5" />
                                                        {stack.location}
                                                    </button>
                                                )}
                                            </div>
                                            {stack.music_url && <Music className="w-3 h-3 text-catalog-accent/40 ml-auto" />}
                                        </div>
                                        {/* Actions */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={e => { e.stopPropagation(); handleShareStack(stack); }}
                                                className="flex items-center gap-1.5 p-2 px-3 hover:bg-emerald-50 text-emerald-600 rounded-xl transition-colors font-bold text-xs"
                                                title="Share"
                                            >
                                                <Share className="w-4 h-4" /> <span className="hidden sm:inline">Share</span>
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setEditingStack(stack); setShowCreateModal(true); }}
                                                className="flex items-center gap-1.5 p-2 px-3 hover:bg-blue-50 text-blue-500 rounded-xl transition-colors font-bold text-xs"
                                                title="Edit"
                                            >
                                                <Pencil className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDeleteStack(stack.id); }}
                                                disabled={deletingId === stack.id}
                                                className="flex items-center gap-1.5 p-2 px-3 hover:bg-red-50 text-red-500 rounded-xl transition-colors font-bold text-xs"
                                                title="Delete"
                                            >
                                                {deletingId === stack.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                <span className="hidden sm:inline">Delete</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    /* ===== EMPTY STATE ===== */
                    <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
                        <div className="w-24 h-24 rounded-full bg-catalog-stone/10 flex items-center justify-center mb-6">
                            <PlaySquare className="w-10 h-10 text-catalog-accent opacity-30" />
                        </div>
                        <h2 className="text-2xl font-outfit font-black text-catalog-text">
                            {searchQuery ? 'No stacks found' : 'No Memory Stacks Yet'}
                        </h2>
                        <p className="text-catalog-text/60 max-w-sm mt-2">
                            {searchQuery ? 'Try a different search term.' : 'Create your first curated memory stack — title, music, media, and all.'}
                        </p>
                        {!searchQuery && (
                            <Button variant="primary" className="mt-8 rounded-2xl gap-2" onClick={() => setShowCreateModal(true)}>
                                <Plus className="w-5 h-5" />
                                <span>Create Your First Stack</span>
                            </Button>
                        )}
                    </div>
                )}
            </div>


            {/* ============ CREATE MODAL ============ */}
            <CreateStackModal
                isOpen={showCreateModal}
                initialStack={editingStack}
                onClose={() => { setShowCreateModal(false); setEditingStack(null); }}
                onCreated={() => { setShowCreateModal(false); setEditingStack(null); fetchStacks(); }}
                folders={[]}
            />

            {/* ============ VIEWER ============ */}
            <AnimatePresence>
                {viewingStack && (
                    <MediaStackViewer
                        items={stackToViewerItems(viewingStack)}
                        initialIndex={0}
                        backgroundMusicUrl={viewingStack.music_url || undefined}
                        onClose={handleCloseViewer}
                        onShare={() => handleShareStack(viewingStack)}
                        onEdit={() => {
                            setEditingStack(viewingStack);
                            handleCloseViewer();
                            setShowCreateModal(true);
                        }}
                        onDelete={() => handleDeleteStack(viewingStack.id)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

export default MediaStacks;
