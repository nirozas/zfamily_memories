import React, { useState, memo, useEffect, useRef } from 'react';
import { useAlbum, type Page, type Asset } from '../../contexts/AlbumContext';
import { cn } from '../../lib/utils';
import { motion } from 'framer-motion';
import { RotateCw, Lock, Plus, Grid } from 'lucide-react';
import { ContextMenu } from './ContextMenu';
import { getFilterStyle, getClipPathStyle } from '../../lib/assetUtils';
import { FocalPointEditorModal } from './FocalPointEditorModal';
import { RichTextEditor } from './RichTextEditor';
import { MediaRenderer } from '../shared/MediaRenderer';

interface EditorCanvasProps {
    page: Page;
    nextPage?: Page;
    side?: 'left' | 'right' | 'single';
    editorMode: 'select' | 'mask' | 'pivot' | 'studio';
    setEditorMode: (mode: 'select' | 'mask' | 'pivot' | 'studio') => void;
    showPrintSafe?: boolean;
    zoom: number;
    onPageSelect?: (pageId: string) => void;
    onOpenMapEditor?: (assetId: string) => void;
    onOpenLocationEditor?: (assetId: string) => void;
    onOpenProEditor?: (assetId: string) => void;
}

interface AssetRendererProps {
    asset: Asset;
    isSelected: boolean;
    isEditing?: boolean;
    onClick: (e: React.MouseEvent) => void;
    onDoubleClick?: () => void;
    onUpdateText?: (id: string, content: string) => void;
    onEditEnd?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    editorMode: 'select' | 'mask' | 'pivot' | 'studio';
    setEditorMode: (mode: 'select' | 'mask' | 'pivot' | 'studio') => void;
    zoom: number;
    onSnap?: (rect: { x: number, y: number, w: number, h: number }) => { snappedX: number, snappedY: number };
    onSnapEnd?: () => void;
    pageId: string;
    side?: 'left' | 'right' | 'single';
    canvasRef: React.RefObject<HTMLDivElement | null>;
    otherPage?: Page;
    onDrop?: (e: React.DragEvent) => void;
    isInSlot?: boolean;
    onOpenMapEditor?: (assetId: string) => void;
    onOpenLocationEditor?: (assetId: string) => void;
    onOpenProEditor?: (assetId: string) => void;
}

const AssetRenderer = memo(function AssetRenderer({
    asset, isSelected, isEditing, onClick, onDoubleClick, onEditEnd,
    onContextMenu, pageId, side = 'single', editorMode, setEditorMode,
    zoom, canvasRef, onDrop, onOpenMapEditor, onOpenLocationEditor, onOpenProEditor, isInSlot
}: AssetRendererProps) {
    const { updateAsset, album, commitHistory } = useAlbum();
    const [textValue, setTextValue] = useState(asset.content || '');
    const [dragPos, setDragPos] = useState<{ x: number, y: number } | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        if (!isEditing) {
            setTextValue(asset.content || '');
        }
    }, [asset.content, isEditing]);

    // Positioning Logic
    const canvasRefWidth = side === 'single' ? 100 : 200;
    const renderX = (side === 'right' ? asset.x + 100 : asset.x);
    const leftPercent = isInSlot ? asset.x : (renderX / canvasRefWidth) * 100;
    const topPercent = isInSlot ? asset.y : asset.y;
    const widthPercent = isInSlot ? asset.width : (asset.width / (side === 'single' ? 100 : 200)) * 100;
    const heightPercent = isInSlot ? asset.height : asset.height;

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !album) return;

        setIsUploading(true);
        try {
            const { storageService } = await import('../../services/storage');
            const { url, error } = await storageService.uploadFile(
                file,
                'album-assets',
                `albums/${album.title}/placeholders/`,
                () => { }
            );

            if (url) {
                updateAsset(pageId, asset.id, {
                    url,
                    isPlaceholder: false,
                    fitMode: 'cover'
                });
            } else {
                console.error('Upload failed', error);
            }
        } catch (err) {
            console.error('Error handling file selection', err);
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="relative contents">
            {dragPos && (
                <div
                    className="fixed z-[9999] pointer-events-none bg-catalog-accent text-white text-[10px] px-2 py-1 rounded shadow-lg font-bold flex flex-col items-center"
                    style={{ left: dragPos.x + 20, top: dragPos.y + 20 }}
                >
                    <div className="flex gap-2">
                        <span>X: {Math.round(asset.x)}%</span>
                        <span>Y: {Math.round(asset.y)}%</span>
                    </div>
                </div>
            )}
            <motion.div
                onDrop={(e) => { setIsDragOver(false); onDrop?.(e); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onPointerDown={(e) => {
                    if (asset.isLocked || album?.config?.isLocked) return;
                    if (e.button !== 0) return;

                    const target = e.currentTarget as HTMLElement;
                    const rect = target.getBoundingClientRect();
                    const startOffset = {
                        x: e.clientX - rect.left,
                        y: e.clientY - rect.top
                    };

                    const canvasRect = canvasRef.current?.getBoundingClientRect();
                    if (!canvasRect) return;

                    const zoomFactor = zoom || 1;

                    const handlePointerMove = (mv: PointerEvent) => {
                        requestAnimationFrame(() => {
                            const newX_px = (mv.clientX - canvasRect.left - startOffset.x) / zoomFactor;
                            const newY_px = (mv.clientY - canvasRect.top - startOffset.y) / zoomFactor;

                            const totalWidth_px = (side === 'single' ? canvasRect.width : canvasRect.width / 2) / zoomFactor;
                            const totalHeight_px = canvasRect.height / zoomFactor;

                            let nx = (newX_px / totalWidth_px) * 100;
                            let ny = (newY_px / totalHeight_px) * 100;

                            if (side === 'right') nx -= 100;

                            nx = Math.max(0, Math.min(100 - asset.width, nx));
                            ny = Math.max(0, Math.min(100 - asset.height, ny));

                            updateAsset(pageId, asset.id, { x: nx, y: ny }, { skipHistory: true });
                            setDragPos({ x: mv.clientX, y: mv.clientY });
                        });
                    };

                    const handlePointerUp = () => {
                        commitHistory();
                        setDragPos(null);
                        window.removeEventListener('pointermove', handlePointerMove);
                        window.removeEventListener('pointerup', handlePointerUp);
                    };

                    window.addEventListener('pointermove', handlePointerMove);
                    window.addEventListener('pointerup', handlePointerUp);
                }}
                animate={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    width: `${widthPercent}%`,
                    height: `${heightPercent}%`,
                    rotate: asset.rotation || 0,
                    scaleX: asset.flipX ? -1 : 1,
                    scaleY: asset.flipY ? -1 : 1,
                    opacity: (asset.opacity ?? 100) / 100,
                    zIndex: asset.zIndex || 0,
                }}
                transition={{ type: "tween", duration: 0.1 }}
                onClick={onClick}
                onDoubleClick={onDoubleClick}
                onContextMenu={onContextMenu}
                className={cn(
                    "absolute cursor-move group/asset",
                    !isSelected && !asset.isHidden && "hover:ring-1 hover:ring-catalog-accent/30",
                    isDragOver && !asset.isPlaceholder && "ring-2 ring-catalog-accent shadow-xl scale-[1.02] z-[100]",
                    asset.isHidden && "opacity-0 pointer-events-none",
                    isSelected && "z-50",
                    asset.isLocked && "cursor-default"
                )}
                style={{
                    ...getFilterStyle(asset),
                    transformOrigin: '0 0',
                }}
            >
                {/* Pivot Control Widget */}
                {isSelected && editorMode === 'pivot' && !album?.config?.isLocked && !asset.isLocked && (
                    <div
                        className="absolute z-[70] w-6 h-6 -ml-3 -mt-3 flex items-center justify-center cursor-move group/pivot"
                        style={{
                            left: `${(asset.pivot?.x ?? 0.5) * 100}%`,
                            top: `${(asset.pivot?.y ?? 0.5) * 100}%`
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget.closest('.group\\/asset') as HTMLElement).getBoundingClientRect();
                            const handleMouseMove = (mv: MouseEvent) => {
                                let x = (mv.clientX - rect.left) / rect.width;
                                let y = (mv.clientY - rect.top) / rect.height;
                                const snaps = [0, 0.5, 1];
                                snaps.forEach(s => {
                                    if (Math.abs(x - s) < 0.05) x = s;
                                    if (Math.abs(y - s) < 0.05) y = s;
                                });
                                updateAsset(pageId, asset.id, { pivot: { x, y } }, { skipHistory: true });
                            };
                            const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                            window.addEventListener('mousemove', handleMouseMove);
                            window.addEventListener('mouseup', handleMouseUp);
                        }}
                    >
                        <div className="w-4 h-4 rounded-full border-2 border-white bg-catalog-accent shadow-lg flex items-center justify-center">
                            <div className="w-1 h-1 bg-white rounded-full" />
                        </div>
                    </div>
                )}

                {/* Mask Points Editor */}
                {isSelected && editorMode === 'mask' && asset.type === 'image' && !album?.config?.isLocked && !asset.isLocked && (
                    <div className="absolute inset-0 z-[70] pointer-events-none">
                        <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                            {asset.clipPoints && (
                                <path
                                    d={`M ${asset.clipPoints[0].x * 100} ${asset.clipPoints[0].y * 100} ` +
                                        asset.clipPoints.slice(1).map(p => `L ${p.x * 100} ${p.y * 100}`).join(' ') + ' Z'}
                                    fill="rgba(0,180,255,0.1)" stroke="var(--catalog-accent)" strokeWidth="0.5" strokeDasharray="1 0.5" vectorEffect="non-scaling-stroke"
                                />
                            )}
                        </svg>
                        {(asset.clipPoints || []).map((p, i) => (
                            <div
                                key={i}
                                className="absolute w-3 h-3 -ml-1.5 -mt-1.5 bg-white border-2 border-catalog-accent rounded-full shadow-md cursor-move pointer-events-auto hover:scale-125 transition-transform z-[71]"
                                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.currentTarget.closest('.group\\/asset') as HTMLElement).getBoundingClientRect();
                                    const handleMouseMove = (mv: MouseEvent) => {
                                        const newPoints = [...(asset.clipPoints || [])];
                                        let nx = (mv.clientX - rect.left) / rect.width;
                                        let ny = (mv.clientY - rect.top) / rect.height;
                                        if (Math.abs(nx) < 0.02) nx = 0; if (Math.abs(nx - 1) < 0.02) nx = 1;
                                        if (Math.abs(ny) < 0.02) ny = 0; if (Math.abs(ny - 1) < 0.02) ny = 1;
                                        newPoints[i] = { ...newPoints[i], x: nx, y: ny };
                                        updateAsset(pageId, asset.id, { clipPoints: newPoints }, { skipHistory: true });
                                    };
                                    const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                    window.addEventListener('mousemove', handleMouseMove);
                                    window.addEventListener('mouseup', handleMouseUp);
                                }}
                            />
                        ))}
                    </div>
                )}

                {/* --- CONSOLIDATED CONTROLS --- */}
                {isSelected && (
                    <>
                        {asset.isLocked && (
                            <div
                                className="absolute -top-3 -right-3 bg-orange-600 text-white p-1 rounded-full shadow-lg z-[110] pointer-events-auto cursor-pointer border-2 border-white"
                                title="Locked - Click to Unlock"
                                onClick={(e) => { e.stopPropagation(); updateAsset(pageId, asset.id, { isLocked: false }); }}
                            >
                                <Lock className="w-3 h-3" />
                            </div>
                        )}
                        {!asset.isLocked && !album?.config?.isLocked && (
                            <>
                                <div className="absolute inset-0 border-2 border-catalog-accent z-[99] pointer-events-none rounded-sm" style={{ boxShadow: '0 0 0 1px rgba(194, 65, 12, 0.1), 0 0 8px rgba(194, 65, 12, 0.3)' }} />
                                <div
                                    className="absolute -top-12 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-catalog-accent rounded-full flex items-center justify-center cursor-alias shadow-lg hover:scale-110 transition-transform z-[101] pointer-events-auto"
                                    style={{ transform: `translate(-50%, 0) scale(${1 / zoom})` }}
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        if (!canvasRef.current) return;
                                        const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                                        const centerX = rect.left + rect.width / 2;
                                        const centerY = rect.top + rect.height / 2;
                                        const handleMouseMove = (mv: MouseEvent) => {
                                            const angle = Math.atan2(mv.clientY - centerY, mv.clientX - centerX) * (180 / Math.PI) + 90;
                                            const finalAngle = mv.shiftKey ? Math.round(angle / 15) * 15 : angle;
                                            updateAsset(pageId, asset.id, { rotation: finalAngle }, { skipHistory: true });
                                        };
                                        const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                        window.addEventListener('mousemove', handleMouseMove);
                                        window.addEventListener('mouseup', handleMouseUp);
                                    }}
                                >
                                    <RotateCw className="w-4 h-4 text-catalog-accent" />
                                </div>

                                {['nw', 'ne', 'sw', 'se'].map((handle) => (
                                    <div
                                        key={`corner-${handle}`}
                                        className={cn("absolute w-4 h-4 bg-white border-2 border-catalog-accent rounded-full z-[101] pointer-events-auto shadow-md hover:scale-125 transition-transform", handle === 'nw' && "cursor-nw-resize", handle === 'ne' && "cursor-ne-resize", handle === 'sw' && "cursor-sw-resize", handle === 'se' && "cursor-se-resize")}
                                        style={{ top: handle.includes('n') ? 0 : '100%', left: handle.includes('w') ? 0 : '100%', transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const startW = asset.width;
                                            const startH = asset.height;
                                            const startPosX = asset.x;
                                            const startPosY = asset.y;
                                            if (!canvasRef.current) return;
                                            const rect = canvasRef.current.getBoundingClientRect();
                                            const pageW_px = (side === 'single') ? rect.width : (rect.width / 2);
                                            const pageH_px = rect.height;
                                            const handleMouseMove = (mv: MouseEvent) => {
                                                const dMx = mv.clientX - startX;
                                                const dMy = mv.clientY - startY;
                                                const dPctX = (dMx / pageW_px) * 100;
                                                const dPctY = (dMy / pageH_px) * 100;
                                                let newW = Math.max(5, startW + (handle.includes('e') ? dPctX : -dPctX));
                                                let newH = Math.max(5, startH + (handle.includes('s') ? dPctY : -dPctY));
                                                let newX = startPosX + (handle.includes('w') ? dPctX : 0);
                                                let newY = startPosY + (handle.includes('n') ? dPctY : 0);
                                                if (asset.lockAspectRatio) {
                                                    const ratio = asset.aspectRatio || (startW / startH);
                                                    newH = newW / ratio;
                                                    if (handle.includes('n')) newY = startPosY + (startH - newH);
                                                }
                                                newX = Math.max(0, Math.min(100, newX));
                                                newY = Math.max(0, Math.min(100, newY));
                                                newW = Math.max(5, Math.min(100 - newX, newW));
                                                newH = Math.max(5, Math.min(100 - newY, newH));
                                                updateAsset(pageId, asset.id, { width: newW, height: newH, x: newX, y: newY }, { skipHistory: true });
                                            };
                                            const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                            window.addEventListener('mousemove', handleMouseMove);
                                            window.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    />
                                ))}

                                {['n', 's', 'e', 'w'].map((handleSide) => (
                                    <div
                                        key={`side-${handleSide}`}
                                        className={cn("absolute bg-white border-2 border-catalog-accent z-[100] pointer-events-auto shadow-sm hover:scale-110 transition-transform rounded-full", (handleSide === 'n' || handleSide === 's') ? "h-1.5 w-6" : "w-1.5 h-6", handleSide === 'n' && "cursor-n-resize", handleSide === 's' && "cursor-s-resize", handleSide === 'e' && "cursor-e-resize", handleSide === 'w' && "cursor-w-resize")}
                                        style={{ top: handleSide === 'n' ? 0 : handleSide === 's' ? '100%' : '50%', left: handleSide === 'w' ? 0 : handleSide === 'e' ? '100%' : '50%', transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            const startX = e.clientX;
                                            const startY = e.clientY;
                                            const startW = asset.width;
                                            const startH = asset.height;
                                            const startPosX = asset.x;
                                            const startPosY = asset.y;
                                            if (!canvasRef.current) return;
                                            const rect = canvasRef.current.getBoundingClientRect();
                                            const pageW_px = (side === 'single') ? rect.width : (rect.width / 2);
                                            const pageH_px = rect.height;
                                            const handleMouseMove = (mv: MouseEvent) => {
                                                const dMx = mv.clientX - startX;
                                                const dMy = mv.clientY - startY;
                                                const dPctX = (dMx / pageW_px) * 100;
                                                const dPctY = (dMy / pageH_px) * 100;
                                                let newW = startW; let newH = startH; let newX = startPosX; let newY = startPosY;

                                                if (handleSide === 'e') newW = Math.max(5, startW + dPctX);
                                                if (handleSide === 'w') { newW = Math.max(5, startW - dPctX); newX = startPosX + dPctX; }
                                                if (handleSide === 's') newH = Math.max(5, startH + dPctY);
                                                if (handleSide === 'n') { newH = Math.max(5, startH - dPctY); newY = startPosY + dPctY; }

                                                updateAsset(pageId, asset.id, { width: newW, height: newH, x: newX, y: newY, fitMode: 'stretch', crop: undefined, lockAspectRatio: false }, { skipHistory: true });
                                            };
                                            const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                            window.addEventListener('mousemove', handleMouseMove);
                                            window.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}

                <div className="w-full h-full relative overflow-hidden pointer-events-auto" style={{ borderRadius: `${asset.borderRadius || 0}px`, border: asset.borderWidth ? `${asset.borderWidth}px solid ${asset.borderColor || '#000'}` : 'none', ...getClipPathStyle(asset) }}>
                    {asset.isPlaceholder ? (
                        <div className={cn("w-full h-full flex flex-col items-center justify-center p-4 text-center transition-all duration-200 group/placeholder", isDragOver ? "bg-catalog-accent/10 border-2 border-dashed border-catalog-accent scale-105 shadow-md" : "bg-slate-100 border-2 border-dashed border-slate-300 hover:border-catalog-accent hover:bg-slate-50")}>
                            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileSelect} />
                            {isUploading ? (
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-catalog-accent mb-2"></div>
                            ) : (
                                <>
                                    <button className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-catalog-accent hover:border-catalog-accent transition-all mb-2 transform group-hover/placeholder:scale-110 pointer-events-auto" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                                        <Plus className="w-5 h-5" />
                                    </button>
                                    <span className={cn("text-[9px] uppercase font-bold tracking-widest transition-colors", isDragOver ? "text-catalog-accent" : "text-slate-400")}>Drop or Click</span>
                                </>
                            )}
                        </div>
                    ) : asset.type === 'text' ? (
                        <div className="w-full h-full">
                            {isEditing ? (
                                <RichTextEditor
                                    content={textValue}
                                    onChange={(val) => setTextValue(val)}
                                    autoFocus
                                    onOpenProEditor={() => onOpenProEditor?.(asset.id)}
                                    onBlur={() => {
                                        if (textValue !== asset.content) {
                                            updateAsset(pageId, asset.id, { content: textValue });
                                        }
                                        onEditEnd?.();
                                    }}
                                    style={{
                                        fontFamily: asset.fontFamily || 'Inter, sans-serif',
                                        fontSize: asset.fontSize || Math.min(asset.width / 5, asset.height / 2),
                                        fontWeight: asset.fontWeight || 'normal',
                                        color: asset.textColor || 'inherit',
                                        textAlign: asset.textAlign || 'center',
                                        lineHeight: asset.lineHeight || 1.2,
                                        letterSpacing: (asset.letterSpacing || 0) + 'px',
                                        backgroundColor: asset.textBackgroundColor || 'transparent',
                                        textShadow: asset.textShadow || 'none'
                                    }}
                                />
                            ) : (
                                <MediaRenderer
                                    type="text"
                                    content={asset.content}
                                    config={asset}
                                    isEditable={true}
                                />
                            )}
                        </div>
                    ) : (
                        <MediaRenderer
                            type={asset.type as any}
                            url={asset.url}
                            content={asset.content}
                            zoom={asset.crop?.zoom}
                            focalX={asset.crop?.x}
                            focalY={asset.crop?.y}
                            rotation={asset.rotation}
                            config={asset}
                            isEditable={true}
                        />
                    )}
                </div>

            </motion.div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.asset === next.asset &&
        prev.isSelected === next.isSelected &&
        prev.isEditing === next.isEditing &&
        prev.editorMode === next.editorMode &&
        prev.zoom === next.zoom &&
        prev.side === next.side &&
        prev.pageId === next.pageId
    );
});

export const EditorCanvas = memo(function EditorCanvas({
    page, nextPage, side = 'single', editorMode, setEditorMode,
    showPrintSafe = true, zoom, onPageSelect, onOpenMapEditor, onOpenLocationEditor, onOpenProEditor
}: EditorCanvasProps) {
    const {
        album, selectedAssetId, setSelectedAssetId, updateAsset,
        removeAsset, duplicateAsset, updateAssetZIndex, addAsset, showLayoutOutlines,
        activeSlot, setActiveSlot
    } = useAlbum();

    const canvasRef = useRef<HTMLDivElement>(null);
    const [dragOverSlot, setDragOverSlot] = useState<{ pageId: string, index: number } | null>(null);

    const getSizeStyles = () => {
        const { width, height } = album?.config?.dimensions || { width: 1000, height: 700 };
        const totalWidth = nextPage ? width * 2 : width;
        const aspectRatio = totalWidth / height;
        return { width: `${totalWidth}px`, aspectRatio: `${aspectRatio}`, backgroundColor: page.backgroundColor };
    };

    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, assetId?: string, pageId?: string } | null>(null);
    const [guides, setGuides] = useState<{ type: 'v' | 'h', pos: number }[]>([]);
    const [focalEditorAsset, setFocalEditorAsset] = useState<{ asset: Asset; pageId: string } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, assetId?: string, assetPageId?: string) => {
        if (album?.config.isLocked) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, assetId, pageId: assetPageId });
        if (assetId) setSelectedAssetId(assetId);
    };

    const handleContextAction = (action: string) => {
        if (!contextMenu?.assetId) return;
        const assetId = contextMenu.assetId;
        const targetPageId = contextMenu.pageId || page.id;
        switch (action) {
            case 'duplicate': duplicateAsset(targetPageId, assetId); break;
            case 'delete': removeAsset(targetPageId, assetId); break;
            case 'front': updateAssetZIndex(targetPageId, assetId, 'front'); break;
            case 'back': updateAssetZIndex(targetPageId, assetId, 'back'); break;
        }
    };

    const findSnappingPoints = React.useCallback((draggingRect: { x: number, y: number, w: number, h: number }) => {
        const snapThreshold = 1.0;
        const newGuides: { type: 'v' | 'h', pos: number }[] = [];
        let snappedX = Math.round(draggingRect.x);
        let snappedY = Math.round(draggingRect.y);
        const colWidth = 100 / 12;
        const totalCols = nextPage ? 24 : 12;
        for (let i = 0; i <= totalCols; i++) {
            const colPos = i * colWidth;
            if (Math.abs(snappedX - colPos) < snapThreshold) { snappedX = colPos; newGuides.push({ type: 'v', pos: colPos }); }
            if (Math.abs(snappedX + draggingRect.w - colPos) < snapThreshold) { snappedX = colPos - draggingRect.w; newGuides.push({ type: 'v', pos: colPos }); }
        }
        return { snappedX, snappedY, guides: newGuides };
    }, [nextPage]);

    const handleAssetClick = React.useCallback((assetId: string, pageId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedAssetId(assetId);
        if (onPageSelect) onPageSelect(pageId);
    }, [onPageSelect, setSelectedAssetId]);

    const handleCanvasClick = React.useCallback((e: React.MouseEvent) => {
        setSelectedAssetId(null);
        setEditingAssetId(null);
        if (nextPage && onPageSelect) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x > rect.width / 2) onPageSelect(nextPage.id);
            else onPageSelect(page.id);
        } else if (onPageSelect) onPageSelect(page.id);
    }, [nextPage, onPageSelect, page.id, setSelectedAssetId]);

    const handleTextUpdate = React.useCallback((assetId: string, newContent: string) => {
        updateAsset(page.id, assetId, { content: newContent });
    }, [page.id, updateAsset]);

    const handleSnap = React.useCallback((rect: { x: number, y: number, w: number, h: number }) => {
        const result = findSnappingPoints(rect);
        if (result.guides.length !== guides.length || (result.guides.length > 0 && (result.guides[0].pos !== guides[0]?.pos || result.guides[0].type !== guides[0]?.type))) {
            setGuides(result.guides);
        }
        return result;
    }, [findSnappingPoints, guides]);

    const handleSnapEnd = React.useCallback(() => { setGuides([]); }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (album?.config.isLocked) return;
        const assetData = e.dataTransfer.getData('asset');
        if (!assetData) return;
        try {
            const data = JSON.parse(assetData);
            const rect = e.currentTarget.getBoundingClientRect();
            const zoomFactor = zoom || 1;
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const dropX_Pct = (clickX / (rect.width / zoomFactor)) * (nextPage ? 200 : 100);
            const dropY_Pct = (clickY / (rect.height / zoomFactor)) * 100;
            let targetPageId = page.id;
            let localX = dropX_Pct;
            if (nextPage && dropX_Pct > 100) { targetPageId = nextPage.id; localX = dropX_Pct - 100; }
            const targetPageObj = targetPageId === page.id ? page : nextPage;
            if (targetPageObj) {
                const hitAsset = targetPageObj.assets.filter(a => a.isPlaceholder).sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)).find(a => localX >= a.x && localX <= (a.x + a.width) && dropY_Pct >= a.y && dropY_Pct <= (a.y + a.height));
                if (hitAsset && (data.type === 'image' || data.type === 'video' || !data.type)) {
                    updateAsset(targetPageId, hitAsset.id, { url: data.url, type: data.type || 'image', isPlaceholder: false, fitMode: 'cover' });
                    return;
                }
            }
            const addWithProportions = (assetType: string, url: string, natW: number, natH: number, category?: string) => {
                const ratio = natW / natH;
                const albumW = album?.config?.dimensions?.width || 1000;
                const albumH = album?.config?.dimensions?.height || 700;
                const isBackground = category === 'backgrounds' || data.category === 'backgrounds';
                const isFrame = assetType === 'frame' || category === 'frames' || data.category === 'frames';
                let w = (isBackground || isFrame) ? 100 : (natW / albumW) * 100;
                let h = (isBackground || isFrame) ? 100 : (natH / albumH) * 100;
                const maxUnit = 60;
                if (!isBackground && !isFrame && (w > maxUnit || h > maxUnit)) {
                    const scale = Math.min(maxUnit / w, maxUnit / h);
                    w *= scale; h *= scale;
                }
                if (!isBackground && !isFrame) h = w / ratio;
                addAsset(targetPageId, { type: isFrame ? 'frame' : (assetType as any), url: url, x: (isBackground || isFrame) ? 0 : Math.max(0, Math.min(100 - w, localX - (w / 2))), y: (isBackground || isFrame) ? 0 : Math.max(0, Math.min(100 - h, dropY_Pct - (h / 2))), width: w, height: h, originalDimensions: { width: natW, height: natH }, rotation: 0, zIndex: isFrame ? 50 : (isBackground ? 0 : (targetPageObj?.assets.length || 0) + 10), aspectRatio: ratio, fitMode: isBackground ? 'cover' : 'fit', lockAspectRatio: true, category: category || data.category } as any);
            };
            if (data.type === 'video') {
                const video = document.createElement('video'); video.src = data.url;
                video.onloadedmetadata = () => addWithProportions('video', data.url, video.videoWidth || 1280, video.videoHeight || 720);
                video.onerror = () => addWithProportions('video', data.url, 1280, 720);
            } else {
                const img = new Image(); img.src = data.url;
                img.onload = () => addWithProportions(data.type || 'image', data.url, img.naturalWidth, img.naturalHeight);
                img.onerror = () => addWithProportions(data.type || 'image', data.url, 800, 600);
            }
        } catch (err) { console.error('Asset drop failed', err); }
    };

    const handleAssetDrop = (assetId: string, pageId: string, e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (album?.config.isLocked) return;
        const assetData = e.dataTransfer.getData('asset');
        if (!assetData) {
            console.warn("[EditorCanvas] Drop failed: No asset data in DataTransfer");
            return;
        }

        try {
            const data = JSON.parse(assetData);
            if (data.type === 'image' || !data.type) {
                if (assetId.startsWith('slot-')) {
                    const slotIndex = parseInt(assetId.replace('slot-', ''));
                    addAsset(pageId, {
                        type: 'image',
                        url: data.url,
                        x: 0, y: 0, width: 100, height: 100,
                        zIndex: 10,
                        rotation: 0,
                        slotId: slotIndex,
                        isPlaceholder: false,
                        fitMode: 'cover'
                    });
                } else {
                    updateAsset(pageId, assetId, {
                        url: data.url,
                        isPlaceholder: false,
                        fitMode: 'cover'
                    });
                }
            }
        } catch (err) {
            console.error('[EditorCanvas] Injection failed:', err);
        }
    };

    const renderPageAssets = (targetPage: Page, targetSide: 'left' | 'right' | 'single') => {
        const layoutCfg = targetPage.layoutConfig;
        if (targetPage.layoutTemplate !== 'freeform' && layoutCfg && layoutCfg.length > 0) {
            return (
                <>
                    {layoutCfg.map((slot: any, index: number) => {
                        const asset = targetPage.assets.find(a => a.slotId === index);
                        const isDragOverThis = dragOverSlot?.pageId === targetPage.id && dragOverSlot?.index === index;
                        return (
                            <div
                                key={`slot-${targetPage.id}-${index}`}
                                className={cn("absolute group transition-all duration-300", !showLayoutOutlines && !isDragOverThis && "border-transparent", showLayoutOutlines && (asset ? "border-[0.5px] border-black/10" : "border-2 border-dashed border-[#4A90E2] bg-[#4A90E2]/5"), isDragOverThis && "border-[3px] border-solid border-[#007bff] shadow-[0_0_15px_rgba(0,123,255,0.6)] z-[60] bg-[#007bff]/5")}
                                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlot({ pageId: targetPage.id, index }); }}
                                onDragLeave={() => setDragOverSlot(null)}
                                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverSlot(null); handleAssetDrop(asset?.id || `slot-${index}`, targetPage.id, e); }}
                                style={{ top: `${slot.top}%`, left: `${targetSide === 'right' ? slot.left + 100 : slot.left}%`, width: `${(nextPage && !targetPage.isSpreadLayout) ? slot.width / 2 : slot.width}%`, height: `${slot.height}%`, zIndex: isDragOverThis ? 60 : (slot.z || 1) }}
                            >
                                {asset ? (
                                    <AssetRenderer
                                        asset={asset} pageId={targetPage.id} side={targetSide} isSelected={selectedAssetId === asset.id} isEditing={editingAssetId === asset.id}
                                        onClick={(e) => handleAssetClick(asset.id, targetPage.id, e)}
                                        onDoubleClick={() => setFocalEditorAsset({ asset, pageId: targetPage.id })}
                                        onUpdateText={handleTextUpdate} onEditEnd={() => setEditingAssetId(null)} onContextMenu={(e) => handleContextMenu(e, asset.id, targetPage.id)} onSnap={handleSnap} onSnapEnd={handleSnapEnd} zoom={zoom} editorMode={editorMode} setEditorMode={setEditorMode} canvasRef={canvasRef} otherPage={targetSide === 'left' ? nextPage : page} onDrop={(e) => handleAssetDrop(asset.id, targetPage.id, e)} onOpenMapEditor={onOpenMapEditor} onOpenLocationEditor={onOpenLocationEditor} isInSlot={true}
                                    />
                                ) : (
                                    <div
                                        className={cn(
                                            "w-full h-full flex flex-col items-center justify-center gap-1 transition-all cursor-pointer group/slot",
                                            (activeSlot?.pageId === targetPage.id && activeSlot?.index === index)
                                                ? "bg-catalog-accent/20 opacity-100 ring-4 ring-catalog-accent/30 text-catalog-accent"
                                                : "opacity-20 hover:opacity-60 bg-slate-50 shadow-inner"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveSlot({ pageId: targetPage.id, index });
                                        }}
                                    >
                                        <div className="w-12 h-12 rounded-full border-2 border-dashed border-catalog-accent/30 flex items-center justify-center group-hover/slot:scale-110 transition-transform">
                                            <Plus className="w-6 h-6" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Fill Slot</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {targetPage.assets.filter(a => a.slotId === undefined).map((asset: Asset) => (
                        <AssetRenderer
                            key={asset.id} asset={asset} pageId={targetPage.id} side={targetSide} isSelected={selectedAssetId === asset.id} isEditing={editingAssetId === asset.id}
                            onClick={(e) => handleAssetClick(asset.id, targetPage.id, e)}
                            onDoubleClick={() => {
                                if (asset.type === 'text') setEditingAssetId(asset.id);
                                else if (asset.type === 'map') onOpenMapEditor?.(asset.id);
                                else if (asset.type === 'location') onOpenLocationEditor?.(asset.id);
                                else if (asset.type === 'image' || asset.type === 'frame') setFocalEditorAsset({ asset, pageId: targetPage.id });
                            }}
                            onUpdateText={handleTextUpdate} onEditEnd={() => setEditingAssetId(null)} onContextMenu={(e) => handleContextMenu(e, asset.id, targetPage.id)} onSnap={handleSnap} onSnapEnd={handleSnapEnd} zoom={zoom} editorMode={editorMode} setEditorMode={setEditorMode} canvasRef={canvasRef} otherPage={targetSide === 'left' ? nextPage : page} onDrop={(e) => handleAssetDrop(asset.id, targetPage.id, e)} onOpenMapEditor={onOpenMapEditor} onOpenLocationEditor={onOpenLocationEditor}
                        />
                    ))}
                </>
            );
        }
        return [...targetPage.assets].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0)).map((asset: Asset) => (
            <AssetRenderer
                key={asset.id} asset={asset} pageId={targetPage.id} side={targetSide} isSelected={selectedAssetId === asset.id} isEditing={editingAssetId === asset.id}
                onClick={(e) => handleAssetClick(asset.id, targetPage.id, e)}
                onDoubleClick={() => {
                    if (asset.type === 'text') setEditingAssetId(asset.id);
                    else if (asset.type === 'map') onOpenMapEditor?.(asset.id);
                    else if (asset.type === 'location') onOpenLocationEditor?.(asset.id);
                    else if (asset.type === 'image' || asset.type === 'frame') setFocalEditorAsset({ asset, pageId: targetPage.id });
                }}
                onUpdateText={handleTextUpdate} onEditEnd={() => setEditingAssetId(null)} onContextMenu={(e) => handleContextMenu(e, asset.id, targetPage.id)} onSnap={handleSnap} onSnapEnd={handleSnapEnd} zoom={zoom} editorMode={editorMode} setEditorMode={setEditorMode} canvasRef={canvasRef} otherPage={targetSide === 'left' ? nextPage : page} onDrop={(e) => handleAssetDrop(asset.id, targetPage.id, e)} onOpenMapEditor={onOpenMapEditor} onOpenLocationEditor={onOpenLocationEditor}
            />
        ));
    };

    return (
        <div onMouseDown={handleCanvasClick} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="relative transition-all duration-300 select-none editor-canvas" data-page-id={page.id} data-side={side} style={getSizeStyles()} ref={canvasRef}>
            {page.backgroundImage && (
                <img src={page.backgroundImage} alt="" className={cn("absolute top-0 bottom-0 object-cover pointer-events-none z-0", nextPage ? "left-0 w-1/2" : "inset-0 w-full h-full")} style={{ opacity: page.backgroundOpacity ?? 1 }} />
            )}
            {nextPage && nextPage.backgroundImage && (
                <img src={nextPage.backgroundImage} alt="" className="absolute top-0 bottom-0 left-1/2 w-1/2 object-cover pointer-events-none z-0" style={{ opacity: nextPage.backgroundOpacity ?? 1 }} />
            )}
            {album?.config?.gridSettings?.visible && (
                <div className="absolute inset-0 pointer-events-none z-0 flex px-0">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="flex-1 border-r border-catalog-accent/5 h-full last:border-r-0" />
                    ))}
                </div>
            )}
            {showPrintSafe && (
                <div className="absolute inset-0 pointer-events-none z-50">
                    <div className="absolute inset-0 bg-black/10" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%, 3% 3%, 97% 3%, 97% 97%, 3% 97%, 3% 3%)' }} />
                    <div className="absolute inset-0 border-[1px] border-dashed border-red-500/20" style={{ margin: '3%' }} />
                </div>
            )}
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} onAction={handleContextAction} onClose={() => setContextMenu(null)} />}
            {renderPageAssets(page, nextPage ? 'left' : side)}
            {nextPage && !page.isSpreadLayout && renderPageAssets(nextPage, 'right')}
            {guides.length > 0 && guides.map((guide, i) => (
                <div key={i} className="absolute bg-catalog-accent/40 z-[100] pointer-events-none" style={{ left: guide.type === 'v' ? `${guide.pos}%` : 0, top: guide.type === 'h' ? `${guide.pos}%` : 0, width: guide.type === 'v' ? '1px' : '100%', height: guide.type === 'h' ? '1px' : '100%', boxShadow: '0 0 4px rgba(194, 65, 12, 0.4)' }} />
            ))}
            {page.assets.length === 0 && (!nextPage || nextPage.assets.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-catalog-text/40 animate-in fade-in zoom-in duration-700">
                        <Grid className="w-8 h-8 mx-auto mb-4 opacity-20" />
                        <p className="text-lg font-serif italic text-catalog-text/60">Ready to Create?</p>
                        <p className="text-xs mt-2 uppercase tracking-widest font-bold">Pick a Layout from the Sidebar</p>
                        <p className="text-[10px] mt-1 opacity-60 italic">or drop your first image here</p>
                    </div>
                </div>
            )}
            {focalEditorAsset && (
                <FocalPointEditorModal
                    asset={focalEditorAsset.asset}
                    pageId={focalEditorAsset.pageId}
                    onSave={(updates) => {
                        updateAsset(focalEditorAsset.pageId, focalEditorAsset.asset.id, updates);
                        setFocalEditorAsset(null);
                    }}
                    onClose={() => setFocalEditorAsset(null)}
                />
            )}
        </div>
    );
});
