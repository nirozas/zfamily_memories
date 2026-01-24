import { AlbumCard } from './AlbumCard';
import { cn } from '../../lib/utils';

interface AlbumsGridProps {
    albums: any[];
    viewMode: 'grid' | 'list';
    onEdit: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onShare: (id: string) => void;
    onPrint: (id: string) => void;
}

/**
 * AlbumsGrid Component
 * 
 * Logic: Thumbnails are programmatically linked to cover_image_url 
 * which is synced to page_number: 1.
 */
export function AlbumsGrid({ albums, viewMode, onEdit, onDelete, onDuplicate, onShare, onPrint }: AlbumsGridProps) {
    if (albums.length === 0) {
        return (
            <div className="text-center py-20 bg-catalog-stone/10 rounded-xl border-2 border-dashed border-catalog-accent/10">
                <p className="text-catalog-text/40 font-serif italic text-lg">No precious memories found in this archive yet.</p>
            </div>
        );
    }

    return (
        <div className={cn(
            viewMode === 'grid'
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8"
                : "space-y-6"
        )}>
            {albums.map((album) => (
                <AlbumCard
                    key={album.id}
                    {...album}
                    onEdit={() => onEdit(album.id)}
                    onDelete={() => onDelete(album.id)}
                    onDuplicate={() => onDuplicate(album.id)}
                    onShare={() => onShare(album.id)}
                    onPrint={() => onPrint(album.id)}
                />
            ))}
        </div>
    );
}
