import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Folder, Image as ImageIcon, Upload, Trash2, Search, Loader2, Grid, List, Edit2, X,
    Check, Palette, Sticker, CheckSquare, Square, Play, Maximize2, Plus, ChevronRight,
    Home, CloudUpload, FolderInput, FolderOpen, Info, Users as UsersIcon, Sparkles as SparklesIcon
} from 'lucide-react';
import { SecureMedia } from '../components/common/SecureMedia';
import { CreateStackModal } from '../components/media/CreateStackModal';
import { ImagePortal } from '../components/viewer/ImagePortal';
import { VideoPortal } from '../components/viewer/VideoPortal';
import { cn } from '../lib/utils';
import { UploadOverlay } from '../components/ui/UploadOverlay';
import { UniversalUploadButton } from '../components/ui/UniversalUploadButton';
import { MinimizedUploadBadge } from '../components/ui/MinimizedUploadBadge';

interface MediaItem {
    id: string;
    url: string;
    type: 'image' | 'video';
    filename: string;
    folder: string;
    category: string;
    created_at: string;
    size: number;
    tags?: string[];
    isSystemAsset?: boolean;
    usageCount?: number;
    metadata?: any;
}

type LibraryTab = 'uploads' | 'system';
type SystemCategory = 'background' | 'sticker' | 'frame' | 'ribbon';

// Reads the natural pixel dimensions of any image URL (including proxy URLs)
function useImageDimensions(url?: string | null) {
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
    useEffect(() => {
        if (!url) return;
        const img = new Image();
        img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = url;
    }, [url]);
    return dims;
}

// Reads the duration of a video URL by loading metadata
function useVideoDuration(url?: string | null, isVideo?: boolean) {
    const [duration, setDuration] = useState<number | null>(null);
    useEffect(() => {
        if (!url || !isVideo) return;
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
            if (isFinite(vid.duration)) setDuration(vid.duration);
        };
        vid.src = url;
        return () => { vid.src = ''; };
    }, [url, isVideo]);
    return duration;
}

function formatDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function MediaGridItem({ item, viewMode, selectedItems, onToggleSelect, editingItem, editName, setEditName, handleRename, handleUpdateTags, handleDelete, isAdmin, activeTab, onPreview, onMove, onShowMetadata }: any) {
    const [authorizedUrl, setAuthorizedUrl] = useState(item.url);

    useEffect(() => {
        let isMounted = true;
        async function fetchSecureUrl() {
            try {
                if (item.url && item.url.includes(import.meta.env.VITE_R2_PUBLIC_URL || 'r2.dev')) {
                    // Quick key extraction fallback
                    let key = item.url;
                    try {
                        key = new URL(item.url).pathname.substring(1);
                    } catch (e) {
                        key = item.url.split('/').pop();
                    }
                    if (key) {
                        const { CloudflareR2Service } = await import('../services/cloudflareR2');
                        const url = await CloudflareR2Service.getAuthorizedUrl(key);
                        if (isMounted && url) setAuthorizedUrl(url);
                    }
                }
            } catch (err) {
                console.error("Failed to secure URL:", err);
            }
        }
        fetchSecureUrl();
        return () => { isMounted = false; };
    }, [item.url]);
    const isCloudinary = item.url?.includes('res.cloudinary.com');
    const displayUrl = isCloudinary ? null : authorizedUrl;

    // Lazy-load dimensions and duration for badge display
    const imageDims = useImageDimensions(item.type === 'image' ? displayUrl : null);
    const videoDuration = useVideoDuration(item.type === 'video' ? displayUrl : null, item.type === 'video');

    return (
        <div key={item.id} className={cn("group relative bg-white border rounded-xl overflow-hidden transition-all duration-200", viewMode === 'list' ? "flex items-center p-3 gap-4 h-20 hover:border-catalog-accent/50" : "aspect-[10/11] hover:shadow-lg hover:-translate-y-1 hover:border-catalog-accent/50", selectedItems.has(item.id) ? "ring-2 ring-catalog-accent border-catalog-accent bg-catalog-accent/5" : "border-gray-200")} onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.action-btn')) {
                // Default to select if clicking the card generally
                onToggleSelect(item.id, e);
            }
        }}>
            <div className={cn("bg-gray-100 overflow-hidden relative", viewMode === 'list' ? "w-14 h-14 rounded-lg flex-shrink-0" : "h-[75%]")}>
                <div className="w-full h-full relative group/thumb">
                    <SecureMedia
                        url={item.url}
                        objectKey={item.r2Key || (item.metadata?.r2Key)}
                        alt={item.filename}
                        className={cn("w-full h-full", 
                            item.type === 'video' ? "object-cover" : (item.category === 'sticker' || item.category === 'frame' ? "object-contain p-2" : "object-cover")
                        )}
                        isVideo={item.type === 'video'}
                    />
                </div>

                {/* Image dimensions badge */}
                {item.type === 'image' && imageDims && viewMode === 'grid' && (
                    <div className="absolute bottom-2 right-2 z-10 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {imageDims.w}×{imageDims.h}
                    </div>
                )}

                {/* Video duration badge */}
                {item.type === 'video' && videoDuration !== null && viewMode === 'grid' && (
                    <div className="absolute bottom-2 right-2 z-10 bg-black/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
                        <Play className="w-2 h-2 fill-white" />
                        {formatDuration(videoDuration)}
                    </div>
                )}
                <div className={cn("absolute inset-0 bg-black/40 transition-opacity flex flex-col items-center justify-center opacity-0 group-hover:opacity-100", selectedItems.has(item.id) && "opacity-100 bg-catalog-accent/20")}>
                    {/* Preview Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onPreview(item, authorizedUrl);
                        }}
                        className="action-btn mb-3 p-3 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transform transition-all hover:scale-110 active:scale-95 border border-white/20"
                        title={item.type === 'video' ? 'Play Video' : 'View Full Screen'}
                    >
                        {item.type === 'video' ? <Play className="w-6 h-6 fill-white" /> : <Maximize2 className="w-6 h-6" />}
                    </button>

                    <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all", selectedItems.has(item.id) ? "bg-catalog-accent border-catalog-accent scale-110" : "border-white bg-transparent")}>
                        {selectedItems.has(item.id) && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                </div>
                {/* Usage Count Badge */}
                <div className={cn(
                    "absolute top-2 left-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold shadow-sm",
                    (item.usageCount || 0) > 0
                        ? "bg-purple-500 text-white"
                        : "bg-gray-200 text-gray-500"
                )}>
                    {item.usageCount || 0}
                </div>
            </div>

            <div className={cn("flex-1 min-w-0", viewMode === 'grid' ? "p-3 bg-white" : "")}>
                {editingItem === item.id ? (
                    <div className="flex items-center gap-1">
                        <input autoFocus type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onClick={(e) => e.stopPropagation()} className="w-full px-1 py-0.5 text-xs border rounded focus:border-catalog-accent outline-none" onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename(item.id, editName);
                            if (e.key === 'Escape') {
                                // setEditingItem(null) - will be handled by parent logic
                            }
                        }} />
                        <button onClick={(e) => { e.stopPropagation(); handleRename(item.id, editName); }} className="action-btn p-0.5 text-green-600"><Check className="w-3 h-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); /* setEditingItem(null) */ }} className="action-btn p-0.5 text-red-500"><X className="w-3 h-3" /></button>
                    </div>
                ) : (
                    <div className="flex items-center justify-between group/info">
                        <div className="truncate">
                            <p className="text-sm font-medium text-gray-700 truncate" title={item.filename}>{item.filename}</p>
                            {item.size > 0 && <p className="text-xs text-gray-400 mt-0.5">{(item.size / 1024 / 1024).toFixed(1)} MB</p>}
                            <div className="flex flex-wrap gap-1 mt-1">
                                {(item.tags || []).map((tag: string) => <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">#{tag}</span>)}
                                {(!item.tags || item.tags.length === 0) && <span className="text-[10px] text-gray-300 italic">No tags</span>}
                            </div>
                        </div>
                        {(activeTab === 'uploads' || isAdmin) && (
                            <div className="flex items-center gap-1 opacity-100 group-hover/info:opacity-100 transition-all">
                                {activeTab === 'uploads' && (
                                    <button className="action-btn p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600" onClick={(e) => {
                                        e.stopPropagation();
                                        onMove(item);
                                    }} title="Move to Folder">
                                        <FolderInput className="w-3 h-3" />
                                    </button>
                                )}
                                <button className="action-btn p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600" onClick={(e) => {
                                    e.stopPropagation();
                                    const newTagsString = prompt("Edit tags (comma separated):", (item.tags || []).join(", "));
                                    if (newTagsString !== null) {
                                        const newTags = newTagsString.split(',').map((t: string) => t.trim()).filter(Boolean);
                                        handleUpdateTags(item.id, newTags);
                                    }
                                }} title="Edit Tags">
                                    <Edit2 className="w-3 h-3" />
                                </button>
                                <button className="action-btn p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-500" onClick={(e) => {
                                    e.stopPropagation();
                                    if (typeof onShowMetadata === 'function') {
                                        onShowMetadata(item, imageDims, videoDuration);
                                    } else {
                                        console.warn('[MediaLibrary] onShowMetadata is not a function');
                                    }
                                }} title="Info & Metadata">
                                    <Info className="w-3 h-3" />
                                </button>
                                <button className="action-btn p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600" onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete([item.id]);
                                }} title="Delete Item">
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function MediaLibrary() {
    const { familyId, userRole } = useAuth();
    const navigate = useNavigate();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const [activeTab, setActiveTab] = useState<LibraryTab>('uploads');
    const [systemCategory, setSystemCategory] = useState<SystemCategory>('background');

    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [previewingImage, setPreviewingImage] = useState<string | null>(null);
    const [previewingImageKey, setPreviewingImageKey] = useState<string | undefined>(undefined);
    const [previewingVideo, setPreviewingVideo] = useState<string | null>(null);
    const [previewingVideoKey, setPreviewingVideoKey] = useState<string | undefined>(undefined);
    const [previewingVideoPoster, setPreviewingVideoPoster] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const [editingItem, setEditingItem] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [metadataModalData, setMetadataModalData] = useState<{ item: MediaItem; dims: { w: number; h: number } | null; duration: number | null } | null>(null);

    // UI state
    const [isCreateStackModalOpen, setIsCreateStackModalOpen] = useState(false);
    const [currentPath, setCurrentPath] = useState<string>('/'); // Hierarchical path
    const [uploadProgress] = useState<Record<string, number>>({});
    const [uploadFolder, setUploadFolder] = useState<string>('/');
    const [isDragging, setIsDragging] = useState(false);

    // Move & Create Folder state
    const [moveModalItem, setMoveModalItem] = useState<MediaItem | null>(null);
    const [moveModalItems, setMoveModalItems] = useState<MediaItem[]>([]);
    const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');

    const [useHls, setUseHls] = useState(false); // Toggle for HLS adaptive streaming
    const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);


    useEffect(() => {
        if (!familyId) {
            setIsLoading(false);
            return;
        }
        fetchMedia();
        setSelectedItems(new Set());
    }, [familyId, activeTab, systemCategory]);


    async function fetchMedia() {
        setIsLoading(true);
        let data: any[] = [];

        if (activeTab === 'uploads') {
            const result = await supabase
                .from('family_media')
                .select('id, family_id, url, type, category, folder, filename, size, tags, uploaded_by, created_at, metadata')
                .eq('family_id', familyId!)
                .order('created_at', { ascending: false });

            if (result.error) {
                console.error('Error fetching family mediaItems:', result.error);
            }
            data = result.data || [];
        } else {
            const result = await supabase
                .from('library_assets')
                .select('*')
                .eq('category', systemCategory)
                .order('created_at', { ascending: false });

            if (result.data) {
                data = result.data.map((item: any) => ({
                    id: item.id,
                    url: item.url,
                    type: 'image',
                    filename: item.name,
                    folder: 'System Library',
                    category: item.category,
                    created_at: item.created_at,
                    size: 0,
                    tags: item.tags || [],
                    isSystemAsset: true
                }));
            }
        }

        // Usage Counting Logic
        // 1. Fetch all potential usage sources
        // Note: For large datasets, this should be done via an RPC function or separate tailored queries.
        // For now, we fetch skeletal data to compute usage client-side or use existing queries.

        const usageMap: Record<string, number> = {};

        // A. Albums (Pages Assets)
        // We look at 'pages' table (legacy) or 'album_pages' (unified). The 'assets' table stores page elements.
        const { data: assetUsage } = await supabase
            .from('assets')
            .select('url');

        assetUsage?.forEach((asset: any) => {
            if (asset.url) usageMap[asset.url] = (usageMap[asset.url] || 0) + 1;
        });

        // B. Events (Presentation URL + Content Assets)
        const { data: eventUsage } = await supabase
            .from('events')
            .select('content');

        eventUsage?.forEach((evt: any) => {
            const content = typeof evt.content === 'string' ? JSON.parse(evt.content) : evt.content;
            if (!content) return;

            // Presentation URL
            if (content.presentationUrl) {
                usageMap[content.presentationUrl] = (usageMap[content.presentationUrl] || 0) + 1;
            }

            // Gallery/Story Assets
            if (Array.isArray(content.assets)) {
                content.assets.forEach((a: any) => {
                    if (a.url) usageMap[a.url] = (usageMap[a.url] || 0) + 1;
                });
            }

            // Rich Text Story Images (Regex find)
            if (content.description && typeof content.description === 'string') {
                const imgRegex = /src="([^"]+)"/g;
                let match;
                while ((match = imgRegex.exec(content.description)) !== null) {
                    if (match[1]) usageMap[match[1]] = (usageMap[match[1]] || 0) + 1;
                }
            }
        });

        // C. Albums (Covers and Page Assets already in assetUsage)
        const { data: albumUsage } = await supabase
            .from('albums')
            .select('config');

        albumUsage?.forEach((alb: any) => {
            let config = alb.config || {};
            if (typeof config === 'string') {
                try { config = JSON.parse(config); } catch (e) { config = {}; }
            }
            const coverUrl = config.coverImage || (config.cover && config.cover.url);
            if (coverUrl) {
                usageMap[coverUrl] = (usageMap[coverUrl] || 0) + 1;
            }
        });

        // D. Profiles (Avatars)
        const { data: profileUsage } = await supabase
            .from('profiles')
            .select('avatar_url');

        profileUsage?.forEach((p: any) => {
            if (p.avatar_url) usageMap[p.avatar_url] = (usageMap[p.avatar_url] || 0) + 1;
        });

        // E. Home / Hero Image (DB Settings)
        const { data: familySettings } = await (supabase.from('family_settings' as any) as any)
            .select('hero_image_url')
            .eq('family_id', familyId!);

        familySettings?.forEach((s: any) => {
            if (s.hero_image_url) usageMap[s.hero_image_url] = (usageMap[s.hero_image_url] || 0) + 1;
        });

        // F. Stacks (mediaItems Items)
        const { data: stackUsage } = await (supabase.from('stacks' as any) as any)
            .select('media_items')
            .eq('family_id', familyId!);

        stackUsage?.forEach((stack: any) => {
            if (Array.isArray(stack.media_items)) {
                stack.media_items.forEach((m: any) => {
                    if (m.url) usageMap[m.url] = (usageMap[m.url] || 0) + 1;
                });
            }
        });


        // Add usage count to mediaItems items
        // Normalizing URLs can be tricky (parameters etc). We attempt exact match or base match.
        const mediaWithUsage = data.map(item => {
            // Simple normalization (ignore query params for matching?)
            // Many URLs in DB might have params or not.
            // This is expensive O(N) lookup without better structure, let's keep it simple for now.
            let count = usageMap[item.url] || 0;

            // If 0, try matching without query params if item.url has them
            if (count === 0 && item.url.includes('?')) {
                // usageMap might keys might also have params or not.
                // This is expensive O(N) lookup without better structure, let's keep it simple for now.
            }
            return { ...item, usageCount: count };
        });

        setMediaItems(mediaWithUsage as MediaItem[]);
        setIsLoading(false);
    }


    const Breadcrumbs = () => {
        if (activeTab === 'system') return null;
        const isRoot = currentPath === '/' || currentPath === 'All';
        const parts = isRoot ? [] : currentPath.split('/').filter(Boolean);

        return (
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest mb-6 bg-white self-start px-4 py-2 rounded-full border border-gray-100 shadow-sm overflow-x-auto no-scrollbar max-w-full">
                <button
                    onClick={() => setCurrentPath('/')}
                    className={cn(
                        "flex items-center gap-1.5 hover:text-catalog-accent transition-all shrink-0",
                        currentPath === '/' ? "text-catalog-accent" : "text-gray-400"
                    )}
                >
                    <Home className="w-3.5 h-3.5" />
                    <span>Vault</span>
                </button>

                {currentPath === 'All' && (
                    <div className="flex items-center gap-1.5 shrink-0">
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className="text-catalog-accent">Vault Library</span>
                    </div>
                )}

                {parts.map((part, i) => {
                    const path = parts.slice(0, i + 1).join('/');
                    return (
                        <div key={path} className="flex items-center gap-1.5 shrink-0">
                            <ChevronRight className="w-3 h-3 text-gray-300" />
                            <button
                                onClick={() => setCurrentPath(path)}
                                className={cn(
                                    "hover:text-catalog-accent transition-all",
                                    i === parts.length - 1 ? "text-catalog-accent" : "text-gray-400"
                                )}
                            >
                                {part}
                            </button>
                        </div>
                    );
                })}
            </div>
        );
    };


    async function handleBulkEditTags() {
        if (selectedItems.size === 0) return;

        const tagsInput = prompt(`Edit tags for ${selectedItems.size} items (comma separated):`);
        if (tagsInput === null) return;

        const newTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
        const table = activeTab === 'uploads' ? 'family_media' : 'library_assets';

        setIsLoading(true);
        for (const id of Array.from(selectedItems)) {
            await (supabase.from(table as any) as any).update({ tags: newTags }).eq('id', id);
        }
        setMediaItems(prev => prev.map(m => selectedItems.has(m.id) ? { ...m, tags: newTags } : m));
        setIsLoading(false);
    }

    async function handleDelete(ids: string[]) {
        const itemsToDelete = mediaItems.filter(m => ids.includes(m.id));

        // Strict Usage Check
        const usedItems = itemsToDelete.filter(m => (m.usageCount || 0) > 0);

        if (usedItems.length > 0) {
            alert(`Unable to delete ${usedItems.length} item(s) because they are currently used in albums, events, or profiles.\n\nPlease remove them from the specific pages/events first.`);
            return;
        }

        const confirmMessage = itemsToDelete.length === 1
            ? `Delete "${itemsToDelete[0].filename || itemsToDelete[0].url.split('/').pop()}"?`
            : `Delete ${itemsToDelete.length} items?`;

        if (!confirm(confirmMessage)) return;

        if (activeTab === 'system' && !isAdmin) {
            alert("Only admins can delete System Assets.");
            return;
        }

        setIsLoading(true);

        const { storageService } = await import('../services/storage');

        // Delete from Cloud Storage first (parallel best effort)
        try {
            await Promise.all(itemsToDelete.map(item => 
                storageService.deleteFile(item.url)
                    .catch(e => console.warn(`Failed to delete ${item.url} from cloud:`, e))
            ));
        } catch (e) {
            console.warn("Global catch for cloud deletions:", e);
        }

        // Delete from DB
        const table = activeTab === 'uploads' ? 'family_media' : 'library_assets';
        await (supabase.from(table as any) as any).delete().in('id', ids);

        setSelectedItems(new Set());
        await fetchMedia();
        setIsLoading(false);
    }


    async function handleUpdateTags(id: string, newTags: string[]) {
        if (activeTab === 'system' && !isAdmin) return;
        const table = activeTab === 'uploads' ? 'family_media' : 'library_assets';
        await (supabase.from(table as any) as any).update({ tags: newTags }).eq('id', id);
        setMediaItems(prev => prev.map(m => m.id === id ? { ...m, tags: newTags } : m));
    }

    async function handleRename(id: string, newName: string) {
        if (!newName.trim() || (activeTab === 'system' && !isAdmin)) return;
        const table = activeTab === 'uploads' ? 'family_media' : 'library_assets';
        const field = activeTab === 'uploads' ? 'filename' : 'name';
        await (supabase.from(table as any) as any).update({ [field]: newName }).eq('id', id);

        // Optimistic update
        setMediaItems(prev => prev.map(m => m.id === id ? { ...m, [field === 'filename' ? 'filename' : 'name']: newName } : m));
        setEditingItem(null);
    }

    /** Move one (or multiple selected) items to a different folder */
    async function handleMoveToFolder(targetFolder: string) {
        const idsToMove = moveModalItems.length > 0
            ? moveModalItems.map(i => i.id)
            : moveModalItem ? [moveModalItem.id] : [];
        if (!idsToMove.length) return;

        await (supabase.from('family_media') as any)
            .update({ folder: targetFolder })
            .in('id', idsToMove);

        // Optimistic update
        setMediaItems(prev => prev.map(m => idsToMove.includes(m.id) ? { ...m, folder: targetFolder } : m));
        setMoveModalItem(null);
        setMoveModalItems([]);
    }

    /** Creates a "virtual" folder by setting the current upload path — no DB row needed */
    function handleCreateFolder() {
        const trimmed = newFolderName.trim();
        if (!trimmed) return;
        // Build path: if we're inside a folder already, nest inside it
        const fullPath = currentPath && currentPath !== '/' && currentPath !== 'All'
            ? `${currentPath}/${trimmed}`
            : trimmed;
        setCurrentPath(fullPath);
        setUploadFolder(fullPath);
        setNewFolderName('');
        setShowCreateFolderModal(false);
    }

    const allFolders = Array.from(new Set(mediaItems.map(m => m.folder || '/'))).sort();

    // Group folders by hierarchy based on currentPath
    const subFolders = useMemo(() => {
        if (activeTab === 'system') return [];

        // Better logic: find UNIQUE first-level subfolders from currentPath
        const childSet = new Set<string>();
        allFolders.forEach(f => {
            if (f === currentPath) return;
            if (currentPath === '/') {
                const firstPart = f.split('/')[0];
                if (firstPart) childSet.add(firstPart);
            } else if (f.startsWith(currentPath + '/')) {
                const relative = f.substring(currentPath.length + 1);
                const firstPart = relative.split('/')[0];
                if (firstPart) childSet.add(firstPart);
            }
        });

        return Array.from(childSet).sort().map(name => ({
            name,
            path: currentPath === '/' ? name : `${currentPath}/${name}`,
            count: mediaItems.filter(m => m.folder === (currentPath === '/' ? name : `${currentPath}/${name}`) || (m.folder || '').startsWith((currentPath === '/' ? name : `${currentPath}/${name}`) + '/')).length
        }));
    }, [allFolders, currentPath, mediaItems, activeTab]);

    const displayedItems = mediaItems.filter(item => {
        const itemFolder = item.folder || '/';
        const matchesFolder = activeTab === 'system' || (currentPath === 'All' ? true : itemFolder === currentPath);
        const searchLower = searchQuery.toLowerCase();
        const matchesSearch = item.filename?.toLowerCase().includes(searchLower) || (item.tags || []).some(t => t.toLowerCase().includes(searchLower));
        const matchesType = filterType === 'all' || item.type === filterType;
        return matchesFolder && matchesSearch && matchesType;
    }).sort((a, b) => {
        const multiplier = sortOrder === 'asc' ? 1 : -1;
        if (sortBy === 'name') return (a.filename || '').localeCompare(b.filename || '') * multiplier;
        if (sortBy === 'size') return ((a.size || 0) - (b.size || 0)) * multiplier;
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * multiplier;
    });

    const toggleSelectAll = () => {
        if (selectedItems.size === displayedItems.length && displayedItems.length > 0) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(displayedItems.map(i => i.id)));
        }
    };

    return (
        <div
            className="flex h-[calc(100vh-64px)] bg-gray-50"
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); }}
        >
            <div className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
                <div className="p-4 border-b border-gray-100 space-y-4">
                    <h2 className="font-serif text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Folder className="w-5 h-5 text-catalog-accent" />
                        Library
                    </h2>

                    <div className="flex p-1 bg-gray-100 rounded-lg">
                        <button onClick={() => { setActiveTab('uploads'); setCurrentPath('/'); }} className={cn("flex-1 py-1.5 text-xs font-medium rounded-md transition-all", activeTab === 'uploads' ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-900")}>
                            My Uploads
                        </button>
                        <button onClick={() => setActiveTab('system')} className={cn("flex-1 py-1.5 text-xs font-medium rounded-md transition-all", activeTab === 'system' ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-900")}>
                            System Assets
                        </button>
                    </div>

                    {activeTab === 'system' && (
                        <div className="flex flex-col gap-1">
                            <button onClick={() => setSystemCategory('background')} className={cn("flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", systemCategory === 'background' ? "bg-catalog-accent/10 text-catalog-accent font-medium" : "text-gray-600 hover:bg-gray-50")}>
                                <Palette className="w-4 h-4" /> Backgrounds
                            </button>
                            <button onClick={() => setSystemCategory('sticker')} className={cn("flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", systemCategory === 'sticker' ? "bg-catalog-accent/10 text-catalog-accent font-medium" : "text-gray-600 hover:bg-gray-50")}>
                                <Sticker className="w-4 h-4" /> Stickers
                            </button>
                            <button onClick={() => setSystemCategory('frame')} className={cn("flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", systemCategory === 'frame' ? "bg-catalog-accent/10 text-catalog-accent font-medium" : "text-gray-600 hover:bg-gray-50")}>
                                <Square className="w-4 h-4" /> Frames
                            </button>
                            <button onClick={() => setSystemCategory('ribbon')} className={cn("flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors", systemCategory === 'ribbon' ? "bg-catalog-accent/10 text-catalog-accent font-medium" : "text-gray-600 hover:bg-gray-50")}>
                                <ImageIcon className="w-4 h-4" /> Ribbons
                            </button>
                        </div>
                    )}

                    {(activeTab === 'uploads' || isAdmin) && (
                        <div className="space-y-2">
                            {/* HLS Toggles */}
                            <div className="flex items-center justify-between px-2 mb-2 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase text-gray-500 tracking-tighter">Adaptive Bitrate</span>
                                    <span className="text-[7px] font-bold text-gray-400">HLS Streaming</span>
                                </div>
                                <button
                                    onClick={() => setUseHls(!useHls)}
                                    className={cn(
                                        "relative w-8 h-4 rounded-full transition-all duration-300 p-0.5 shadow-inner",
                                        useHls ? "bg-catalog-accent" : "bg-gray-200"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-md transition-all duration-300",
                                        useHls ? "left-[18px]" : "left-0.5"
                                    )} />
                                </button>
                            </div>
                            {/* Universal Upload Button — replaces old scatter of upload/google buttons */}
                            <UniversalUploadButton
                                variant="sidebar"
                                label={activeTab === 'system' ? 'Add Asset' : 'Add Media'}
                                familyId={familyId}
                                folder={activeTab === 'system' ? (currentPath === '/' ? 'sticker' : currentPath) : (uploadFolder !== '/' ? uploadFolder : undefined)}
                                useHls={useHls}
                                isSystemAsset={activeTab === 'system'}
                                onComplete={() => fetchMedia()}
                            />
                        </div>
                    )}
                </div>

                {activeTab === 'uploads' && (
                    <div className="flex-1 overflow-y-auto p-3 space-y-1">
                        <button onClick={() => setCurrentPath('All')} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left", currentPath === 'All' ? "bg-catalog-accent/10 text-catalog-accent font-semibold" : "text-gray-600 hover:bg-gray-50")}>
                            <Grid className="w-4 h-4" /> All Vault Media
                        </button>

                        <div className="flex items-center justify-between pt-4 pb-2 px-3">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hierarchy</span>
                            <button
                                onClick={() => { setNewFolderName(''); setShowCreateFolderModal(true); }}
                                className="flex items-center gap-1 text-[10px] font-bold text-catalog-accent hover:text-catalog-accent/80 uppercase tracking-widest transition-colors"
                                title="Create new folder"
                            >
                                <Plus className="w-3 h-3" />
                                New
                            </button>
                        </div>

                        {/* Recursive Sidebar View or just Root Folders */}
                        {Array.from(new Set(mediaItems.map(m => (m.folder || '').split('/')[0]).filter(Boolean))).sort().map(root => (
                            <button
                                key={root}
                                onClick={() => setCurrentPath(root)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left",
                                    currentPath.startsWith(root) ? "text-catalog-accent font-medium" : "text-gray-600 hover:bg-gray-50"
                                )}
                            >
                                <Folder className={cn("w-4 h-4", currentPath.startsWith(root) ? "fill-catalog-accent/20" : "text-gray-400")} />
                                <span className="truncate">{root}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 flex flex-col bg-gray-50/50 relative">
                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-catalog-accent/20 backdrop-blur-sm flex items-center justify-center pointer-events-none border-4 border-dashed border-catalog-accent m-4 rounded-2xl animate-in fade-in zoom-in duration-200">
                        <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-catalog-accent/10 rounded-full flex items-center justify-center">
                                <Upload className="w-8 h-8 text-catalog-accent animate-bounce" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-bold text-gray-900">Drop files to upload</h3>
                                <p className="text-sm text-gray-500">Add them to your {uploadFolder === '/' ? 'Library' : `"${uploadFolder}" folder`}</p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="h-14 border-b border-gray-200 bg-white px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                        <button onClick={toggleSelectAll} className="flex items-center gap-2 hover:text-gray-900 transition-colors">
                            {selectedItems.size === displayedItems.length && displayedItems.length > 0 ? <CheckSquare className="w-5 h-5 text-catalog-accent" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <span className="font-medium">Select All</span>
                        </button>
                        <div className="h-4 w-px bg-gray-300" />
                        <span className="font-medium text-gray-900">{displayedItems.length} items</span>
                        {selectedItems.size > 0 && <span className="px-2 py-0.5 bg-catalog-accent/10 text-catalog-accent rounded-full text-xs font-medium">{selectedItems.size} selected</span>}
                    </div>

                    <div className="flex items-center gap-3">
                        <MinimizedUploadBadge />
                        {selectedItems.size > 0 && (activeTab === 'uploads' || isAdmin) && (
                            <>
                                <button onClick={handleBulkEditTags} className="flex items-center gap-1.5 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                    <Edit2 className="w-4 h-4" /> Edit Tags ({selectedItems.size})
                                </button>
                                <button onClick={() => handleDelete(Array.from(selectedItems))} className="flex items-center gap-1.5 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                                    <Trash2 className="w-4 h-4" /> Delete ({selectedItems.size})
                                </button>
                                <button
                                    onClick={() => setIsCreateStackModalOpen(true)}
                                    className="flex items-center gap-1.5 bg-catalog-accent text-white px-4 py-1.5 rounded-lg text-sm font-bold shadow-lg shadow-catalog-accent/20 hover:scale-105 transition-all"
                                >
                                    <SparklesIcon className="w-4 h-4" /> Create Memory
                                </button>
                            </>
                        )}
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-catalog-accent transition-colors" />
                            <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 pr-4 py-1.5 w-48 border border-gray-200 bg-gray-50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 focus:border-catalog-accent focus:bg-white transition-all" />
                        </div>

                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
                            <select
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                                className="text-xs bg-transparent border-none focus:ring-0 text-gray-600 font-medium py-1 pl-2 pr-6 cursor-pointer hover:bg-gray-50 rounded-md"
                            >
                                <option value="all">All Types</option>
                                <option value="image">Images</option>
                                <option value="video">Videos</option>
                            </select>
                            <div className="w-px h-4 bg-gray-200 mx-1" />
                            <select
                                value={`${sortBy}-${sortOrder}`}
                                onChange={(e) => {
                                    const [field, order] = e.target.value.split('-');
                                    setSortBy(field as any);
                                    setSortOrder(order as any);
                                }}
                                className="text-xs bg-transparent border-none focus:ring-0 text-gray-600 font-medium py-1 pl-2 pr-6 cursor-pointer hover:bg-gray-50 rounded-md"
                            >
                                <option value="date-desc">Newest</option>
                                <option value="date-asc">Oldest</option>
                                <option value="name-asc">A-Z</option>
                                <option value="name-desc">Z-A</option>
                                <option value="size-desc">Largest</option>
                                <option value="size-asc">Smallest</option>
                            </select>
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                            <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600")}>
                                <Grid className="w-4 h-4" />
                            </button>
                            <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-white shadow-sm text-gray-900" : "text-gray-400 hover:text-gray-600")}>
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Grid / Content Area */}
                <div className="flex-1 overflow-y-auto p-6 content-scrollbar">
                    <Breadcrumbs />

                    {isLoading ? (
                        <div className="flex h-full items-center justify-center">
                            <Loader2 className="w-8 h-8 animate-spin text-catalog-accent/30" />
                        </div>
                    ) : (
                        <div className={cn("grid gap-6 pb-20", viewMode === 'grid' ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" : "grid-cols-1")}>
                            {/* Subfolders in Grid */}
                            {currentPath !== 'All' && subFolders.map(folder => (
                                <div
                                    key={folder.path}
                                    onClick={() => setCurrentPath(folder.path)}
                                    className={cn(
                                        "group relative bg-white border border-gray-100 rounded-xl p-4 flex flex-col items-center justify-center gap-3 cursor-pointer hover:shadow-xl hover:border-catalog-accent/50 hover:-translate-y-1 transition-all duration-300",
                                        viewMode === 'list' && "flex-row h-16 py-2 px-4 justify-start"
                                    )}
                                >
                                    <div className="w-12 h-12 bg-catalog-accent/5 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <FolderOpen className="w-6 h-6 text-catalog-accent fill-catalog-accent/10" />
                                    </div>
                                    <div className={cn("text-center min-w-0", viewMode === 'list' && "text-left")}>
                                        <p className="text-sm font-bold text-gray-900 truncate">{folder.name}</p>
                                        <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">{folder.count} items</p>
                                    </div>
                                </div>
                            ))}

                            {displayedItems.length === 0 && subFolders.length === 0 && currentPath !== 'All' ? (
                                <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white/40 border-2 border-dashed border-black/5 rounded-[2.5rem]">
                                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-[2rem] flex items-center justify-center mb-6">
                                        <FolderOpen className="w-8 h-8 text-catalog-accent/30" />
                                    </div>
                                    <h3 className="text-xl font-bold text-catalog-text mb-2">This folder is empty</h3>
                                    <p className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.3em] mb-8">Upload media or create sub-folders</p>
                                     <UniversalUploadButton
                                         variant="primary"
                                         label={activeTab === 'system' ? 'Add Asset' : 'Add Media'}
                                         familyId={familyId}
                                         folder={currentPath !== 'All' ? currentPath : undefined}
                                         isSystemAsset={activeTab === 'system'}
                                         onComplete={() => fetchMedia()}
                                     />
                                </div>
                            ) : displayedItems.length === 0 && currentPath === 'All' ? (
                                <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white/40 border-2 border-dashed border-black/5 rounded-[2.5rem]">
                                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-[2rem] flex items-center justify-center mb-6">
                                        <ImageIcon className="w-8 h-8 text-catalog-accent/30" />
                                    </div>
                                    <h3 className="text-xl font-bold text-catalog-text mb-2">Your library is empty</h3>
                                    <p className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.3em] mb-8">Start by uploading some moments</p>
                                     <UniversalUploadButton
                                         variant="primary"
                                         label={activeTab === 'system' ? 'Add Asset' : 'Add Media'}
                                         familyId={familyId}
                                         isSystemAsset={activeTab === 'system'}
                                         onComplete={() => fetchMedia()}
                                     />
                                </div>
                            ) : !familyId ? (
                                <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white/40 border-2 border-dashed border-black/5 rounded-[2.5rem]">
                                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-[2rem] flex items-center justify-center mb-6">
                                        <UsersIcon className="w-8 h-8 text-catalog-accent/30" />
                                    </div>
                                    <h3 className="text-xl font-bold text-catalog-text mb-2">No active group</h3>
                                    <p className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.3em] mb-8">Join or create a group to start your catalog</p>
                                    <button 
                                        onClick={() => navigate('/settings')}
                                        className="px-8 py-3 bg-catalog-accent text-white rounded-full text-xs font-bold uppercase tracking-widest shadow-xl shadow-catalog-accent/20 hover:scale-105 transition-all"
                                    >
                                        Go to Settings
                                    </button>
                                </div>
                            ) : null}

                            {displayedItems.map(item => (
                                <MediaGridItem
                                    key={item.id}
                                    item={item}
                                    viewMode={viewMode}
                                    selectedItems={selectedItems}
                                    onToggleSelect={(id: string, e?: React.MouseEvent) => {
                                        const newSet = new Set(selectedItems);
                                        const currentIndex = displayedItems.findIndex(i => i.id === id);

                                        if (e?.shiftKey && lastSelectedIdx !== null) {
                                            const start = Math.min(lastSelectedIdx, currentIndex);
                                            const end = Math.max(lastSelectedIdx, currentIndex);
                                            const itemsInRange = displayedItems.slice(start, end + 1);
                                            
                                            // If the item we just clicked is already selected, we are likely deselecting the range
                                            const wasSelected = selectedItems.has(id);
                                            itemsInRange.forEach(item => {
                                                if (wasSelected) newSet.delete(item.id);
                                                else newSet.add(item.id);
                                            });
                                        } else {
                                            if (newSet.has(id)) newSet.delete(id);
                                            else newSet.add(id);
                                        }
                                        
                                        setSelectedItems(newSet);
                                        setLastSelectedIdx(currentIndex);
                                    }}
                                    editingItem={editingItem}
                                    editName={editName}
                                    setEditName={setEditName}
                                    handleRename={handleRename}
                                    handleUpdateTags={handleUpdateTags}
                                    handleDelete={handleDelete}
                                    isAdmin={isAdmin}
                                    activeTab={activeTab}
                                    onMove={(item: MediaItem) => {
                                        // If multiple selected, move them all; otherwise just this one
                                        if (selectedItems.size > 1 && selectedItems.has(item.id)) {
                                            setMoveModalItems(mediaItems.filter(m => selectedItems.has(m.id)));
                                            setMoveModalItem(null);
                                        } else {
                                            setMoveModalItem(item);
                                            setMoveModalItems([]);
                                        }
                                    }}
                                    onPreview={(item: any) => {
                                        const r2Key = item.metadata?.r2Key;
                                        if (item.type === 'video') {
                                            setPreviewingVideo(item.url);
                                            setPreviewingVideoKey(r2Key);
                                            setPreviewingVideoPoster(undefined);
                                        } else {
                                            setPreviewingImage(item.url);
                                            setPreviewingImageKey(r2Key);
                                        }
                                    }}
                                    onShowMetadata={(item: MediaItem, dims: { w: number; h: number } | null, duration: number | null) => {
                                        setMetadataModalData({ item, dims, duration });
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {isCreateStackModalOpen && (
                <CreateStackModal
                    isOpen={isCreateStackModalOpen}
                    onClose={() => setIsCreateStackModalOpen(false)}
                    initialSelected={mediaItems.filter(m => selectedItems.has(m.id))}
                    onCreated={() => {
                        setIsCreateStackModalOpen(false);
                        setSelectedItems(new Set());
                    }}
                />
            )}



            <UploadOverlay
                isOpen={Object.keys(uploadProgress).length > 0}
                progress={uploadProgress}
                title="Migrating to Permanent Storage..."
            />

            {previewingImage && (
                <ImagePortal
                    imageUrl={previewingImage}
                    objectKey={previewingImageKey}
                    onClose={() => {
                        setPreviewingImage(null);
                        setPreviewingImageKey(undefined);
                    }}
                />
            )}

            {previewingVideo && (
                <VideoPortal
                    videoUrl={previewingVideo}
                    objectKey={previewingVideoKey}
                    posterUrl={previewingVideoPoster}
                    onClose={() => {
                        setPreviewingVideo(null);
                        setPreviewingVideoKey(undefined);
                        setPreviewingVideoPoster(undefined);
                    }}
                />
            )}

            {/* ── Move to Folder Modal ─────────────────────────────────────────── */}
            {(moveModalItem || moveModalItems.length > 0) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => { setMoveModalItem(null); setMoveModalItems([]); }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h2 className="text-base font-bold text-gray-900">Move to Folder</h2>
                                <p className="text-xs text-gray-400 mt-0.5">
                                    {moveModalItems.length > 1
                                        ? `Moving ${moveModalItems.length} items`
                                        : `Moving: ${moveModalItem?.filename || 'item'}`}
                                </p>
                            </div>
                            <button onClick={() => { setMoveModalItem(null); setMoveModalItems([]); }} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-3 max-h-72 overflow-y-auto space-y-1">
                            {allFolders.filter(f => f !== '/' && f !== moveModalItem?.folder).length === 0 && (
                                <p className="text-center text-sm text-gray-400 py-6">No other folders yet.<br />Create one using the button below.</p>
                            )}
                            {moveModalItem?.folder !== '/' && (
                                <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-catalog-accent/5 text-left transition-colors group" onClick={() => handleMoveToFolder('/')}>
                                    <div className="w-8 h-8 rounded-lg bg-catalog-accent/10 flex items-center justify-center">
                                        <Home className="w-4 h-4 text-catalog-accent" />
                                    </div>
                                    <span className="text-sm font-semibold text-gray-700">Vault (Root)</span>
                                </button>
                            )}
                            {allFolders.filter(f => f !== '/' && f !== moveModalItem?.folder).map(folder => (
                                <button key={folder} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-catalog-accent/5 text-left transition-colors group" onClick={() => handleMoveToFolder(folder)}>
                                    <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                                        <FolderOpen className="w-4 h-4 text-amber-500 fill-amber-100" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-700 truncate">{folder.split('/').pop()}</p>
                                        {folder.includes('/') && <p className="text-[10px] text-gray-400 truncate">{folder}</p>}
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-catalog-accent transition-colors shrink-0" />
                                </button>
                            ))}
                        </div>
                        <div className="px-4 pb-4">
                            <button onClick={() => { setMoveModalItem(null); setMoveModalItems([]); setNewFolderName(''); setShowCreateFolderModal(true); }}
                                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 py-2.5 rounded-xl text-sm text-gray-400 hover:border-catalog-accent hover:text-catalog-accent transition-all font-medium">
                                <Plus className="w-4 h-4" />
                                Create new folder
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Create Folder Modal ──────────────────────────────────────────── */}
            {showCreateFolderModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowCreateFolderModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">New Folder</h2>
                            <button onClick={() => setShowCreateFolderModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {currentPath && currentPath !== '/' && currentPath !== 'All' && (
                                <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg">
                                    Creating inside: <span className="font-semibold text-gray-600">{currentPath}</span>
                                </p>
                            )}
                            <input
                                autoFocus
                                type="text"
                                placeholder="Folder name (e.g. Vacations)"
                                value={newFolderName}
                                onChange={e => setNewFolderName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 focus:border-catalog-accent"
                            />
                            <button disabled={!newFolderName.trim()} onClick={handleCreateFolder}
                                className="w-full py-2.5 bg-catalog-accent text-white rounded-xl text-sm font-bold hover:bg-catalog-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                Create Folder
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Metadata Modal ───────────────────────────────────────────────── */}
            {metadataModalData && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setMetadataModalData(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Info className="w-5 h-5 text-catalog-accent" />
                                File Metadata
                            </h2>
                            <button onClick={() => setMetadataModalData(null)} className="p-1.5 bg-gray-200/50 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-600" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                            <div className="grid grid-cols-3 gap-y-4 gap-x-4 text-sm">
                                <div className="text-gray-500 font-medium col-span-1">Name</div>
                                <div className="text-gray-900 col-span-2 font-semibold break-all">{metadataModalData.item.filename}</div>

                                <div className="text-gray-500 font-medium col-span-1">Size</div>
                                <div className="text-gray-900 col-span-2">
                                    {metadataModalData.item.size < 1024 
                                        ? `${metadataModalData.item.size} Bytes` 
                                        : metadataModalData.item.size < 1024 * 1024 
                                            ? `${(metadataModalData.item.size / 1024).toFixed(1)} KB` 
                                            : `${(metadataModalData.item.size / 1024 / 1024).toFixed(2)} MB`}
                                </div>

                                <div className="text-gray-500 font-medium col-span-1">Type</div>
                                <div className="text-gray-900 col-span-2 capitalize">{metadataModalData.item.type}</div>

                                <div className="text-gray-500 font-medium col-span-1">Date Added</div>
                                <div className="text-gray-900 col-span-2">{new Date(metadataModalData.item.created_at).toLocaleString()}</div>

                                {(metadataModalData.item.metadata?.creationTime || metadataModalData.item.metadata?.dateTaken) && (
                                    <>
                                        <div className="text-gray-500 font-medium col-span-1">Date Taken</div>
                                        <div className="text-gray-900 col-span-2">
                                            {new Date(metadataModalData.item.metadata.creationTime || metadataModalData.item.metadata.dateTaken).toLocaleString()}
                                        </div>
                                    </>
                                )}

                                {(metadataModalData.dims || metadataModalData.item.metadata?.resolution) && (
                                    <>
                                        <div className="text-gray-500 font-medium col-span-1">Dimensions</div>
                                        <div className="text-gray-900 col-span-2">
                                            {metadataModalData.dims 
                                                ? `${metadataModalData.dims.w} × ${metadataModalData.dims.h} pixels`
                                                : metadataModalData.item.metadata?.resolution.replace('x', ' × ') + ' pixels'
                                            }
                                        </div>

                                        <div className="text-gray-500 font-medium col-span-1">Resolution</div>
                                        <div className="text-gray-900 col-span-2">
                                            {metadataModalData.dims
                                                ? `${((metadataModalData.dims.w * metadataModalData.dims.h) / 1000000).toFixed(1)} MP`
                                                : (parseInt(metadataModalData.item.metadata?.resolution.split('x')[0]) * parseInt(metadataModalData.item.metadata?.resolution.split('x')[1]) / 1000000).toFixed(1) + ' MP'
                                            }
                                        </div>
                                    </>
                                )}

                                {metadataModalData.duration !== null && (
                                    <>
                                        <div className="text-gray-500 font-medium col-span-1">Duration</div>
                                        <div className="text-gray-900 col-span-2 flex items-center gap-1">
                                            <Play className="w-3 h-3 text-catalog-accent" />
                                            {formatDuration(metadataModalData.duration)}
                                        </div>
                                    </>
                                )}

                                <div className="text-gray-500 font-medium col-span-1">Location</div>
                                <div className="text-gray-900 col-span-2">{metadataModalData.item.folder}</div>

                                <div className="text-gray-500 font-medium col-span-1">Tags</div>
                                <div className="text-gray-900 col-span-2 flex flex-wrap gap-1">
                                    {(metadataModalData.item.tags || []).length > 0
                                        ? metadataModalData.item.tags?.map((t: string) => <span key={t} className="px-2 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-[10px] uppercase font-bold tracking-wider text-gray-600">{t}</span>)
                                        : <span className="text-gray-400 text-xs italic">No tags</span>
                                    }
                                </div>

                                {metadataModalData.item.metadata?.storage === 'r2' && (
                                    <>
                                        <div className="text-gray-500 font-medium col-span-1">Storage</div>
                                        <div className="text-gray-900 col-span-2 flex items-center gap-1.5 font-medium"><CloudUpload className="w-4 h-4 text-blue-500" /> Cloudflare R2 (Permanent)</div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
