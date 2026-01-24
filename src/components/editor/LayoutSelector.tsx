import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { useAlbum } from '../../contexts/AlbumContext';
import { Grid, Image as ImageIcon, Loader2, Search } from 'lucide-react';

interface LayoutSelection {
    id: string;
    name: string;
    image_count: number;
    target_ratio: 'portrait' | 'landscape' | 'square';
    config: any;
    category: string;
}

interface LayoutSelectorProps {
    pageId: string;
    onApply?: () => void;
}

export function LayoutSelector({ pageId, onApply }: LayoutSelectorProps) {
    const { album, updatePage } = useAlbum();
    const [layouts, setLayouts] = useState<LayoutSelection[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterCount, setFilterCount] = useState<number | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [useRatioFilter, setUseRatioFilter] = useState(true);

    // Determine target ratio based on album orientation
    const getTargetRatio = () => {
        if (!album) return 'portrait';
        const { width, height } = album.config.dimensions;
        if (width === height) return 'square';
        return width > height ? 'landscape' : 'portrait';
    };

    const targetRatio = getTargetRatio();

    useEffect(() => {
        const fetchLayouts = async () => {
            setLoading(true);
            try {
                let query = supabase
                    .from('album_layouts')
                    .select('*')
                    .eq('is_active', true);

                // If it's single page, show portrait/square. Spreads usually landscape.
                // For simplicity, we filter by target_ratio matches or is square
                if (useRatioFilter) {
                    if (targetRatio === 'landscape') {
                        query = query.eq('target_ratio', 'landscape');
                    } else {
                        query = query.in('target_ratio', ['portrait', 'square']);
                    }
                }

                const { data, error } = await query;
                if (!error && data) {
                    setLayouts(data as LayoutSelection[]);
                }
            } catch (err) {
                console.error('Failed to fetch layouts:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchLayouts();
    }, [targetRatio, useRatioFilter]);

    const filteredLayouts = layouts.filter(layout => {
        const matchesCount = filterCount === 'all' || layout.image_count === filterCount;
        const matchesSearch = (layout.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (layout.category?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        return matchesCount && matchesSearch;
    });

    const handleApplyLayout = (layout: LayoutSelection) => {
        const page = album?.pages.find(p => p.id === pageId);
        if (!page) return;

        // Parse the raw config from database
        const rawConfig = typeof layout.config === 'string' ? JSON.parse(layout.config) : layout.config;

        // Filter only media assets (images/videos)
        const mediaAssets = page.assets.filter(a => a.type === 'image' || a.type === 'video');
        const nonMediaAssets = page.assets.filter(a => a.type !== 'image' && a.type !== 'video');

        // Create layout config with nested content
        const layoutConfigWithContent = rawConfig.map((slot: any, index: number) => {
            const asset = mediaAssets[index];

            if (asset) {
                // Nest the asset data inside the slot's content
                return {
                    ...slot,
                    id: slot.id || `slot-${index}`,
                    content: {
                        type: asset.type,
                        url: asset.url,
                        zoom: asset.crop?.zoom || 1,
                        x: asset.crop?.x || 50,
                        y: asset.crop?.y || 50,
                        rotation: asset.rotation || 0,
                        config: {
                            ...asset,
                            // Preserve all asset properties for later editing
                            slotId: index
                        }
                    }
                };
            }

            // Empty slot
            return {
                ...slot,
                id: slot.id || `slot-${index}`,
                content: null
            };
        });

        // Update assets: assign slotId to media assets that fit in layout
        const updatedAssets = [
            ...mediaAssets.slice(0, layout.image_count).map((asset, idx) => ({
                ...asset,
                slotId: idx,
                x: 0, y: 0, width: 100, height: 100 // Relative to slot
            })),
            ...mediaAssets.slice(layout.image_count).map(asset => {
                const { slotId, ...rest } = asset;
                return rest; // Remove slotId from overflow assets
            }),
            ...nonMediaAssets.map(asset => {
                const { slotId, ...rest } = asset;
                return rest; // Keep non-media as freeform
            })
        ];

        updatePage(pageId, {
            layoutTemplate: layout.name,
            layoutConfig: layoutConfigWithContent,
            assets: updatedAssets
        });

        if (onApply) onApply();
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="p-4 border-b border-catalog-accent/10 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-catalog-text uppercase tracking-widest flex items-center gap-2">
                        <Grid className="w-4 h-4 text-catalog-accent" />
                        Layout Engine
                    </h3>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-1">
                    {['all', 1, 2, 3, 4, 6, 8].map((count) => (
                        <button
                            key={count}
                            onClick={() => setFilterCount(count as any)}
                            className={cn(
                                "px-2 py-1 text-[10px] font-bold rounded-full border transition-all",
                                filterCount === count
                                    ? "bg-catalog-accent text-white border-catalog-accent"
                                    : "bg-white text-catalog-text/60 border-catalog-accent/20 hover:border-catalog-accent/40"
                            )}
                        >
                            {count === 'all' ? 'All' : `${count} Img`}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-catalog-text/40" />
                    <input
                        type="text"
                        placeholder="Search layouts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs bg-catalog-stone/5 border border-catalog-accent/10 rounded-md focus:outline-none focus:ring-1 focus:ring-catalog-accent/30"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
                        <Loader2 className="w-6 h-6 animate-spin text-catalog-accent" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Loading Library</span>
                    </div>
                ) : filteredLayouts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 opacity-40 text-center">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2 text-catalog-accent/40" />
                        <span className="text-[10px] font-bold uppercase tracking-widest leading-tight">
                            {useRatioFilter ? "No matching layouts for this orientation" : "No layouts found"}
                        </span>
                        <div className="flex flex-col gap-2 mt-2">
                            {useRatioFilter && (
                                <button
                                    onClick={() => setUseRatioFilter(false)}
                                    className="text-[10px] font-bold text-catalog-accent hover:underline uppercase tracking-widest"
                                >
                                    Show All Orientations
                                </button>
                            )}
                            <button
                                onClick={() => { setFilterCount('all'); setSearchQuery(''); setUseRatioFilter(true); }}
                                className="text-[10px] font-bold text-catalog-text/60 hover:text-catalog-accent uppercase tracking-widest"
                            >
                                Reset All Filters
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        {filteredLayouts.map((layout) => (
                            <button
                                key={layout.id}
                                onClick={() => handleApplyLayout(layout)}
                                className="group relative aspect-[4/3] bg-catalog-stone/5 border border-catalog-accent/20 rounded-lg overflow-hidden hover:border-catalog-accent hover:shadow-lg transition-all"
                            >
                                <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent z-10">
                                    <div className="text-[8px] font-black text-white uppercase tracking-wider truncate">
                                        {layout.name}
                                    </div>
                                    <div className="text-[7px] text-white/60 font-medium">
                                        {layout.image_count} Media Slots
                                    </div>
                                </div>

                                {/* Miniature Layout Preview */}
                                <div className="w-full h-full p-2 relative">
                                    {JSON.parse(typeof layout.config === 'string' ? layout.config : JSON.stringify(layout.config)).map((slot: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="absolute border border-catalog-accent/40 bg-white/40 group-hover:bg-catalog-accent/10 transition-colors"
                                            style={{
                                                top: `${slot.top}%`,
                                                left: `${slot.left}%`,
                                                width: `${slot.width}%`,
                                                height: `${slot.height}%`
                                            }}
                                        />
                                    ))}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-3 bg-catalog-stone/5 border-t border-catalog-accent/10">
                <p className="text-[8px] text-center text-catalog-text/50 font-medium uppercase tracking-[0.2em]">
                    Smart Aspect-Ratio Matching Enabled
                </p>
            </div>
        </div>
    );
}
