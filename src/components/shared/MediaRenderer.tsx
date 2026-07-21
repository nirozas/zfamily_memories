import { memo, useRef, useEffect, useState } from 'react';
import { Maximize2, MapPin, Play } from 'lucide-react';
import { getTransformedUrl, getFilterStyle } from '../../lib/assetUtils';
import { MapAsset } from '../ui/MapAsset';
import { cn } from '../../lib/utils';
import { useAuthorizedUrl } from '../../hooks/useAuthorizedUrl';
import { ChromaKeyImage } from './ChromaKeyImage';

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
    const { authorizedUrl } = useAuthorizedUrl(url);
    const displayUrl = authorizedUrl || url || null;

    // 1. Handle Images and Decorative Assets
    if (type === 'image' || type === 'sticker' || type === 'ribbon' || type === 'frame') {
        if (!displayUrl) return null;

        // Build image style based on whether a crop is applied
        let imageStyle: React.CSSProperties;
        if (config.crop && config.crop.width && config.crop.height) {
            // === CROP MODE: Viewport-into-image technique ===
            // The container (LayoutFrame inner div) has overflow:hidden which clips the image.
            // We make the image larger than the container, offset it so the crop region is visible.
            //
            // Given crop = { x, y, width, height } all in 0-1 (fraction of original image):
            //   - Image rendered width = container_width / cropWidth
            //   - Image rendered height = container_height / cropHeight  
            //   - Image left = -(cropX / cropWidth) * container_width
            //   - Image top = -(cropY / cropHeight) * container_height
            const cw = Math.max(0.001, config.crop.width);
            const ch = Math.max(0.001, config.crop.height);
            const cx = config.crop.x ?? 0;
            const cy = config.crop.y ?? 0;
            imageStyle = {
                position: 'absolute',
                width: `${(1 / cw) * 100}%`,
                height: `${(1 / ch) * 100}%`,
                left: `${-(cx / cw) * 100}%`,
                top: `${-(cy / ch) * 100}%`,
                objectFit: 'fill',  // fill the positioned box exactly
                maxWidth: 'none',
                maxHeight: 'none',
                display: 'block',
                ...getFilterStyle(config),
            };
        } else {
            // === NORMAL MODE: object-fit with focal point ===
            imageStyle = {
                position: 'absolute',
                width: '100%',
                height: '100%',
                objectFit: config.fitMode === 'fit' ? 'contain' : (config.fitMode === 'stretch' ? 'fill' : 'cover'),
                objectPosition: `${focalX}% ${focalY}%`,
                transform: zoom !== 1 ? `scale(${zoom})` : undefined,
                transformOrigin: `${focalX}% ${focalY}%`,
                maxWidth: 'none',
                maxHeight: 'none',
                display: 'block',
                ...getFilterStyle(config),
            };
        }

        return (
            <ChromaKeyImage
                src={getTransformedUrl(displayUrl, config)}
                alt=""
                className={cn("pointer-events-auto transition-all duration-300 shadow-none", className)}
                style={imageStyle}
                draggable={false}
                onClick={(e: any) => {
                    if (!isEditable) e.stopPropagation();
                }}
                chromaKeyColors={config.chromaKeyColors}
                chromaKeyTolerance={config.chromaKeyTolerance}
            />
        );
    }

    // 2. Handle Videos
    if (type === 'video') {
        if (!displayUrl) return null;
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

        // Build video style based on whether a crop is applied
        let computedVideoStyle: React.CSSProperties;
        if (config.crop && config.crop.width && config.crop.height) {
            const cw = Math.max(0.001, config.crop.width);
            const ch = Math.max(0.001, config.crop.height);
            const cx = config.crop.x ?? 0;
            const cy = config.crop.y ?? 0;
            computedVideoStyle = {
                position: 'absolute',
                width: `${(1 / cw) * 100}%`,
                height: `${(1 / ch) * 100}%`,
                left: `${-(cx / cw) * 100}%`,
                top: `${-(cy / ch) * 100}%`,
                objectFit: 'fill',
                maxWidth: 'none',
                maxHeight: 'none',
                display: 'block',
                cursor: 'pointer',
                pointerEvents: 'auto',
                zIndex: 50,
            };
        } else {
            computedVideoStyle = {
                ...videoStyle,
                objectFit: config.fitMode === 'fit' ? 'contain' : (config.fitMode === 'stretch' ? 'fill' : 'cover'),
                objectPosition: `${focalX}% ${focalY}%`,
                width: '100%',
                height: '100%',
                maxWidth: 'none',
                maxHeight: 'none',
            };
        }

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
                    src={displayUrl}
                    className={cn("absolute max-w-none max-h-none", className)}
                    style={computedVideoStyle}
                    playsInline
                    controls={isEditable}
                    controlsList="nofullscreen"
                    preload="metadata"
                    muted
                    onPlay={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                        if (!isEditable) {
                            e.currentTarget.pause();
                            if (displayUrl && onVideoClick) onVideoClick(displayUrl, rotation);
                        }
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
                    <div 
                        className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/40 transition-all duration-300 cursor-pointer z-[60] group/overlay"
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
                        title="Play Fullscreen"
                    >
                        <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.5)] border border-white/20 transform scale-90 group-hover/overlay:scale-105 transition-all duration-300 group-hover/overlay:bg-catalog-accent">
                            <Play className="w-6 h-6 text-white ml-1.5" />
                        </div>
                    </div>
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

        const getGradientStyle = (gradientName: string): React.CSSProperties => {
            switch (gradientName) {
                case 'sunset':
                    return {
                        background: 'linear-gradient(135deg, #f59e0b, #ec4899, #8b5cf6)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    };
                case 'ocean':
                    return {
                        background: 'linear-gradient(135deg, #06b6d4, #3b82f6, #6366f1)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    };
                case 'royal':
                    return {
                        background: 'linear-gradient(135deg, #d946ef, #8b5cf6, #ec4899)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    };
                case 'emerald':
                    return {
                        background: 'linear-gradient(135deg, #10b981, #059669, #047857)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                    };
                default:
                    return {};
            }
        };

        const gradientStyle = style.textGradient && style.textGradient !== 'none' ? getGradientStyle(style.textGradient) : {};

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
                    "w-full h-full break-words overflow-hidden flex flex-col justify-center outline-none selection:bg-catalog-accent/20",
                    isEditable && "cursor-text",
                    isEmpty && isEditable && !isFocused && "after:content-['Insert_Story_Verse...'] after:opacity-20 after:italic",
                    className
                )}
                style={{
                    fontFamily: style.fontFamily || 'Inter, sans-serif',
                    fontSize: style.fontSize || 16,
                    fontWeight: style.fontWeight || 'normal',
                    fontStyle: style.fontStyle || 'normal',
                    color: style.textColor || style.color || 'inherit',
                    textAlign: (style.textAlign || 'center') as any,
                    textDecoration: style.textDecoration || 'none',
                    lineHeight: style.lineHeight || 1.4,
                    letterSpacing: (style.letterSpacing || 0) + 'px',
                    whiteSpace: 'pre-wrap',
                    textShadow: style.textShadow || 'none',
                    backgroundColor: style.textBackgroundColor || 'transparent',
                    padding: `${style.padding !== undefined ? style.padding : 16}px`,
                    ...gradientStyle
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
