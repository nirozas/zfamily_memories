import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
    Folder,
    Camera,
    Image as ImageIcon,
    Upload,
    Trash2,
    Search,
    Loader2,
    Grid,
    List,
    Edit2,
    X,
    Check,
    Palette,
    Sticker,
    CheckSquare,
    Square,
    Link as LinkIcon,
    Sparkles,
    Play,
    Maximize2,
    Plus,
    ChevronRight,
    Home,
    FolderOpen,
} from 'lucide-react';
import { UrlInputModal } from '../components/media/UrlInputModal';
import { CreateStackModal } from '../components/media/CreateStackModal';
import { GooglePhotosService, type GoogleMediaItem } from '../services/googlePhotos';
import { GooglePhotosSelector } from '../components/media/GooglePhotosSelector';
import { FolderPickerModal } from '../components/media/FolderPickerModal';
import { ImagePortal } from '../components/viewer/ImagePortal';
import { VideoPortal } from '../components/viewer/VideoPortal';
import { GoogleDriveService } from '../services/googleDrive';
import { cn } from '../lib/utils';

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

import { useGooglePhotosUrl } from '../hooks/useGooglePhotosUrl';

function MediaGridItem({ item, viewMode, selectedItems, onToggleSelect, editingItem, editName, setEditName, handleRename, handleUpdateTags, handleDelete, isAdmin, activeTab, onPreview }: any) {
    const isGoogleUrl = item.url && (item.url.includes('googleusercontent.com') || item.url.includes('photoslibrary.googleapis.com') || item.url.includes('drive.google.com'));
    const initialUrl = item.url;
    const isGoogle = !!item.metadata?.googlePhotoId || isGoogleUrl;
    // For the grid, we always want a thumbnail image, even for videos
    const { url: displayUrl } = useGooglePhotosUrl(item.metadata?.googlePhotoId, initialUrl, null, true);

    return (
        <div key={item.id} className={cn("group relative bg-white border rounded-xl overflow-hidden transition-all duration-200", viewMode === 'list' ? "flex items-center p-3 gap-4 h-20 hover:border-catalog-accent/50" : "aspect-[10/11] hover:shadow-lg hover:-translate-y-1 hover:border-catalog-accent/50", selectedItems.has(item.id) ? "ring-2 ring-catalog-accent border-catalog-accent bg-catalog-accent/5" : "border-gray-200")} onClick={(e) => {
            if (!(e.target as HTMLElement).closest('.action-btn')) {
                // Default to select if clicking the card generally
                onToggleSelect(item.id);
            }
        }}>
            <div className={cn("bg-gray-100 overflow-hidden relative", viewMode === 'list' ? "w-14 h-14 rounded-lg flex-shrink-0" : "h-[75%]")}>
                        <div className="w-full h-full relative group/thumb">
                            {item.type === 'video' ? (
                                <div className="w-full h-full bg-neutral-900 flex items-center justify-center relative">
                                    {/* Try showing the proxied image thumbnail first if it's an external Google URL */}
                                    {isGoogleUrl ? (
                                        <img
                                            src={displayUrl}
                                            alt={item.filename}
                                            className="w-full h-full object-cover"
                                            crossOrigin="anonymous"
                                            onError={(e) => {
                                                // If the image fails, show a video element fallback
                                                e.currentTarget.style.display = 'none';
                                                const vid = e.currentTarget.parentElement?.querySelector('video');
                                                if (vid) vid.style.display = 'block';
                                            }}
                                        />
                                    ) : null}
                                    
                                    {/* Video element as fallback or for local uploads */}
                                    <video
                                        src={`${item.url}#t=0.1`}
                                        className={cn("w-full h-full object-cover", isGoogleUrl ? "hidden" : "block")}
                                        muted
                                        playsInline
                                        preload="metadata"
                                        crossOrigin="anonymous"
                                    />
                                    
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/20 pointer-events-none">
                                        <div className="bg-white/90 p-2 rounded-full shadow-lg">
                                            <Play className="w-4 h-4 text-catalog-accent fill-current" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <img
                                    src={displayUrl}
                                    alt={item.filename}
                                    className={cn("w-full h-full", item.category === 'sticker' || item.category === 'frame' ? "object-contain p-2" : "object-cover")}
                                    crossOrigin="anonymous"
                                />
                            )}
                        </div>
                {isGoogle && (
                    <div className="absolute top-2 right-2 z-10">
                        <Camera className="w-3 h-3 text-white drop-shadow-md" />
                    </div>
                )}
                <div className={cn("absolute inset-0 bg-black/40 transition-opacity flex flex-col items-center justify-center opacity-0 group-hover:opacity-100", selectedItems.has(item.id) && "opacity-100 bg-catalog-accent/20")}>
                    {/* Preview Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onPreview(item);
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
                            <div className="flex items-center gap-1 opacity-0 group-hover/info:opacity-100 transition-all">
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
    const { familyId, user, userRole, googleAccessToken, signInWithGoogle } = useAuth();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const [activeTab, setActiveTab] = useState<LibraryTab>('uploads');
    const [systemCategory, setSystemCategory] = useState<SystemCategory>('background');

    const [media, setMedia] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [previewingImage, setPreviewingImage] = useState<string | null>(null);
    const [previewingVideo, setPreviewingVideo] = useState<string | null>(null);
    const [previewingVideoPoster, setPreviewingVideoPoster] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'date' | 'name' | 'size'>('date');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video'>('all');
    const [editingItem, setEditingItem] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [uploadFolder, setUploadFolder] = useState<string>('/');
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isGoogleSelectorOpen, setIsGoogleSelectorOpen] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showAmazonInput, setShowAmazonInput] = useState(false);
    const [isCreateStackModalOpen, setIsCreateStackModalOpen] = useState(false);
    const [currentPath, setCurrentPath] = useState<string>('/'); // Hierarchical path
    
    // Amazon Photos states
    const [amazonFolderName, setAmazonFolderName] = useState<string>('');
    const [amazonUrlInput, setAmazonUrlInput] = useState<string>('');
    const [isImportingAmazon, setIsImportingAmazon] = useState(false);
    const [amazonBatchProgress, setAmazonBatchProgress] = useState<{ done: number, total: number } | null>(null);
    const [amazonImportError, setAmazonImportError] = useState<string>('');


    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSourceSelect = (source: 'upload' | 'google' | 'url' | 'amazon') => {
        setShowSourceModal(false);
        if (source === 'upload') {
            handleUploadClick();
        } else if (source === 'google') {
            if (!googleAccessToken) {
                if (confirm('Connect to Google to browse your Photos and Drive?')) {
                    signInWithGoogle();
                }
                return;
            }
            setIsGoogleSelectorOpen(true);
        } else if (source === 'url') {
            setShowUrlInput(true);
        } else if (source === 'amazon') {
            setShowAmazonInput(true);
        }
    };

    const processRemoteAsset = async (asset: string | GoogleMediaItem, source: 'url' | 'google' | 'library' = 'url') => {
        const url = typeof asset === 'string' ? asset : (asset.mediaFile?.baseUrl || asset.baseUrl || '');
        const googleId = typeof asset === 'string' ? undefined : asset.id;
        const originalFilename = typeof asset === 'string' ? `imported-url-${Date.now()}` : asset.filename;
        const originalMimeType = typeof asset === 'string' ? undefined : (asset.mediaFile?.mimeType || asset.mimeType);

        if (!url) return;

        try {
            // For URLs, we download and re-upload to our primary Google Photos storage to ensure persistence
            const isGoogleUrl = url.includes('googleusercontent.com') || url.includes('photoslibrary.googleapis.com');
            const fetchUrl = isGoogleUrl ? GooglePhotosService.getProxyUrl(url, googleAccessToken) : url;

            const response = await fetch(fetchUrl);
            const blob = await response.blob();
            const mimeType = blob.type || originalMimeType || 'image/jpeg';
            const ext = mimeType.split('/')[1] || 'jpg';
            const filename = `${originalFilename}.${ext}`;

            const file = new File([blob], filename, { type: mimeType });
            await performUpload([file], googleId, 'upload');

        } catch (error: any) {
            console.error(`Remote asset import failed from ${source}:`, error);
            alert(`Failed to import from ${source}: ${error.message}`);
        }
    };


    async function handleGooglePhotosImport(items: GoogleMediaItem[]) {
        if (!familyId || items.length === 0) return;

        setIsGoogleSelectorOpen(false);
        setShowUrlInput(false);
        setUploadProgress({});

        const { storageService } = await import('../services/storage');

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const name = item.filename || 'google-photo';
            setUploadProgress(prev => ({ ...prev, [name]: 10 }));

            try {
                const { url: persistentUrl, googlePhotoId: persistentId, type: persistentType } = 
                    await storageService.persistGoogleMedia(item, googleAccessToken!, familyId, uploadFolder, (p) => {
                        setUploadProgress(prev => ({ ...prev, [name]: p }));
                    });

                setUploadProgress(prev => ({ ...prev, [name]: 100 }));

                // Check if already exists to avoid 400 error on PostgREST upsert
                const { data: existing } = await (supabase
                    .from('family_media') as any)
                    .select('id')
                    .eq('url', persistentUrl)
                    .maybeSingle();

                if (existing) {
                    await (supabase.from('family_media') as any)
                        .update({
                            type: persistentType,
                            folder: uploadFolder,
                            category: 'general',
                            uploaded_by: user?.id,
                            filename: item.filename || 'google-photo',
                            metadata: { syncedToGooglePhotos: true, isExternal: true, googlePhotoId: persistentId, source: 'google_photos' }
                        })
                        .eq('id', (existing as any).id);
                } else {
                    await (supabase.from('family_media') as any).insert({
                        family_id: familyId,
                        url: persistentUrl,
                        type: persistentType,
                        folder: uploadFolder,
                        category: 'general',
                        uploaded_by: user?.id,
                        filename: item.filename || 'google-photo',
                        metadata: { syncedToGooglePhotos: true, isExternal: true, googlePhotoId: persistentId, source: 'google_photos' }
                    });
                }
            } catch (err) {
                console.error('Failed to import Google Photo:', err);
            }
        }

        setTimeout(() => setUploadProgress({}), 2000);
        await fetchMedia();
    }

    const handleAmazonBatchImport = async () => {
        if (!amazonUrlInput.trim() || !familyId) return;

        const processAmazonUrl = (url: string) => {
            const trimmed = url.trim();
            if (!trimmed.startsWith('http')) return null;
            const isVideo = trimmed.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i);
            const type: 'image' | 'video' = isVideo ? 'video' : 'image';
            const filename = trimmed.split('/').pop()?.split('?')[0] || (isVideo ? 'Amazon Video' : 'Amazon Photo');
            return { processedUrl: trimmed, type, filename };
        };

        const lines = amazonUrlInput.split('\n').map(l => l.trim()).filter(Boolean);
        const validUrls = lines.map(processAmazonUrl).filter((r): r is NonNullable<typeof r> => r !== null);

        if (validUrls.length === 0) {
            setAmazonImportError('No valid URLs found. Make sure each URL starts with http.');
            return;
        }

        const folderName = amazonFolderName.trim() || 'Amazon Photos';
        setIsImportingAmazon(true);
        setAmazonImportError('');
        setAmazonBatchProgress({ done: 0, total: validUrls.length });

        let failCount = 0;
        for (let i = 0; i < validUrls.length; i++) {
            const item = validUrls[i];
            try {
                // Check if already exists to avoid 400 error if onConflict 'url' requires unique constraint
                const { data: existing } = await supabase
                    .from('family_media')
                    .select('id')
                    .eq('url', item.processedUrl)
                    .maybeSingle();

                let error;
                if (existing) {
                    const { error: updateErr } = await (supabase
                        .from('family_media') as any)
                        .update({
                            filename: item.filename,
                            folder: folderName,
                            metadata: { source: 'amazon_photos', folder: folderName }
                        })
                        .eq('id', (existing as any).id);
                    error = updateErr;
                } else {
                    const { error: insertErr } = await (supabase
                        .from('family_media') as any)
                        .insert({
                            family_id: familyId,
                            url: item.processedUrl,
                            type: item.type,
                            filename: item.filename,
                            folder: folderName,
                            category: 'general',
                            uploaded_by: user?.id,
                            metadata: { source: 'amazon_photos', folder: folderName }
                        });
                    error = insertErr;
                }
                
                if (error) failCount++;
            } catch { failCount++; }
            setAmazonBatchProgress({ done: i + 1, total: validUrls.length });
        }

        setAmazonUrlInput('');
        setAmazonBatchProgress(null);
        setIsImportingAmazon(false);
        setShowAmazonInput(false);
        if (failCount > 0) alert(`${failCount} URL(s) failed to import.`);
        await fetchMedia();
    };

    useEffect(() => {
        if (!familyId) return;
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
                console.error('Error fetching family media:', result.error);
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

        // F. Stacks (Media Items)
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


        // Add usage count to media items
        // Normalizing URLs can be tricky (parameters etc). We attempt exact match or base match.
        const mediaWithUsage = data.map(item => {
            // Simple normalization (ignore query params for matching?)
            // Many URLs in DB might have params or not.
            // For robustness, check exact match first.
            let count = usageMap[item.url] || 0;

            // If 0, try matching without query params if item.url has them
            if (count === 0 && item.url.includes('?')) {
                // usageMap might keys might also have params or not.
                // This is expensive O(N) lookup without better structure, let's keep it simple for now.
            }
            return { ...item, usageCount: count };
        });

        setMedia(mediaWithUsage as MediaItem[]);
        setIsLoading(false);
    }

    function handleUploadClick() {
        if (activeTab === 'uploads') {
            setShowFolderPicker(true);
        } else {
            fileInputRef.current?.click();
        }
    }
    function handleFolderSelection(folder: string) {
        setUploadFolder(folder);
        setCurrentPath(folder === '/' ? '/' : folder);
        setShowFolderPicker(false);
        fileInputRef.current?.click();
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
                        <span className="text-catalog-accent">All Media</span>
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

    async function performUpload(
        files: FileList | File[],
        googlePhotoId?: string,
        source: 'upload' | 'google' | 'url' = 'upload',
        manualUrl?: string,
        manualFilename?: string,
        manualMimeType?: string
    ) {
        if ((!files || files.length === 0) && source !== 'google') return;

        if (activeTab === 'system' && !isAdmin) {
            alert("Only admins can add to System Assets.");
            return;
        }

        let uploadTags: string[] = [];
        if (activeTab === 'system') {
            const tagsInput = prompt("Add hashtags for these assets (comma separated, optional):");
            if (tagsInput) {
                uploadTags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
            }
        }

        const { storageService } = await import('../services/storage');
        if (source === 'upload' && files instanceof FileList) {
            setTimeout(() => setUploadProgress({}), 2000);
        }

        const itemsToProcess = source === 'google' ? [null] : Array.from(files);

        for (let i = 0; i < itemsToProcess.length; i++) {
            const file = itemsToProcess[i] as File | null;
            const name = manualFilename || (file ? file.name : 'google-photo');
            if (source === 'upload' && files instanceof FileList) {
                setUploadProgress(prev => ({ ...prev, [name]: 0 }));
            }

            let storageUrl: string | null = manualUrl ?? null;
            let finalType: 'video' | 'image' = 'image';
            let finalFilename = manualFilename || (file ? file.name : 'google-photo');
            let finalSize = file ? file.size : 0;

            if (activeTab === 'uploads') {
                // EXCLUSIVELY GOOGLE DRIVE FOR FAMILY MEDIA
                try {
                    if (source === 'google' && googlePhotoId && manualUrl) {
                        storageUrl = manualUrl;
                        finalType = (manualMimeType?.startsWith('video') || manualUrl.includes('video')) ? 'video' : 'image';
                    } else if (file) {
                        const isVideo = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i);

                        if (!isVideo && !googleAccessToken) {
                            if (confirm('Google integration required for image upload. Sign in with Google now?')) {
                                signInWithGoogle();
                            }
                            break;
                        }

                        const { url, error, r2Key: _r2Key, googlePhotoId: storageId } = await storageService.uploadFile(
                            file,
                            'family-media',
                            `media/${familyId}/vault/${uploadFolder}`,
                            (progress) => {
                                const percent = Math.round((progress.loaded / progress.total) * 100);
                                setUploadProgress(prev => ({ ...prev, [name]: percent }));
                            },
                            googleAccessToken // passed for images
                        );

                        if (error) throw new Error(error);
                        storageUrl = url;
                        finalType = isVideo ? 'video' : 'image';
                        if (!isVideo) {
                            googlePhotoId = storageId;
                        }
                    }

                    if (storageUrl && familyId) {
                        await supabase.from('family_media').insert({
                            family_id: familyId,
                            url: storageUrl,
                            type: finalType,
                            filename: finalFilename,
                            size: finalSize,
                            folder: uploadFolder,
                            category: 'general',
                            uploaded_by: user?.id,
                            metadata: finalType === 'video'
                                ? { storage: 'r2' }
                                : { syncedToGooglePhotos: true, isExternal: true, googlePhotoId }
                        } as any);
                    }
                } catch (err: any) {
                    console.error('Upload to Google Drive failed:', err);
                    alert(`Upload failed: ${err.message || 'Error uploading to Google Drive'}`);
                }
            } else if (activeTab === 'system' && isAdmin && file) {
                // SYSTEM ASSETS USE PERMANENT GOOGLE DRIVE STORAGE
                try {
                    const driveService = new GoogleDriveService(googleAccessToken!);
                    const driveUrl = await driveService.uploadSystemAsset(file, systemCategory as any);

                    if (driveUrl) {
                        await supabase.from('library_assets').insert({
                            category: systemCategory,
                            url: driveUrl,
                            name: file.name,
                            tags: uploadTags,
                            is_premium: false
                        } as any);
                    }
                } catch (err: any) {
                    console.error('System asset upload to Drive failed:', err);
                    alert(`Failed to upload system asset: ${err.message}`);
                }
            }
        }

        setUploadProgress(null);
        await fetchMedia();
    }


    async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files) {
            await performUpload(e.target.files);
            e.target.value = '';
        }
    }

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeTab === 'uploads' || isAdmin) {
            setIsDragging(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        if (activeTab === 'uploads' || isAdmin) {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                await performUpload(files);
            }
        }
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
        setMedia(prev => prev.map(m => selectedItems.has(m.id) ? { ...m, tags: newTags } : m));
        setIsLoading(false);
    }

    async function handleDelete(ids: string[]) {
        const itemsToDelete = media.filter(m => ids.includes(m.id));

        // Strict Usage Check
        const usedItems = itemsToDelete.filter(m => (m.usageCount || 0) > 0);

        if (usedItems.length > 0) {
            alert(`Unable to delete ${usedItems.length} item(s) because they are currently used in albums, events, or profiles.\n\nPlease remove them from the specific pages/events first.`);
            return;
        }

        const confirmMessage = `Delete ${ids.length} item${ids.length !== 1 ? 's' : ''}? This action cannot be undone.`;

        if (!confirm(confirmMessage)) return;

        if (activeTab === 'system' && !isAdmin) {
            alert("Only admins can delete System Assets.");
            return;
        }

        setIsLoading(true);

        const { storageService } = await import('../services/storage');

        // Delete from Cloud Storage first (best effort)
        for (const item of itemsToDelete) {
            try {
                // We attempt to delete, but don't block if it fails (e.g. no credentials)
                await storageService.deleteFile(item.url);
            } catch (e) {
                console.warn("Failed to delete from cloud:", e);
            }
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
        setMedia(prev => prev.map(m => m.id === id ? { ...m, tags: newTags } : m));
    }

    async function handleRename(id: string, newName: string) {
        if (!newName.trim() || (activeTab === 'system' && !isAdmin)) return;
        const table = activeTab === 'uploads' ? 'family_media' : 'library_assets';
        const field = activeTab === 'uploads' ? 'filename' : 'name';
        await (supabase.from(table as any) as any).update({ [field]: newName }).eq('id', id);

        // Optimistic update
        setMedia(prev => prev.map(m => m.id === id ? { ...m, [field === 'filename' ? 'filename' : 'name']: newName } : m));
        setEditingItem(null);
    }

    const allFolders = Array.from(new Set(media.map(m => m.folder || '/'))).sort();

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
            count: media.filter(m => m.folder === (currentPath === '/' ? name : `${currentPath}/${name}`) || (m.folder || '').startsWith((currentPath === '/' ? name : `${currentPath}/${name}`) + '/')).length
        }));
    }, [allFolders, currentPath, media, activeTab]);

    const displayedItems = media.filter(item => {
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
        <div className="flex h-[calc(100vh-64px)] bg-gray-50">
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
                            <button onClick={() => setShowSourceModal(true)} className="w-full flex items-center justify-center gap-2 bg-catalog-accent text-white py-2.5 rounded-lg hover:bg-catalog-accent/90 transition-all shadow-sm font-medium text-sm">
                                <Upload className="w-4 h-4" />
                                {activeTab === 'system' ? 'Add Asset' : 'Add Media'}
                            </button>

                            {/* Google Connector */}
                            {activeTab === 'uploads' && !googleAccessToken && (
                                <button
                                    onClick={() => signInWithGoogle()}
                                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 py-2.5 rounded-lg hover:bg-gray-50 transition-all shadow-sm font-medium text-[10px] uppercase tracking-wider"
                                >
                                    <span className="w-4 h-4 flex items-center justify-center font-bold text-blue-600 bg-blue-50 rounded">G</span>
                                    Connect to Google
                                </button>
                            )}

                            {activeTab === 'uploads' && googleAccessToken && (
                                <div className="space-y-2 pt-2">
                                    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-100">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-green-700 uppercase tracking-widest">Google Connected</span>
                                    </div>
                                    <button
                                        onClick={() => setIsGoogleSelectorOpen(true)}
                                        className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-700 py-2.5 rounded-lg hover:bg-blue-100 transition-all font-medium text-[10px] uppercase tracking-wider border border-blue-200"
                                    >
                                        <Camera className="w-4 h-4" />
                                        Browse & Import
                                    </button>
                                </div>
                            )}

                            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
                        </div>
                    )}
                </div>

                {activeTab === 'uploads' && (
                    <div className="flex-1 overflow-y-auto p-3 space-y-1">
                        <button onClick={() => setCurrentPath('All')} className={cn("w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all text-left", currentPath === 'All' ? "bg-catalog-accent/10 text-catalog-accent font-semibold" : "text-gray-600 hover:bg-gray-50")}>
                            <Grid className="w-4 h-4" /> All Media
                        </button>

                        <div className="flex items-center justify-between pt-4 pb-2 px-3">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Hierarchy</span>
                        </div>

                        {/* Recursive Sidebar View or just Root Folders */}
                        {Array.from(new Set(media.map(m => (m.folder || '').split('/')[0]).filter(Boolean))).sort().map(root => (
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

            <div
                className="flex-1 flex flex-col bg-gray-50/50 relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
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
                                    <Sparkles className="w-4 h-4" /> Create Memory
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

                {Object.keys(uploadProgress).length > 0 && (
                    <div className="bg-catalog-stone/5 border border-catalog-accent/20 p-6 rounded-[2rem] mb-8 space-y-4 shadow-xl">
                        {Object.entries(uploadProgress).map(([filename, progress]) => (
                            <div key={filename} className="w-full">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-catalog-text/60 mb-2 px-1">
                                    <span className="truncate max-w-[80%] flex items-center gap-2">
                                        {progress >= 100 ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Loader2 className="w-3.5 h-3.5 text-catalog-accent animate-spin" />}
                                        {filename}
                                    </span>
                                    <span className="text-catalog-accent font-serif tracking-normal text-sm italic">{Math.round(progress)}%</span>
                                </div>
                                <div className="w-full bg-white rounded-full h-1.5 overflow-hidden shadow-inner flex">
                                    <div 
                                        className="bg-catalog-accent h-full rounded-full transition-all duration-300 ease-out" 
                                        style={{ width: `${progress}%` }} 
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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
                                    <button
                                        onClick={() => setShowSourceModal(true)}
                                        className="px-8 py-3 bg-catalog-accent text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Add Media
                                    </button>
                                </div>
                            ) : displayedItems.length === 0 && currentPath === 'All' ? (
                                <div className="col-span-full py-24 flex flex-col items-center justify-center bg-white/40 border-2 border-dashed border-black/5 rounded-[2.5rem]">
                                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-[2rem] flex items-center justify-center mb-6">
                                        <ImageIcon className="w-8 h-8 text-catalog-accent/30" />
                                    </div>
                                    <h3 className="text-xl font-bold text-catalog-text mb-2">Your library is empty</h3>
                                    <p className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.3em] mb-8">Start by uploading some moments</p>
                                    <button
                                        onClick={() => setShowSourceModal(true)}
                                        className="px-8 py-3 bg-catalog-accent text-white rounded-full text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Add Media
                                    </button>
                                </div>
                            ) : null}

                            {displayedItems.map(item => (
                                <MediaGridItem
                                    key={item.id}
                                    item={item}
                                    viewMode={viewMode}
                                    selectedItems={selectedItems}
                                    onToggleSelect={(id: string) => {
                                        const newSet = new Set(selectedItems);
                                        if (newSet.has(id)) newSet.delete(id);
                                        else newSet.add(id);
                                        setSelectedItems(newSet);
                                    }}
                                    editingItem={editingItem}
                                    editName={editName}
                                    setEditName={setEditName}
                                    handleRename={handleRename}
                                    handleUpdateTags={handleUpdateTags}
                                    handleDelete={handleDelete}
                                    isAdmin={isAdmin}
                                    activeTab={activeTab}
                                    onPreview={(item: any) => {
                                        const isGoogle = item.url && (item.url.includes('googleusercontent.com') || item.url.includes('photoslibrary.googleapis.com') || item.url.includes('drive.google.com'));
                                        const cleanUrl = GooglePhotosService.getCleanUrl(item.url);
                                        let finalUrl = item.url;
                                        let posterUrl = undefined;

                                        if (isGoogle) {
                                            if (item.type === 'video') {
                                                finalUrl = GooglePhotosService.getProxyUrl(cleanUrl, googleAccessToken, null, item.metadata?.googlePhotoId);
                                                // Always try to get a poster via proxy for Google videos (Photos or Drive)
                                                posterUrl = GooglePhotosService.getProxyUrl(cleanUrl, googleAccessToken, null, item.metadata?.googlePhotoId, true);
                                            } else {
                                                finalUrl = GooglePhotosService.getProxyUrl(cleanUrl, googleAccessToken, null, item.metadata?.googlePhotoId);
                                            }
                                        }

                                        if (item.type === 'video') {
                                            setPreviewingVideo(finalUrl);
                                            setPreviewingVideoPoster(posterUrl);
                                        } else {
                                            setPreviewingImage(finalUrl);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <FolderPickerModal
                isOpen={showFolderPicker}
                onClose={() => setShowFolderPicker(false)}
                onSelect={handleFolderSelection}
                existingFolders={allFolders}
                currentFolder={currentPath}
                title="Select Upload Destination"
            />
            {isGoogleSelectorOpen && (
                <GooglePhotosSelector
                    googleAccessToken={googleAccessToken || ''}
                    isOpen={isGoogleSelectorOpen}
                    onClose={() => setIsGoogleSelectorOpen(false)}
                    folders={allFolders}
                    onSelect={handleGooglePhotosImport}
                    onReauth={signInWithGoogle}
                />
            )}

            {isCreateStackModalOpen && (
                <CreateStackModal
                    isOpen={isCreateStackModalOpen}
                    onClose={() => setIsCreateStackModalOpen(false)}
                    initialSelected={media.filter(m => selectedItems.has(m.id))}
                    folders={allFolders}
                    onCreated={() => {
                        setIsCreateStackModalOpen(false);
                        setSelectedItems(new Set());
                    }}
                />
            )}

            {showUrlInput && (
                <UrlInputModal
                    isOpen={showUrlInput}
                    onClose={() => setShowUrlInput(false)}
                    onSubmit={(url) => processRemoteAsset(url, 'url')}
                />
            )}

            {showAmazonInput && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowAmazonInput(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                            <h3 className="text-lg font-serif italic text-catalog-text flex items-center gap-2">
                                <svg className="w-5 h-5 text-orange-600" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.42 14.58c.25-.26.22-.67.05-.93-.15-.22-.38-.3-.6-.22-1.94.73-4.08 1.11-6.46 1.11-3.08 0-5.84-.82-8.24-2.43-.25-.17-.57-.07-.7.19-.14.28-.05.6.2.76 2.62 1.74 5.66 2.65 8.97 2.65 2.55 0 4.86-.43 6.78-1.13zM21.6 13.4c-.37-.42-.92-.58-1.52-.41l-1.54.44c-.39.11-.61.52-.5.9s.52.62.91.5l.8-.23c-.63 2.88-2.2 5.41-4.52 7.2-.25.19-.3.54-.11.79.11.15.28.23.45.23.12 0 .24-.03.34-.11 2.62-1.99 4.36-4.84 4.98-8.06l.24.84c.1.38.51.6.89.49.38-.1.6-.5.49-.88l-.91-2.7zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10S22 17.52 22 12 17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
                                </svg>
                                Amazon Photos / Bulk URL Import
                            </h3>
                            <button onClick={() => setShowAmazonInput(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-5">
                            <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg">
                                <p className="text-[10px] text-amber-800 leading-relaxed italic">
                                    Tip: To import an Amazon Photos folder, paste the direct image/video URLs here. You can find these by inspecting the network tab in your browser while viewing the folder.
                                </p>
                            </div>
                            
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-700">Folder Name</label>
                                <input 
                                    type="text" 
                                    value={amazonFolderName}
                                    onChange={e => setAmazonFolderName(e.target.value)}
                                    placeholder="e.g. Amazon Import, Summer Trip 2024..."
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-gray-700 flex justify-between">
                                    <span>URLs (one per line)</span>
                                    {amazonUrlInput.trim() && (
                                        <span className="text-orange-600">
                                            {amazonUrlInput.split('\n').filter(l => l.trim().startsWith('http')).length} detected
                                        </span>
                                    )}
                                </label>
                                <textarea 
                                    value={amazonUrlInput}
                                    onChange={e => setAmazonUrlInput(e.target.value)}
                                    placeholder={`https://m.media-amazon.com/images/...jpg\nhttps://m.media-amazon.com/images/...mp4`}
                                    rows={8}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all font-mono text-[10px]"
                                />
                            </div>

                            {amazonImportError && <p className="text-xs font-medium text-red-500">⚠ {amazonImportError}</p>}

                            {amazonBatchProgress && (
                                <div className="space-y-2">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-orange-600">
                                        <span>Importing batch...</span>
                                        <span>{Math.round((amazonBatchProgress.done / amazonBatchProgress.total) * 100)}%</span>
                                    </div>
                                    <div className="h-2 bg-orange-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-orange-500 transition-all duration-300" style={{ width: `${(amazonBatchProgress.done / amazonBatchProgress.total) * 100}%` }} />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                            <button 
                                onClick={() => setShowAmazonInput(false)}
                                className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={handleAmazonBatchImport}
                                disabled={isImportingAmazon || !amazonUrlInput.trim()}
                                className="px-6 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-orange-200 hover:scale-105 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2"
                            >
                                {isImportingAmazon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Start Import
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Source Selection Modal */}
            {showSourceModal && (
                <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" onClick={() => setShowSourceModal(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="text-lg font-serif italic text-catalog-text">
                                Add to {activeTab === 'system' ? 'System Assets' : uploadFolder === '/' ? 'Library' : uploadFolder}
                            </h3>
                            <button onClick={() => setShowSourceModal(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-2">
                            <button
                                onClick={() => handleSourceSelect('upload')}
                                className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                            >
                                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Upload className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-900 text-sm">Upload Files</div>
                                    <div className="text-xs text-gray-500">From your computer</div>
                                </div>
                            </button>
                            {activeTab === 'uploads' && (
                                <>
                                    <button
                                        onClick={() => handleSourceSelect('google')}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Camera className="w-5 h-5" />
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
                                            <div className="font-bold text-gray-900 text-sm">Direct Link</div>
                                            <div className="text-xs text-gray-500">Paste single image/video URL</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => handleSourceSelect('amazon')}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 rounded-lg flex items-center gap-3 transition-colors group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M18.42 14.58c.25-.26.22-.67.05-.93-.15-.22-.38-.3-.6-.22-1.94.73-4.08 1.11-6.46 1.11-3.08 0-5.84-.82-8.24-2.43-.25-.17-.57-.07-.7.19-.14.28-.05.6.2.76 2.62 1.74 5.66 2.65 8.97 2.65 2.55 0 4.86-.43 6.78-1.13zM21.6 13.4c-.37-.42-.92-.58-1.52-.41l-1.54.44c-.39.11-.61.52-.5.9s.52.62.91.5l.8-.23c-.63 2.88-2.2 5.41-4.52 7.2-.25.19-.3.54-.11.79.11.15.28.23.45.23.12 0 .24-.03.34-.11 2.62-1.99 4.36-4.84 4.98-8.06l.24.84c.1.38.51.6.89.49.38-.1.6-.5.49-.88l-.91-2.7zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10S22 17.52 22 12 17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/>
                                            </svg>
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 text-sm">Amazon / Bulk Import</div>
                                            <div className="text-xs text-gray-500">Multiple URLs + Folder Mapping</div>
                                        </div>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {previewingImage && (
                <ImagePortal
                    imageUrl={previewingImage}
                    onClose={() => setPreviewingImage(null)}
                />
            )}

            {previewingVideo && (
                <VideoPortal
                    videoUrl={previewingVideo}
                    posterUrl={previewingVideoPoster}
                    onClose={() => {
                        setPreviewingVideo(null);
                        setPreviewingVideoPoster(undefined);
                    }}
                />
            )}
        </div>
    );
}
