import { Link } from 'react-router-dom';
import { Calendar, MapPin, Eye, BookOpen } from 'lucide-react';
import { ActionToolbar } from '../ui/ActionToolbar';
import { motion } from 'framer-motion';

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
        <div className="relative group h-[440px] transition-all duration-700 hover-lift active:scale-[0.98]">
            <Link to={`/album/${id}`} className="block h-full no-underline">
                <div className="relative h-full overflow-hidden bg-zinc-950 rounded-[2.5rem] border border-white/5 shadow-2xl group/card ring-1 ring-black/5">

                    {/* 1. Dynamic Background & Glow */}
                    <div className="absolute inset-0 z-0">
                        {displayCover ? (
                            <>
                                <img
                                    src={displayCover}
                                    alt={title}
                                    className="w-full h-full object-cover opacity-80 transition-all duration-1000 group-hover/card:scale-110 group-hover/card:opacity-100 group-hover/card:rotate-1"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent z-10" />
                                <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-zinc-950 to-transparent z-15" />
                                <div className="absolute inset-0 bg-catalog-accent/5 mix-blend-overlay z-10" />
                            </>
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900">
                                <BookOpen className="w-12 h-12 text-white/5 mb-4" />
                                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10 font-outfit">Archive Protected</span>
                            </div>
                        )}
                    </div>

                    {/* 2. Interactive Shine Effect */}
                    <div className="absolute inset-0 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000 pointer-events-none overflow-hidden">
                        <div className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] bg-gradient-to-br from-white/10 via-transparent to-transparent rotate-12 transform group-hover/card:animate-shine" />
                    </div>

                    {/* Content Layer */}
                    <div className="relative z-30 h-full flex flex-col justify-between p-7 text-white font-outfit">

                        {/* Top Badges */}
                        <div className="flex items-center justify-between">
                            <motion.div
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="px-4 py-1.5 glass backdrop-blur-3xl text-[9px] font-black text-white rounded-full uppercase tracking-[0.2em] border border-white/10 shadow-lg"
                            >
                                {albumCategory}
                            </motion.div>
                            {pageCount > 0 && (
                                <div className="p-2 glass rounded-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                                    <BookOpen className="w-3.5 h-3.5 text-catalog-accent" />
                                </div>
                            )}
                        </div>

                        {/* Middle Action Indicator */}
                        <div className="flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-all duration-500 scale-90 group-hover/card:scale-100 pointer-events-none">
                            <div className="glass-dark px-7 py-4 rounded-3xl border border-white/10 shadow-3xl">
                                <div className="flex items-center gap-3">
                                    <Eye className="w-5 h-5 text-catalog-accent" />
                                    <span className="text-sm font-black uppercase tracking-widest text-white/90">View Gallery</span>
                                </div>
                            </div>
                        </div>

                        {/* Footer Info Area */}
                        <div className="space-y-5">
                            <div className="space-y-1">
                                <h3 className="text-3xl font-black leading-tight tracking-premium group-hover/card:text-catalog-accent transition-colors duration-300">
                                    {title}
                                </h3>

                                <div className="flex items-center gap-4 text-[10px] text-white/40 uppercase tracking-[0.25em] font-black">
                                    <div className="flex items-center gap-2">
                                        <Calendar className="w-3 h-3 text-catalog-accent/50" />
                                        <span>{formattedDate}</span>
                                    </div>
                                    <div className="w-1.5 h-1.5 bg-white/20 rounded-full" />
                                    <span>{pageCount} Chapters</span>
                                </div>
                            </div>

                            {loc && (
                                <button
                                    className="flex items-center gap-2 px-3 py-2 glass-dark rounded-xl border border-white/5 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-all group/loc max-w-full truncate"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        window.open(`/map?location=${encodeURIComponent(loc)}`, '_blank');
                                    }}
                                >
                                    <MapPin className="w-3 h-3 text-catalog-accent animate-bounce" />
                                    <span className="truncate opacity-60 group-hover/loc:opacity-100 transition-opacity">{loc}</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </Link>

            {/* Premium Floating Toolbar */}
            <div className="absolute top-[28%] -right-3 z-40 translate-x-12 group-hover:translate-x-0 opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100">
                <ActionToolbar
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                    onShare={onShare}
                    onPrint={onPrint}
                    variant="dark"
                    className="flex flex-col gap-2 glass-dark p-2 rounded-2xl border border-white/10 shadow-2xl backdrop-blur-4xl"
                />
            </div>
        </div>
    );
}
