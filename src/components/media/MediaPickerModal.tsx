import { useState, useEffect } from 'react';
import { X, Search, Image as ImageIcon, Video, Folder, CheckCircle, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

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
    allowedTypes = ['image'],
    multiSelect = false,
}: MediaPickerModalProps) {
    const { familyId } = useAuth();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentFolder, setCurrentFolder] = useState<string>('All');

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

    const folders = Array.from(new Set(media.map(m => m.folder || 'Unsorted'))).sort();

    const filteredMedia = media.filter(item => {
        if (allowedTypes && !allowedTypes.includes(item.type)) return false;
        if (currentFolder !== 'All' && (item.folder || 'Unsorted') !== currentFolder) return false;
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
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-white z-10">
                    <h3 className="text-xl font-serif text-catalog-text flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-gray-400" />
                        {multiSelect ? 'Select from Library' : 'Select from Library'}
                    </h3>
                    <div className="flex items-center gap-3">
                        {multiSelect && filteredMedia.length > 0 && (
                            <button
                                onClick={handleSelectAll}
                                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all border-catalog-accent/30 text-catalog-accent hover:bg-catalog-accent hover:text-white"
                            >
                                {selectedIds.size === filteredMedia.length ? 'Deselect All' : 'Select All'}
                            </button>
                        )}
                        {multiSelect && selectedIds.size > 0 && (
                            <span className="px-2 py-0.5 bg-catalog-accent text-white rounded-full text-xs font-black">
                                {selectedIds.size} selected
                            </span>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar: Folders */}
                    <div className="w-48 border-r border-gray-100 bg-gray-50 overflow-y-auto p-2 space-y-1 hidden md:block">
                        <button
                            onClick={() => setCurrentFolder('All')}
                            className={cn(
                                "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-2",
                                currentFolder === 'All' ? "bg-white shadow text-catalog-accent" : "text-gray-500 hover:text-gray-900"
                            )}
                        >
                            <ImageIcon className="w-4 h-4" /> All Media
                        </button>
                        <div className="pt-2 px-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Folders</div>
                        {folders.map(folder => (
                            <button
                                key={folder}
                                onClick={() => setCurrentFolder(folder)}
                                className={cn(
                                    "w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate flex items-center gap-2",
                                    currentFolder === folder ? "bg-white shadow text-catalog-accent" : "text-gray-500 hover:text-gray-900"
                                )}
                            >
                                <Folder className="w-3.5 h-3.5" />
                                <span className="truncate">{folder}</span>
                            </button>
                        ))}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col min-w-0 bg-white">
                        {/* Search Bar */}
                        <div className="p-3 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search by name or tag..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-catalog-accent/20"
                                />
                            </div>
                        </div>

                        {/* Grid */}
                        <div className="flex-1 overflow-y-auto p-4 content-scrollbar">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
                            ) : filteredMedia.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
                                    <ImageIcon className="w-12 h-12 mb-2" />
                                    <p>No media found</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                    {filteredMedia.map(item => {
                                        const isMultiSelected = selectedIds.has(item.id);
                                        const isSingleSelected = selectedId === item.id;
                                        const isSelected = multiSelect ? isMultiSelected : isSingleSelected;

                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => multiSelect ? toggleMultiSelect(item.id) : setSelectedId(item.id)}
                                                onDoubleClick={() => {
                                                    if (!multiSelect) {
                                                        setSelectedId(item.id);
                                                        handleConfirmSingle();
                                                    }
                                                }}
                                                className={cn(
                                                    "aspect-square rounded-lg overflow-hidden cursor-pointer relative group border transition-all",
                                                    isSelected
                                                        ? "ring-2 ring-catalog-accent border-catalog-accent shadow-md"
                                                        : "border-gray-100 hover:border-gray-300"
                                                )}
                                            >
                                                <img
                                                    src={item.type === 'video' ? `https://res.cloudinary.com/demo/image/fetch/f_jpg/${item.url}` : item.url}
                                                    alt={item.filename}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
                                                />
                                                {item.type === 'video' && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                                        <Video className="w-8 h-8 text-white opacity-80" />
                                                    </div>
                                                )}
                                                {/* Selection indicator */}
                                                {isSelected ? (
                                                    <div className="absolute inset-0 bg-catalog-accent/20 flex items-center justify-center">
                                                        <div className="bg-catalog-accent text-white rounded-full p-1 shadow-lg">
                                                            <CheckCircle className="w-5 h-5" />
                                                        </div>
                                                    </div>
                                                ) : multiSelect && (
                                                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full border-2 border-white bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Check className="w-3 h-3 text-white" />
                                                    </div>
                                                )}
                                                <div className="absolute bottom-0 inset-x-0 bg-black/50 p-1 text-white text-[10px] truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {item.filename}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 flex justify-between items-center gap-3 bg-gray-50">
                            <button
                                onClick={onClose}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
                            >
                                Cancel
                            </button>
                            {multiSelect ? (
                                <button
                                    onClick={handleConfirmMulti}
                                    disabled={selectedIds.size === 0}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-bold text-white transition-all shadow-sm",
                                        selectedIds.size > 0 ? "bg-catalog-accent hover:bg-catalog-accent/90" : "bg-gray-300 cursor-not-allowed"
                                    )}
                                >
                                    {selectedIds.size > 0 ? `Select ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}` : 'Select Items'}
                                </button>
                            ) : (
                                <button
                                    onClick={handleConfirmSingle}
                                    disabled={!selectedId}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-bold text-white transition-all shadow-sm",
                                        selectedId ? "bg-catalog-accent hover:bg-catalog-accent/90" : "bg-gray-300 cursor-not-allowed"
                                    )}
                                >
                                    Select Item
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
