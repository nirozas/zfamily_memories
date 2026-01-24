import React, { useMemo } from 'react';
import { cn } from '../../lib/utils';
import { type Page, type Asset } from '../../contexts/AlbumContext';
import { Image as ImageIcon } from 'lucide-react';

interface LayoutCanvasProps {
    page: Page;
    layoutConfig: any[]; // JSON array from album_layouts
    onDropAsset: (slotIndex: number, asset: Asset) => void;
    aspectRatio?: number;
    className?: string;
}

/**
 * LayoutCanvas (Version 2.0)
 * 
 * The "Proportional Canvas" editor component.
 * Implements percentage-based DropZones for layout-driven design.
 */
export const LayoutCanvas: React.FC<LayoutCanvasProps> = ({
    page,
    layoutConfig,
    onDropAsset,
    aspectRatio = 1 / 1.414, // Default A4 Portrait
    className
}) => {

    // 1. Render Slots/DropZones based on layoutConfig
    const dropZones = useMemo(() => {
        return layoutConfig.map((slot, index) => {
            // Find asset assigned to this slot
            const asset = page.assets.find(a => a.slotId === index);

            return (
                <div
                    key={`dropzone-${index}`}
                    className={cn(
                        "absolute group transition-all duration-300",
                        asset ? "border-transparent" : "border border-dashed border-slate-300 bg-slate-50/50"
                    )}
                    style={{
                        top: `${slot.top}%`,
                        left: `${slot.left}%`,
                        width: `${slot.width}%`,
                        height: `${slot.height}%`,
                        zIndex: slot.z || 1,
                    }}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add('bg-catalog-accent/10', 'border-catalog-accent');
                    }}
                    onDragLeave={(e) => {
                        e.currentTarget.classList.remove('bg-catalog-accent/10', 'border-catalog-accent');
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('bg-catalog-accent/10', 'border-catalog-accent');
                        const assetData = e.dataTransfer.getData('asset');
                        if (assetData) {
                            try {
                                onDropAsset(index, JSON.parse(assetData));
                            } catch (err) {
                                console.error("Drop failed:", err);
                            }
                        }
                    }}
                >
                    {asset ? (
                        <div className="w-full h-full relative overflow-hidden">
                            {asset.type === 'image' && (
                                <img
                                    src={asset.url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            )}
                            {asset.type === 'video' && (
                                <video
                                    src={asset.url}
                                    className="w-full h-full object-cover"
                                    muted
                                />
                            )}
                            {/* Overlay to allow dragging over filled slots */}
                            <div className="absolute inset-0 bg-transparent group-hover:bg-black/5 transition-colors pointer-events-none" />
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 opacity-20 group-hover:opacity-40 transition-opacity">
                            <ImageIcon className="w-5 h-5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Slot {index + 1}</span>
                        </div>
                    )}
                </div>
            );
        });
    }, [layoutConfig, page.assets, onDropAsset]);

    return (
        <div
            className={cn(
                "relative bg-white shadow-xl overflow-hidden",
                className
            )}
            style={{
                width: '100%',
                aspectRatio: `${aspectRatio}`,
            }}
        >
            {/* Margins/Print Bleed Guide (3% to 97%) */}
            <div className="absolute inset-x-[3%] inset-y-[3%] pointer-events-none border border-dashed border-red-500/10 z-50" />

            <div className="w-full h-full relative z-10">
                {dropZones}
            </div>

            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[url('https://www.transparenttextures.com/patterns/paper.png')] mix-blend-multiply z-20" />
        </div>
    );
};
