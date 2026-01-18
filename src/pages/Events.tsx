import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, Plus } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import type { Event } from '../types/supabase';
import { ActionToolbar } from '../components/ui/ActionToolbar';
import { SharingDialog } from '../components/sharing/SharingDialog';
import { FilterBar, type FilterState } from '../components/ui/FilterBar';
import { motion } from 'framer-motion';

export function Events() {
    const { familyId, userRole } = useAuth();
    const navigate = useNavigate();
    const [events, setEvents] = useState<Event[]>([]);
    const [linkedAlbums, setLinkedAlbums] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [creatingAlbumFor, setCreatingAlbumFor] = useState<string | null>(null);
    const [sharingEventId, setSharingEventId] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>({ query: '', category: 'all', year: 'all', location: 'all' });
    const [categories, setCategories] = useState<string[]>([]);
    const [years, setYears] = useState<string[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [searchParams] = useSearchParams();

    const canCreate = userRole === 'admin' || userRole === 'creator';

    useEffect(() => {
        if (familyId) {
            fetchEventsAndAlbums();
        }
    }, [familyId]);

    useEffect(() => {
        const locationParam = searchParams.get('location');
        if (locationParam) {
            setFilters(prev => ({ ...prev, location: locationParam }));
        }
    }, [searchParams]);

    const fetchEventsAndAlbums = async () => {
        if (!familyId) {
            setLoading(false);
            return;
        }
        try {
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('*')
                .eq('family_id', familyId)
                .order('event_date', { ascending: false });

            if (eventsError) throw eventsError;
            const fetchedEvents = (eventsData || []) as any[];
            setEvents(fetchedEvents);

            const { data: albumsData, error: albumsError } = await supabase
                .from('albums')
                .select('id, event_id')
                .eq('family_id', familyId)
                .not('event_id', 'is', null);

            if (albumsError) throw albumsError;

            const albumMap: Record<string, string> = {};
            if (albumsData) {
                ((albumsData as unknown) as { id: string; event_id: string }[]).forEach(album => {
                    if (album.event_id) {
                        albumMap[album.event_id] = album.id;
                    }
                });
            }
            setLinkedAlbums(albumMap);

            // Extract unique categories, years, and locations
            const cats = Array.from(new Set(fetchedEvents.map(e => e.category).filter(Boolean))) as string[];
            const yrs = Array.from(new Set(fetchedEvents.map(e => new Date(e.event_date).getFullYear().toString()))) as string[];
            const locs = Array.from(new Set(fetchedEvents.map(e => e.location).filter(Boolean))) as string[];

            setCategories(cats.sort());
            setYears(yrs.sort((a, b) => b.localeCompare(a)));
            setLocations(locs.sort());
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteEvent = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this moment? This will also disconnect any linked albums.')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('events')
                .delete()
                .eq('id', id);

            if (error) throw error;
            setEvents((prev) => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error('Error deleting event:', error);
            alert('Failed to delete event');
        }
    };

    const handleShareEvent = (id: string) => {
        setSharingEventId(id);
    };

    const handlePrintEvent = async (event: Event) => {
        try {
            const doc = new Blob([`
                <html>
                    <body style="font-family: serif; padding: 40px; line-height: 1.6;">
                        <h1 style="color: #2d2a26;">${event.title}</h1>
                        <p style="color: #999;">${new Date(event.event_date).toLocaleDateString()}</p>
                        ${event.category ? `<p><strong>Category:</strong> ${event.category}</p>` : ''}
                        ${event.location ? `<p><strong>Location:</strong> ${event.location}</p>` : ''}
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                        <div style="font-size: 1.1rem;">${event.description || ''}</div>
                    </body>
                </html>
            `], { type: 'text/html' });

            const url = URL.createObjectURL(doc);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${event.title.replace(/\s+/g, '_')}_Moment.html`;
            a.click();
        } catch (error) {
            console.error('Error printing event:', error);
        }
    };

    const handleCreateAlbum = async (event: Event) => {
        if (!familyId || creatingAlbumFor) return;
        setCreatingAlbumFor(event.id);

        try {
            const { data, error } = await supabase
                .from('albums')
                .insert({
                    family_id: familyId,
                    event_id: event.id,
                    title: event.title,
                    description: event.description,
                    category: event.category,
                    is_published: false
                } as any)
                .select()
                .single();

            if (error) throw error;
            navigate(`/album/${(data as any).id}/edit`);
        } catch (error) {
            console.error('Error creating album:', error);
            setCreatingAlbumFor(null);
        }
    };

    const filteredEvents = events.filter(event => {
        const matchesQuery = !filters.query ||
            event.title.toLowerCase().includes(filters.query.toLowerCase()) ||
            (event.description && event.description.toLowerCase().includes(filters.query.toLowerCase()));

        const matchesCategory = filters.category === 'all' || event.category === filters.category;
        const matchesYear = filters.year === 'all' || new Date(event.event_date).getFullYear().toString() === filters.year;
        const matchesLocation = filters.location === 'all' ||
            (event.location?.trim() === filters.location?.trim());

        return matchesQuery && matchesCategory && matchesYear && matchesLocation;
    });



    const groupedEvents = filteredEvents.reduce((groups: Record<string, Event[]>, event) => {
        const year = new Date(event.event_date).getFullYear().toString();
        if (!groups[year]) groups[year] = [];
        groups[year].push(event);
        return groups;
    }, {});

    const sortedYears = Object.keys(groupedEvents).sort((a, b) => b.localeCompare(a));

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!familyId) {
        return (
            <div className="container-fluid max-w-wide py-20 text-center">
                <Card className="max-w-md mx-auto p-12 space-y-6">
                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-full flex items-center justify-center mx-auto">
                        <Calendar className="w-10 h-10 text-catalog-accent" />
                    </div>
                    <h2 className="text-3xl font-serif text-catalog-text">The Hearth is Quiet</h2>
                    <p className="text-catalog-text/60">
                        Join your family group to see the timeline of shared moments and create your own records.
                    </p>
                    <Button onClick={() => navigate('/settings')} variant="primary" className="w-full">
                        Join Family
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-fade-in w-full px-6 lg:px-12 pb-20">
            <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-5xl font-serif italic text-catalog-text mb-3">The Hearth</h1>
                    <p className="text-lg font-sans text-catalog-text/70 max-w-xl leading-relaxed">
                        The heartbeat of your family's legacy. A chronological journey through the moments that matter most.
                    </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <FilterBar
                        filters={filters}
                        onFilterChange={setFilters}
                        categories={categories}
                        years={years}
                        locations={locations}
                        className="w-full sm:w-auto min-w-[300px]"
                    />
                    {canCreate && (
                        <Button
                            variant="primary"
                            onClick={() => navigate('/event/new')}
                            className="shadow-md hover:shadow-lg transition-all w-full sm:w-auto h-12"
                        >
                            <Plus className="w-5 h-5 mr-2" />
                            Record Moment
                        </Button>
                    )}
                </div>
            </section>

            {events.length === 0 ? (
                <div className="text-center py-20 bg-white/30 rounded-lg border border-catalog-accent/5">
                    <div className="w-20 h-20 bg-catalog-accent/5 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Calendar className="w-8 h-8 text-catalog-accent" />
                    </div>
                    <h3 className="text-2xl font-serif mb-3 text-catalog-text">Your Timeline is Empty</h3>
                    <p className="text-catalog-text/60 max-w-md mx-auto mb-8 font-sans">
                        Every family has a story. Start capturing yours by recording your first significant memory or milestone.
                    </p>
                    {canCreate && (
                        <Button variant="secondary" onClick={() => navigate('/event/new')}>
                            Begin the Journey
                        </Button>
                    )}
                </div>
            ) : (
                <div className="relative space-y-16">
                    {/* Vertical Line */}
                    <div className="absolute left-[20px] top-0 bottom-0 w-px bg-gradient-to-b from-catalog-accent/40 via-catalog-accent/20 to-transparent hidden md:block" />

                    {sortedYears.map((year, yearIndex) => {
                        const YEAR_COLORS = ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'];
                        const yearColor = YEAR_COLORS[yearIndex % YEAR_COLORS.length];

                        return (
                            <div key={year} className="relative space-y-8">
                                {/* Year Indicator */}
                                <div className="flex items-center gap-4 relative z-10">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-serif italic shadow-lg transition-transform hover:scale-110"
                                        style={{ backgroundColor: yearColor }}
                                    >
                                        {year.slice(-2)}
                                    </div>
                                    <h2 className="text-3xl font-serif italic text-catalog-text">{year}</h2>
                                    <div className="flex-1 h-px bg-catalog-accent/10" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-8 md:pl-14">
                                    {groupedEvents[year].map((event, index) => {
                                        const linkedAlbumId = linkedAlbums[event.id];
                                        const titleColor = YEAR_COLORS[(event.title.length + index + yearIndex) % YEAR_COLORS.length];

                                        // Extract image Logic
                                        const assets = (event.content as unknown as { assets: { url: string; type: string }[] })?.assets || [];
                                        let presentationImage = assets.find(a => a.type === 'image')?.url;

                                        if (!presentationImage && event.description) {
                                            const imgMatch = event.description.match(/<img[^>]+src="([^">]+)"/);
                                            if (imgMatch) presentationImage = imgMatch[1];
                                        }

                                        // Fallback placeholder if no image
                                        if (!presentationImage) {
                                            presentationImage = 'https://images.unsplash.com/photo-1526749837599-b4eba9fd855e?auto=format&fit=crop&w=800&q=80';
                                        }

                                        return (
                                            <motion.div
                                                key={event.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ duration: 0.4 }}
                                            >
                                                {/* CodePen Card Implementation with Tailwind */}
                                                <div className="bg-white rounded shadow-[0_20px_40px_-14px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden hover:shadow-2xl transition-all duration-300 group h-full border-2 border-catalog-accent/5 hover:border-catalog-accent/20 relative">
                                                    {/* Card Image */}
                                                    <div
                                                        className="relative overflow-hidden filter contrast-[0.7] transition-all duration-500 group-hover:contrast-100 bg-[#ececec] cursor-pointer"
                                                        onClick={() => window.open(`/event/${event.id}/view`, '_blank')}
                                                    >
                                                        <div
                                                            className="w-full bg-cover bg-center bg-no-repeat pt-[56.25%] sm:pt-[66.6%]"
                                                            style={{ backgroundImage: `url(${presentationImage})` }}
                                                        />
                                                        {event.category && (
                                                            <div className="absolute top-2 right-2 px-2 py-1 bg-white/90 text-[#696969] text-[0.6rem] uppercase tracking-widest font-bold border border-[#cccccc]">
                                                                {event.category}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Card Content */}
                                                    <div className="flex flex-1 flex-col p-6 relative">
                                                        {/* Hover Rainbow Line */}
                                                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-rainbow opacity-0 group-hover:opacity-100 transition-opacity" />

                                                        <div className="cursor-pointer flex-1 flex flex-col" onClick={() => window.open(`/event/${event.id}/view`, '_blank')}>
                                                            <h3
                                                                className="text-2xl font-serif font-medium tracking-wide mb-3 capitalize"
                                                                style={{ color: titleColor }}
                                                            >
                                                                {event.title}
                                                            </h3>

                                                            <div className="text-xs text-[#999999] font-serif italic mb-4 flex flex-wrap items-center gap-2">
                                                                <span className="font-sans font-bold uppercase tracking-widest text-[0.65rem]">
                                                                    {new Date(event.event_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                                                </span>
                                                                {event.location && (
                                                                    <>
                                                                        <span className="not-italic opacity-50">•</span>
                                                                        <button
                                                                            className="hover:text-[#696969] hover:underline transition-colors text-left"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                // Assuming /map or /family-map exists, query param location
                                                                                navigate(`/map?location=${encodeURIComponent(event.location || '')}`);
                                                                            }}
                                                                        >
                                                                            {event.location}
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>

                                                            <div className="flex-1 text-[0.95rem] leading-[1.8] mb-6 text-[#999999] line-clamp-3 font-serif">
                                                                {event.description ? (
                                                                    <div dangerouslySetInnerHTML={{ __html: event.description.replace(/<[^>]+>/g, ' ').substring(0, 150) + (event.description.length > 150 ? '...' : '') }} />
                                                                ) : (
                                                                    <span className="italic opacity-50">No description provided.</span>
                                                                )}
                                                            </div>

                                                        </div>
                                                        {/* Buttons / Actions */}
                                                        <div className="mt-auto pt-4 border-t border-[#f0f0f0] flex items-center justify-between" onClick={(e) => e.stopPropagation()}>

                                                            {/* Left Side: Create/Open Album */}
                                                            <div>
                                                                {linkedAlbumId ? (
                                                                    <button
                                                                        onClick={() => navigate(`/album/${linkedAlbumId}`)}
                                                                        className="text-[0.7rem] bg-[#f8f8f8] hover:bg-[#ececec] text-[#696969] px-3 py-1.5 rounded-sm uppercase tracking-widest font-bold border border-[#e0e0e0] transition-colors"
                                                                    >
                                                                        Open Album
                                                                    </button>
                                                                ) : (
                                                                    canCreate && (
                                                                        <button
                                                                            onClick={() => handleCreateAlbum(event)}
                                                                            disabled={creatingAlbumFor === event.id}
                                                                            className="text-[0.7rem] hover:bg-catalog-accent/10 text-[#999999] hover:text-catalog-accent px-3 py-1.5 rounded-sm uppercase tracking-widest font-bold border border-transparent hover:border-catalog-accent/20 transition-all flex items-center gap-1.5"
                                                                        >
                                                                            {creatingAlbumFor === event.id ? (
                                                                                <span>Creating...</span>
                                                                            ) : (
                                                                                <>
                                                                                    <Plus className="w-3 h-3" />
                                                                                    <span>Create Album</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    )
                                                                )}
                                                            </div>

                                                            {/* Right Side: Toolbar */}
                                                            <div className="opacity-60 hover:opacity-100 transition-opacity">
                                                                <ActionToolbar
                                                                    onEdit={canCreate ? () => navigate(`/event/${event.id}/edit`) : undefined}
                                                                    onDelete={canCreate ? () => handleDeleteEvent(event.id) : undefined}
                                                                    onShare={() => handleShareEvent(event.id)}
                                                                    onPrint={() => handlePrintEvent(event)}
                                                                    className="transform scale-90 origin-right"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {sharingEventId && (
                <SharingDialog
                    eventId={sharingEventId}
                    title={events.find(e => e.id === sharingEventId)?.title || 'Event'}
                    onClose={() => setSharingEventId(null)}
                />
            )}
        </div>
    );
}
