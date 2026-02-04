import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FlipbookViewer } from '../components/viewer/FlipbookViewer';
import { validateShareLink } from '../services/sharing';
import { AlbumDataService } from '../services/albumDataService';
import { unifiedAlbumToContextAlbum } from '../lib/albumAdapters';
import { type Album } from '../contexts/AlbumContext';

export function SharedAlbumView() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [album, setAlbum] = useState<Album | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSharedAlbum = async () => {
            if (!token) return;

            // 1. Validate Token
            const { valid, albumId, error: validationError } = await validateShareLink(token);

            if (!valid || !albumId) {
                setError(validationError || 'Invalid or expired shared link');
                setLoading(false);
                return;
            }

            // 2. Fetch Album Data
            // We need to bypass RLS here if the user is anonymous. 
            // In a production app, we would use a secure RPC function like 'get_shared_album(token)'.
            // For now, we will try to fetch expecting the RLS to allow "public" reading if there's a token?
            // Actually, the simplest implementation for now is to rely on 'is_published' or similar,
            // OR we assume the user is just a 'viewer'.
            // However, since we haven't implemented 'get_shared_album', we might hit RLS issues if we are not logged in.
            // Let's assume for this step that we are fetching normally. If RLS blocks it, we know what to fix later.

            try {
                console.log(`[SharedAlbumView] Fetching unified shared album: ${albumId}`);
                const unifiedAlbum = await AlbumDataService.fetchAlbum(albumId);

                if (!unifiedAlbum) {
                    throw new Error('Album not found or failed to load');
                }

                const album = unifiedAlbumToContextAlbum(unifiedAlbum);
                setAlbum(album);
            } catch (err: any) {
                console.error('Error loading shared album:', err);
                setError(err.message || 'Failed to load album');
            } finally {
                setLoading(false);
            }
        };

        fetchSharedAlbum();
    }, [token]);

    const handleClose = () => {
        // For shared view, close might just redirect to home or login
        navigate('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="font-serif italic text-white/70">Opening shared album...</p>
                </div>
            </div>
        );
    }

    if (error || !album) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center text-white max-w-md p-6">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-serif mb-2">Access Denied</h2>
                    <p className="text-white/60 mb-6">{error || 'This link may have expired or is invalid.'}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2 bg-catalog-accent text-white rounded-sm hover:bg-catalog-accent/90 transition-colors"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
            <FlipbookViewer
                pages={album.pages}
                album={album}
                onClose={handleClose}
            />
        </div>
    );
}
