import { Link } from 'react-router-dom';
import { Calendar, MapPin, BookOpen } from 'lucide-react';
import { ActionToolbar } from '../ui/ActionToolbar';
import { AlbumPage } from '../viewer/AlbumPage';
import { cn, slugify } from '../../lib/utils';
import { useState, useRef, useEffect } from 'react';

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

const getCategoryStyles = (cat: string) => {
    const c = (cat || 'Memory').toLowerCase();
    if (c.includes('wedding')) return 'bg-rose-100/90 text-rose-900 border-rose-300 shadow-rose-200/50';
    if (c.includes('birthday')) return 'bg-amber-100/90 text-amber-900 border-amber-300 shadow-amber-200/50';
    if (c.includes('holiday')) return 'bg-emerald-100/90 text-emerald-900 border-emerald-300 shadow-emerald-200/50';
    if (c.includes('vacation')) return 'bg-sky-100/90 text-sky-900 border-sky-300 shadow-sky-200/50';
    if (c.includes('gathering')) return 'bg-violet-100/90 text-violet-900 border-violet-300 shadow-violet-200/50';
    return 'bg-slate-100/90 text-slate-900 border-slate-300 shadow-slate-200/50';
};

export function AlbumCard(props: AlbumCardProps) {
    const { title, cover_url, category, created_at, pages, location, config, onEdit, onDelete, onDuplicate, onShare, onPrint } = props;

    const pageCount = pages?.length || 0;
    const albumCategory = category || 'Memory';
    const loc = location || config?.location;

    // Date Logic
    const formattedDate = (() => {
        if (config?.startDate) return new Date(config.startDate).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
        return new Date(created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    })();

    const dims = config?.dimensions || { width: 800, height: 1028.5 };
    const aspectRatio = `${dims.width} / ${dims.height}`;


    const [scale, setScale] = useState(0.2);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const update = () => {
            const rect = containerRef.current!.getBoundingClientRect();
            if (rect.width > 0) {
                setScale(rect.width / dims.width);
            }
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [dims.width]);

    return (
        <div className="flex flex-col group/album relative w-full h-full">
            <div
                ref={containerRef}
                className="relative group w-full transition-all duration-700 hover-lift active:scale-[0.98] shadow-2xl rounded-[2.5rem] overflow-hidden bg-white ring-1 ring-black/5"
                style={{ aspectRatio } as any}
            >
                <Link to={`/album/${slugify(title)}`} className="block w-full h-full no-underline relative group/card">
                    {/* 1. Flat Snapshot Preview (High Fidelity) */}
                    <div className="absolute inset-0 z-0">
                        {cover_url ? (
                            <div className="w-full h-full overflow-hidden bg-white">
                                <img
                                    src={cover_url}
                                    alt={title}
                                    className="w-full h-full object-cover transition-transform duration-1000 group-hover/card:scale-105"
                                />
                            </div>
                        ) : pages && pages.length > 0 ? (
                            <div className="w-full h-full relative overflow-hidden bg-white">
                                <div
                                    className="absolute top-1/2 left-1/2 transition-transform duration-1000 group-hover/card:scale-[1.05]"
                                    style={{
                                        width: `${dims.width}px`,
                                        height: `${dims.height}px`,
                                        transform: `translate(-50%, -50%) scale(${scale})`,
                                        transformOrigin: 'center center'
                                    }}
                                >
                                    <AlbumPage
                                        page={pages[0] as any}
                                        dimensions={dims}
                                        side="single"
                                        isCover={true}
                                        onVideoClick={() => { }}
                                        showPageNumber={false}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-zinc-50">
                                <BookOpen className="w-12 h-12 text-black/5" />
                            </div>
                        )}
                    </div>

                    {/* 2. Interactive Shine */}
                    <div className="absolute inset-0 z-20 opacity-0 group-hover/card:opacity-100 transition-opacity duration-1000 pointer-events-none">
                        <div className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] bg-gradient-to-br from-white/20 via-transparent to-transparent rotate-12 transform group-hover/card:animate-shine" />
                    </div>

                    {/* 3. Minimal Badge Overlay */}
                    <div className="absolute top-5 left-5 z-30 pointer-events-none">
                        <div className={cn(
                            "px-3 py-1.5 backdrop-blur-md text-[8px] font-black rounded-lg uppercase tracking-[0.2em] border shadow-md",
                            getCategoryStyles(albumCategory)
                        )}>
                            {albumCategory}
                        </div>
                    </div>
                </Link>

                {/* 4. Action Toolbar */}
                <div className="absolute bottom-5 right-5 z-40 opacity-0 group-hover/album:opacity-100 transition-all duration-500 translate-y-2 group-hover/album:translate-y-0">
                    <ActionToolbar
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onDuplicate={onDuplicate}
                        onShare={onShare}
                        onPrint={onPrint}
                        variant="dark"
                        className="bg-zinc-950/90 backdrop-blur-md p-1 rounded-2xl border border-white/10 shadow-2xl flex items-center gap-1 scale-90 hover:scale-100 transition-transform"
                    />
                </div>
            </div>

            {/* 5. Metadata BELOW the Cover (Distraction-Free) */}
            <div className="mt-6 px-1 space-y-3 text-catalog-text text-center">
                <div className="space-y-1">
                    <h3 className="text-xl font-black leading-tight tracking-premium transition-colors duration-300 group-hover/album:text-catalog-accent truncate px-2">
                        {title}
                    </h3>

                    <div className="flex items-center justify-center gap-4 text-[10px] text-catalog-text/60 uppercase tracking-widest font-black">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="w-2.5 h-2.5 opacity-50" />
                            <span>{formattedDate}</span>
                        </div>
                        <div className="w-1 h-1 bg-catalog-text/10 rounded-full" />
                        <div className="flex items-center gap-1.5">
                            <BookOpen className="w-2.5 h-2.5 opacity-50" />
                            <span>{pageCount} Chapters</span>
                        </div>
                    </div>
                </div>

                {loc && (
                    <div className="flex justify-center">
                        <button
                            className="flex items-center justify-center gap-1.5 px-3 py-1 bg-black/[0.03] hover:bg-black/[0.06] border border-black/5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all group/loc max-w-[90%]"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                window.open(`/map?location=${encodeURIComponent(loc)}`, '_blank');
                            }}
                        >
                            <MapPin className="w-2.5 h-2.5 text-catalog-accent group-hover/loc:animate-bounce" />
                            <span className="truncate opacity-80 group-hover/loc:opacity-100 transition-opacity">{loc}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
