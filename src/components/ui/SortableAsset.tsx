import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils'; // Assuming cn utility exists, adjust if not
import { useMediaUrl } from '../../hooks/useGooglePhotosUrl';

interface SortableAssetProps {
    id: string;
    asset: { url: string; type: string; caption?: string };
    onRemove: () => void;
    children?: React.ReactNode;
}

export function SortableAsset({ id, asset, onRemove, children }: SortableAssetProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.5 : 1,
    };

    // Proxy the URL using useMediaUrl to handle Google Photos IDs properly
    const { url: displayUrl } = useMediaUrl(asset.url, undefined, null, true);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={cn(
                "group relative aspect-square bg-catalog-stone/10 rounded-lg overflow-hidden border border-catalog-accent/10 touch-none",
                isDragging && "ring-2 ring-catalog-accent shadow-xl"
            )}
        >
            {asset.type === 'video' ? (
                (() => {
                    const isGoogleUrl = asset.url && (
                        asset.url.includes('googleusercontent.com') ||
                        asset.url.includes('photoslibrary.googleapis.com') ||
                        asset.url.startsWith('google-photos://') ||
                        asset.url.includes('drive.google.com') ||
                        asset.url.includes('ggpht.com')
                    );
                    return isGoogleUrl ? (
                        <img src={displayUrl || asset.url} className="w-full h-full object-cover pointer-events-none" alt="" />
                    ) : (
                        <video src={asset.url.includes('.m3u8') ? asset.url : asset.url} className="w-full h-full object-cover pointer-events-none" muted playsInline />
                    );
                })()
            ) : (
                <img src={displayUrl || asset.url} className="w-full h-full object-cover pointer-events-none" alt="" />
            )}


            {/* Overlay */}
            <div className={cn(
                "absolute inset-0 bg-black/40 transition-opacity flex flex-col items-center justify-center gap-2",
                isDragging ? "opacity-0" : "opacity-0 group-hover:opacity-100" // Hide controls while dragging
            )}>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent drag start
                        onRemove();
                    }}
                    className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors pointer-events-auto cursor-pointer"
                // Add data-no-dnd="true" if dnd-kit respects it, otherwise stopPropagation usually works
                >
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
                {/* Custom Children (e.g. move arrows if we want to keep them as fallback, or other controls) */}
                {children}
            </div>
        </div>
    );
}
