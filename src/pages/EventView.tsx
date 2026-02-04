import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Calendar, MapPin, ArrowLeft, Printer, Heart } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EventReviews } from '../components/events/EventReviews';
import { EventMediaGallery } from '../components/events/EventMediaGallery';
import { GlobalLightboxProvider, useGlobalLightbox } from '../components/ui/GlobalLightbox';
import type { Event } from '../types/supabase';
import { motion } from 'framer-motion';

const EventContent = ({ event }: { event: Event }) => {
    const { openLightbox } = useGlobalLightbox();

    return (
        <article className="space-y-20 font-inter">
            <header className="space-y-12 text-center py-10 relative">
                {/* Decorative Elements */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-catalog-accent/5 rounded-full blur-[100px] -z-10" />

                <div className="space-y-6">
                    {event.category && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-block px-5 py-2 glass rounded-full text-[10px] font-black tracking-[0.3em] text-catalog-accent uppercase border border-catalog-accent/20 shadow-xl shadow-catalog-accent/5"
                        >
                            {event.category}
                        </motion.div>
                    )}
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.8 }}
                        className="text-6xl md:text-8xl font-outfit font-black text-catalog-text leading-[0.9] tracking-tighter"
                    >
                        {event.title}
                    </motion.h1>
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-wrap items-center justify-center gap-8 text-catalog-text/40 font-outfit text-[11px] font-black uppercase tracking-[0.2em]"
                >
                    <div className="flex items-center gap-3 glass px-4 py-2 rounded-xl border border-black/5 shadow-sm">
                        <Calendar className="w-4 h-4 text-catalog-accent" />
                        {new Date(event.event_date).toLocaleDateString(undefined, { dateStyle: 'long' })}
                    </div>
                    {event.location && (
                        <Link
                            to={`/map?location=${encodeURIComponent(event.location)}`}
                            className="flex items-center gap-3 glass px-4 py-2 rounded-xl border border-black/5 shadow-sm hover:text-catalog-accent transition-all hover:scale-105"
                        >
                            <MapPin className="w-4 h-4 text-catalog-accent" />
                            {event.location}
                        </Link>
                    )}
                </motion.div>

                <div className="w-32 h-[2px] bg-gradient-to-r from-transparent via-catalog-accent/20 to-transparent mx-auto" />
            </header>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 1 }}
                className="prose prose-lg md:prose-xl prose-catalog max-w-none font-serif leading-[2] text-catalog-text/70 selection:bg-catalog-accent/20 first-letter:text-7xl first-letter:font-black first-letter:text-catalog-accent first-letter:mr-3 first-letter:float-left drop-shadow-sm"
                dangerouslySetInnerHTML={{ __html: event.description || '' }}
                onClick={(e: React.MouseEvent) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === 'IMG') {
                        const img = target as HTMLImageElement;
                        openLightbox(0, [{ src: img.src, alt: img.alt }]);
                    }
                }}
            />

            {/* Media Gallery Section */}
            {event.content?.assets && event.content.assets.length > 0 && (
                <section className="space-y-10 pt-20 border-t border-black/5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[11px] font-black text-catalog-text/40 uppercase tracking-[0.4em] font-outfit">Visual Chronicles</h2>
                        <div className="flex-1 mx-8 h-[1px] bg-black/5" />
                    </div>
                    <EventMediaGallery
                        assets={event.content.assets}
                        mode={event.content.galleryMode || 'cards'}
                    />
                </section>
            )}

            {/* Review Section */}
            <div className="pt-20 border-t border-black/5">
                <EventReviews eventId={event.id} />
            </div>

            {/* Premium Archive Footer */}
            <footer className="pt-32 pb-20 text-center space-y-12">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-catalog-accent/40 rounded-full blur-2xl animate-pulse" />
                        <div className="relative w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-2xl border border-black/5">
                            <Heart className="w-8 h-8 text-catalog-accent" />
                        </div>
                    </div>
                    <div className="space-y-3">
                        <p className="font-outfit font-black text-catalog-text uppercase tracking-[0.3em] text-sm">
                            Seal of the Archive
                        </p>
                        <p className="font-serif italic text-2xl text-catalog-text/40 max-w-lg mx-auto leading-relaxed">
                            "This moment is etched into the living legacy of our ancestors, preserved for those yet to come."
                        </p>
                    </div>
                    <div className="w-24 h-px bg-black/5" />
                    <p className="font-outfit text-[9px] font-black text-catalog-text/20 uppercase tracking-[0.5em]">
                        Digital Heritage Protocol v5.0
                    </p>
                </div>
            </footer>
        </article>
    );
};

export function EventView() {
    const { id } = useParams<{ id: string }>();
    const [event, setEvent] = useState<Event | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) fetchEvent(id);
    }, [id]);

    const fetchEvent = async (eventId: string) => {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*')
                .eq('id', eventId)
                .single();

            if (error) throw error;
            setEvent(data);
        } catch (error) {
            console.error('Error fetching event:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!event) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-catalog-bg text-catalog-text">
                <h1 className="text-4xl font-serif mb-4">Story Not Found</h1>
                <Link to="/events">
                    <Button variant="primary">Return to Timeline</Button>
                </Link>
            </div>
        );
    }

    return (
        <GlobalLightboxProvider>
            <div className="min-h-screen bg-white theme-peach theme-rainbow bg-pattern-diverse">
                {/* Minimal Header */}
                <header className="h-16 border-b border-catalog-stone/20 flex items-center justify-between px-6 sticky top-0 bg-white/80 backdrop-blur-md z-10">
                    <div className="flex items-center gap-4">
                        <Link to="/events" className="p-2 hover:bg-catalog-stone/50 rounded-full transition-colors text-catalog-text/60">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <span className="text-sm font-sans uppercase tracking-[0.2em] text-catalog-text/40 font-bold">The Family Archive</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => window.print()}>
                            <Printer className="w-4 h-4 mr-2" /> Print
                        </Button>
                    </div>
                </header>

                <main className="max-w-4xl mx-auto px-6 py-16 md:py-24">
                    <EventContent event={event} />
                </main>
            </div>
        </GlobalLightboxProvider>
    );
}
