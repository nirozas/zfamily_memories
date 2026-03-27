import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Calendar, MapPin, Heart, Clock, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EventMediaGallery } from '../components/events/EventMediaGallery';
import type { Event } from '../types/supabase';
import { GooglePhotosService } from '../services/googlePhotos';

export function SharedEventView() {
    const { token } = useParams<{ token: string }>();
    const [event, setEvent] = useState<Event | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token) {
            setError('Invalid link');
            setLoading(false);
            return;
        }

        const fetchSharedEvent = async () => {
            try {
                // Call the universal sharing RPC
                const { data, error: fnError } = await (supabase.rpc as any)('get_shared_content', {
                    token_param: token
                });

                if (fnError || !data || data.success === false) {
                    throw new Error(fnError?.message || data?.error || 'Link is invalid or has expired after 48 hours.');
                }

                if (data.type !== 'event' || !data.event) {
                    throw new Error('This link is not associated with a story.');
                }

                setEvent(data.event);
            } catch (err: any) {
                console.error('Error fetching shared event:', err);
                setError(err.message || 'An unexpected error occurred.');
            } finally {
                setLoading(false);
            }
        };

        fetchSharedEvent();
    }, [token]);

    // Resolve Google Photo URLs in description HTML
    const resolvedDescription = (() => {
        if (!event?.description) return '';

        // Find <img> tags and replace src with proxy URLs
        return event.description.replace(/<img[^>]+src="([^">]+)"([^>]*)>/g, (match, src, rest) => {
            const idMatch = rest.match(/data-google-id="([^"]+)"/);
            const googleId = idMatch ? idMatch[1] : undefined;
            const isGoogleUrl = src.includes('googleusercontent.com') || src.includes('photoslibrary.googleapis.com');

            if (googleId || isGoogleUrl) {
                // Pass the share token to the proxy so it can refresh the creator's credentials
                const proxyUrl = GooglePhotosService.getProxyUrl(googleId ? '' : src, null, token, googleId);
                return `<img src="${proxyUrl}" ${rest} crossOrigin="anonymous">`;
            }
            return match;
        });
    })();

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !event) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-catalog-bg text-catalog-text p-6 text-center">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h1 className="text-3xl font-serif mb-2">Access Restricted</h1>
                <p className="text-catalog-text/60 mb-8 max-w-sm">
                    {error || 'This story is private or the link has expired.'}
                </p>
                <div className="flex gap-4">
                    <Link to="/login">
                        <Button variant="primary">Family Sign In</Button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Minimal Header */}
            <header className="h-16 border-b border-catalog-stone/20 flex items-center justify-center px-6 sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-sans uppercase tracking-[0.2em] text-catalog-text/40 font-bold">A Shared Legacy</span>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-6 py-16 md:py-24">
                <div className="mb-12 flex justify-center">
                    <div className="flex items-center gap-2 px-3 py-1 bg-catalog-accent/5 text-catalog-accent text-[10px] font-bold uppercase tracking-widest rounded-full border border-catalog-accent/10">
                        <Clock className="w-3 h-3" /> Temporary Guest Access
                    </div>
                </div>

                {/* Story Hero */}
                <article className="space-y-12">
                    <header className="space-y-8 text-center">
                        <div className="space-y-4">
                            {event.category && (
                                <span className="inline-block px-4 py-1 text-xs font-bold tracking-[0.3em] text-catalog-accent uppercase bg-catalog-accent/5 rounded-full">
                                    {event.category}
                                </span>
                            )}
                            <h1 className="text-5xl md:text-7xl font-serif text-catalog-text leading-tight">
                                {event.title}
                            </h1>
                        </div>

                        <div className="flex flex-wrap items-center justify-center gap-6 text-catalog-text/50 font-sans text-sm tracking-wide">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-catalog-accent" />
                                {new Date(event.event_date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                            </div>
                            {event.location && (
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-catalog-accent" />
                                    {event.location}
                                </div>
                            )}
                        </div>

                        <div className="w-24 h-px bg-catalog-accent/20 mx-auto" />
                    </header>

                    <div
                        className="prose prose-lg md:prose-xl prose-catalog max-w-none font-serif leading-relaxed text-catalog-text/80"
                        dangerouslySetInnerHTML={{ __html: resolvedDescription }}
                    />

                    {/* Media Gallery */}
                    {event.content?.assets && event.content.assets.length > 0 && (
                        <EventMediaGallery
                            assets={event.content.assets}
                            mode={event.content.galleryMode || 'cards'}
                        />
                    )}

                    {/* Footer */}
                    <footer className="pt-16 mt-16 border-t border-catalog-stone/20 text-center space-y-8">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 bg-catalog-accent/10 rounded-full flex items-center justify-center">
                                <Heart className="w-6 h-6 text-catalog-accent" />
                            </div>
                            <p className="font-serif italic text-xl text-catalog-text/60">
                                This memory was shared with you from the Zoabi Family Archive.
                            </p>
                        </div>
                    </footer>
                </article>
            </main>
        </div>
    );
}
