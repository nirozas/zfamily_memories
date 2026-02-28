import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import MediaStackViewer, { type MediaItem } from '../components/media/MediaStackViewer';
import { Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function SharedStackView() {
    const { token } = useParams<{ token: string }>();

    const [stack, setStack] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('Invalid link');
            setLoading(false);
            return;
        }

        const fetchSharedStack = async () => {
            try {
                // Call the Postgres function we created
                const { data, error: fnError } = await (supabase.rpc as any)('get_shared_stack', {
                    token_param: token
                });

                if (fnError || !data) {
                    throw new Error(fnError?.message || 'Link is invalid or has expired after 48 hours.');
                }

                setStack(data);
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Failed to load shared stack.');
            } finally {
                setLoading(false);
            }
        };
        fetchSharedStack();
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
                <Loader2 className="w-10 h-10 text-catalog-accent animate-spin mb-4" />
                <p className="text-white font-bold">Loading Memory Stack...</p>
            </div>
        );
    }

    if (error || !stack) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-3xl text-center">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-6" />
                    <h2 className="text-2xl font-black text-white mb-3">Link Expired</h2>
                    <p className="text-gray-300 font-medium mb-8 leading-relaxed">
                        {error}
                        <br /><br />
                        For security reasons, shared stack links automatically expire within 48 hours and cannot grant access to the main application portfolio.
                    </p>
                    <Button variant="primary" onClick={() => window.location.href = '/'} className="w-full">
                        Close
                    </Button>
                </div>
            </div>
        );
    }

    // Convert stack to MediaStackViewer format
    const viewerItems: MediaItem[] = (stack.media_items || []).map((item: any) => ({
        id: item.id,
        url: item.url,
        type: (item.type === 'video' || item.url?.match(/\.(mp4|mov|webm|mkv|avi)(\?.*)?$/i)) ? 'video' : 'image',
        date: new Date(stack.created_at),
        caption: item.caption || item.textOverlay,
        filename: item.filename,
        duration: item.duration,
        cropMode: item.cropMode,
        captionRotation: item.captionRotation,
        captionX: item.captionX,
        captionY: item.captionY,
        captionFontSize: item.captionFontSize,
        captionColor: item.captionColor,
        textLayers: item.textLayers,
        stickerLayers: item.stickerLayers,
        googlePhotoId: item.googlePhotoId,
    }));

    return (
        <MediaStackViewer
            items={viewerItems}
            initialIndex={0}
            backgroundMusicUrl={stack.music_url || undefined}
            onClose={() => {
                // Exit cleanly out of the website since they have no auth rights.
                window.location.href = 'https://google.com';
            }}
            readOnly={true} // Add a signal so Share/Edit icons aren't rendered inside
            shareToken={token}
        />
    );
}
