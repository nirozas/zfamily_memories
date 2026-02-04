import { useState, useEffect, memo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAlbum } from '../../contexts/AlbumContext';
import { Grid, Search, Plus, Layout as LayoutIcon, Eye, EyeOff, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LayoutSelection {
    id: string;
    name: string;
    image_count: number;
    target_ratio: 'portrait' | 'landscape' | 'square';
    config: any;
    category: string;
}

interface LayoutSidebarProps {
    activePageId: string;
}

const LayoutThumbnail = memo(({ layout, viewMode, onClick }: { layout: LayoutSelection, viewMode: 'single' | 'spread', onClick: () => void }) => {
    const config = typeof layout.config === 'string' ? JSON.parse(layout.config) : layout.config;

    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative glass-card border border-black/5 rounded-2xl overflow-hidden hover:border-catalog-accent/30 hover:shadow-2xl hover:shadow-catalog-accent/10 transition-all p-3 active:scale-95",
                viewMode === 'spread' ? "aspect-[2/1]" : "aspect-square"
            )}
            title={layout.name}
        >
            {/* Image Count Badge */}
            <div className="absolute top-3 left-3 z-20">
                <span className="text-[7px] font-black text-white uppercase tracking-widest px-2.5 py-1 bg-catalog-accent rounded-lg shadow-lg border border-white/20">
                    {layout.image_count} SLOTS
                </span>
            </div>

            {/* Wireframe Container */}
            <div className="w-full h-full relative bg-catalog-stone/5 rounded-xl overflow-hidden border border-black/5 group-hover:bg-catalog-stone/10 transition-colors">
                {config.map((slot: any, idx: number) => (
                    <div
                        key={idx}
                        className="absolute bg-white/80 border-[1.5px] border-catalog-accent/30 shadow-inner group-hover:border-catalog-accent/60 transition-all"
                        style={{
                            top: `${slot.top}%`,
                            left: `${slot.left}%`,
                            width: `${slot.width}%`,
                            height: `${slot.height}%`,
                            borderRadius: '4px'
                        }}
                    >
                        <div className="absolute inset-x-2 top-1/2 h-[1px] bg-catalog-accent/10 group-hover:bg-catalog-accent/20" />
                        <div className="absolute inset-y-2 left-1/2 w-[1px] bg-catalog-accent/10 group-hover:bg-catalog-accent/20" />
                    </div>
                ))}

                {/* Visual Gutter for Spreads */}
                {viewMode === 'spread' && (
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[1px] bg-black/10 z-10 pointer-events-none" />
                )}
            </div>

            {/* Apply Overlay */}
            <div className="absolute inset-0 bg-catalog-accent/10 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
                <div className="bg-white text-catalog-accent rounded-2xl p-3 shadow-2xl transform scale-75 group-hover:scale-100 transition-all duration-500 font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Apply Template
                </div>
            </div>
        </button>
    );
});

const SkeletonThumbnail = ({ viewMode }: { viewMode: 'single' | 'spread' }) => (
    <div className={cn(
        "glass-card rounded-2xl p-3 border border-black/5",
        viewMode === 'spread' ? "aspect-[2/1]" : "aspect-square"
    )}>
        <div className="w-full h-full bg-black/5 rounded-xl overflow-hidden relative animate-pulse" />
    </div>
);

export function LayoutSidebar({ activePageId }: LayoutSidebarProps) {
    const { album, applyLayout, showLayoutOutlines, toggleLayoutOutlines, clearPageMedia } = useAlbum();
    const [layouts, setLayouts] = useState<LayoutSelection[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Advanced Filters
    const [filterCount, setFilterCount] = useState<string>('all');
    const [viewMode, setViewMode] = useState<'single' | 'spread'>(
        album?.config.useSpreadView ? 'spread' : 'single'
    );

    useEffect(() => {
        const fetchLayouts = async () => {
            setLoading(true);
            try {
                const { data, error } = await (supabase.from('album_layouts') as any)
                    .select('*')
                    .eq('is_active', true);

                if (!error && data) {
                    setLayouts(data as LayoutSelection[]);
                }
            } catch (err) {
                console.error('Failed to fetch layouts:', err);
            } finally {
                setTimeout(() => setLoading(false), 400);
            }
        };

        fetchLayouts();
    }, []);

    const filteredLayouts = layouts.filter(layout => {
        const matchesSearch = (layout.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (layout.category?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        if (viewMode === 'spread') {
            if (layout.target_ratio !== 'landscape') return false;
        } else {
            if (layout.target_ratio === 'landscape') return false;
        }

        if (filterCount !== 'all') {
            const count = layout.image_count;
            if (filterCount === '1' && count !== 1) return false;
            if (filterCount === '2' && count !== 2) return false;
            if (filterCount === '3' && count !== 3) return false;
            if (filterCount === '4' && count !== 4) return false;
            if (filterCount === '5-7' && (count < 5 || count > 7)) return false;
            if (filterCount === '8-10' && (count < 8 || count > 10)) return false;
        }

        return true;
    });

    const handleApply = (layout: LayoutSelection) => {
        if (!activePageId) return;
        applyLayout(activePageId, layout);
    };

    const imageCountOptions = [
        { label: 'Any Count', value: 'all' },
        { label: 'Single Shot', value: '1' },
        { label: 'Double', value: '2' },
        { label: 'Triple', value: '3' },
        { label: 'Quad', value: '4' },
        { label: 'Art Gallery (5-7)', value: '5-7' },
        { label: 'Collection (8-10)', value: '8-10' },
    ];

    const viewModeOptions = [
        { label: 'Single Canvas', value: 'single' },
        { label: 'Deep Spread', value: 'spread' },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden font-outfit">
            {/* Advanced Navigation Header */}
            <div className="p-6 border-b border-black/5 space-y-6 bg-black/5 backdrop-blur-md">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black text-catalog-text uppercase tracking-widest flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-black/5">
                            <LayoutIcon className="w-4 h-4 text-catalog-accent" />
                        </div>
                        Compositions
                    </h3>
                    <button
                        onClick={toggleLayoutOutlines}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border",
                            showLayoutOutlines
                                ? "bg-catalog-accent text-white border-transparent shadow-lg shadow-catalog-accent/20"
                                : "bg-white text-catalog-text/40 border-black/5 hover:bg-black/5"
                        )}
                        title={showLayoutOutlines ? "Hide Layout Outlines" : "Show Layout Outlines"}
                    >
                        {showLayoutOutlines ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        {showLayoutOutlines ? "GUIDES" : "OFF"}
                    </button>
                </div>

                {/* Filter Dropdowns */}
                <div className="grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-catalog-text/30 uppercase tracking-[0.2em] px-1">Asset Density</label>
                        <select
                            value={filterCount}
                            onChange={(e) => setFilterCount(e.target.value)}
                            className="w-full bg-white border border-black/5 rounded-xl py-2 px-3 text-[10px] font-black text-catalog-text/60 focus:outline-none focus:ring-4 focus:ring-catalog-accent/10 appearance-none cursor-pointer uppercase tracking-widest transition-all"
                        >
                            {imageCountOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-catalog-text/30 uppercase tracking-[0.2em] px-1">Canvas Mode</label>
                        <select
                            value={viewMode}
                            onChange={(e) => setViewMode(e.target.value as any)}
                            className="w-full bg-white border border-black/5 rounded-xl py-2 px-3 text-[10px] font-black text-catalog-text/60 focus:outline-none focus:ring-4 focus:ring-catalog-accent/10 appearance-none cursor-pointer uppercase tracking-widest transition-all"
                        >
                            {viewModeOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/30 group-focus-within:text-catalog-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Search archetypes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-2.5 text-xs bg-white border border-black/5 rounded-xl focus:outline-none focus:ring-4 focus:ring-catalog-accent/10 transition-all font-black uppercase tracking-widest placeholder:text-catalog-text/20 placeholder:font-black"
                    />
                </div>
            </div>

            {/* Active Page Management Section */}
            {(activePageId && album) && (
                <div className="mx-6 mt-4 mb-2 p-4 glass-card border border-catalog-accent/20 rounded-2xl bg-catalog-accent/[0.02]">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[9px] font-black text-catalog-accent uppercase tracking-[0.2em]">Active Page Context</span>
                        <button
                            onClick={() => {
                                if (window.confirm("Are you sure you want to clear all media from this page?")) {
                                    clearPageMedia(activePageId);
                                }
                            }}
                            className="p-1.5 bg-white rounded-lg hover:bg-red-50 text-red-500 transition-all shadow-sm border border-black/5"
                            title="Clear All Media"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <div className="flex gap-6">
                        <div className="flex flex-col">
                            <span className="text-[7px] text-catalog-text/40 font-black uppercase tracking-widest">Composition</span>
                            <span className="text-[10px] font-black text-catalog-text/80 uppercase">
                                {album.pages.find(p => p.id === activePageId)?.layoutTemplate || 'Freeform'}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[7px] text-catalog-text/40 font-black uppercase tracking-widest">Occupancy</span>
                            <span className="text-[10px] font-black text-catalog-text/80 uppercase">
                                {album.pages.find(p => p.id === activePageId)?.assets.length || 0} Elements
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Layout Grid */}
            <div className="flex-1 overflow-y-auto content-scrollbar p-6">
                <div className={cn(
                    "grid gap-4 pb-12",
                    viewMode === 'spread' ? "grid-cols-1" : "grid-cols-2"
                )}>
                    {/* SPECIAL: Blank Canvas Layout */}
                    {!loading && filterCount === 'all' && searchQuery === '' && (
                        <button
                            onClick={() => handleApply({
                                id: 'freeform',
                                name: 'freeform',
                                image_count: 0,
                                target_ratio: viewMode === 'spread' ? 'landscape' : 'portrait',
                                config: [],
                                category: 'Basic'
                            })}
                            className={cn(
                                "group relative bg-white border border-catalog-accent/20 border-dashed rounded-[2rem] overflow-hidden hover:border-catalog-accent/40 hover:shadow-2xl hover:shadow-catalog-accent/10 transition-all p-3 active:scale-95 flex items-center justify-center",
                                viewMode === 'spread' ? "aspect-[2/1]" : "aspect-square"
                            )}
                        >
                            <div className="absolute top-4 left-4 z-20">
                                <span className="text-[7px] font-black text-white px-3 py-1 bg-catalog-text/50 rounded-lg opacity-80 uppercase tracking-widest border border-white/20">TABULA RASA</span>
                            </div>
                            <div className="flex flex-col items-center justify-center gap-3">
                                <div className="p-4 bg-catalog-accent/5 rounded-full ring-1 ring-catalog-accent/20 group-hover:scale-110 transition-transform">
                                    <Plus className="w-6 h-6 text-catalog-accent" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-catalog-text/30">Blank Slate</span>
                            </div>
                        </button>
                    )}

                    {loading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                            <SkeletonThumbnail key={i} viewMode={viewMode} />
                        ))
                    ) : (
                        filteredLayouts.map(layout => (
                            <LayoutThumbnail
                                key={layout.id}
                                layout={layout}
                                viewMode={viewMode}
                                onClick={() => handleApply(layout)}
                            />
                        ))
                    )}

                    {!loading && filteredLayouts.length === 0 && (
                        <div className="col-span-full py-24 flex flex-col items-center justify-center gap-6 opacity-30 text-center px-4">
                            <div className="w-16 h-16 bg-black/5 rounded-[2rem] flex items-center justify-center">
                                <Grid className="w-8 h-8" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-sm font-black uppercase tracking-widest text-catalog-text">No Patterns Match</h3>
                                <p className="text-[9px] font-medium leading-relaxed max-w-[200px] uppercase">Refine your density or canvas mode filters.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-6 bg-black/5 border-t border-black/5">
                <div className="flex items-center justify-between text-[8px] font-black text-catalog-text/30 uppercase tracking-[0.2em]">
                    <span>Editorial Engine v4.0</span>
                    <span className="flex items-center gap-1.5">
                        <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                        Live Sync
                    </span>
                </div>
            </div>
        </div>
    );
}
