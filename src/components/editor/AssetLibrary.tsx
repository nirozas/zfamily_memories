import { useState, useRef, useEffect, useCallback } from 'react';
import { useAlbum } from '../../contexts/AlbumContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import {
    Upload,
    Video,
    Search,
    Palette,
    Sticker,
    Image as ImageIcon,
    Bookmark,
    Plus,
    Loader2,
    ChevronDown,
    ChevronLeft,
    Maximize2,
    Grid as GridIcon,
    LayoutGrid,
    Link as LinkIcon,
    X,
    AlertTriangle
} from 'lucide-react';
// import { storageService } from '../../services/storage';
import { UrlInputModal } from '../media/UrlInputModal';
import { MediaPickerModal } from '../media/MediaPickerModal';
import { UniversalUploadButton } from '../ui/UniversalUploadButton';
import { UploadOverlay } from '../ui/UploadOverlay';
import { CloudflareR2Service } from '../../services/cloudflareR2';

// Helper for library thumbnails (not full assets)
const getThumbnailUrl = (url: string) => {
    return url;
};


// Helper to get assets by category
async function fetchLibraryAssets(category: string, familyId?: string) {
    let assets: any[] = [];

    // 1. Fetch from library_assets for system assets
    const { data: systemData, error: systemError } = await supabase
        .from('library_assets')
        .select('*')
        .eq('category', category);

    if (!systemError && systemData) {
        assets = [...systemData];
    }

    // 2. If it's the 'uploads' category (Legacy behavior) or if we want family-specific assets of this category
    if (familyId) {
        let query = supabase.from('family_media').select('*').eq('family_id', familyId);

        if (category !== 'uploads') {
            query = query.eq('category', category);
        }

        const { data: familyData, error: familyError } = await query.order('created_at', { ascending: false });

        if (!familyError && familyData) {
            const familyAssets = (familyData as any[]).map(item => ({
                id: item.id,
                url: item.url,
                type: item.type,
                category: item.category || 'uploads',
                name: item.filename || 'Uploaded Asset',
                folder: item.folder,
                created_at: item.created_at,
                is_family: true
            }));

            if (category === 'uploads') {
                return familyAssets; // Uploads tab shows only user uploads
            } else {
                assets = [...familyAssets, ...assets];
            }
        }
    }
    return assets;
}

type Tab = 'uploads' | 'backgrounds' | 'stickers' | 'frames' | 'ribbons' | 'layouts';

export function AssetLibrary() {
    const { album, setAlbum, uploadMedia, moveFromLibrary, isSaving, addAsset, currentPageIndex, uploadProgress } = useAlbum();
    const { userRole } = useAuth();
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const [activeTab, setActiveTab] = useState<Tab>('uploads');
    const [libraryAssets, setLibraryAssets] = useState<any[]>([]);
    const [isLoadingAssets, setIsLoadingAssets] = useState(false);
    // const [isAdminUploading, setIsAdminUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
    const [sortBy, setSortBy] = useState<'name' | 'uploaded'>('uploaded');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshTick, setRefreshTick] = useState(0);

    const [viewMode, setViewMode] = useState<'grid' | 'folders'>('folders');
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [gridCols, setGridCols] = useState<2 | 3 | 4>(3);
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month' | 'year'>('all');

    // Source Selection State
    // const [showSourceModal, setShowSourceModal] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [showMediaPicker, setShowMediaPicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const triggerRefresh = useCallback(() => setRefreshTick(t => t + 1), []);

    // Amazon Photos batch import state - DEPRECATED (Moved to unified R2)
    /*
    const [amazonUrlInput, setAmazonUrlInput] = useState('');
    const [amazonFolderName, setAmazonFolderName] = useState('');
    const [isImportingAmazon, setIsImportingAmazon] = useState(false);
    const [amazonImportError, setAmazonImportError] = useState('');
    const [amazonImportedItems, setAmazonImportedItems] = useState<any[]>([]);
    const [amazonBatchProgress, setAmazonBatchProgress] = useState<{ done: number; total: number } | null>(null);
    */

    // Bulk System Asset URL Import State
    const [bulkSystemUrlInput, setBulkSystemUrlInput] = useState('');
    const [isImportingBulkSystem, setIsImportingBulkSystem] = useState(false);
    const [bulkSystemError, setBulkSystemError] = useState('');
    const [bulkSystemProgress, setBulkSystemProgress] = useState<{ done: number; total: number } | null>(null);
    const [showBulkSystemInput, setShowBulkSystemInput] = useState<Tab | null>(null);


    /*
    const handleAmazonBatchImport = ... (commented out)
    */

    const handleUrlImport = async (url: string) => {
        if (!album?.family_id || !url) return;
        setShowUrlInput(false);
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const fileName = url.split('/').pop()?.split('?')[0] || 'imported_image';
            const timestamp = Date.now();
            const key = `uploads/${timestamp}_${fileName}`;
            const r2Url = await CloudflareR2Service.uploadFile(blob, key, blob.type);
            
            const { data: userData } = await supabase.auth.getUser();
            const { error } = await (supabase.from('family_media') as any).insert({
                family_id: album.family_id,
                url: r2Url,
                type: blob.type.startsWith('video/') ? 'video' : 'image',
                filename: fileName,
                folder: 'Imported',
                category: 'uploads',
                uploaded_by: userData?.user?.id
            });
            if (error) throw error;
            triggerRefresh();
        } catch (err: any) {
            console.error('Failed to import URL:', err);
            alert(`Failed to import URL: ${err.message}`);
        }
    };

    const handleBulkSystemUrlImport = async (type: Tab) => {
        if (!bulkSystemUrlInput.trim() || !isAdmin) return;
        const urls = bulkSystemUrlInput.split('\n').map(u => u.trim()).filter(Boolean);
        if (urls.length === 0) return;

        setIsImportingBulkSystem(true);
        setBulkSystemError('');
        setBulkSystemProgress({ done: 0, total: urls.length });

        const categoryMap: Record<string, string> = {
            'backgrounds': 'background',
            'stickers': 'sticker',
            'frames': 'frame',
            'ribbons': 'ribbon'
        };
        const category = categoryMap[type] || 'general';
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
                const res = await fetch(url);
                const blob = await res.blob();
                const fileName = url.split('/').pop()?.split('?')[0] || `asset_${i}`;
                const timestamp = Date.now();
                const ext = blob.type.split('/')[1] || 'png';
                const key = `system/${category}s/${timestamp}_${i}.${ext}`;
                const r2Url = await CloudflareR2Service.uploadFile(blob, key, blob.type);

                const { error } = await (supabase.from('library_assets') as any).insert({
                    category: category,
                    url: r2Url,
                    type: blob.type.startsWith('video/') ? 'video' : 'image',
                    name: fileName,
                    metadata: { source: 'bulk_import', original_url: url }
                });
                if (error) throw error;
                successCount++;
            } catch (err) {
                console.error(`Failed to import ${url}:`, err);
                failCount++;
            }
            setBulkSystemProgress({ done: i + 1, total: urls.length });
        }

        setBulkSystemUrlInput('');
        setIsImportingBulkSystem(false);
        setBulkSystemProgress(null);
        setShowBulkSystemInput(null);
        if (failCount > 0) setBulkSystemError(`${failCount} items failed to import.`);
        triggerRefresh();
    };




    const handleMediaPickerSelect = (item: any) => {
        setShowMediaPicker(false);
        if (!item) return;
        // Map to expected format if needed, or pass directly if compatible
        // handleAssetClick expects { id, url, type, name(or filename), is_google? }
        handleAssetClick({
            ...item,
            name: item.filename // Ensure name is present
        }, 'uploads');
    };


    // Fetch assets when tab changes, an upload finishes, or refreshTick changes
    useEffect(() => {
        const loadAssets = async () => {
            const curAlbum = album;
            if (!curAlbum) return;
            setIsLoadingAssets(true);
            const categoryMap: Record<string, string> = {
                'uploads': 'uploads',
                'backgrounds': 'background',
                'stickers': 'sticker',
                'frames': 'frame',
                'ribbons': 'ribbon'
            };
            const category = categoryMap[activeTab];

            if (category) {
                const assets = await fetchLibraryAssets(category, curAlbum.family_id);

                // Merge in-memory unplaced media
                let mergedAssets = [...assets];
                if (category === 'uploads' && curAlbum.unplacedMedia && curAlbum.unplacedMedia.length > 0) {
                    const dbUrls = new Set(assets.map(a => a.url));
                    const localAssets = curAlbum.unplacedMedia
                        .filter((m: any) => !dbUrls.has(m.url))
                        .map((m: any) => ({
                            id: m.id,
                            url: m.url,
                            type: m.type,
                            category: 'uploads',
                            name: (m as any).name || (m.url.split('/').pop()?.split('?')[0].split('_').pop()) || 'Recently Uploaded',
                            folder: (m as any).folder || curAlbum.title,
                            created_at: (m as any).createdAt || new Date().toISOString(),
                            is_family: true
                        }));
                    mergedAssets = [...localAssets, ...mergedAssets];
                }

                setLibraryAssets(mergedAssets);
            }
            setIsLoadingAssets(false);
        };
        loadAssets();
    }, [activeTab, album?.family_id, isSaving, album?.unplacedMedia?.length, searchQuery, refreshTick]);

    if (!album) return null;
    const currentPage = album.pages[currentPageIndex];

    // Compute which assets are already used in the album to show indicators
    const usedAssetUrls = new Set<string>();
    album.pages.forEach(p => p.assets.forEach(a => {
        if (a.url) usedAssetUrls.add(a.url);
    }));

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            await uploadMedia(Array.from(e.target.files));
            e.target.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (activeTab === 'uploads') {
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

        if (activeTab === 'uploads') {
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                await uploadMedia(Array.from(files));
            }
        }
    };

    const handleAssetClick = (item: any, type: Tab) => {
        if (!currentPage || !album) return;

        // Helper to add asset with correct proportions
        const addWithProportions = (assetType: any, url: string, natW: number, natH: number) => {
            const ratio = natW / natH;
            const albumW = album.config.dimensions.width || 1000;
            const albumH = album.config.dimensions.height || 700;

            const isBackground = type === 'backgrounds';
            const isFrame = type === 'frames';

            // Calculate width/height in page % units (0-100)
            let w = (isBackground || isFrame) ? 100 : (natW / albumW) * 100;
            let h = (isBackground || isFrame) ? (100 / (albumW / albumH)) * ratio : (natH / albumH) * 100;

            if (isBackground) {
                w = 100;
                h = 100;
            }

            const maxUnit = 60;
            if (!isBackground && !isFrame && (w > maxUnit || h > maxUnit)) {
                const scale = Math.min(maxUnit / w, maxUnit / h);
                w *= scale;
                h *= scale;
            }
            if (!isBackground && !isFrame) h = w / ratio; // maintain ratio

            addAsset(currentPage.id, {
                type: assetType,
                url: url,
                x: (isBackground || isFrame) ? 0 : (100 - w) / 2,
                y: (isBackground || isFrame) ? 0 : (100 - h) / 2,
                width: w,
                height: h,
                originalDimensions: { width: natW, height: natH },
                rotation: 0,
                zIndex: isFrame ? 50 : (isBackground ? 0 : currentPage.assets.length + 1),
                isStamp: type !== 'uploads',
                category: type,
                fitMode: isBackground ? 'cover' : 'fit',
                aspectRatio: ratio,
                isLocked: false,
                lockAspectRatio: true,
                pivot: { x: 0.5, y: 0.5 }
            } as any);

        };

        // Check if item is in unplacedMedia to move it instead of copy
        const isInUnplaced = album.unplacedMedia.some(a => a.id === item.id);

        if (type === 'uploads' && isInUnplaced) {
            moveFromLibrary(item.id, currentPage.id);
            return;
        }

        // Special handling for backgrounds/layouts if they need direct update instead of new asset?
        // For now we add them as background assets.

        if (item.type === 'video') {
            const video = document.createElement('video');
            video.src = item.url;
            video.onloadedmetadata = () => {
                const w = video.videoWidth || 1280;
                const h = video.videoHeight || 720;
                addWithProportions('video', item.url, w, h);
            };
            // Fallback for metadata fail
            video.onerror = () => addWithProportions('video', item.url, 1280, 720);
        } else {
            const img = new Image();
            img.src = item.url;
            img.onload = () => {
                addWithProportions(type === 'frames' ? 'frame' : 'image', item.url, img.naturalWidth, img.naturalHeight);
            };
            img.onerror = () => addWithProportions(type === 'frames' ? 'frame' : 'image', item.url, 800, 600);
        }
    };

    const renderAdminBulkControls = () => {
        if (!isAdmin) return null;
        const displayCategory = activeTab.replace(/s$/, '').toUpperCase();
        
        return (
            <div className="col-span-full space-y-2 mb-4 px-1">
                {showBulkSystemInput === activeTab ? (
                    <div className="p-3 bg-gray-50 rounded-xl border border-catalog-accent/20 space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black uppercase tracking-widest text-catalog-accent flex items-center gap-2">
                                <LinkIcon className="w-3 h-3" />
                                Bulk {displayCategory} Fetch
                            </span>
                            <button onClick={() => setShowBulkSystemInput(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[9px] text-gray-500 leading-tight">Paste URLs (one per line). We'll download them and save permanently to our R2 storage.</p>
                        <textarea
                            value={bulkSystemUrlInput}
                            onChange={e => {
                                setBulkSystemUrlInput(e.target.value);
                                setBulkSystemError('');
                            }}
                            placeholder={`https://example.com/asset1.png\nhttps://example.com/asset2.png`}
                            className="w-full p-2 text-[10px] bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-catalog-accent/30 outline-none font-mono"
                            rows={4}
                        />
                        {bulkSystemError && (
                            <div className="p-2 bg-red-50 border border-red-100 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                                <span className="text-[9px] text-red-600 font-medium leading-tight">{bulkSystemError}</span>
                            </div>
                        )}
                        {bulkSystemProgress && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[8px] font-bold text-catalog-accent uppercase tracking-tighter">
                                    <span>Importing Assets...</span>
                                    <span>{Math.round((bulkSystemProgress.done / bulkSystemProgress.total) * 100)}%</span>
                                </div>
                                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-catalog-accent transition-all duration-300" 
                                        style={{ width: `${(bulkSystemProgress.done / bulkSystemProgress.total) * 100}%` }} 
                                    />
                                </div>
                            </div>
                        )}
                        <button
                            onClick={() => handleBulkSystemUrlImport(activeTab)}
                            disabled={isImportingBulkSystem || !bulkSystemUrlInput.trim()}
                            className="w-full py-2.5 bg-catalog-accent text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-50 shadow-sm"
                        >
                            {isImportingBulkSystem ? <Loader2 className="w-3 h-3 animate-spin"/> : <LinkIcon className="w-3 h-3" />}
                            {isImportingBulkSystem ? 'Processing Batch...' : 'Fetch Assets'}
                        </button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 border border-dashed border-catalog-accent/20 rounded-xl py-3 text-center cursor-pointer hover:bg-catalog-accent/5 transition-all bg-white flex flex-col items-center justify-center gap-1.5 group"
                        >
                            <div className="p-2 bg-catalog-stone/10 rounded-full group-hover:scale-110 transition-transform">
                                <Upload className="w-4 h-4 text-catalog-accent" />
                            </div>
                            <span className="text-[9px] text-catalog-accent font-black uppercase tracking-wider">Device Upload</span>
                        </button>
                        <button
                            onClick={() => setShowBulkSystemInput(activeTab)}
                            className="flex-1 border border-dashed border-catalog-accent/20 rounded-xl py-3 text-center cursor-pointer hover:bg-catalog-accent/5 transition-all bg-white flex flex-col items-center justify-center gap-1.5 group"
                        >
                            <div className="p-2 bg-catalog-stone/10 rounded-full group-hover:scale-110 transition-transform">
                                <LinkIcon className="w-4 h-4 text-catalog-accent" />
                            </div>
                            <span className="text-[9px] text-catalog-accent font-black uppercase tracking-wider">Bulk URL Import</span>
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="hidden sm:flex flex-col h-full bg-white border-r border-catalog-accent/10 w-64 md:w-80 shrink-0">
            {/* Tabs */}
            <div className="flex flex-wrap bg-catalog-stone/10 border-b border-catalog-accent/10">
                <button
                    onClick={() => { setActiveTab('uploads'); setCurrentFolder(null); }}
                    className={cn("flex-1 min-w-[33%] py-2 px-1 flex flex-col items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors", activeTab === 'uploads' ? "border-catalog-accent text-catalog-accent bg-white" : "border-transparent text-catalog-text/50 hover:bg-white/50")}
                >
                    <ImageIcon className="w-3.5 h-3.5" /> Media
                </button>
                <button
                    onClick={() => setActiveTab('backgrounds')}
                    className={cn("flex-1 min-w-[33%] py-2 px-1 flex flex-col items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors", activeTab === 'backgrounds' ? "border-catalog-accent text-catalog-accent bg-white" : "border-transparent text-catalog-text/50 hover:bg-white/50")}
                >
                    <Palette className="w-3.5 h-3.5" /> Bgs
                </button>
                <button
                    onClick={() => setActiveTab('stickers')}
                    className={cn("flex-1 min-w-[33%] py-2 px-1 flex flex-col items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors", activeTab === 'stickers' ? "border-catalog-accent text-catalog-accent bg-white" : "border-transparent text-catalog-text/50 hover:bg-white/50")}
                >
                    <Sticker className="w-3.5 h-3.5" /> Stickers
                </button>
                <button
                    onClick={() => setActiveTab('frames')}
                    className={cn("flex-1 min-w-[33%] py-2 px-1 flex flex-col items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors", activeTab === 'frames' ? "border-catalog-accent text-catalog-accent bg-white" : "border-transparent text-catalog-text/50 hover:bg-white/50")}
                >
                    <div className="w-3.5 h-3.5 border-[1.5px] border-current rounded-sm" /> Frames
                </button>
                <button
                    onClick={() => setActiveTab('ribbons')}
                    className={cn("flex-1 min-w-[33%] py-2 px-1 flex flex-col items-center gap-0.5 text-[9px] font-bold uppercase tracking-widest border-b-2 transition-colors", activeTab === 'ribbons' ? "border-catalog-accent text-catalog-accent bg-white" : "border-transparent text-catalog-text/50 hover:bg-white/50")}
                >
                    <Bookmark className="w-3.5 h-3.5" /> Ribbons
                </button>
            </div>

            {/* Content Area */}
            <div
                className="flex-1 overflow-y-auto p-4 content-scrollbar bg-gray-50/50 relative"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >

                {/* Drag Overlay */}
                {isDragging && (
                    <div className="absolute inset-0 z-50 bg-catalog-accent/10 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-none border-2 border-dashed border-catalog-accent m-2 rounded-xl animate-in fade-in zoom-in duration-200">
                        <Upload className="w-8 h-8 text-catalog-accent animate-bounce mb-2" />
                        <p className="text-xs font-bold text-catalog-accent uppercase tracking-wider">Drop to upload</p>
                    </div>
                )}

                {/* Global Controls: Search & Sort */}
                <div className="mb-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/30" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${activeTab === 'uploads' ? 'media' : activeTab}...`}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-catalog-accent/10 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-catalog-accent/20"
                        />
                    </div>
                </div>

                {/* Global Filters & Sort */}
                <div className="mb-3 space-y-2 bg-white p-2 rounded-lg border border-catalog-accent/5">
                    {/* Media Type Filter */}
                    <div className="flex bg-gray-100/50 p-0.5 rounded-md border border-catalog-accent/5">
                        <button
                            onClick={() => setMediaFilter('all')}
                            className={cn("flex-1 py-1 text-[8px] font-bold uppercase rounded transition-all", mediaFilter === 'all' ? "bg-white shadow-sm text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                        >All</button>
                        <button
                            onClick={() => setMediaFilter('image')}
                            className={cn("flex-1 py-1 text-[8px] font-bold uppercase rounded transition-all", mediaFilter === 'image' ? "bg-white shadow-sm text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                        >Img</button>
                        <button
                            onClick={() => setMediaFilter('video')}
                            className={cn("flex-1 py-1 text-[8px] font-bold uppercase rounded transition-all", mediaFilter === 'video' ? "bg-white shadow-sm text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                        >Vid</button>
                    </div>

                    {/* Date & Sort */}
                    <div className="flex gap-1">
                        <select
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value as any)}
                            className="flex-1 bg-white border border-catalog-accent/10 rounded px-1.5 py-1 text-[8px] font-bold text-catalog-text/70 focus:outline-none"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="year">This Year</option>
                        </select>
                        <select
                            value={sortBy === 'uploaded' ? (sortOrder === 'desc' ? 'newest' : 'oldest') : 'name'}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === 'name') {
                                    setSortBy('name');
                                    setSortOrder('asc');
                                } else if (val === 'newest') {
                                    setSortBy('uploaded');
                                    setSortOrder('desc');
                                } else if (val === 'oldest') {
                                    setSortBy('uploaded');
                                    setSortOrder('asc');
                                }
                            }}
                            className="flex-1 bg-white border border-catalog-accent/10 rounded px-1.5 py-1 text-[8px] font-bold text-catalog-text/70 focus:outline-none"
                        >
                            <option value="newest">Newest</option>
                            <option value="oldest">Oldest</option>
                            <option value="name">Name</option>
                        </select>
                    </div>
                </div>

                {/* Grid controls... */}

                {/* Grid Size Controls */}
                <div className="flex items-center justify-end gap-1 mb-3 px-1">
                    <button
                        onClick={() => setGridCols(4)}
                        className={cn("p-1 rounded transition-colors", gridCols === 4 ? "bg-catalog-accent/10 text-catalog-accent" : "text-gray-400 hover:bg-gray-100")}
                        title="Small items"
                    >
                        <LayoutGrid className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setGridCols(3)}
                        className={cn("p-1 rounded transition-colors", gridCols === 3 ? "bg-catalog-accent/10 text-catalog-accent" : "text-gray-400 hover:bg-gray-100")}
                        title="Medium items"
                    >
                        <GridIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => setGridCols(2)}
                        className={cn("p-1 rounded transition-colors", gridCols === 2 ? "bg-catalog-accent/10 text-catalog-accent" : "text-gray-400 hover:bg-gray-100")}
                        title="Large items"
                    >
                        <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* UPLOADS TAB */}
                {activeTab === 'uploads' && (
                    <div className="space-y-4">
                        {/* Upload & Basic Filters */}
                        <div className="flex items-center gap-2 px-1">
                        <UniversalUploadButton
                            variant="sidebar"
                            label="Add Media"
                            familyId={album.family_id}
                            folder={album.title ? `Albums/${album.title.trim()}` : 'Albums'}
                            showLibraryImport={true}
                            onSelectExisting={() => setShowMediaPicker(true)}
                            onComplete={(items) => {
                                if (setAlbum && album) {
                                    const newAssets = items.map(m => ({
                                        id: `uploaded-${Date.now()}-${Math.random()}`,
                                        url: m.url,
                                        type: m.type as any,
                                        category: 'uploads',
                                        name: m.filename,
                                        createdAt: new Date(),
                                        zIndex: 1, // Required by Asset type
                                        x: 0,
                                        y: 0,
                                        width: 100,
                                        height: 100,
                                        rotation: 0
                                    } as any));
                                    
                                    setAlbum({
                                        ...album,
                                        unplacedMedia: [...album.unplacedMedia, ...newAssets],
                                        updatedAt: new Date(),
                                    });
                                }
                            }}
                            className="flex-1"
                        />

                            <div className="flex-1 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <button
                                        onClick={() => {
                                            if (currentFolder) setCurrentFolder(null);
                                            else setViewMode(v => v === 'grid' ? 'folders' : 'grid');
                                        }}
                                        className="text-[8px] font-bold uppercase text-catalog-accent/60 hover:text-catalog-accent flex items-center gap-1 transition-colors"
                                    >
                                        {currentFolder ? <><ChevronLeft className="w-2 h-2" /> Back</> : (viewMode === 'grid' ? "Folder view" : "List view")}
                                    </button>
                                    <span className="text-[8px] font-bold text-catalog-text/30 uppercase tracking-tighter">Media Library</span>
                                </div>
                            </div>
                        </div>

                        {/* Heritage Archive Section */}
                        <div className="space-y-3 px-1">
                            {currentFolder && (
                                <div className="flex items-center gap-1.5 opacity-70">
                                    <Bookmark className="w-3.5 h-3.5 text-catalog-accent" />
                                    <span className="text-[10px] font-bold text-catalog-text uppercase tracking-widest">{currentFolder}</span>
                                </div>
                            )}

                            {isLoadingAssets ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-20">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <span className="text-[9px] font-bold uppercase tracking-widest">Loading Media...</span>
                                </div>
                            ) : (
                                <>
                                    {/* Folders Selection */}
                                    {viewMode === 'folders' && !currentFolder && (
                                        <div className="grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-1 duration-300">
                                            {(() => {
                                                const folderSet = new Set<string>();
                                                libraryAssets.forEach(a => {
                                                    folderSet.add(a.folder || 'Unsorted');
                                                });
                                                return Array.from(folderSet).map(folder => (
                                                    <div
                                                        key={folder}
                                                        onClick={() => {
                                                            setCurrentFolder(folder);
                                                            setViewMode('folders');
                                                        }}
                                                        className="flex flex-col items-center gap-2 p-3 bg-white border border-catalog-accent/10 rounded-xl hover:bg-catalog-accent/5 hover:border-catalog-accent/30 hover:scale-[1.02] transition-all cursor-pointer group shadow-sm relative overflow-hidden"
                                                    >
                                                        <div className="w-14 h-11 bg-catalog-stone/10 rounded-lg flex items-center justify-center group-hover:bg-catalog-accent/10 transition-colors relative border border-catalog-accent/5">
                                                            <div className="absolute -top-1 left-2 w-5 h-2 bg-catalog-accent/30 rounded-t-sm" />
                                                            <ImageIcon className="w-5 h-5 text-catalog-accent/40" />
                                                        </div>
                                                        <span className="text-[9px] font-bold text-catalog-text/70 uppercase tracking-tighter truncate w-full text-center px-1">{folder}</span>
                                                        <div className="absolute top-1 right-1 bg-catalog-accent/10 text-catalog-accent text-[7px] font-bold px-1 rounded-full border border-catalog-accent/5">
                                                            {libraryAssets.filter(a => a.category === 'uploads' && (a.folder || 'Unsorted') === folder).length}
                                                        </div>
                                                    </div>
                                                ));
                                            })()}
                                        </div>
                                    )}

                                    {/* Assets Display */}
                                    {(viewMode === 'grid' || currentFolder) && (
                                        <div className={cn("grid gap-2 animate-in fade-in slide-in-from-top-1 duration-300", gridCols === 2 ? "grid-cols-2" : (gridCols === 3 ? "grid-cols-3" : "grid-cols-4"))}>
                                            {libraryAssets
                                                .filter(a => viewMode === 'grid' ? true : (a.folder || 'Unsorted') === currentFolder)
                                                .filter(a => mediaFilter === 'all' || (mediaFilter === 'image' ? (!a.type || a.type === 'image') : a.type === 'video'))
                                                .filter(a => {
                                                    if (dateFilter === 'all') return true;
                                                    const now = new Date();
                                                    const created = new Date(a.created_at || 0);
                                                    const diff = now.getTime() - created.getTime();
                                                    const day = 24 * 60 * 60 * 1000;

                                                    if (dateFilter === 'today') return diff < day;
                                                    if (dateFilter === 'week') return diff < (7 * day);
                                                    if (dateFilter === 'month') return diff < (30 * day);
                                                    if (dateFilter === 'year') return diff < (365 * day);
                                                    return true;
                                                })
                                                .filter(a => {
                                                    if (!searchQuery) return true;
                                                    const query = searchQuery.toLowerCase();
                                                    return (a.name || '').toLowerCase().includes(query) || a.tags?.some((t: string) => t.toLowerCase().includes(query));
                                                })
                                                .sort((a, b) => {
                                                    const multiplier = sortOrder === 'asc' ? 1 : -1;
                                                    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '') * multiplier;
                                                    const da = new Date(a.created_at || 0).getTime();
                                                    const db = new Date(b.created_at || 0).getTime();
                                                    return (da - db) * multiplier;
                                                })
                                                .map((item) => (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => handleAssetClick(item, 'uploads')}
                                                        className="group flex flex-col gap-1 cursor-pointer"
                                                    >
                                                        <div
                                                            draggable
                                                            onDragStart={(e) => {
                                                                e.dataTransfer.setData('asset', JSON.stringify({ url: item.url, type: item.type || 'image' }));
                                                            }}
                                                            className={cn(
                                                                "relative aspect-square rounded-lg overflow-hidden bg-white shadow-sm group-hover:shadow-md transition-all border",
                                                                usedAssetUrls.has(item.url) ? "border-red-500 ring-1 ring-red-500/50" : "border-catalog-accent/5 group-hover:border-catalog-accent/30"
                                                            )}
                                                        >
                                                            {item.type === 'video' ? (
                                                                <div className="w-full h-full relative">
                                                                    <img src={getThumbnailUrl(item.url) || undefined} alt="" className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/30 transition-colors">
                                                                        <Video className="w-5 h-5 text-white drop-shadow-md" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <img src={getThumbnailUrl(item.url) || undefined} alt="" className="w-full h-full object-cover" />
                                                            )}
                                                            <div className="absolute inset-0 bg-catalog-accent/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                <Plus className="w-5 h-5 text-white" />
                                                            </div>
                                                            {item.type === 'video' && <div className="absolute bottom-1 right-1 bg-black/50 text-white p-0.5 rounded-sm"><Video className="w-2.5 h-2.5" /></div>}
                                                            {usedAssetUrls.has(item.url) && <div className="absolute top-1 right-1 bg-red-500 text-white text-[6px] font-bold px-1 rounded-sm shadow-sm uppercase">Used</div>}
                                                        </div>
                                                        <span className="text-[8px] font-bold text-catalog-text/50 truncate px-0.5 text-center group-hover:text-catalog-accent transition-colors">
                                                            {item.name || (item.url.split('/').pop()?.split('?')[0].split('_').pop()) || 'Media'}
                                                        </span>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Center Upload Overlay when active */}
                        <UploadOverlay 
                            isOpen={isSaving} 
                            progress={uploadProgress} 
                            title="Uploading Highlights..."
                        />
                    </div>
                )}



                {/* BACKGROUNDS TAB */}
                {activeTab === 'backgrounds' && (
                    <div className="grid grid-cols-2 gap-2">
                        {renderAdminBulkControls()}
                        <div className="col-span-2 flex items-center gap-2 mb-2">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                className="flex-1 bg-white border border-catalog-accent/10 rounded px-2 py-1 text-[9px] font-bold text-catalog-text/70 focus:outline-none"
                            >
                                <option value="uploaded">Newest</option>
                                <option value="name">Name</option>
                            </select>
                            <button onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')} className="p-1 border border-catalog-accent/10 rounded bg-white">
                                <ChevronDown className={cn("w-3 h-3", sortOrder === 'asc' && "rotate-180")} />
                            </button>
                        </div>
                        {libraryAssets
                            .filter(a => {
                                if (!searchQuery) return true;
                                const q = searchQuery.toLowerCase();
                                return (a.name || '').toLowerCase().includes(q) || a.tags?.some((t: string) => t.toLowerCase().includes(q.replace('#', '')));
                            })
                            .sort((a, b) => {
                                const multiplier = sortOrder === 'asc' ? 1 : -1;
                                if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '') * multiplier;
                                return (new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()) * multiplier;
                            })
                            .map((item) => (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('asset', JSON.stringify({
                                            url: item.url,
                                            type: 'image',
                                            category: 'backgrounds',
                                            name: item.name
                                        }));
                                    }}
                                    onClick={() => handleAssetClick(item, 'backgrounds')}
                                    className="aspect-[4/3] rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-catalog-accent transition-all shadow-sm bg-white relative group border border-gray-100"
                                >
                                    <img src={getThumbnailUrl(item.url)} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-catalog-accent/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Plus className="w-6 h-6 text-white" />
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {/* STICKERS TAB */}
                {activeTab === 'stickers' && (
                    <div className="grid grid-cols-3 gap-2">
                        {renderAdminBulkControls()}
                        {libraryAssets
                            .filter(a => {
                                if (!searchQuery) return true;
                                const q = searchQuery.toLowerCase();
                                return (a.name || '').toLowerCase().includes(q);
                            })
                            .map((item) => (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('asset', JSON.stringify({
                                            url: item.url,
                                            type: 'image',
                                            category: 'stickers',
                                            name: item.name
                                        }));
                                    }}
                                    onClick={() => handleAssetClick(item, 'stickers')}
                                    className="aspect-square p-2 bg-white rounded-lg border border-catalog-accent/5 hover:border-catalog-accent/30 transition-all cursor-pointer flex items-center justify-center group"
                                >
                                    <img src={item.url} alt="" className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform" />
                                </div>
                            ))}
                    </div>
                )}

                {/* FRAMES TAB */}
                {activeTab === 'frames' && (
                    <div className="grid grid-cols-2 gap-3">
                        {renderAdminBulkControls()}
                        {libraryAssets
                            .filter(a => {
                                if (!searchQuery) return true;
                                const q = searchQuery.toLowerCase();
                                return (a.name || '').toLowerCase().includes(q);
                            })
                            .map((item) => (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('asset', JSON.stringify({
                                            url: item.url,
                                            type: 'frame',
                                            category: 'frames',
                                            name: item.name
                                        }));
                                    }}
                                    onClick={() => handleAssetClick(item, 'frames')}
                                    className="aspect-square bg-white rounded-lg border border-catalog-accent/5 hover:border-catalog-accent/30 transition-all cursor-pointer flex items-center justify-center p-1 group shadow-sm overflow-hidden"
                                >
                                    <div className="relative w-full h-full group-hover:scale-105 transition-transform duration-300">
                                        <img src={item.url} alt="" className="w-full h-full object-contain" />
                                    </div>
                                </div>
                            ))}
                    </div>
                )}

                {/* RIBBONS TAB */}
                {activeTab === 'ribbons' && (
                    <div className="grid grid-cols-1 gap-2">
                        {renderAdminBulkControls()}
                        {libraryAssets
                            .filter(a => {
                                if (!searchQuery) return true;
                                const q = searchQuery.toLowerCase();
                                return (a.name || '').toLowerCase().includes(q);
                            })
                            .map((item) => (
                                <div
                                    key={item.id}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.setData('asset', JSON.stringify({
                                            url: item.url,
                                            type: 'image',
                                            category: 'ribbons',
                                            name: item.name
                                        }));
                                    }}
                                    onClick={() => handleAssetClick(item, 'ribbons')}
                                    className="aspect-[4/1] bg-white rounded-lg border border-catalog-accent/5 hover:border-catalog-accent/30 transition-all cursor-pointer flex items-center justify-center p-2 group shadow-sm"
                                >
                                    <img src={item.url} alt="" className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform" />
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {showUrlInput && (
                <UrlInputModal
                    isOpen={showUrlInput}
                    onClose={() => setShowUrlInput(false)}
                    onSubmit={handleUrlImport}
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
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                multiple
                accept="image/*,video/*"
            />
        </div>
    );
}

