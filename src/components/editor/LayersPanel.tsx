import { useState, useEffect } from 'react';
import { useAlbum, type Asset } from '../../contexts/AlbumContext';
import { Layers, Lock, Unlock, Eye, EyeOff, GripVertical, Type, Image as ImageIcon, Video, Box, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Reorder } from 'framer-motion';

export function LayersPanel({ activePageId }: { activePageId?: string | null }) {
    const {
        album,
        currentPageIndex,
        selectedAssetId,
        setSelectedAssetId,
        updateAsset,
        removeAsset,
        getSpread,
        updatePageAssets
    } = useAlbum();

    const [viewMode, setViewMode] = useState<'spread' | 'page'>('spread');
    const [activeSide, setActiveSide] = useState<'left' | 'right'>('left');

    if (!album) return null;

    const spreadPages = getSpread(currentPageIndex);

    // Sync active side when activePageId changes
    useEffect(() => {
        if (activePageId) {
            const index = spreadPages.findIndex(p => p.id === activePageId);
            if (index !== -1) {
                setActiveSide(index === 0 ? 'left' : 'right');
            }
        }
    }, [activePageId, spreadPages]);


    const toggleLock = (pageId: string, asset: Asset) => {
        updateAsset(pageId, asset.id, { isLocked: !asset.isLocked });
    };

    const toggleHide = (pageId: string, asset: Asset) => {
        updateAsset(pageId, asset.id, { isHidden: !asset.isHidden });
    };

    const handleRename = (pageId: string, asset: Asset, name: string) => {
        updateAsset(pageId, asset.id, { id_name: name });
    };

    return (
        <div className="flex flex-col h-full w-full overflow-hidden font-outfit">
            <div className="flex flex-col gap-4 p-6 border-b border-black/5 bg-black/5 backdrop-blur-md shrink-0">
                <div className="flex items-center justify-between">
                    <h3 className="font-outfit font-black text-xs uppercase tracking-widest text-catalog-text flex items-center gap-3">
                        <div className="p-2 bg-white rounded-lg shadow-sm border border-black/5">
                            <Layers className="w-4 h-4 text-catalog-accent" />
                        </div>
                        Hierarchy
                    </h3>
                    <p className="text-[10px] text-catalog-text/40 font-black uppercase tracking-widest italic">
                        Depth Control
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Switcher */}
                    <div className="flex flex-1 p-1 glass rounded-xl shadow-inner border border-black/5">
                        <button
                            onClick={() => setViewMode('spread')}
                            className={cn(
                                "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                viewMode === 'spread' ? "bg-white shadow-sm text-catalog-text" : "text-catalog-text/30 hover:text-catalog-text/60"
                            )}
                        >
                            Spread
                        </button>
                        <button
                            onClick={() => setViewMode('page')}
                            className={cn(
                                "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                viewMode === 'page' ? "bg-white shadow-sm text-catalog-text" : "text-catalog-text/30 hover:text-catalog-text/60"
                            )}
                        >
                            Page
                        </button>
                    </div>

                    {viewMode === 'spread' && (
                        <div className="flex gap-1">
                            <button
                                onClick={() => document.getElementById('left-page-column')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}
                                className="p-2 glass rounded-lg hover:bg-white transition-all shadow-sm border border-black/5"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 text-catalog-accent" />
                            </button>
                            <button
                                onClick={() => document.getElementById('right-page-column')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })}
                                className="p-2 glass rounded-lg hover:bg-white transition-all shadow-sm border border-black/5"
                            >
                                <ChevronRight className="w-3.5 h-3.5 text-catalog-accent" />
                            </button>
                        </div>
                    )}
                </div>

                {viewMode === 'page' && (
                    <div className="flex p-1 glass rounded-xl border border-black/5">
                        <button
                            onClick={() => setActiveSide('left')}
                            className={cn(
                                "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                activeSide === 'left' ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/30"
                            )}
                        >
                            Left
                        </button>
                        <button
                            onClick={() => setActiveSide('right')}
                            className={cn(
                                "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all",
                                activeSide === 'right' ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/30"
                            )}
                        >
                            Right
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden px-4 py-6 scrollbar-thin scrollbar-thumb-catalog-accent/20 scrollbar-track-transparent">
                <div className="flex h-full gap-8 items-start min-w-max pb-4">
                    {viewMode === 'spread' ? (
                        <>
                            {spreadPages.map((page, pIdx) => {
                                const sortedAssets = [...page.assets].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));

                                const handleReorder = (newOrder: Asset[]) => {
                                    const updatedWithZ = newOrder.map((asset, idx) => ({
                                        ...asset,
                                        zIndex: newOrder.length - idx
                                    }));
                                    updatePageAssets(page.id, updatedWithZ);
                                };

                                return (
                                    <div
                                        key={page.id}
                                        id={pIdx === 0 ? 'left-page-column' : 'right-page-column'}
                                        className={cn(
                                            "flex flex-col h-full min-w-[260px] w-full max-w-[300px] shrink-0 transition-opacity duration-300",
                                            page.id !== activePageId && activePageId && "opacity-60 grayscale-[0.5]"
                                        )}
                                    >
                                        <div className="px-4 py-2 mb-4 text-[10px] font-black text-catalog-text/40 uppercase tracking-[0.2em] glass-card rounded-xl border border-black/5">
                                            {page.layoutTemplate === 'cover-front' ? 'Archive Cover' : (pIdx === 0 ? 'Left Chapter' : 'Right Chapter')}
                                        </div>
                                        <Reorder.Group axis="y" values={sortedAssets} onReorder={handleReorder} className="space-y-2 overflow-y-auto pr-2 flex-1 content-scrollbar">
                                            {sortedAssets.map((asset) => (
                                                <LayerItem
                                                    key={asset.id}
                                                    asset={asset}
                                                    pageId={page.id}
                                                    isSelected={selectedAssetId === asset.id}
                                                    onSelect={() => setSelectedAssetId(asset.id)}
                                                    onToggleLock={() => toggleLock(page.id, asset)}
                                                    onToggleHide={() => toggleHide(page.id, asset)}
                                                    onRename={(name) => handleRename(page.id, asset, name)}
                                                    onRemove={() => removeAsset(page.id, asset.id)}
                                                />
                                            ))}
                                            {sortedAssets.length === 0 && (
                                                <div className="py-12 glass-card rounded-2xl border border-dashed border-black/10 flex flex-col items-center justify-center text-catalog-text/20 italic text-[10px]">
                                                    <Box className="w-8 h-8 mb-2 opacity-10" />
                                                    No elements
                                                </div>
                                            )}
                                        </Reorder.Group>
                                    </div>
                                );
                            })}
                        </>
                    ) : (
                        <div className="flex h-full w-full">
                            {spreadPages.filter((_, i) => (activeSide === 'left' ? i === 0 : i === 1)).map(page => {
                                const sortedAssets = [...page.assets].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
                                return (
                                    <Reorder.Group key={page.id} axis="y" values={sortedAssets} onReorder={(newOrder) => {
                                        const updatedWithZ = newOrder.map((asset, idx) => ({ ...asset, zIndex: newOrder.length - idx }));
                                        updatePageAssets(page.id, updatedWithZ);
                                    }} className="space-y-2 overflow-y-auto pr-2 flex-1 content-scrollbar min-w-[260px]">
                                        {sortedAssets.map(asset => (
                                            <LayerItem
                                                key={asset.id}
                                                asset={asset}
                                                pageId={page.id}
                                                isSelected={selectedAssetId === asset.id}
                                                onSelect={() => setSelectedAssetId(asset.id)}
                                                onToggleLock={() => toggleLock(page.id, asset)}
                                                onToggleHide={() => toggleHide(page.id, asset)}
                                                onRename={(name) => handleRename(page.id, asset, name)}
                                                onRemove={() => removeAsset(page.id, asset.id)}
                                            />
                                        ))}
                                        {page.assets.length === 0 && (
                                            <div className="py-24 glass-card rounded-3xl border border-dashed border-black/10 flex flex-col items-center justify-center text-catalog-text/20 italic text-[10px]">
                                                <Box className="w-12 h-12 mb-3 opacity-10" />
                                                Empty Chapter
                                            </div>
                                        )}
                                    </Reorder.Group>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

interface LayerItemProps {
    asset: Asset;
    pageId: string;
    isSelected: boolean;
    onSelect: () => void;
    onToggleLock: () => void;
    onToggleHide: () => void;
    onRename: (name: string) => void;
    onRemove: () => void;
}

function LayerItem({ asset, isSelected, onSelect, onToggleLock, onToggleHide, onRename, onRemove }: LayerItemProps) {
    return (
        <Reorder.Item
            value={asset}
            dragListener={!asset.isLocked}
            onClick={onSelect}
            className={cn(
                "group flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer",
                isSelected
                    ? "bg-white border-catalog-accent shadow-xl shadow-catalog-accent/10 -translate-y-0.5 scale-[1.02]"
                    : "bg-white/40 border-black/5 hover:bg-white hover:border-black/10 hover:shadow-lg",
                asset.isLocked && "opacity-60 cursor-default"
            )}
        >
            <div className={cn(
                "shrink-0 p-1.5 rounded-lg transition-colors",
                isSelected ? "bg-catalog-accent/10 text-catalog-accent" : "bg-black/5 text-catalog-text/30 group-hover:bg-black/10"
            )}>
                {asset.type === 'text' && <Type className="w-3.5 h-3.5" />}
                {asset.type === 'image' && <ImageIcon className="w-3.5 h-3.5" />}
                {asset.type === 'video' && <Video className="w-3.5 h-3.5" />}
                {asset.type === 'frame' && <Box className="w-3.5 h-3.5" />}
                {(asset.type === 'sticker' || asset.type === 'shape') && <Box className="w-3.5 h-3.5" />}
            </div>

            <div className="flex-1 min-w-0">
                <input
                    className="bg-transparent border-none p-0 text-[11px] font-black uppercase tracking-widest text-catalog-text focus:ring-0 w-full outline-none truncate font-outfit"
                    value={asset.id_name || `${asset.type}`}
                    onChange={(e) => onRename(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={asset.isLocked}
                />
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleHide(); }}
                    className={cn("p-2 rounded-lg transition-all", asset.isHidden ? "bg-red-50 text-red-500" : "hover:bg-black/5 text-catalog-text/20")}
                >
                    {asset.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleLock(); }}
                    className={cn("p-2 rounded-lg transition-all", asset.isLocked ? "bg-orange-50 text-orange-500" : "hover:bg-black/5 text-catalog-text/20")}
                >
                    {asset.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                </button>
                <button
                    onClick={(e) => { e.stopPropagation(); if (confirm('Permanently remove this layer?')) onRemove(); }}
                    className="p-2 rounded-lg hover:bg-red-50 text-catalog-text/10 hover:text-red-500 transition-all"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
                <div className="p-2 cursor-grab active:cursor-grabbing text-catalog-text/10 hover:text-catalog-text/40 transition-colors">
                    <GripVertical className="w-3 h-3" />
                </div>
            </div>
        </Reorder.Item>
    );
}
