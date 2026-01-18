import { useAlbum, type Page, type Asset } from '../../contexts/AlbumContext';
import { cn } from '../../lib/utils';
import { useState, memo, useEffect, useRef } from 'react';
import React from 'react';
import { motion } from 'framer-motion';
import { RotateCw, Lock, Plus } from 'lucide-react';
import { ContextMenu } from './ContextMenu';
import { getTransformedUrl, getFilterStyle, getClipPathStyle } from '../../lib/assetUtils';
import { MapAsset } from '../ui/MapAsset';

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
    onOpenMapEditor?: (assetId: string) => void;
    onOpenLocationEditor?: (assetId: string) => void;
}

const AssetRenderer = memo(function AssetRenderer({
    asset, isSelected, isEditing, onClick, onDoubleClick, onEditEnd,
    onContextMenu, onSnap, onSnapEnd, pageId, side = 'single', editorMode, setEditorMode,
    zoom, canvasRef, otherPage, onDrop, onOpenMapEditor, onOpenLocationEditor
}: AssetRendererProps) {
    const { updateAsset, album, moveAssetToPage, commitHistory } = useAlbum();
    const [textValue, setTextValue] = useState(asset.content || '');
    const [dragPos, setDragPos] = useState<{ x: number, y: number } | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        if (!isEditing) {
            setTextValue(asset.content || '');
        }
    }, [asset.content, isEditing]);

    // For responsive rendering, we now treat coordinates (0-100) as direct percentages
    const refWidth = 100;
    const refHeight = 100;
    const canvasRefWidth = side === 'single' ? 100 : 200;

    // Spread view handling for X position
    const renderX = (side === 'right' ? asset.x + 100 : asset.x);
    const leftPercent = (renderX / canvasRefWidth) * 100;
    const topPercent = (asset.y / refHeight) * 100;
    const widthPercent = (asset.width / refWidth) * (side === 'single' ? 100 : 50);
    const heightPercent = (asset.height / refHeight) * 100;

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
                    {asset.width && <span className="text-[8px] opacity-70">{Math.round(asset.width)}x{Math.round(asset.height)} units</span>}
                </div>
            )}
            <motion.div
                onDrop={(e) => { setIsDragOver(false); onDrop?.(e); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                drag={!isEditing && !asset.isLocked && !album?.config?.isLocked}
                dragMomentum={false}
                dragElastic={0}
                transition={{ type: "tween", duration: 0 }}
                whileDrag={{ zIndex: 100 }}
                onDragStart={(_, info) => {
                    setDragPos({ x: info.point.x, y: info.point.y });
                }}
                onDrag={(_, info) => {
                    setDragPos({ x: info.point.x, y: info.point.y });
                    if (onSnap && canvasRef.current) {
                        const rect_bounds = canvasRef.current.getBoundingClientRect();
                        const pageWidthInPixels = otherPage ? rect_bounds.width / 2 : rect_bounds.width;
                        const heightInPixels = rect_bounds.height;

                        // info.offset is screen pixels. rect_bounds is screen pixels.
                        // Zoom is already baked into rect_bounds via transformation on parent.
                        const offsetXPercent = (info.offset.x / pageWidthInPixels) * 100;
                        const offsetYPercent = (info.offset.y / heightInPixels) * 100;

                        const currentAssetX = (side === 'right' ? asset.x + 100 : asset.x);
                        const draggingRect = {
                            x: currentAssetX + offsetXPercent,
                            y: asset.y + offsetYPercent,
                            w: asset.width,
                            h: asset.height
                        };
                        onSnap(draggingRect);
                    }
                }}
                onDragEnd={(_, info) => {
                    setDragPos(null);
                    if (!canvasRef.current) return;
                    const rect = canvasRef.current.getBoundingClientRect();
                    const heightInPixels = rect.height;
                    const pageWidthInPixels = otherPage ? rect.width / 2 : rect.width;

                    const offsetXPercent = (info.offset.x / pageWidthInPixels) * 100;
                    const offsetYPercent = (info.offset.y / heightInPixels) * 100;

                    let finalX = asset.x + offsetXPercent;
                    let finalY = asset.y + offsetYPercent;
                    const absoluteX = (side === 'right' ? asset.x + 100 : asset.x) + offsetXPercent;

                    if (onSnap) {
                        const draggingRect = {
                            x: absoluteX,
                            y: finalY,
                            w: asset.width,
                            h: asset.height
                        };
                        const { snappedX, snappedY } = onSnap(draggingRect);
                        finalX = side === 'right' ? snappedX - 100 : snappedX;
                        finalY = snappedY;
                        onSnapEnd?.();
                    }

                    // Constrain to page borders
                    finalX = Math.max(0, Math.min(100 - asset.width, finalX));
                    finalY = Math.max(0, Math.min(100 - asset.height, finalY));

                    if (otherPage && side === 'left' && absoluteX > 110) { // Threshold for moving to next page
                        moveAssetToPage(asset.id, pageId, otherPage.id, Math.max(0, absoluteX - 100), finalY);
                    } else if (otherPage && side === 'right' && absoluteX < 90) { // Threshold for moving to prev page
                        moveAssetToPage(asset.id, pageId, otherPage.id, Math.min(100 - asset.width, absoluteX), finalY);
                    } else {
                        updateAsset(pageId, asset.id, { x: finalX, y: finalY });
                    }
                    commitHistory();
                }}
                onClick={onClick}
                onDoubleClick={() => {
                    if (asset.type === 'image') {
                        setEditorMode('studio');
                    } else if (asset.type === 'text') {
                        onDoubleClick?.(); // Standard setEditingAssetId
                    } else if (asset.type === 'map') {
                        onOpenMapEditor?.(asset.id);
                    } else if (asset.type === 'location') {
                        onOpenLocationEditor?.(asset.id);
                    }
                }}
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
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    width: `${widthPercent}%`,
                    height: `${heightPercent}%`,
                    ...getFilterStyle(asset),
                    transformOrigin: `${(asset.pivot?.x ?? 0.5) * 100}% ${(asset.pivot?.y ?? 0.5) * 100}%`,
                    transform: `rotate(${asset.rotation || 0}deg) scaleX(${asset.flipX ? -1 : 1}) scaleY(${asset.flipY ? -1 : 1})`,
                    zIndex: asset.zIndex || 0,
                    opacity: (asset.opacity ?? 100) / 100,
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
                                {/* Border/Frame */}
                                <div
                                    className="absolute inset-0 border-2 border-catalog-accent z-[99] pointer-events-none rounded-sm"
                                    style={{ boxShadow: '0 0 0 1px rgba(194, 65, 12, 0.1), 0 0 8px rgba(194, 65, 12, 0.3)' }}
                                />

                                {/* Rotation Handle */}
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

                                {/* Corner Resize Handles */}
                                {['nw', 'ne', 'sw', 'se'].map((handle) => (
                                    <div
                                        key={`corner-${handle}`}
                                        className={cn(
                                            "absolute w-4 h-4 bg-white border-2 border-catalog-accent rounded-full z-[101] pointer-events-auto shadow-md hover:scale-125 transition-transform",
                                            handle === 'nw' && "cursor-nw-resize", handle === 'ne' && "cursor-ne-resize",
                                            handle === 'sw' && "cursor-sw-resize", handle === 'se' && "cursor-se-resize"
                                        )}
                                        style={{
                                            top: handle.includes('n') ? 0 : '100%',
                                            left: handle.includes('w') ? 0 : '100%',
                                            transform: `translate(-50%, -50%) scale(${1 / zoom})`
                                        }}
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
                                            const pageW_px = (canvasRefWidth === 100) ? rect.width : (rect.width / 2);
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

                                                updateAsset(pageId, asset.id, { width: newW, height: newH, x: newX, y: newY }, { skipHistory: true });
                                            };
                                            const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                            window.addEventListener('mousemove', handleMouseMove);
                                            window.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    />
                                ))}

                                {/* Side Resize Handles */}
                                {['n', 's', 'e', 'w'].map((handleSide) => (
                                    <div
                                        key={`side-${handleSide}`}
                                        className={cn(
                                            "absolute bg-white border-2 border-catalog-accent z-[100] pointer-events-auto shadow-sm hover:scale-110 transition-transform rounded-full",
                                            (handleSide === 'n' || handleSide === 's') && "h-1.5 w-6",
                                            (handleSide === 'e' || handleSide === 'w') && "w-1.5 h-6",
                                            handleSide === 'n' && "cursor-n-resize", handleSide === 's' && "cursor-s-resize",
                                            handleSide === 'e' && "cursor-e-resize", handleSide === 'w' && "cursor-w-resize"
                                        )}
                                        style={{
                                            top: handleSide === 'n' ? 0 : handleSide === 's' ? '100%' : '50%',
                                            left: handleSide === 'w' ? 0 : handleSide === 'e' ? '100%' : '50%',
                                            transform: `translate(-50%, -50%) scale(${1 / zoom})`
                                        }}
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
                                            const pageW_px = (canvasRefWidth === 100) ? rect.width : (rect.width / 2);
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

                                                updateAsset(pageId, asset.id, { width: newW, height: newH, x: newX, y: newY, fitMode: 'stretch', crop: undefined }, { skipHistory: true });
                                            };
                                            const handleMouseUp = () => { commitHistory(); window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
                                            window.addEventListener('mousemove', handleMouseMove);
                                            window.addEventListener('mouseup', handleMouseUp);
                                        }}
                                    />
                                ))}

                                {/* Pivot Point Handle */}
                                {editorMode === 'pivot' && (
                                    <div
                                        className="absolute z-[110] cursor-crosshair pointer-events-auto"
                                        style={{
                                            left: `${(asset.pivot?.x ?? 0.5) * 100}%`,
                                            top: `${(asset.pivot?.y ?? 0.5) * 100}%`,
                                            transform: 'translate(-50%, -50%)'
                                        }}
                                        onMouseDown={(e) => {
                                            e.stopPropagation();
                                            const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
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
                            </>
                        )}
                    </>
                )}

                <div className="w-full h-full relative overflow-hidden pointer-events-auto" style={{ borderRadius: `${asset.borderRadius || 0}px`, border: asset.borderWidth ? `${asset.borderWidth}px solid ${asset.borderColor || '#000'}` : 'none', ...getClipPathStyle(asset) }}>
                    {(asset.type === 'image' || asset.type === 'frame') && asset.url && !asset.isPlaceholder && (
                        <img
                            src={getTransformedUrl(asset.url, asset)} alt="" className="absolute max-w-none origin-top-left shadow-none transition-filter duration-300"
                            crossOrigin="anonymous"
                            style={{
                                width: asset.crop ? `${(1 / (asset.crop.width || 1)) * 100}%` : '100%',
                                height: asset.crop ? `${(1 / (asset.crop.height || 1)) * 100}%` : '100%',
                                left: asset.crop ? `-${(asset.crop.x || 0) * (asset.crop.width ? 1 / asset.crop.width : 1) * 100}%` : '0',
                                top: asset.crop ? `-${(asset.crop.y || 0) * (asset.crop.height ? 1 / asset.crop.height : 1) * 100}%` : '0',
                                objectFit: asset.crop ? 'fill' : (asset.fitMode === 'fit' ? 'contain' : ((asset.fitMode as any) === 'stretch' ? 'fill' : 'cover')),
                                ...getFilterStyle(asset),
                            }}
                            draggable={false}
                        />
                    )}
                    {asset.isPlaceholder && (
                        <div className={cn(
                            "w-full h-full flex flex-col items-center justify-center p-4 text-center transition-all duration-200 group/placeholder",
                            isDragOver
                                ? "bg-catalog-accent/10 border-2 border-dashed border-catalog-accent scale-105 shadow-md"
                                : "bg-slate-100 border-2 border-dashed border-slate-300 hover:border-catalog-accent hover:bg-slate-50"
                        )}>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept="image/*"
                                onChange={handleFileSelect}
                            />

                            {isUploading ? (
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-catalog-accent mb-2"></div>
                            ) : (
                                <>
                                    <button
                                        className="w-10 h-10 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 hover:text-catalog-accent hover:border-catalog-accent transition-all mb-2 transform group-hover/placeholder:scale-110 pointer-events-auto"
                                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                        title="Click to upload image"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                    <span className={cn("text-[9px] uppercase font-bold tracking-widest transition-colors", isDragOver ? "text-catalog-accent" : "text-slate-400")}>
                                        Drop or Click
                                    </span>
                                </>
                            )}
                        </div>
                    )}
                    {asset.type === 'video' && asset.url && (
                        <div className="w-full h-full bg-black relative overflow-hidden group">
                            <video src={asset.url} className="w-full h-full object-cover cursor-pointer" style={getFilterStyle(asset)} controls={isSelected} muted loop />
                        </div>
                    )}
                    {asset.type === 'text' && (
                        <div className="w-full h-full">
                            {isEditing ? (
                                <textarea
                                    autoFocus className="w-full h-full p-2 bg-transparent resize-none focus:outline-none text-center"
                                    style={{
                                        fontFamily: asset.fontFamily || 'Inter, sans-serif',
                                        fontSize: asset.fontSize || Math.min(asset.width / 5, asset.height / 2),
                                        fontWeight: asset.fontWeight || 'normal',
                                        color: asset.textColor || 'inherit',
                                        textAlign: asset.textAlign || 'center',
                                        textDecoration: asset.textDecoration || 'none',
                                        lineHeight: asset.lineHeight || 1.2,
                                        letterSpacing: (asset.letterSpacing || 0) + 'px',
                                        backgroundColor: asset.textBackgroundColor || 'transparent',
                                        textShadow: asset.textShadow || 'none'
                                    }}
                                    value={textValue} onChange={(e) => setTextValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    onBlur={() => {
                                        if (textValue !== asset.content) {
                                            updateAsset(pageId, asset.id, { content: textValue });
                                        }
                                        onEditEnd?.();
                                    }}
                                />
                            ) : (
                                <div
                                    className="w-full h-full flex items-center justify-center p-2 break-words overflow-hidden"
                                    style={{
                                        fontFamily: asset.fontFamily || 'Inter, sans-serif',
                                        fontSize: asset.fontSize || Math.min(asset.width / 5, asset.height / 2),
                                        fontWeight: asset.fontWeight || 'normal',
                                        color: asset.textColor || 'inherit',
                                        textAlign: asset.textAlign || 'center',
                                        textDecoration: asset.textDecoration || 'none',
                                        lineHeight: asset.lineHeight || 1.2,
                                        letterSpacing: (asset.letterSpacing || 0) + 'px',
                                        textShadow: asset.textShadow,
                                        backgroundColor: asset.textBackgroundColor
                                    }}
                                >
                                    {asset.content || 'Double click to edit'}
                                </div>
                            )}
                        </div>
                    )}
                    {asset.type === 'location' && (
                        <div
                            className="w-full h-full flex items-center gap-2 px-3 py-2 overflow-hidden"
                            style={{
                                fontFamily: asset.fontFamily || 'Inter, sans-serif',
                                fontSize: asset.fontSize || 14,
                                fontWeight: asset.fontWeight || 'normal',
                                color: asset.textColor || '#6b7280',
                            }}
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.2em', height: '1.2em', flexShrink: 0, color: '#9333ea' }}>
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            <span className="truncate">{asset.content || 'Location'}</span>
                        </div>
                    )}
                    {asset.type === 'map' && asset.mapConfig && (
                        <div className="w-full h-full">
                            <MapAsset
                                center={asset.mapConfig.center || { lat: 32.0853, lng: 34.7818 }}
                                zoom={asset.mapConfig.zoom || 12}
                                places={asset.mapConfig.places || []}
                                interactive={isSelected} // Interactive when selected in editor
                            />
                        </div>
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

export function EditorCanvas({
    page,
    nextPage,
    side = 'single',
    editorMode,
    setEditorMode,
    showPrintSafe = true,
    zoom,
    onPageSelect,
    onOpenMapEditor,
    onOpenLocationEditor
}: EditorCanvasProps) {
    const {
        album,
        selectedAssetId,
        setSelectedAssetId,
        updateAsset,
        removeAsset,
        duplicateAsset,
        updateAssetZIndex,
        addAsset
    } = useAlbum();

    const canvasRef = useRef<HTMLDivElement>(null);

    const getSizeStyles = () => {
        const { width, height } = album?.config?.dimensions || { width: 1000, height: 700 };
        const totalWidth = nextPage ? width * 2 : width;
        const aspectRatio = totalWidth / height;
        return {
            width: `${totalWidth}px`,
            aspectRatio: `${aspectRatio}`,
            backgroundColor: page.backgroundColor,
        };
    };
    const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, assetId?: string, pageId?: string } | null>(null);
    const [guides, setGuides] = useState<{ type: 'v' | 'h', pos: number }[]>([]);

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

    const findSnappingPoints = (draggingRect: { x: number, y: number, w: number, h: number }) => {
        const snapThreshold = 1.0;
        const newGuides: { type: 'v' | 'h', pos: number }[] = [];
        let snappedX = Math.round(draggingRect.x);
        let snappedY = Math.round(draggingRect.y);
        const colWidth = 100 / 12;
        for (let i = 0; i <= (nextPage ? 24 : 12); i++) {
            const colPos = i * colWidth;
            if (Math.abs(snappedX - colPos) < snapThreshold) { snappedX = colPos; newGuides.push({ type: 'v', pos: colPos }); }
            if (Math.abs(snappedX + draggingRect.w - colPos) < snapThreshold) { snappedX = colPos - draggingRect.w; newGuides.push({ type: 'v', pos: colPos }); }
        }
        return { snappedX, snappedY, guides: newGuides };
    };

    const handleAssetClick = (assetId: string, pageId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedAssetId(assetId);
        if (onPageSelect) onPageSelect(pageId);
    };

    const handleCanvasClick = (e: React.MouseEvent) => {
        setSelectedAssetId(null);
        setEditingAssetId(null);
        if (nextPage && onPageSelect) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x > rect.width / 2) onPageSelect(nextPage.id);
            else onPageSelect(page.id);
        } else if (onPageSelect) onPageSelect(page.id);
    };

    const handleTextUpdate = (assetId: string, newContent: string) => {
        updateAsset(page.id, assetId, { content: newContent });
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (album?.config.isLocked) return;



        // 2. Handle Asset Drops (Images/Stickers)
        const assetData = e.dataTransfer.getData('asset');
        if (!assetData) return;

        try {
            const data = JSON.parse(assetData);
            const rect = e.currentTarget.getBoundingClientRect();

            // Calculate standardized drop coordinates relative to the canvas
            // Logic matches AssetRenderer positioning:
            // Side 'single': 100x100 coord system
            // Side 'left'/'right': Total width is spread width.

            const zoomFactor = zoom || 1;
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;

            // Coordinates in percentage (0-100 for height, 0-100 or 0-200 for width)
            const dropX_Pct = (clickX / (rect.width / zoomFactor)) * (nextPage ? 200 : 100);
            const dropY_Pct = (clickY / (rect.height / zoomFactor)) * 100;

            let targetPageId = page.id;
            let localX = dropX_Pct;

            // Determine target page and local X relative to that page (0-100)
            if (nextPage && dropX_Pct > 100) {
                targetPageId = nextPage.id;
                localX = dropX_Pct - 100;
            }

            // --- GEOMETRIC HIT TEST FOR PLACEHOLDERS ---
            // Before adding a new asset, check if we dropped ONTOP of a placeholder
            // This bypasses potential z-index/event bubbling issues
            const targetPageObj = targetPageId === page.id ? page : nextPage;
            if (targetPageObj) {
                // Find highest z-index placeholder that contains the point
                const hitAsset = targetPageObj.assets
                    .filter(a => a.isPlaceholder)
                    .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)) // Check top-most first
                    .find(a => {
                        // Simple bounding box check
                        return (
                            localX >= a.x &&
                            localX <= (a.x + a.width) &&
                            dropY_Pct >= a.y &&
                            dropY_Pct <= (a.y + a.height)
                        );
                    });

                if (hitAsset && (data.type === 'image' || !data.type)) {
                    // HIT! Update the placeholder
                    updateAsset(targetPageId, hitAsset.id, {
                        url: data.url,
                        isPlaceholder: false,
                        fitMode: 'cover'
                    });
                    return; // Stop processing, we filled a slot
                }
            }
            // -------------------------------------------


            // 3. If no placeholder hit, Add New Asset
            if (data.type === 'image' || data.type === 'frame' || !data.type) {
                const img = new Image();
                img.src = data.url;
                img.onload = () => {
                    let w = 40;
                    const ratio = img.naturalWidth / img.naturalHeight;
                    let h = w / ratio;

                    // Center the new asset on the mouse cursor
                    let finalX = localX - (w / 2);
                    let finalY = dropY_Pct - (h / 2);

                    const isFrame = data.type === 'frame' || data.category === 'frames' || data.category === 'frame';
                    const isBackground = data.category === 'backgrounds' || data.category === 'background';

                    if (isBackground) {
                        addAsset(targetPageId, {
                            type: 'image',
                            url: data.url,
                            x: 0,
                            y: 0,
                            width: 100,
                            height: 100,
                            rotation: 0,
                            zIndex: 0,
                            aspectRatio: ratio,
                            fitMode: 'cover',
                            category: 'backgrounds'
                        } as any);
                    } else if (isFrame) {
                        addAsset(targetPageId, { type: 'frame', url: data.url, x: 0, y: 0, width: 100, height: 100, rotation: 0, zIndex: 50, aspectRatio: ratio, fitMode: 'cover' });
                    } else {
                        addAsset(targetPageId, {
                            type: 'image',
                            url: data.url,
                            x: finalX,
                            y: finalY,
                            width: w,
                            height: h,
                            rotation: 0,
                            zIndex: targetPageObj ? targetPageObj.assets.length + 10 : 10,
                            aspectRatio: ratio,
                            fitMode: 'fit'
                        });
                    }
                };
            }
        } catch (err) { console.error('Asset drop failed', err); }
    };

    const handleAssetDrop = (assetId: string, pageId: string, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (album?.config.isLocked) return;

        const assetData = e.dataTransfer.getData('asset');
        if (!assetData) return;

        try {
            const data = JSON.parse(assetData);
            if (data.type === 'image' || !data.type) {
                // Update the existing placeholder asset
                updateAsset(pageId, assetId, {
                    url: data.url,
                    isPlaceholder: false,
                    fitMode: 'cover',
                    // Keep existing dimensions/rotation/z-index
                });
            }
        } catch (err) {
            console.error('Failed to drop into placeholder', err);
        }
    };

    return (
        <div
            onMouseDown={handleCanvasClick} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
            className="relative transition-all duration-300 select-none editor-canvas"
            data-page-id={page.id} data-side={side} style={getSizeStyles()} ref={canvasRef}
        >
            {/* Left Page (or Single Page) Background */}
            {page.backgroundImage && (
                <img
                    src={page.backgroundImage}
                    alt=""
                    className={cn(
                        "absolute top-0 bottom-0 object-cover pointer-events-none z-0",
                        nextPage ? "left-0 w-1/2" : "inset-0 w-full h-full"
                    )}
                    style={{ opacity: page.backgroundOpacity ?? 1 }}
                />
            )}

            {/* Right Page Background (Spread View) */}
            {nextPage && nextPage.backgroundImage && (
                <img
                    src={nextPage.backgroundImage}
                    alt=""
                    className="absolute top-0 bottom-0 left-1/2 w-1/2 object-cover pointer-events-none z-0"
                    style={{ opacity: nextPage.backgroundOpacity ?? 1 }}
                />
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
            {[...page.assets].sort((a: Asset, b: Asset) => (a.zIndex || 0) - (b.zIndex || 0)).map((asset: Asset) => (
                <AssetRenderer
                    key={asset.id} asset={asset} pageId={page.id} side={nextPage ? 'left' : side} isSelected={selectedAssetId === asset.id} isEditing={editingAssetId === asset.id}
                    onClick={(e: React.MouseEvent) => handleAssetClick(asset.id, page.id, e)} onDoubleClick={() => setEditingAssetId(asset.id)} onUpdateText={handleTextUpdate} onEditEnd={() => setEditingAssetId(null)}
                    onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, asset.id, page.id)} onSnap={(rect) => { const result = findSnappingPoints(rect); setGuides(result.guides); return result; }}
                    onSnapEnd={() => setGuides([])} zoom={zoom} editorMode={editorMode} setEditorMode={setEditorMode} canvasRef={canvasRef} otherPage={nextPage}
                    onDrop={(e) => handleAssetDrop(asset.id, page.id, e)}
                    onOpenMapEditor={onOpenMapEditor}
                    onOpenLocationEditor={onOpenLocationEditor}
                />
            ))}
            {nextPage && [...nextPage.assets].sort((a: Asset, b: Asset) => (a.zIndex || 0) - (b.zIndex || 0)).map((asset: Asset) => (
                <AssetRenderer
                    key={asset.id} asset={asset} pageId={nextPage.id} side="right" isSelected={selectedAssetId === asset.id} isEditing={editingAssetId === asset.id}
                    onClick={(e: React.MouseEvent) => handleAssetClick(asset.id, nextPage.id, e)} onDoubleClick={() => setEditingAssetId(asset.id)} onUpdateText={(id, content) => updateAsset(nextPage.id, id, { content })} onEditEnd={() => setEditingAssetId(null)}
                    onContextMenu={(e: React.MouseEvent) => handleContextMenu(e, asset.id, nextPage.id)} onSnap={(rect) => { const result = findSnappingPoints(rect); setGuides(result.guides); return result; }}
                    onSnapEnd={() => setGuides([])} zoom={zoom} editorMode={editorMode} setEditorMode={setEditorMode} canvasRef={canvasRef} otherPage={page}
                    onDrop={(e) => handleAssetDrop(asset.id, nextPage.id, e)}
                    onOpenMapEditor={onOpenMapEditor}
                    onOpenLocationEditor={onOpenLocationEditor}
                />
            ))}
            {guides.map((guide, i) => (
                <div key={i} className="absolute bg-catalog-accent/50 z-[100] pointer-events-none" style={{ left: guide.type === 'v' ? guide.pos : 0, top: guide.type === 'h' ? guide.pos : 0, width: guide.type === 'v' ? '1px' : '100%', height: guide.type === 'h' ? '1px' : '100%' }} />
            ))}
            {page.assets.length === 0 && (!nextPage || nextPage.assets.length === 0) && (
                <div className="absolute inset-0 flex items-center justify-center"><div className="text-center text-catalog-text/40"><p className="text-lg font-serif italic">Drop images here</p><p className="text-sm mt-2">Or select from the sidebar</p></div></div>
            )}
        </div>
    );
}
