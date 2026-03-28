import { useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Video, Folder, CheckCircle, Check, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { useGooglePhotosUrl } from '../../hooks/useGooglePhotosUrl';

interface MediaItem {
    id: string;
    url: string;
    google_id?: string; // New direct column
    type: 'image' | 'video';
    filename: string;
    folder: string;
    category: string;
    created_at: string;
    size: number;
    tags?: string[];
    metadata?: {
        googlePhotoId?: string; // Legacy field
        [key: string]: any;
    };
}

function MediaPickerItem({ 
    item, 
    isSelected, 
    multiSelect, 
    onToggle 
}: { 
    item: MediaItem; 
    isSelected: boolean; 
    multiSelect: boolean; 
    onToggle: () => void;
}) {
    // Check both potential locations for the Google ID
    const googleId = item.google_id || item.metadata?.googlePhotoId;
    const { url: displayUrl } = useGooglePhotosUrl(googleId, item.url, null, true);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);

    return (
        <div
            onClick={onToggle}
            className={cn(
                "aspect-square rounded-2xl overflow-hidden cursor-pointer relative group border transition-all",
                isSelected
                    ? "ring-2 ring-catalog-accent border-catalog-accent shadow-md"
                    : "border-gray-100 hover:border-gray-200"
            )}
        >
            <div className="w-full h-full bg-gray-50 flex items-center justify-center relative">
                <img
                    src={displayUrl || item.url}
                    alt={item.filename}
                    className={cn(
                        "w-full h-full object-cover transition-opacity duration-500 transition-transform duration-700 group-hover:scale-110",
                        isLoaded ? "opacity-100" : "opacity-0"
                    )}
                    onLoad={() => setIsLoaded(true)}
                    onError={() => setIsError(true)}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                />
                
                {/* Fallback Display */}
                {(!isLoaded || isError) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        {item.type === 'video' ? (
                            <div className="w-12 h-12 rounded-full bg-catalog-accent/10 flex items-center justify-center">
                                <Video className={cn("w-6 h-6 text-catalog-accent", !isLoaded && "animate-pulse")} />
                            </div>
                        ) : (
                            <ImageIcon className={cn("w-6 h-6 text-gray-200", !isLoaded && "animate-pulse")} />
                        )}
                        {!isLoaded && (
                            <div className="text-[8px] font-black uppercase tracking-widest text-gray-300">
                                Loading...
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Control Overlays */}
            {item.type === 'video' && isLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors pointer-events-none">
                    <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                       <Video className="w-5 h-5 text-white" />
                    </div>
                </div>
            )}
            {/* Selection indicator */}
            {isSelected ? (
                <div className="absolute inset-0 bg-catalog-accent/20 flex items-center justify-center">
                    <div className="bg-catalog-accent text-white rounded-full p-1 shadow-lg scale-110">
                        <CheckCircle className="w-6 h-6" />
                    </div>
                </div>
            ) : multiSelect && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full border-2 border-white bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Check className="w-3.5 h-3.5 text-white" />
                </div>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-white text-[9px] font-black uppercase tracking-widest truncate opacity-0 group-hover:opacity-100 transition-opacity">
                {item.filename}
            </div>
        </div>
    );
}

interface MediaPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called with a single item when multi is false (default) */
    onSelect: (item: MediaItem) => void;
    /** Called with multiple items when multiSelect is true */
    onSelectMultiple?: (items: MediaItem[]) => void;
    allowedTypes?: ('image' | 'video')[];
    /** Enable multi-select mode */
    multiSelect?: boolean;
}

export function MediaPickerModal({
    isOpen,
    onClose,
    onSelect,
    onSelectMultiple,
    allowedTypes = ['image', 'video'],
    multiSelect = false,
}: MediaPickerModalProps) {
    const { familyId } = useAuth();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPath, setCurrentPath] = useState<string>('All');

    // Single select
    const [selectedId, setSelectedId] = useState<string | null>(null);
    // Multi select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (isOpen && familyId) {
            fetchMedia();
        }
    }, [isOpen, familyId]);

    const fetchMedia = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('family_media')
                .select('*')
                .eq('family_id', familyId!)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMedia(data as MediaItem[] || []);
        } catch (err) {
            console.error('Error fetching media for picker:', err);
        } finally {
            setIsLoading(false);
        }
    };


    const filteredMedia = media.filter(item => {
        if (allowedTypes && !allowedTypes.includes(item.type)) return false;
        if (currentPath !== 'All' && (item.folder || '/') !== currentPath) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return item.filename?.toLowerCase().includes(q) || item.tags?.some(t => t.toLowerCase().includes(q));
        }
        return true;
    });

    // ── Handlers ──────────────────────────────────────────────────────────

    const toggleMultiSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredMedia.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredMedia.map(i => i.id)));
        }
    };

    const handleConfirmSingle = () => {
        const item = media.find(m => m.id === selectedId);
        if (item) {
            onSelect(item);
            onClose();
        }
    };

    const handleConfirmMulti = () => {
        const selected = media.filter(m => selectedIds.has(m.id));
        if (onSelectMultiple) {
            onSelectMultiple(selected);
        } else {
            // Fallback: call onSelect for each (shouldn't normally happen)
            selected.forEach(item => onSelect(item));
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white z-10 shrink-0">
                    <div className="flex flex-col">
                        <h3 className="text-2xl font-outfit font-black text-catalog-text flex items-center gap-2">
                            <ImageIcon className="w-6 h-6 text-catalog-accent" />
                            {multiSelect ? 'Select from Library' : 'Select Media'}
                        </h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-1">
                            Browsing your family archive
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {multiSelect && filteredMedia.length > 0 && (
                            <button
                                onClick={handleSelectAll}
                                className="px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all border-catalog-accent/30 text-catalog-accent hover:bg-catalog-accent hover:text-white"
                            >
                                {selectedIds.size === filteredMedia.length ? 'Deselect All' : 'Select All'}
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar: Folders */}
                    <div className="w-64 border-r border-gray-100 bg-gray-50/50 overflow-y-auto p-4 space-y-1 hidden md:block">
                        <button
                            onClick={() => setCurrentPath('All')}
                            className={cn(
                                "w-full text-left px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3",
                                currentPath === 'All' ? "bg-white shadow-xl text-catalog-accent border border-black/5" : "text-gray-400 hover:text-gray-900"
                            )}
                        >
                            <ImageIcon className="w-4 h-4" /> All Media
                        </button>
                        <div className="pt-8 pb-3 px-3 text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Vault</div>
                        {Array.from(new Set(media.map(m => (m.folder || '').split('/')[0]).filter(Boolean))).sort().map(root => (
                            <button
                                key={root}
                                onClick={() => setCurrentPath(root)}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all truncate flex items-center gap-3",
                                    currentPath.startsWith(root) ? "bg-white shadow-xl text-catalog-accent border border-black/5" : "text-gray-400 hover:text-gray-900"
                                )}
                            >
                                <Folder className="w-4 h-4" />
                                <span className="truncate">{root}</span>
                            </button>
                        ))}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white">
                        {/* Search Bar */}
                        <div className="p-4 bg-white">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name or tag..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-4 bg-gray-50/80 border-none rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-6 content-scrollbar bg-white">
                            <div className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
                                <button onClick={() => setCurrentPath('All')} className={cn("hover:text-catalog-accent", currentPath === 'All' ? "text-catalog-accent" : "text-gray-400")}>Vault</button>
                                {currentPath !== 'All' && currentPath.split('/').filter(Boolean).map((p, i, arr) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <ChevronRight className="w-2.5 h-2.5 text-gray-300" />
                                        <button onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))} className={cn("hover:text-catalog-accent", i === arr.length - 1 ? "text-catalog-accent" : "text-gray-400")}>{p}</button>
                                    </div>
                                ))}
                            </div>

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-200">
                                    <div className="w-12 h-12 border-4 border-catalog-accent/10 border-t-catalog-accent rounded-full animate-spin" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-catalog-text/20">Decrypting Archive...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                                    {/* Subfolders in Grid */}
                                    {currentPath !== 'All' && Array.from(new Set(media.map(m => m.folder || '/').filter(f => f !== currentPath))).filter(f => {
                                        if (currentPath === '/') return !f.includes('/');
                                        return f.startsWith(currentPath + '/') && f.split('/').length === currentPath.split('/').length + 1;
                                    }).map(f => {
                                        const name = f.split('/').pop();
                                        return (
                                            <div key={f} onClick={() => setCurrentPath(f)} className="aspect-square rounded-[2rem] border border-gray-100 bg-gray-50/50 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-catalog-accent/5 hover:border-catalog-accent/20 transition-all group shadow-sm">
                                                <div className="p-5 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                                                    <Folder className="w-8 h-8 text-catalog-accent" />
                                                </div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-catalog-accent truncate px-4 w-full text-center">{name}</span>
                                            </div>
                                        );
                                    })}
                                    {filteredMedia.map(item => (
                                        <MediaPickerItem
                                            key={item.id}
                                            item={item}
                                            isSelected={multiSelect ? selectedIds.has(item.id) : selectedId === item.id}
                                            multiSelect={multiSelect}
                                            onToggle={() => multiSelect ? toggleMultiSelect(item.id) : setSelectedId(item.id)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-gray-100 flex justify-between items-center gap-3 bg-gray-50/50 shrink-0">
                            <button
                                onClick={onClose}
                                className="px-6 py-3 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-900 transition-colors"
                            >
                                Back to Editor
                            </button>
                            {multiSelect ? (
                                <button
                                    onClick={handleConfirmMulti}
                                    disabled={selectedIds.size === 0}
                                    className={cn(
                                        "px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl",
                                        selectedIds.size > 0 ? "bg-catalog-accent hover:bg-catalog-accent/90 hover:-translate-y-1 active:scale-95" : "bg-gray-300 cursor-not-allowed"
                                    )}
                                >
                                    {selectedIds.size > 0 ? `Import ${selectedIds.size} Memory${selectedIds.size > 1 ? 'ies' : ''}` : 'Confirm Selection'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleConfirmSingle}
                                    disabled={!selectedId}
                                    className={cn(
                                        "px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-[0.2em] text-white transition-all shadow-xl",
                                        selectedId ? "bg-catalog-accent hover:bg-catalog-accent/90 hover:-translate-y-1 active:scale-95" : "bg-gray-300 cursor-not-allowed"
                                    )}
                                >
                                    Confirm Selection
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
