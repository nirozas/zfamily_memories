import { useAlbum } from '../../contexts/AlbumContext';
import { Slider } from '../ui/Slider';
import {
    Layers,
    Trash2,
    Type,
    Image as ImageIcon,
    Sun,
    Droplets,
    Box,
    RotateCw,
    ChevronDown,
    Minimize2,
    Maximize2,
    Copy,
    Bold,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Type as TypeIcon,
    Lock,
    Unlock
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AssetControlPanelProps {
    editorMode: 'select' | 'mask' | 'pivot' | 'studio';
    setEditorMode: (mode: 'select' | 'mask' | 'pivot' | 'studio') => void;
}

function CollapsibleSection({ title, children, defaultOpen = true, icon: Icon }: { title: string, children: React.ReactNode, defaultOpen?: boolean, icon?: any }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border-b border-black/5 pb-0.5">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-2.5 px-2 hover:bg-black/5 rounded-xl transition-all group"
            >
                <div className="flex items-center gap-2.5">
                    <div className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        isOpen ? "bg-catalog-accent/10 text-catalog-accent" : "bg-black/5 text-catalog-text/40 group-hover:bg-black/10"
                    )}>
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                    </div>
                    <span className="text-[9px] font-black text-catalog-text/80 uppercase tracking-[0.2em] font-outfit">{title}</span>
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                >
                    <ChevronDown className="w-3.5 h-3.5 text-catalog-text/20" />
                </motion.div>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-3 pt-1 pb-4 px-3">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export function AssetControlPanel({ editorMode, setEditorMode }: AssetControlPanelProps) {
    const { album, selectedAssetId, currentPageIndex, updateAsset, removeAsset, updatePage, syncStyles, updateAssetZIndex, duplicateAsset } = useAlbum();

    // Improved asset selection logic to ensure consistency across the app
    const asset = album?.pages.flatMap(p => [
        ...(p.assets || []),
        ...(p.layoutConfig || []).map(b => ({ ...b, ...b.content?.config, type: b.content?.type || 'image', content: b.content?.text })),
        ...(p.textLayers || []).map(l => ({ ...l, ...l.content?.config, type: 'text', content: l.content?.text }))
    ] as any[]).find(a => a.id === selectedAssetId);

    let parentPage = album?.pages.find(p =>
        (p.assets || []).some(a => a.id === selectedAssetId) ||
        (p.layoutConfig || []).some(b => b.id === selectedAssetId) ||
        (p.textLayers || []).some(l => l.id === selectedAssetId)
    ) || album?.pages[currentPageIndex];

    if (!album || !selectedAssetId || !asset) {
        // Page settings for the current page
        const currentPage = album?.pages[currentPageIndex];
        return (
            <div className="w-full h-full overflow-y-auto content-scrollbar font-outfit bg-white/40 backdrop-blur-xl">
                <div className="p-8 border-b border-black/5 glass sticky top-0 z-10">
                    <h3 className="font-outfit font-black text-[11px] uppercase tracking-[0.4em] text-catalog-text flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-black/5 flex items-center justify-center">
                            <Layers className="w-5 h-5 text-catalog-accent" />
                        </div>
                        Canvas Matrix
                    </h3>
                </div>
                <div className="p-8 space-y-12">
                    {currentPage && (
                        <section className="space-y-10">
                            <div className="space-y-6">
                                <label className="text-[10px] font-black text-catalog-accent uppercase tracking-[0.4em]">Background Atmosphere</label>

                                <div className="grid grid-cols-5 gap-4">
                                    {[
                                        { name: 'Pure', value: '#ffffff' },
                                        { name: 'Warm', value: '#fff9f2' },
                                        { name: 'Archive', value: '#fdfcfb' },
                                        { name: 'Soft Gray', value: '#f8fafc' },
                                        { name: 'Bone', value: '#ececeb' },
                                        { name: 'Mint', value: '#f0fff4' },
                                        { name: 'Sky', value: '#f0f9ff' },
                                        { name: 'Rose', value: '#fff1f2' },
                                        { name: 'Slate', value: '#334155' },
                                        { name: 'Midnight', value: '#0f172a' },
                                    ].map((c) => (
                                        <button
                                            key={c.value}
                                            onClick={() => updatePage(currentPage.id, { backgroundColor: c.value })}
                                            className={cn(
                                                "w-full aspect-square rounded-[1rem] border transition-all hover:scale-110 shadow-sm",
                                                currentPage.backgroundColor === c.value ? "border-catalog-accent scale-110 shadow-xl ring-4 ring-catalog-accent/10" : "border-black/5"
                                            )}
                                            style={{ backgroundColor: c.value }}
                                            title={c.name}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-catalog-text/20 uppercase tracking-[0.3em]">Signature Chroma</label>
                                <div className="flex gap-4 glass p-2 rounded-[1.5rem] border border-black/5">
                                    <input
                                        type="color"
                                        disabled={album.config.isLocked}
                                        value={currentPage.backgroundColor || '#ffffff'}
                                        onChange={(e) => updatePage(currentPage.id, { backgroundColor: e.target.value })}
                                        className="w-12 h-12 bg-white border border-black/5 rounded-xl p-1 cursor-pointer disabled:opacity-50 shadow-sm"
                                    />
                                    <input
                                        type="text"
                                        value={currentPage.backgroundColor?.toUpperCase() || '#FFFFFF'}
                                        onChange={(e) => updatePage(currentPage.id, { backgroundColor: e.target.value })}
                                        className="flex-1 bg-transparent border-none px-2 text-xs font-mono font-black uppercase tracking-widest focus:ring-0 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-5 p-6 glass rounded-[2rem] border border-black/5">
                                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-catalog-text/40">
                                    <span>Atmospheric Opacity</span>
                                    <span className="text-catalog-accent font-outfit">{Math.round((currentPage.backgroundOpacity ?? 1) * 100)}%</span>
                                </div>
                                <Slider
                                    disabled={album.config.isLocked}
                                    value={[(currentPage.backgroundOpacity ?? 1) * 100]}
                                    min={0}
                                    max={100}
                                    onValueChange={(v: number[]) => updatePage(currentPage.id, { backgroundOpacity: v[0] / 100 })}
                                />
                            </div>

                            {currentPage.backgroundImage && (
                                <div className="space-y-6 pt-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest px-1">Atmospheric Proportions</label>
                                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/5 rounded-xl border border-black/5">
                                            {[
                                                { id: 'cover', label: 'Cover' },
                                                { id: 'contain', label: 'Fit' },
                                                { id: 'stretch', label: 'Fill' }
                                            ].map((mode) => (
                                                <button
                                                    key={mode.id}
                                                    onClick={() => updatePage(currentPage.id, { backgroundScale: mode.id as any })}
                                                    className={cn(
                                                        "py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all",
                                                        (currentPage.backgroundScale || 'cover') === mode.id ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/40 hover:text-catalog-text/60"
                                                    )}
                                                >
                                                    {mode.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest px-1">Vertical Anchor</label>
                                        <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/5 rounded-xl border border-black/5">
                                            {[
                                                { id: 'top', label: 'Top' },
                                                { id: 'center', label: 'Mid' },
                                                { id: 'bottom', label: 'Base' }
                                            ].map((pos) => (
                                                <button
                                                    key={pos.id}
                                                    onClick={() => updatePage(currentPage.id, { backgroundPosition: pos.id as any })}
                                                    className={cn(
                                                        "py-2 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all",
                                                        (currentPage.backgroundPosition || 'center') === pos.id ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/40 hover:text-catalog-text/60"
                                                    )}
                                                >
                                                    {pos.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-6 pt-10 border-t border-black/5">
                                <button
                                    disabled={album.config.isLocked}
                                    onClick={() => {
                                        if (confirm('Synchronize signature style to all pages in this archive?')) {
                                            syncStyles();
                                        }
                                    }}
                                    className="w-full py-6 bg-catalog-accent text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.3em] shadow-2xl shadow-catalog-accent/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                >
                                    Global Synchronization
                                </button>
                                <p className="text-[9px] text-catalog-text/20 text-center font-black uppercase tracking-widest leading-relaxed px-4">
                                    Unify dimensions, orientation, and core atmosphere across all archive chapters.
                                </p>
                            </div>
                        </section>
                    )}

                    <div className="pt-24 text-center space-y-6 opacity-30">
                        <div className="w-16 h-16 bg-black/5 rounded-[2rem] mx-auto flex items-center justify-center">
                            <Layers className="w-6 h-6 text-catalog-text" />
                        </div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-catalog-text max-w-[180px] mx-auto leading-relaxed">Select a canvas element to unlock properties</p>
                    </div>
                </div>
            </div>
        );
    }

    // We already found parentPage and asset above
    if (!parentPage || !asset) return null;

    const isLockedForEditing = album.config.isLocked || asset.isLocked;

    const handleLayerChange = (direction: 'front' | 'back') => {
        updateAssetZIndex(parentPage!.id, asset!.id, direction);
    };

    const handleDelete = () => {
        if (window.confirm('Remove this element from the archive?')) {
            removeAsset(parentPage!.id, asset!.id);
        }
    };
    const applyDpi = (targetDpi: number) => {
        const sourceWidth = asset.originalDimensions?.width || asset.width;
        const sourceHeight = asset.originalDimensions?.height || asset.height;

        // Calculate new width: (Original Pixels) / (Target Dots Per Inch / base 96 dpi)
        const newWidth = sourceWidth / (targetDpi / 96);
        const ratio = asset.aspectRatio || (sourceWidth / sourceHeight);

        updateAsset(parentPage!.id, asset!.id, {
            width: newWidth,
            height: newWidth / ratio
        });
    };

    const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'fit') => {
        const { width: w, height: h } = album?.config?.dimensions || { width: 800, height: 600 };
        const bleed = album?.config?.dimensions?.bleed || 0;

        let newX = asset.x;
        let newY = asset.y;
        let newWidth = asset.width;
        let newHeight = asset.height;

        switch (type) {
            case 'left': newX = bleed; break;
            case 'center': newX = (w - asset.width) / 2; break;
            case 'right': newX = w - asset.width - bleed; break;
            case 'top': newY = bleed; break;
            case 'middle': newY = (h - asset.height) / 2; break;
            case 'bottom': newY = h - asset.height - bleed; break;
            case 'fit':
                newX = 0;
                newY = 0;
                newWidth = w;
                newHeight = h;
                break;
        }

        updateAsset(parentPage!.id, asset!.id, { x: newX, y: newY, width: newWidth, height: newHeight });
    };

    return (
        <div className="w-full h-full flex flex-col overflow-y-auto content-scrollbar font-outfit bg-white/40 backdrop-blur-xl">
            <div className="p-8 border-b border-black/5 glass sticky top-0 z-10">
                <h3 className="font-outfit font-black text-[11px] uppercase tracking-[0.4em] text-catalog-text flex items-center gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl shadow-sm border border-black/5 flex items-center justify-center">
                        {asset.type === 'image' && <ImageIcon className="w-5 h-5 text-catalog-accent" />}
                        {asset.type === 'video' && <ImageIcon className="w-5 h-5 text-catalog-accent" />}
                        {asset.type === 'text' && <Type className="w-5 h-5 text-catalog-accent" />}
                        {(asset.type !== 'image' && asset.type !== 'video' && asset.type !== 'text') && <Box className="w-5 h-5 text-catalog-accent" />}
                    </div>
                    Object Protocol
                </h3>
            </div>

            <div className="p-4 space-y-3">
                {editorMode !== 'select' && (
                    <div className="p-4 glass-dark border border-white/10 rounded-xl space-y-3 mb-4 shadow-xl">
                        <div className="flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-catalog-accent animate-pulse" />
                            <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.3em] text-center">
                                Mode: {editorMode}
                            </p>
                        </div>
                        <button
                            className="w-full py-3 bg-white text-catalog-text rounded-xl shadow-lg text-[9px] font-black uppercase tracking-[0.3em] hover:bg-white/90 transition-all active:scale-95"
                            onClick={() => setEditorMode('select')}
                        >
                            FINISH EDITING
                        </button>
                    </div>
                )}

                <CollapsibleSection title="Transformation" icon={Box}>
                    <div className="space-y-4">
                        {/* Precise Positioning & Sizing */}
                        <div className="grid grid-cols-2 gap-2 pb-2">
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-0.5">X Position</label>
                                <input
                                    type="number"
                                    disabled={isLockedForEditing}
                                    value={Math.round(asset.x)}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { x: parseInt(e.target.value) || 0 })}
                                    className="w-full h-8 px-2 bg-white border border-black/5 rounded-lg text-[10px] font-mono font-bold disabled:opacity-50 focus:ring-2 focus:ring-catalog-accent/5 outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-0.5">Y Position</label>
                                <input
                                    type="number"
                                    disabled={isLockedForEditing}
                                    value={Math.round(asset.y)}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { y: parseInt(e.target.value) || 0 })}
                                    className="w-full h-8 px-2 bg-white border border-black/5 rounded-lg text-[10px] font-mono font-bold disabled:opacity-50 focus:ring-2 focus:ring-catalog-accent/5 outline-none"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pb-1">
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-0.5">Width</label>
                                <input
                                    type="number"
                                    disabled={isLockedForEditing}
                                    value={Math.round(asset.width)}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { width: parseInt(e.target.value) || 0 })}
                                    className="w-full h-8 px-2 bg-white border border-black/5 rounded-lg text-[10px] font-mono font-bold disabled:opacity-50 focus:ring-2 focus:ring-catalog-accent/5 outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-0.5">Height</label>
                                <input
                                    type="number"
                                    disabled={isLockedForEditing}
                                    value={Math.round(asset.height)}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { height: parseInt(e.target.value) || 0 })}
                                    className="w-full h-8 px-2 bg-white border border-black/5 rounded-lg text-[10px] font-mono font-bold disabled:opacity-50 focus:ring-2 focus:ring-catalog-accent/5 outline-none"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                disabled={isLockedForEditing}
                                onClick={() => updateAsset(parentPage!.id, asset!.id, { flipX: !asset.flipX })}
                                className={cn("p-2 text-[9px] font-black border border-black/5 rounded-lg hover:bg-black/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest", asset.flipX && "bg-catalog-accent text-white border-catalog-accent shadow-sm")}
                                title="Flip Horizontal"
                            >
                                <Box className="w-3.5 h-3.5 scale-x-[-1]" /> Flip H
                            </button>
                            <button
                                disabled={isLockedForEditing}
                                onClick={() => updateAsset(parentPage!.id, asset!.id, { flipY: !asset.flipY })}
                                className={cn("p-2 text-[9px] font-black border border-black/5 rounded-lg hover:bg-black/5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 uppercase tracking-widest", asset.flipY && "bg-catalog-accent text-white border-catalog-accent shadow-sm")}
                                title="Flip Vertical"
                            >
                                <Box className="w-3.5 h-3.5 scale-y-[-1]" /> Flip V
                            </button>
                        </div>

                        {(asset.type === 'image' || asset.type === 'video' || asset.type === 'frame') && (
                            <button
                                disabled={isLockedForEditing}
                                onClick={() => updateAsset(parentPage!.id, asset!.id, { lockAspectRatio: !asset.lockAspectRatio })}
                                className={cn(
                                    "w-full py-2.5 px-3 flex items-center justify-between border border-black/5 rounded-xl transition-all",
                                    asset.lockAspectRatio ? "bg-catalog-accent/5 border-catalog-accent/20 text-catalog-accent" : "hover:bg-black/[0.02] text-catalog-text/40"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    {asset.lockAspectRatio ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                    <span className="text-[9px] font-black uppercase tracking-widest">Maintain Aspect Ratio</span>
                                </div>
                                <div className={cn(
                                    "w-8 h-4 rounded-full relative transition-colors duration-300",
                                    asset.lockAspectRatio ? "bg-catalog-accent" : "bg-black/10"
                                )}>
                                    <motion.div
                                        animate={{ x: asset.lockAspectRatio ? 18 : 2 }}
                                        className="absolute top-1 w-2.5 h-2.5 bg-white rounded-full shadow-sm"
                                    />
                                </div>
                            </button>
                        )}

                        <div className="space-y-3 p-3 bg-black/[0.02] rounded-xl border border-black/5">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-catalog-text/40">
                                <span>Opacity</span>
                                <span className="text-catalog-accent">{asset.opacity ?? 100}%</span>
                            </div>
                            <Slider
                                disabled={isLockedForEditing}
                                value={[asset.opacity ?? 100]}
                                min={0}
                                max={100}
                                onValueChange={(v: number[]) => updateAsset(parentPage!.id, asset!.id, { opacity: v[0] })}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => handleLayerChange('back')} className="flex-1 py-1.5 text-[8px] font-black border border-black/5 rounded-lg hover:bg-black/5 uppercase tracking-[0.2em] transition-all">To Back</button>
                            <button onClick={() => handleLayerChange('front')} className="flex-1 py-1.5 text-[8px] font-black border border-black/5 rounded-lg hover:bg-black/5 uppercase tracking-[0.2em] transition-all">To Front</button>
                        </div>

                        <button
                            disabled={isLockedForEditing}
                            onClick={() => {
                                if (parentPage && asset) duplicateAsset(parentPage.id, asset.id);
                            }}
                            className="w-full py-2.5 bg-catalog-accent/5 border border-catalog-accent/10 border-dashed rounded-lg hover:bg-catalog-accent/10 text-[9px] font-black uppercase tracking-[0.2em] text-catalog-accent flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Copy className="w-3.5 h-3.5" /> Clone Element
                        </button>
                    </div>
                </CollapsibleSection>

                {asset.type === 'text' && (
                    <CollapsibleSection title="Typography Essence" icon={TypeIcon}>
                        <div className="space-y-4">
                            {/* Font Family */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest">Typeface</label>
                                <select
                                    disabled={isLockedForEditing}
                                    value={asset.fontFamily || 'Inter'}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { fontFamily: e.target.value })}
                                    className="w-full h-10 px-4 bg-white border border-black/5 rounded-xl text-[11px] font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-catalog-accent/5 appearance-none"
                                >
                                    <option value="Inter">Outfit (Modern)</option>
                                    <option value="'Cormorant Garamond'">Garamond (Elegant)</option>
                                    <option value="'Playfair Display'">Playfair (Classic)</option>
                                    <option value="'Dancing Script'">Dancing (Script)</option>
                                    <option value="Montserrat">Montserrat (Geometric)</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {/* Font Size */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest">Size (pt)</label>
                                    <input
                                        type="number"
                                        disabled={isLockedForEditing}
                                        value={asset.fontSize || 32}
                                        onChange={(e) => updateAsset(parentPage!.id, asset!.id, { fontSize: parseInt(e.target.value) || 12 })}
                                        className="w-full h-10 px-3 bg-white border border-black/5 rounded-xl text-xs font-mono font-bold outline-none focus:ring-4 focus:ring-catalog-accent/5"
                                    />
                                </div>
                                {/* Text Color */}
                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest">Ink Color</label>
                                    <div className="flex gap-2 h-10">
                                        <div className="flex-1 relative rounded-xl overflow-hidden border border-black/5">
                                            <input
                                                type="color"
                                                disabled={isLockedForEditing}
                                                value={asset.textColor || '#000000'}
                                                onChange={(e) => updateAsset(parentPage!.id, asset!.id, { textColor: e.target.value })}
                                                className="absolute inset-0 w-full h-full scale-150 cursor-pointer border-none p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Style Toggles */}
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => updateAsset(parentPage!.id, asset!.id, { fontWeight: asset.fontWeight === 'bold' ? 'normal' : 'bold' })}
                                    className={cn(
                                        "py-3 rounded-xl border border-black/5 flex items-center justify-center gap-2 transition-all",
                                        asset.fontWeight === 'bold' ? "bg-catalog-accent text-white shadow-lg" : "hover:bg-black/5 text-catalog-text/40"
                                    )}
                                >
                                    <Bold className="w-4 h-4" /> <span className="text-[10px] font-black uppercase tracking-widest">Bold</span>
                                </button>
                                <button
                                    onClick={() => updateAsset(parentPage!.id, asset!.id, { textDecoration: asset.textDecoration === 'underline' ? 'none' : 'underline' } as any)}
                                    className={cn(
                                        "py-3 rounded-xl border border-black/5 flex items-center justify-center gap-2 transition-all",
                                        asset.textDecoration === 'underline' ? "bg-catalog-accent text-white shadow-lg" : "hover:bg-black/5 text-catalog-text/40"
                                    )}
                                >
                                    <Underline className="w-4 h-4" /> <span className="text-[10px] font-black uppercase tracking-widest">Underline</span>
                                </button>
                            </div>

                            {/* Alignment */}
                            <div className="grid grid-cols-3 gap-2 p-1.5 bg-black/5 rounded-2xl border border-black/5">
                                {[
                                    { id: 'left', icon: AlignLeft },
                                    { id: 'center', icon: AlignCenter },
                                    { id: 'right', icon: AlignRight }
                                ].map((align) => (
                                    <button
                                        key={align.id}
                                        onClick={() => updateAsset(parentPage!.id, asset!.id, { textAlign: align.id as any })}
                                        className={cn(
                                            "py-2 rounded-xl flex items-center justify-center transition-all",
                                            (asset.textAlign || 'center') === align.id ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/20 hover:text-catalog-text/40"
                                        )}
                                    >
                                        <align.icon className="w-4 h-4" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {(asset.type === 'image' || asset.type === 'video' || asset.type === 'frame') && (
                    <CollapsibleSection title="Borders & Shape" icon={Maximize2} defaultOpen={false}>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-[8px] font-black text-catalog-text/40 uppercase tracking-widest">
                                    <span>Corner Radius</span>
                                    <span className="text-catalog-accent">{asset.borderRadius || 0}px</span>
                                </div>
                                <Slider
                                    value={[asset.borderRadius || 0]}
                                    min={0}
                                    max={100}
                                    onValueChange={(v: number[]) => updateAsset(parentPage!.id, asset!.id, { borderRadius: v[0] })}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-[8px] font-black text-catalog-text/40 uppercase tracking-widest">
                                    <span>Stroke Width</span>
                                    <span className="text-catalog-accent">{asset.borderWidth || 0}px</span>
                                </div>
                                <Slider
                                    value={[asset.borderWidth || 0]}
                                    min={0}
                                    max={20}
                                    onValueChange={(v: number[]) => updateAsset(parentPage!.id, asset!.id, { borderWidth: v[0] })}
                                />
                            </div>

                            {(asset.borderWidth || 0) > 0 && (
                                <div className="space-y-2">
                                    <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-1">Stroke Color</label>
                                    <div className="flex gap-2 h-10">
                                        <div className="flex-1 relative rounded-xl overflow-hidden border border-black/5">
                                            <input
                                                type="color"
                                                value={asset.borderColor || '#000000'}
                                                onChange={(e) => updateAsset(parentPage!.id, asset!.id, { borderColor: e.target.value })}
                                                className="absolute inset-0 w-full h-full scale-150 cursor-pointer border-none p-0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>
                )}

                <CollapsibleSection title="Rotation" icon={RotateCw} defaultOpen={false}>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest px-1">Angular Precision</label>
                            <button
                                onClick={() => updateAsset(parentPage!.id, asset!.id, { rotation: 0 })}
                                className="text-[8px] text-catalog-accent hover:underline font-black uppercase tracking-widest"
                            >
                                Reset
                            </button>
                        </div>
                        <div className="flex gap-3 items-center">
                            <div className="flex-1">
                                <Slider
                                    disabled={isLockedForEditing}
                                    value={[asset.rotation || 0]}
                                    min={0}
                                    max={360}
                                    step={1}
                                    onValueChange={(v: number[]) => updateAsset(parentPage!.id, asset!.id, { rotation: v[0] })}
                                />
                            </div>
                            <div className="w-16 relative">
                                <input
                                    type="number"
                                    disabled={isLockedForEditing}
                                    value={Math.round(asset.rotation || 0)}
                                    onChange={(e) => updateAsset(parentPage!.id, asset!.id, { rotation: parseInt(e.target.value) || 0 })}
                                    className="w-full h-8 pl-2 pr-4 bg-white border border-black/5 rounded-lg text-[10px] font-mono font-black focus:ring-2 focus:ring-catalog-accent/5 outline-none disabled:opacity-50"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] font-bold text-catalog-text/20">°</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {[0, 90, 180, 270].map(deg => (
                                <button
                                    key={deg}
                                    disabled={isLockedForEditing}
                                    onClick={() => updateAsset(parentPage!.id, asset!.id, { rotation: deg })}
                                    className={cn(
                                        "py-1.5 text-[9px] font-black border border-black/5 rounded-lg hover:bg-black/5 transition-all font-outfit disabled:opacity-50",
                                        (asset.rotation || 0) === deg && "bg-catalog-accent text-white border-catalog-accent shadow-sm"
                                    )}
                                >
                                    {deg}°
                                </button>
                            ))}
                        </div>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Alignment" icon={Maximize2} defaultOpen={false}>
                    <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-1.5">
                            {['left', 'center', 'right', 'top', 'middle', 'bottom'].map((align) => (
                                <button
                                    key={align}
                                    disabled={isLockedForEditing}
                                    onClick={() => handleAlign(align as any)}
                                    className="p-2 text-[8px] font-black border border-black/5 rounded-lg hover:bg-black/5 uppercase tracking-widest text-catalog-text/50 transition-all hover:border-catalog-accent/30 hover:text-catalog-accent disabled:opacity-50"
                                >
                                    {align}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => handleAlign('fit')}
                            className="w-full py-2.5 bg-catalog-accent/5 border border-catalog-accent/20 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] text-catalog-accent hover:bg-catalog-accent hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                            <Maximize2 className="w-3.5 h-3.5" /> Expand to Canvas
                        </button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection title="Pivot Point" icon={Box} defaultOpen={false}>
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-1">
                            <span className="text-[8px] text-gray-500 uppercase font-bold">X: {Math.round((asset.pivot?.x ?? 0.5) * 100)}%</span>
                            <Slider
                                disabled={isLockedForEditing}
                                value={[(asset.pivot?.x ?? 0.5) * 100]}
                                min={0} max={100}
                                onValueChange={([v]) => updateAsset(parentPage!.id, asset!.id, { pivot: { ...asset.pivot, x: v / 100, y: asset.pivot?.y ?? 0.5 } })}
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <span className="text-[8px] text-gray-500 uppercase font-bold">Y: {Math.round((asset.pivot?.y ?? 0.5) * 100)}%</span>
                            <Slider
                                disabled={isLockedForEditing}
                                value={[(asset.pivot?.y ?? 0.5) * 100]}
                                min={0} max={100}
                                onValueChange={([v]) => updateAsset(parentPage!.id, asset!.id, { pivot: { ...asset.pivot, y: v / 100, x: asset.pivot?.x ?? 0.5 } })}
                            />
                        </div>
                    </div>
                    <button
                        disabled={isLockedForEditing}
                        onClick={() => setEditorMode(editorMode === 'pivot' ? 'select' : 'pivot')}
                        className={cn(
                            "w-full mt-2 p-2 text-[10px] border rounded hover:bg-black/5 flex items-center justify-center gap-2 font-bold transition-all disabled:opacity-50",
                            editorMode === 'pivot' && "bg-catalog-accent text-white border-catalog-accent shadow-sm"
                        )}
                    >
                        <Box className="w-3 h-3" /> {editorMode === 'pivot' ? 'Cancel Pivot Edit' : 'Set Pivot Manually'}
                    </button>
                </CollapsibleSection>

                {(asset.type === 'image' || asset.type === 'video') && (
                    <CollapsibleSection title="Fitting & Framing" icon={Minimize2} defaultOpen={false}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/5 rounded-xl border border-black/5">
                                {[
                                    { id: 'cover', icon: Maximize2, label: 'Fill' },
                                    { id: 'fit', icon: Minimize2, label: 'Fit' },
                                    { id: 'stretch', icon: Box, label: 'Stretch' }
                                ].map((mode) => (
                                    <button
                                        key={mode.id}
                                        onClick={() => updateAsset(parentPage!.id, asset!.id, { fitMode: mode.id as any })}
                                        className={cn(
                                            "py-2 flex flex-col items-center gap-1 rounded-lg transition-all",
                                            (asset.fitMode || 'cover') === mode.id ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/40 hover:text-catalog-text/60"
                                        )}
                                    >
                                        <mode.icon className="w-3.5 h-3.5" />
                                        <span className="text-[7px] font-black uppercase tracking-widest">{mode.label}</span>
                                    </button>
                                ))}
                            </div>

                            <button
                                onClick={() => {
                                    if (asset.aspectRatio) {
                                        updateAsset(parentPage!.id, asset!.id, {
                                            height: asset.width / asset.aspectRatio,
                                            fitMode: 'cover'
                                        });
                                    }
                                }}
                                className="w-full py-2 bg-catalog-accent/5 text-catalog-accent border border-catalog-accent/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all hover:bg-catalog-accent/10"
                            >
                                Restore Original Geometry
                            </button>
                        </div>
                    </CollapsibleSection>
                )}

                {(asset.type === 'image' || asset.type === 'video') && (
                    <CollapsibleSection title="Image Resolution" icon={Sun} defaultOpen={false}>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[8px] font-black text-catalog-text/20 uppercase tracking-widest">Efficiency</label>
                                {asset.originalDimensions && (
                                    <div className={cn(
                                        "px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5",
                                        (Math.round((asset.originalDimensions.width || 0) / (asset.width / 96))) < 150 ? "bg-red-500/10 text-red-600 border border-red-200" : "bg-green-500/10 text-green-600 border border-green-200"
                                    )}>
                                        {Math.round((asset.originalDimensions.width || 0) / (asset.width / 96))} DPI
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {[300, 600].map(dpi => (
                                    <button
                                        key={dpi}
                                        disabled={isLockedForEditing}
                                        onClick={() => applyDpi(dpi)}
                                        className="py-1.5 text-[8px] font-black border border-black/5 rounded-lg hover:bg-black/5 transition-all uppercase tracking-widest text-catalog-text/40"
                                    >
                                        {dpi} DPI
                                    </button>
                                ))}
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {(asset.type === 'image' || asset.type === 'video') && (
                    <CollapsibleSection title="Atmospherics" icon={Sun} defaultOpen={false}>
                        <div className="space-y-4">
                            {[
                                { label: 'Brightness', key: 'brightness' },
                                { label: 'Contrast', key: 'contrast' },
                                { label: 'Saturation', key: 'saturate' },
                                { label: 'Blur', key: 'blur', max: 20 },
                            ].map((adj) => (
                                <div key={adj.key} className="space-y-2">
                                    <div className="flex justify-between text-[8px] font-black text-catalog-text/40 uppercase tracking-widest">
                                        <span>{adj.label}</span>
                                        <span className="text-catalog-accent">{(asset as any)[adj.key] || (adj.key === 'blur' ? 0 : 100)}%</span>
                                    </div>
                                    <Slider
                                        value={[(asset as any)[adj.key] || (adj.key === 'blur' ? 0 : 100)]}
                                        min={0}
                                        max={adj.max || 200}
                                        onValueChange={(v: number[]) => updateAsset(parentPage!.id, asset!.id, { [adj.key]: v[0] })}
                                    />
                                </div>
                            ))}
                        </div>
                    </CollapsibleSection>
                )}

                {(asset.type === 'image' || asset.type === 'video') && (
                    <CollapsibleSection title="Cinematic Filters" icon={Droplets} defaultOpen={false}>
                        <div className="grid grid-cols-4 gap-1">
                            {['none', 'vintage', 'matte', 'noir', 'film', 'vibrant', 'cinematic'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => updateAsset(parentPage!.id, asset!.id, { filter: f })}
                                    className={cn(
                                        "py-1.5 text-[8px] font-black border border-black/5 rounded-md capitalize transition-all",
                                        asset.filter === f ? "bg-catalog-accent text-white border-catalog-accent" : "text-catalog-text/40 hover:bg-black/5"
                                    )}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </CollapsibleSection>
                )}

                <div className="pt-6 border-t border-black/5">
                    <button
                        onClick={handleDelete}
                        className="w-full py-2.5 flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Trash Element
                    </button>
                </div>
            </div>
        </div>
    );
}
