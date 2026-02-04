import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { FlipbookViewer } from '../components/viewer/FlipbookViewer';
import { useAlbum } from '../contexts/AlbumContext';
import { useAuth } from '../contexts/AuthContext';
import { SharingDialog } from '../components/sharing/SharingDialog';
import { Share2, Edit3, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function AlbumView() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { album, fetchAlbum, isLoading: loading } = useAlbum();
    const [showSharing, setShowSharing] = useState(false);
    const { userRole } = useAuth();
    const canEdit = userRole === 'admin' || userRole === 'creator';
    const error = null; // We can use context error if we add it, but for now null is fine

    useEffect(() => {
        if (id) {
            fetchAlbum(id);
        }
    }, [id, fetchAlbum]);

    // Real-Time Subscription for the Current Album (Optional, context might eventually handle this)
    useEffect(() => {
        if (!id) return;

        const subscription = supabase
            .channel(`album:${id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'album_pages', filter: `album_id=eq.${id}` }, () => {
                fetchAlbum(id);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [id, fetchAlbum]);


    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="font-serif italic text-catalog-text/70">Opening the archive...</p>
                </div>
            </div>
        );
    }

    if (error || !album) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="text-center p-8 bg-white rounded-2xl shadow-xl border border-red-100 max-w-md mx-auto">
                    <p className="text-red-500 font-medium mb-4">{error || 'Album not found'}</p>
                    <Button onClick={() => navigate('/library')}>Return to Library</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-catalog-bg flex flex-col">
            {/* Header */}
            <div className="bg-white/80 backdrop-blur-md border-b border-catalog-accent/10 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/library')}
                        className="p-2 hover:bg-catalog-stone/50 rounded-full transition-colors text-catalog-text/60 hover:text-catalog-text"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="font-serif text-xl text-catalog-text">{album.title}</h1>
                        <p className="text-xs text-catalog-text/50 uppercase tracking-widest">{album.category}</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSharing(true)}
                        className="gap-2"
                    >
                        <Share2 className="w-4 h-4" />
                        Share
                    </Button>
                    {canEdit && (
                        <Button
                            size="sm"
                            onClick={() => navigate(`/editor/${album.id}`)}
                            className="gap-2"
                        >
                            <Edit3 className="w-4 h-4" />
                            Edit Album
                        </Button>
                    )}
                </div>
            </div>

            {/* Viewer */}
            <FlipbookViewer
                pages={album.pages}
                album={album}
                onClose={() => navigate('/library')}
            />

            {showSharing && (
                <SharingDialog
                    albumId={album.id}
                    title={album.title}
                    onClose={() => setShowSharing(false)}
                />
            )}
        </div>
    );
}
