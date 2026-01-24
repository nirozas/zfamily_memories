import { memo } from 'react';
import { type LayoutBox } from '../../contexts/AlbumContext';
import { MediaRenderer } from './MediaRenderer';
import { cn } from '../../lib/utils';
import { getClipPathStyle } from '../../lib/assetUtils';

interface LayoutFrameProps {
    box: LayoutBox;
    isEditable?: boolean;
    onVideoClick?: (url: string, rotation?: number) => void;
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: () => void;
    className?: string;
}

/**
 * LayoutFrame
 * Standardized container for all layout elements.
 * Implements absolute positioning based on percentages and strict Z-index hierarchy.
 */
export const LayoutFrame = memo(function LayoutFrame({
    box,
    isEditable = false,
    onVideoClick,
    onClick,
    onDoubleClick,
    className
}: LayoutFrameProps) {

    // Strict Z-Index Hierarchy
    // Background: 0, Images/Slots: 10, Text: 50, Overlays: 100
    const getStrictZIndex = (role: string, customZ?: number) => {
        if (customZ !== undefined && customZ >= 100) return customZ; // Preserve interaction layers
        switch (role) {
            case 'slot': return 10;
            case 'text': return 50;
            case 'decoration': return 5;
            default: return customZ || 10;
        }
    };

    const zIndex = getStrictZIndex(box.role, box.zIndex || box.z);

    const isMedia = box.role === 'slot' && (box.content?.type === 'image' || box.content?.type === 'video');

    const style: React.CSSProperties = {
        position: 'absolute',
        left: `${box.left || box.x || 0}%`,
        top: `${box.top || box.y || 0}%`,
        width: `${box.width}%`,
        height: `${box.height}%`,
        zIndex: isMedia ? 100 : zIndex, // 3. Set LayoutFrame to z-index: 100 for media
        overflow: 'hidden',
        borderRadius: box.content?.config?.borderRadius ? `${box.content.config.borderRadius}px` : undefined,
        border: box.content?.config?.borderWidth ? `${box.content.config.borderWidth}px solid ${box.content.config.borderColor || '#000'}` : undefined,
        opacity: (box.content?.config?.opacity ?? 100) / 100,
        ...getClipPathStyle((box.content?.config || {}) as any),
        pointerEvents: isEditable ? 'auto' : (box.role === 'text' ? 'none' : 'auto')
    };


    return (
        <div
            className={cn(
                "layout-frame transition-all duration-300",
                isEditable && "cursor-move",
                className
            )}
            style={style}
            onClick={(e) => {
                if (isMedia && !isEditable) {
                    e.stopPropagation();
                }
                onClick?.(e);
            }}
            onMouseDown={(e) => {
                if (isMedia && !isEditable) {
                    e.stopPropagation();
                }
            }}
            onDoubleClick={onDoubleClick}
        >
            <MediaRenderer
                type={box.content?.type || 'image'}
                url={box.content?.url}
                content={box.content?.text || box.content?.config?.content}
                zoom={box.content?.zoom}
                focalX={box.content?.x}
                focalY={box.content?.y}
                rotation={box.content?.rotation}
                config={box.content?.config}
                isEditable={isEditable}
                onVideoClick={onVideoClick}
            />
        </div>
    );
});

