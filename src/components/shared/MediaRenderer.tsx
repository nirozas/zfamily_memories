import { memo, useRef, useEffect, useState } from 'react';
import { Maximize2, MapPin } from 'lucide-react';
import { getTransformedUrl, getFilterStyle } from '../../lib/assetUtils';
import { MapAsset } from '../ui/MapAsset';
import { useGooglePhotosUrl } from '../../hooks/useGooglePhotosUrl';
import { cn } from '../../lib/utils';

interface MediaRendererProps {
    id?: string;
    type: 'image' | 'video' | 'text' | 'map' | 'location' | 'sticker' | 'ribbon' | 'frame';
    url?: string;
    content?: string;
    zoom?: number;
    focalX?: number;
    focalY?: number;
    rotation?: number;
    config?: any;
    isEditable?: boolean;
    onVideoClick?: (url: string, rotation?: number) => void;
    className?: string;
}

/**
 * MediaRenderer
 * The universal engine for rendering media content across Studio, Preview, and View.
 * Ensures pixel-perfect consistency in cropping, scaling, and rotation.
 */
export const MediaRenderer = memo(function MediaRenderer({
    id,
    type,
    url,
    content,
    zoom = 1,
    focalX = 50,
    focalY = 50,
    rotation = 0,
    config = {},
    isEditable = false,
    onVideoClick,
    className
}: MediaRendererProps) {

    const { url: resolvedUrl } = useGooglePhotosUrl(config.googlePhotoId, url);
    const displayUrl = resolvedUrl || url || null;

    // 1. Handle Images and Decorative Assets
    if (type === 'image' || type === 'sticker' || type === 'ribbon' || type === 'frame') {
        return (
            <img
                src={getTransformedUrl(displayUrl || '', config)}
                alt=""
                className={cn("absolute w-full h-full shadow-none transition-all duration-300", className)}
                crossOrigin="anonymous"
                style={{
                    objectFit: config.fitMode === 'fit' ? 'contain' : (config.fitMode === 'stretch' || config.fitMode === 'fill') ? 'fill' : 'cover',
                    objectPosition: `${focalX}% ${focalY}%`,
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: `${focalX}% ${focalY}%`, // Pivot at the focal point
                    display: 'block',
                    ...getFilterStyle(config),
                }}
                draggable={false}
                loading="lazy"
                onClick={(e) => {
                    if (!isEditable) e.stopPropagation();
                }}
            />
        );
    }

    // 2. Handle Videos
    if (type === 'video') {
        const videoStyle: React.CSSProperties = {
            objectFit: 'contain',
            objectPosition: `${focalX}% ${focalY}%`,
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center',
            zIndex: 50,
            pointerEvents: 'auto',
            display: 'block',
            cursor: 'pointer'
        };

        const stopPropagation = (e: React.SyntheticEvent | React.MouseEvent | React.TouchEvent) => {
            e.stopPropagation();
        };

        return (
            <div
                className={cn("w-full h-full relative overflow-hidden group video-container-v5", className)}
                style={{ pointerEvents: 'auto', zIndex: 100 }}
                onClick={stopPropagation}
                onMouseDown={stopPropagation}
                onMouseUp={stopPropagation}
                onTouchStart={stopPropagation}
            >
                <video
                    src={displayUrl || undefined}
                    className="w-full h-full"
                    style={videoStyle}
                    playsInline
                    controls={true}
                    controlsList="nofullscreen"
                    crossOrigin="anonymous"
                    preload="metadata"
                    muted
                    onPlay={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                    onPointerDown={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                    onPointerUp={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                    }}
                />


                {!isEditable && onVideoClick && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            if (displayUrl) onVideoClick(displayUrl, rotation);
                        }}
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                        }}
                        className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-catalog-accent text-white rounded-md opacity-0 group-hover:opacity-100 transition-all z-[60] pointer-events-auto cursor-pointer shadow-lg backdrop-blur-sm scale-90 hover:scale-100"
                        title="Open Fullscreen"
                    >
                        <Maximize2 className="w-4 h-4" />
                    </button>
                )}

            </div>
        );
    }

    // 3. Handle Text
    if (type === 'text') {
        const style = config || {};
        const isEmpty = !content || content === '<br>' || content === '';
        const textRef = useRef<HTMLDivElement>(null);
        const [isFocused, setIsFocused] = useState(false);

        // Sync local DOM with external content prop only when NOT focused
        // This prevents resets while user is actively typing or using spellcheck
        useEffect(() => {
            if (textRef.current && !isFocused) {
                if (textRef.current.innerHTML !== (content || '')) {
                    textRef.current.innerHTML = content || '';
                }
            }
        }, [content, isFocused]);

        return (
            <div
                ref={textRef}
                id={id}
                data-text-asset-id={id}
                contentEditable={isEditable}
                spellCheck={true}
                suppressContentEditableWarning={true}
                onFocus={() => setIsFocused(true)}
                onInput={(e) => {
                    if (isEditable && config.onTextChange) {
                        const newContent = e.currentTarget.innerHTML;
                        config.onTextChange(newContent);
                    }
                }}
                onBlur={(e) => {
                    setIsFocused(false);
                    if (isEditable && config.onTextChange) {
                        config.onTextChange(e.currentTarget.innerHTML);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        // Allow enter for new lines
                    }
                    e.stopPropagation(); // Prevent global shortcuts while typing
                }}
                onMouseDown={(e) => {
                    if (isEditable && isFocused) e.stopPropagation();
                }}
                onPointerDown={(e) => {
                    // Only stop propagation if we are already focused and editing
                    // This allows clicking to SELECT/DRAG the box initially, 
                    // and double-clicking to enter "Mode B" (editing)
                    if (isEditable && isFocused) e.stopPropagation();
                }}
                className={cn(
                    "w-full h-full p-4 break-words overflow-hidden flex flex-col justify-center outline-none selection:bg-catalog-accent/20",
                    isEditable && "cursor-text",
                    isEmpty && isEditable && !isFocused && "after:content-['Insert_Story_Verse...'] after:opacity-20 after:italic",
                    className
                )}
                style={{
                    fontFamily: style.fontFamily || 'Inter, sans-serif',
                    fontSize: style.fontSize || 16,
                    fontWeight: style.fontWeight || 'normal',
                    color: style.textColor || style.color || 'inherit',
                    textAlign: (style.textAlign || 'center') as any,
                    textDecoration: style.textDecoration || 'none',
                    lineHeight: style.lineHeight || 1.4,
                    letterSpacing: (style.letterSpacing || 0) + 'px',
                    whiteSpace: 'pre-wrap',
                    textShadow: style.textShadow || 'none',
                    backgroundColor: style.textBackgroundColor || 'transparent',
                }}
            />
        );
    }

    // 4. Handle Location
    if (type === 'location') {
        return (
            <div
                className={cn("w-full h-full flex items-center gap-2 px-3 py-2 overflow-hidden", className)}
                style={{
                    fontFamily: config.fontFamily || 'Inter, sans-serif',
                    fontSize: config.fontSize || 14,
                    color: config.textColor || '#6b7280'
                }}
            >
                <MapPin className="w-[1.2em] h-[1.2em] text-purple-600 flex-shrink-0" />
                <span className="truncate">{content || 'Location'}</span>
            </div>
        );
    }

    // 5. Handle Map
    if (type === 'map' && config.mapConfig) {
        return (
            <div className={cn("w-full h-full", className)}>
                <MapAsset
                    center={config.mapConfig.center}
                    zoom={config.mapConfig.zoom}
                    places={config.mapConfig.places}
                    interactive={!isEditable}
                    lazyLoad={true}
                />
            </div>
        );
    }

    return null;
});
