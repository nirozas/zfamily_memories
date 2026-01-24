import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Calendar, MapPin, Eye, BookOpen } from 'lucide-react';
import { ActionToolbar } from '../ui/ActionToolbar';

interface AlbumCardProps {
    id: string;
    title: string;
    cover_url?: string;
    category?: string;
    created_at: string;
    pages?: any[];
    location?: string;
    config?: any;
    onEdit?: () => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onShare?: () => void;
    onPrint?: () => void;
}

/**
 * AlbumCard - Premium 'Wow' Edition
 * 
 * Logic: Linked to page_number: 1 via cover_image_url
 * Rendering: Cover image as the background of the album box.
 */
export function AlbumCard(props: AlbumCardProps) {
    const { id, title, cover_url, category, created_at, pages, location, config, onEdit, onDelete, onDuplicate, onShare, onPrint } = props;


    const pageCount = pages?.length || 0;
    const albumCategory = category || 'Memory';
    const loc = location || config?.location;

    // 1. First Page (Front Page) Derivation Fallback
    const displayCover = cover_url || (() => {
        if (!pages || pages.length === 0) return null;
        const findImageInPage = (page: any) => {
            // Check nested layout boxes
            if (page.layout_json) {
                const boxes = Array.isArray(page.layout_json) ? page.layout_json : [];
                const box = boxes.find((b: any) => b.content?.url && (b.content.type === 'image' || b.content.type === 'video'));
                if (box) return box.content.url;
            }
            // Check flat assets
            if (page.assets) {
                const assets = Array.isArray(page.assets) ? page.assets : [];
                const asset = assets.find((a: any) => a.url && (a.asset_type === 'image' || a.type === 'image'));
                if (asset) return asset.url;
            }
            return null;
        };

        // Priority 1: Page 1 (Front Cover)
        const frontPage = pages.find(p => p.page_number === 1 || p.pageNumber === 1);
        if (frontPage) {
            const img = findImageInPage(frontPage);
            if (img) return img;
        }

        // Priority 2: Page 0 (Legacy Support)
        const legacyPage = pages.find(p => p.page_number === 0 || p.pageNumber === 0);
        if (legacyPage) {
            const img = findImageInPage(legacyPage);
            if (img) return img;
        }

        // Priority 3: First available content
        for (const p of pages) {
            const img = findImageInPage(p);
            if (img) return img;
        }
        return null;
    })();

    // Date Logic
    const formattedDate = (() => {
        if (config?.startDate) return new Date(config.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        return new Date(created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    })();

    return (
        <div className="relative group h-[420px] transition-all duration-500 hover:-translate-y-2">
            <Link to={`/album/${id}`} className="block h-full">
                <Card className="relative h-full overflow-hidden p-0 border-none shadow-2xl bg-zinc-900 rounded-2xl group/card">

                    {/* 1. First Page (Front Page) Rendering */}
                    <div className="absolute inset-0 z-0">
                        {displayCover ? (
                            <>
                                <img
                                    src={displayCover}
                                    alt={title}
                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover/card:scale-110"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10" />
                                <div className="absolute inset-0 bg-gradient-to-br from-catalog-accent/20 to-transparent mix-blend-overlay z-10" />
                            </>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
                                <BookOpen className="w-16 h-16 text-white/10 mb-4" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20">Empty Archive</span>
                            </div>
                        )}
                    </div>

                    {/* Content Layer */}
                    <div className="relative z-20 h-full flex flex-col justify-end p-6 text-white">

                        {/* Top Badge */}
                        <div className="absolute top-6 left-6 flex items-center gap-2">
                            <span className="px-3 py-1 bg-catalog-accent/90 backdrop-blur-md text-[9px] font-bold text-white rounded-full uppercase tracking-widest shadow-lg">
                                {albumCategory}
                            </span>
                        </div>

                        {/* Visual View Hint */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none">
                            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-xl px-6 py-3 rounded-full border border-white/20 shadow-2xl transform scale-90 group-hover/card:scale-100 transition-transform">
                                <Eye className="w-5 h-5 text-white" />
                                <span className="text-xs font-bold uppercase tracking-widest">Open Library</span>
                            </div>
                        </div>

                        {/* Info Section - Now with specific requested order */}
                        <div className="space-y-4 transform transition-transform duration-500 group-hover/card:translate-y-[-10px]">
                            <div className="space-y-2">
                                {/* Position 1: Title */}
                                <h3 className="font-serif text-3xl leading-tight group-hover/card:text-catalog-accent transition-colors">
                                    {title}
                                </h3>

                                {/* Position 2: Number of Pages (under the title) */}
                                <div className="flex items-center gap-4 text-[11px] text-white/80 uppercase tracking-[0.2em] font-bold">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-catalog-accent" />
                                        <span>{formattedDate}</span>
                                    </div>
                                    <div className="w-1 h-1 bg-white/30 rounded-full" />
                                    <span>{pageCount} Pages</span>
                                </div>

                                {/* Position 3: Location (under the number of pages) */}
                                {loc && (
                                    <div className="pb-2"> {/* Added padding to create space before the ActionToolbar */}
                                        <button
                                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 backdrop-blur-md rounded-lg border border-white/10 text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all cursor-pointer group/loc max-w-full"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                window.open(`/map?location=${encodeURIComponent(loc)}`, '_blank');
                                            }}
                                        >
                                            <MapPin className="w-3 h-3 text-catalog-accent group-hover/loc:scale-125 transition-transform" />
                                            <span className="truncate">{loc}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            </Link>

            {/* Position 4: Always Visible Premium Footer Actions (at the bottom) */}
            <div className="absolute bottom-4 right-4 z-30 transition-transform duration-500">
                <ActionToolbar
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onShare={onShare}
                    onPrint={onPrint}
                    variant="dark"
                    className="bg-black/40 backdrop-blur-2xl px-4 py-2 rounded-full border border-white/10 shadow-2xl flex gap-3 interactive-toolbar"
                />
            </div>
        </div>
    );
}
