import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, Clock, MapPin, Grid, List, Search, Filter, Layout, ChevronDown } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface CalendarEvent {
    id: string;
    title: string;
    date: Date;
    endDate?: Date;
    type: 'album' | 'event';
    description?: string;
    location?: string;
    color: string;
    image?: string;
}

type ViewMode = 'month' | 'year' | 'timeline';
type FilterType = 'all' | 'album' | 'event';

export function Calendar() {
    const { familyId } = useAuth();
    const navigate = useNavigate();
    const [today] = useState(new Date());
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);

    // View & Filter State
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<FilterType>('all');
    const [showSelector, setShowSelector] = useState(false);

    // Helpers
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const PASTEL_COLORS = {
        album: '#C7CEEA', // Blue-ish
        event: '#FFB7B2', // Red-ish
        highlight: '#B5EAD7', // Green-ish
        today: '#FFDAC1' // Peach
    };

    useEffect(() => {
        fetchData();
    }, [familyId]);

    const fetchData = async () => {
        if (!familyId) {
            setLoading(false);
            return;
        }

        try {
            // Fetch Albums
            const { data: albumsData } = await supabase
                .from('albums')
                .select('*')
                .eq('family_id', familyId);

            // Fetch Events
            const { data: eventsData } = await supabase
                .from('events')
                .select('*')
                .eq('family_id', familyId);

            const normalizedEvents: CalendarEvent[] = [];

            // Process Albums
            (albumsData || []).forEach((album: any) => {
                const config = album.config || {};
                const dateStr = config.startDate || album.created_at;
                if (!dateStr) return;

                normalizedEvents.push({
                    id: album.id,
                    title: album.title,
                    date: new Date(dateStr),
                    endDate: config.endDate ? new Date(config.endDate) : undefined,
                    type: 'album',
                    description: album.description,
                    location: config.location || album.location,
                    color: PASTEL_COLORS.album,
                    image: album.cover_image_url
                });
            });

            // Process Events
            (eventsData || []).forEach((event: any) => {
                if (!event.event_date) return;

                let image = null;
                if (event.content && typeof event.content === 'object' && event.content.assets) {
                    image = event.content.assets.find((a: any) => a.type === 'image')?.url;
                }
                if (!image && event.description) {
                    const match = event.description.match(/<img[^>]+src="([^">]+)"/);
                    if (match) image = match[1];
                }

                normalizedEvents.push({
                    id: event.id,
                    title: event.title,
                    date: new Date(event.event_date),
                    endDate: event.end_date ? new Date(event.end_date) : undefined,
                    type: 'event',
                    description: event.description,
                    location: event.location,
                    color: PASTEL_COLORS.event,
                    image
                });
            });

            setEvents(normalizedEvents);
        } catch (err) {
            console.error('Error fetching calendar data:', err);
        } finally {
            setLoading(false);
        }
    };

    // Derived State: Filtered Events
    const filteredEvents = useMemo(() => {
        return events.filter(e => {
            const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (e.description && e.description.toLowerCase().includes(searchQuery.toLowerCase()));
            const matchesType = filterType === 'all' || e.type === filterType;
            return matchesSearch && matchesType;
        });
    }, [events, searchQuery, filterType]);

    // Navigation
    const nextPeriod = () => {
        if (viewMode === 'month') setCurrentDate(new Date(year, month + 1, 1));
        if (viewMode === 'year') setCurrentDate(new Date(year + 1, 0, 1));
        if (viewMode === 'timeline') setCurrentDate(new Date(year + 5, 0, 1));
    };

    const prevPeriod = () => {
        if (viewMode === 'month') setCurrentDate(new Date(year, month - 1, 1));
        if (viewMode === 'year') setCurrentDate(new Date(year - 1, 0, 1));
        if (viewMode === 'timeline') setCurrentDate(new Date(year - 5, 0, 1));
    };

    const isSameDay = (d1: Date, d2: Date) => {
        return d1.getDate() === d2.getDate() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getFullYear() === d2.getFullYear();
    };

    const navToEvent = (evt: CalendarEvent) => {
        if (evt.type === 'album') navigate(`/album/${evt.id}`);
        else navigate(`/event/${evt.id}/view`);
    };

    // --- Sub-Components for Different Views ---

    const MonthView = () => {
        const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
        const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

        const daysInMonth = getDaysInMonth(year, month);
        const startDay = getFirstDayOfMonth(year, month);
        const calendarDays = [];
        for (let i = 0; i < startDay; i++) calendarDays.push(null);
        for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(year, month, i));

        const getEventsForDate = (d: Date) => {
            return filteredEvents.filter(e => {
                const start = new Date(e.date.getFullYear(), e.date.getMonth(), e.date.getDate());
                const end = e.endDate
                    ? new Date(e.endDate.getFullYear(), e.endDate.getMonth(), e.endDate.getDate())
                    : start;
                const current = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                return current >= start && current <= end;
            });
        };

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full animate-fade-in">
                {/* Calendar Grid */}
                <Card className="lg:col-span-2 p-6 min-h-[500px]">
                    <div className="grid grid-cols-7 mb-4">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-xs font-bold uppercase tracking-widest text-catalog-text/40 pb-2">
                                {day}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 auto-rows-[minmax(100px,1fr)]">
                        {calendarDays.map((date, idx) => {
                            if (!date) return <div key={`empty-${idx}`} className="bg-transparent" />;

                            const dayEvents = getEventsForDate(date);
                            const isToday = isSameDay(date, today);
                            const isSelected = isSameDay(date, selectedDate);

                            return (
                                <div
                                    key={date.toISOString()}
                                    onClick={() => setSelectedDate(date)}
                                    className={cn(
                                        "relative border rounded-lg p-1 transition-all cursor-pointer flex flex-col justify-start group overflow-hidden bg-white/50 hover:bg-white hover:shadow-md",
                                        isSelected
                                            ? "border-catalog-accent ring-1 ring-catalog-accent/20"
                                            : "border-transparent",
                                        isToday && !isSelected && "bg-orange-50/30"
                                    )}
                                >
                                    <span className={cn(
                                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1",
                                        isToday ? "bg-orange-400 text-white" : "text-catalog-text/70"
                                    )}>
                                        {date.getDate()}
                                    </span>

                                    <div className="flex flex-col gap-1 w-full overflow-hidden">
                                        {dayEvents.slice(0, 4).map((evt, i) => {
                                            const start = new Date(evt.date.getFullYear(), evt.date.getMonth(), evt.date.getDate());
                                            const end = evt.endDate
                                                ? new Date(evt.endDate.getFullYear(), evt.endDate.getMonth(), evt.endDate.getDate())
                                                : start;
                                            const current = new Date(date.getFullYear(), date.getMonth(), date.getDate());

                                            const isStart = current.getTime() === start.getTime();
                                            const isEnd = current.getTime() === end.getTime();
                                            const isSingleDay = start.getTime() === end.getTime();

                                            return (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "h-1.5 md:h-2 w-full text-[0px]",
                                                        isSingleDay ? "rounded-full mx-auto w-1.5 md:w-2" : "",
                                                        !isSingleDay && isStart ? "rounded-l-full ml-1" : "",
                                                        !isSingleDay && isEnd ? "rounded-r-full mr-1" : "",
                                                        !isSingleDay && !isStart && !isEnd ? "rounded-none" : ""
                                                    )}
                                                    style={{ backgroundColor: evt.color }}
                                                    title={evt.title}
                                                />
                                            );
                                        })}
                                        {dayEvents.length > 4 && (
                                            <span className="text-[8px] text-gray-400 text-center leading-none">+{dayEvents.length - 4}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>

                {/* Agenda View */}
                <div className="flex flex-col gap-6">
                    <Card className="flex-1 p-6 bg-white/80 backdrop-blur-sm border-l-4 border-l-catalog-accent overflow-auto max-h-[600px]">
                        <h3 className="text-xl font-serif font-bold text-catalog-text mb-4 border-b pb-2 sticky top-0 bg-white/95 z-10">
                            {MONTH_NAMES[month]} {year} Highlights
                        </h3>
                        {(() => {
                            // Filter events for current view
                            const monthEvents = filteredEvents
                                .filter(e => e.date.getMonth() === month && e.date.getFullYear() === year)
                                .sort((a, b) => a.date.getTime() - b.date.getTime());

                            if (monthEvents.length === 0) {
                                return (
                                    <div className="text-center opacity-50 py-8">
                                        <Clock className="w-8 h-8 mx-auto mb-2 text-catalog-accent/50" />
                                        <p>No moments recorded for this month.</p>
                                    </div>
                                );
                            }

                            return (
                                <div className="space-y-4">
                                    {monthEvents.map(evt => {
                                        const isSelected = isSameDay(evt.date, selectedDate);
                                        return (
                                            <motion.div
                                                key={evt.id}
                                                initial={{ opacity: 0, x: 20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navToEvent(evt);
                                                }}
                                                className={cn(
                                                    "flex gap-4 p-3 rounded-lg transition-all border cursor-pointer group hover:shadow-md",
                                                    isSelected
                                                        ? "bg-catalog-accent/5 border-catalog-accent/30 ring-1 ring-catalog-accent/20"
                                                        : "bg-white border-transparent hover:border-gray-100"
                                                )}
                                            >
                                                <div className="shrink-0 pt-1 flex flex-col items-center">
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-1">{SHORT_MONTHS[evt.date.getMonth()]}</span>
                                                    <span className={cn(
                                                        "text-lg font-bold leading-none",
                                                        isSelected ? "text-catalog-accent" : "text-gray-700"
                                                    )}>{evt.date.getDate()}</span>
                                                </div>
                                                <div className="flex-1 min-w-0 border-l pl-3 border-gray-100">
                                                    <h4 className="font-bold text-catalog-text truncate group-hover:text-catalog-accent transition-colors">
                                                        {evt.title}
                                                    </h4>
                                                    {evt.location && (
                                                        <div className="flex items-center gap-1 text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                                                            <MapPin className="w-3 h-3" />
                                                            {evt.location}
                                                        </div>
                                                    )}
                                                    <div className="mt-2 flex gap-2">
                                                        {evt.type === 'album' ?
                                                            <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Album</span> :
                                                            <span className="text-[9px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">Event</span>
                                                        }
                                                    </div>
                                                </div>
                                            </motion.div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </Card>
                </div>
            </div>
        );
    };

    const YearView = () => {
        // Grid of 12 months
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-fade-in">
                {MONTH_NAMES.map((mName, mIdx) => {
                    // Get events for this month
                    const monthEvents = filteredEvents.filter(e => e.date.getFullYear() === year && e.date.getMonth() === mIdx);

                    return (
                        <Card key={mName} className="p-4 hover:shadow-lg transition-shadow relative overflow-hidden group">
                            <h3 className="font-bold text-lg mb-2 text-catalog-text/80">{mName}</h3>
                            <div className="min-h-[100px] bg-gray-50/50 rounded-lg p-2 space-y-1">
                                {monthEvents.slice(0, 5).map(evt => (
                                    <div
                                        key={evt.id}
                                        onClick={() => navToEvent(evt)}
                                        className="text-xs truncate px-2 py-1 rounded bg-white border border-gray-100 cursor-pointer hover:bg-white hover:border-catalog-accent/30 hover:text-catalog-accent transition-colors flex items-center gap-2"
                                    >
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: evt.color }} />
                                        {evt.title}
                                    </div>
                                ))}
                                {monthEvents.length > 5 && (
                                    <div className="text-[10px] text-gray-400 text-center pt-1">+{monthEvents.length - 5} more</div>
                                )}
                                {monthEvents.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-[10px] text-gray-300 italic">
                                        No events
                                    </div>
                                )}
                            </div>
                        </Card>
                    );
                })}
            </div>
        );
    };

    const TimelineView = () => {
        // 5 Years: Current Year - 2 to Current Year + 2
        const startYear = year - 2;
        const years = [startYear, startYear + 1, startYear + 2, startYear + 3, startYear + 4];

        return (
            <div className="space-y-8 animate-fade-in overflow-x-auto pb-4">
                {years.map(y => (
                    <div key={y} className="min-w-[1000px]">
                        <div className="flex items-center gap-4 mb-2 sticky left-0 bg-catalog-bg z-10">
                            <h3 className="text-2xl font-serif font-black text-catalog-text/20">{y}</h3>
                            <div className="h-[1px] bg-catalog-text/10 flex-1" />
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                            {SHORT_MONTHS.map((mShort, mIdx) => {
                                const monthEvents = filteredEvents.filter(e => e.date.getFullYear() === y && e.date.getMonth() === mIdx);
                                return (
                                    <div key={`${y}-${mIdx}`} className="space-y-1">
                                        <div className="text-[10px] uppercase font-bold text-gray-400 pl-1">{mShort}</div>
                                        <div className="min-h-[120px] bg-white border border-gray-100 rounded-md p-1 space-y-1 hover:border-catalog-accent/30 transition-colors">
                                            {monthEvents.map(evt => (
                                                <div
                                                    key={evt.id}
                                                    onClick={() => navToEvent(evt)}
                                                    className="group/item relative text-[9px] leading-tight p-1 rounded bg-gray-50 hover:bg-white cursor-pointer border border-transparent hover:shadow-sm"
                                                    title={evt.title}
                                                >
                                                    <div className="font-bold truncate text-catalog-text group-hover/item:text-catalog-accent">{evt.title}</div>
                                                    <div className="w-full h-0.5 mt-0.5 rounded-full opacity-50" style={{ backgroundColor: evt.color }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="container-fluid max-w-wide space-y-6 pb-12 px-4 md:px-6">
            {/* Header & Controls */}
            <div className="flex flex-col gap-6">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <h1 className="text-4xl font-serif italic text-catalog-text">Family Calendar</h1>
                        <p className="text-sm font-sans text-catalog-text/70">
                            Explore moments across time.
                        </p>
                    </div>

                    {/* Controls Group */}
                    <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-xl shadow-sm border border-catalog-accent/10">
                        {/* Period Nav */}
                        <div className="flex items-center gap-2 pr-2 border-r border-gray-100 relative">
                            <button onClick={prevPeriod} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                            <div className="relative group">
                                <button
                                    onClick={() => setShowSelector(!showSelector)}
                                    className="text-sm font-bold min-w-[120px] text-center px-2 py-1 rounded hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 active:scale-95"
                                >
                                    {viewMode === 'month' && `${MONTH_NAMES[month]} ${year}`}
                                    {viewMode === 'year' && `${year}`}
                                    {viewMode === 'timeline' && `${year - 2} - ${year + 2}`}
                                    <ChevronDown className={cn("w-3 h-3 transition-transform", showSelector && "rotate-180")} />
                                </button>

                                <AnimatePresence>
                                    {showSelector && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowSelector(false)} />
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 p-4 bg-white rounded-2xl shadow-2xl border border-catalog-accent/10 z-50 min-w-[300px]"
                                            >
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div className="space-y-2">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/40">Select Month</label>
                                                        <div className="grid grid-cols-3 gap-1">
                                                            {MONTH_NAMES.map((m, i) => (
                                                                <button
                                                                    key={m}
                                                                    onClick={() => {
                                                                        setCurrentDate(new Date(year, i, 1));
                                                                        setShowSelector(false);
                                                                    }}
                                                                    className={cn(
                                                                        "text-[10px] py-2 rounded-lg transition-all",
                                                                        month === i ? "bg-catalog-accent text-white shadow-md" : "hover:bg-catalog-accent/10 text-catalog-text/60"
                                                                    )}
                                                                >
                                                                    {SHORT_MONTHS[i]}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 border-l pl-6 border-gray-100">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-catalog-text/40">Select Year</label>
                                                        <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                                            {Array.from({ length: 50 }, (_, i) => year + 5 - i).map(y => (
                                                                <button
                                                                    key={y}
                                                                    onClick={() => {
                                                                        setCurrentDate(new Date(y, month, 1));
                                                                        setShowSelector(false);
                                                                    }}
                                                                    className={cn(
                                                                        "text-[10px] py-1.5 px-3 rounded-lg text-left transition-all",
                                                                        year === y ? "bg-catalog-accent text-white shadow-md" : "hover:bg-catalog-accent/10 text-catalog-text/60"
                                                                    )}
                                                                >
                                                                    {y}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                            <button onClick={nextPeriod} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight className="w-4 h-4" /></button>
                        </div>

                        {/* View Switcher */}
                        <div className="flex items-center bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('month')}
                                className={cn("p-1.5 rounded-md transition-all", viewMode === 'month' ? "bg-white shadow text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                                title="Month View"
                            >
                                <Grid className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('year')}
                                className={cn("p-1.5 rounded-md transition-all", viewMode === 'year' ? "bg-white shadow text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                                title="Year View"
                            >
                                <Layout className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setViewMode('timeline')}
                                className={cn("p-1.5 rounded-md transition-all", viewMode === 'timeline' ? "bg-white shadow text-catalog-accent" : "text-gray-400 hover:text-gray-600")}
                                title="5-Year Timeline"
                            >
                                <List className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-4 items-center bg-white/50 backdrop-blur p-4 rounded-xl border border-white shadow-sm">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search memories..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-lg bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                        <Filter className="w-4 h-4 text-gray-400" />
                        {(['all', 'album', 'event'] as const).map(ft => (
                            <button
                                key={ft}
                                onClick={() => setFilterType(ft)}
                                className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap",
                                    filterType === ft ? "bg-catalog-accent text-white" : "bg-white text-gray-500 hover:bg-gray-100"
                                )}
                            >
                                {ft === 'all' ? 'All Items' : ft + 's'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* View Content */}
            <div className="min-h-[600px]">
                {viewMode === 'month' && <MonthView />}
                {viewMode === 'year' && <YearView />}
                {viewMode === 'timeline' && <TimelineView />}
            </div>
        </div>
    );
}
