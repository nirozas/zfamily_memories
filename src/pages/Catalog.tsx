import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Grid, List, PlusCircle, Filter } from 'lucide-react';
import { AlbumsGrid } from '../components/catalog/AlbumsGrid';
import { CreateAlbumModal } from '../components/catalog/CreateAlbumModal';
import { SharingDialog } from '../components/sharing/SharingDialog';
import { Button } from '../components/ui/Button';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { printService } from '../services/printService';
import { motion, AnimatePresence } from 'framer-motion';

const eventFilters = ['All', 'Wedding', 'Birthday', 'Holiday', 'Vacation', 'Gathering'];

export function Catalog() {
    const { familyId } = useAuth();
    const navigate = useNavigate();
    const [albums, setAlbums] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [eventFilter, setEventFilter] = useState('All');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [sharingAlbumId, setSharingAlbumId] = useState<string | null>(null);

    const fetchAlbums = async () => {
        if (!familyId) {
            setLoading(false);
            return;
        }
        try {
            const { data: albumData, error: albumError } = await supabase
                .from('albums')
                .select('*')
                .eq('family_id', familyId as string)
                .order('created_at', { ascending: false });

            if (albumError) throw albumError;

            if (!albumData || albumData.length === 0) {
                setAlbums([]);
                return;
            }

            const albumIds = (albumData as any[]).map(a => a.id);
            const { data: pagesData, error: pagesError } = await (supabase.from('album_pages') as any)
                .select('*')
                .in('album_id', albumIds);

            if (pagesError) console.error('Page Sync Error:', pagesError);

            const pagesByAlbum = (pagesData || []).reduce((acc: any, page: any) => {
                if (!acc[page.album_id]) acc[page.album_id] = [];
                acc[page.album_id].push(page);
                return acc;
            }, {});

            const formattedAlbums = albumData.map((album: any) => ({
                ...album,
                cover_url: album.cover_image_url,
                pages: (pagesByAlbum[album.id] || []).sort((a: any, b: any) => (a.page_number || 0) - (b.page_number || 0))
            }));

            setAlbums(formattedAlbums);
        } catch (err) {
            console.error('Fatal Catalog Error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlbums();
        if (!familyId) return;

        const albumSub = supabase
            .channel('public:albums')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'albums', filter: `family_id=eq.${familyId}` }, () => fetchAlbums())
            .subscribe();

        const pageSub = supabase
            .channel('public:album_pages')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'album_pages' }, () => fetchAlbums())
            .subscribe();

        return () => {
            supabase.removeChannel(albumSub);
            supabase.removeChannel(pageSub);
        };
    }, [familyId]);

    const handleEditAlbum = (id: string) => navigate(`/album/${id}/edit`);

    const handleDeleteAlbum = async (id: string) => {
        if (!window.confirm('Are you sure?')) return;
        try {
            const { error } = await supabase.from('albums').delete().eq('id', id);
            if (error) throw error;
            setAlbums(prev => prev.filter(a => a.id !== id));
        } catch (err) {
            alert('Failed to delete');
        }
    };

    const handleShareAlbum = (id: string) => setSharingAlbumId(id);

    const handleDuplicateAlbum = async (id: string) => {
        try {
            const { data, error: rpcError } = await (supabase as any)
                .rpc('duplicate_album_v2', { source_album_id: id, new_title: null })
                .single();

            if (rpcError) throw rpcError;
            if (!data?.success) throw new Error(data?.error_message);
            await fetchAlbums();
        } catch (err: any) {
            alert(`Duplication failed: ${err.message}`);
        }
    };

    const handlePrintAlbum = async (id: string) => {
        const album = albums.find(a => a.id === id);
        if (album) await printService.exportToHTML5(album);
    };

    const filteredAlbums = albums.filter(album => {
        const matchesSearch = album.title.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesEvent = eventFilter === 'All' || album.category === eventFilter;
        return matchesSearch && matchesEvent;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
                <div className="w-16 h-16 border-t-4 border-catalog-accent rounded-full animate-spin" />
                <p className="font-outfit text-catalog-text/40 font-bold uppercase tracking-widest text-xs">Accessing Archives</p>
            </div>
        );
    }

    return (
        <div className="container-fluid max-w-wide space-y-12 pb-24">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-10 pt-10"
            >
                <div className="space-y-6">
                    <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-catalog-accent/10 border border-catalog-accent/10">
                        <span className="w-2 h-2 rounded-full bg-catalog-accent animate-pulse" />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-catalog-accent">Vault Secured</span>
                    </div>
                    <div className="space-y-2">
                        <p className="text-sm font-black text-catalog-accent uppercase tracking-[0.4em] font-outfit">The Collection</p>
                        <h1 className="text-6xl md:text-8xl font-black font-outfit text-catalog-text tracking-tighter leading-none">
                            Family <span className="text-rainbow font-black not-italic">Folios</span>
                        </h1>
                    </div>
                </div>

                <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="shrink-0 h-20 px-12 glass hover:bg-catalog-accent hover:text-white text-catalog-accent font-outfit font-black rounded-[2.5rem] shadow-2xl flex items-center gap-4 transition-all duration-500 hover:-translate-y-2 border border-black/5"
                >
                    <PlusCircle className="w-6 h-6" />
                    <span className="text-xs uppercase tracking-[0.2em]">Initiate New Folio</span>
                </Button>
            </motion.div>

            {/* Toolbar */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6 rounded-[3rem] flex flex-col xl:flex-row gap-8 items-start xl:items-center justify-between sticky top-24 z-40 border border-black/5 shadow-2xl shadow-black/5"
            >
                {/* Search */}
                <div className="relative flex-1 w-full xl:max-w-xl group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-catalog-text/20 group-focus-within:text-catalog-accent transition-colors" />
                    <input
                        type="text"
                        placeholder="Locate memoirs by title or sentiment..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-16 pr-8 h-16 bg-white border border-black/5 rounded-[2rem] focus:outline-none focus:ring-4 focus:ring-catalog-accent/5 focus:border-catalog-accent/30 transition-all font-outfit text-base placeholder:text-catalog-text/10 shadow-inner"
                    />
                </div>

                {/* Filters & Actions */}
                <div className="flex flex-wrap items-center gap-6 w-full xl:w-auto">
                    <div className="flex items-center gap-2 glass p-1.5 rounded-[2rem] border border-black/5 shadow-inner">
                        <div className="p-3 bg-white rounded-xl shadow-sm mr-2">
                            <Filter className="w-4 h-4 text-catalog-accent" />
                        </div>
                        <div className="flex gap-1 pr-2">
                            {eventFilters.map((filter) => (
                                <button
                                    key={filter}
                                    onClick={() => setEventFilter(filter)}
                                    className={cn(
                                        "px-6 py-3 text-[10px] font-black rounded-xl transition-all font-outfit uppercase tracking-widest",
                                        eventFilter === filter
                                            ? "bg-catalog-accent text-white shadow-xl"
                                            : "text-catalog-text/30 hover:text-catalog-text hover:bg-black/5"
                                    )}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex glass rounded-[1.5rem] p-1.5 shadow-inner border border-black/5 shrink-0">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={cn(
                                "p-4 rounded-xl transition-all",
                                viewMode === 'grid' ? "bg-white text-catalog-accent shadow-lg" : "text-catalog-text/20 hover:text-catalog-text"
                            )}
                        >
                            <Grid className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "p-4 rounded-xl transition-all",
                                viewMode === 'list' ? "bg-white text-catalog-accent shadow-lg" : "text-catalog-text/20 hover:text-catalog-text"
                            )}
                        >
                            <List className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Albums Grid Section */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={viewMode + eventFilter + searchQuery}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    <AlbumsGrid
                        albums={filteredAlbums}
                        viewMode={viewMode}
                        onEdit={handleEditAlbum}
                        onDelete={handleDeleteAlbum}
                        onDuplicate={handleDuplicateAlbum}
                        onShare={handleShareAlbum}
                        onPrint={handlePrintAlbum}
                    />

                    {filteredAlbums.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-center space-y-6">
                            <div className="w-24 h-24 bg-catalog-accent/5 rounded-full flex items-center justify-center text-catalog-accent/30">
                                <Search className="w-10 h-10" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-outfit font-black text-catalog-text">No Archives Found</h3>
                                <p className="text-catalog-text/40 font-outfit max-w-sm">Adjust your filters or start a new collection to fill your library.</p>
                            </div>
                            <Button variant="ghost" onClick={() => { setSearchQuery(''); setEventFilter('All'); }} className="font-outfit uppercase tracking-widest font-bold text-xs">Clear All Filters</Button>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            <CreateAlbumModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

            {sharingAlbumId && (
                <SharingDialog
                    albumId={sharingAlbumId}
                    title={albums.find(a => a.id === sharingAlbumId)?.title || 'Album'}
                    onClose={() => setSharingAlbumId(null)}
                />
            )}
        </div>
    );
}
