import { useState, useEffect, useMemo, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cn } from '../lib/utils';
import { MapPin, Calendar, Filter, X, Tag, Book, Image as ImageIcon, Globe, History, ChevronRight, Camera } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

interface MapItem {
    id: string;
    type: 'event' | 'album';
    title: string;
    location: string;
    country?: string;
    date: string;
    category?: string;
    participants?: string[];
    lat: number;
    lng: number;
    coverImage?: string;
    link: string;
}

const MAP_STYLES: Record<string, any> = {
    streets: "https://tiles.openfreemap.org/styles/liberty",
    positron: "https://tiles.openfreemap.org/styles/positron",
    dark: "https://tiles.openfreemap.org/styles/dark-matter",
    satellite: {
        version: 8,
        sources: {
            'satellite': {
                type: 'raster',
                tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
                tileSize: 256,
                attribution: 'Esri World Imagery'
            }
        },
        layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }]
    }
};
const defaultCenter: [number, number] = [34.7818, 32.0853];

export function HeritageMap() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const locationParam = searchParams.get('location');

    const { familyId } = useAuth();
    const [items, setItems] = useState<MapItem[]>([]);
    const [filteredItems, setFilteredItems] = useState<MapItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);
    const [showFilters, setShowFilters] = useState(false);
    const [showPath, setShowPath] = useState(true);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);

    // Filters
    const [yearFilter, setYearFilter] = useState<string>('all');
    const [countryFilter, setCountryFilter] = useState<string>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [mapStyle, setMapStyle] = useState<keyof typeof MAP_STYLES>('streets');

    // Manual refresh function
    const refreshData = async () => {
        setLoading(true);
        if (!familyId) {
            setLoading(false);
            return;
        }

        try {
            // Fetch Events
            const { data: eventsData, error: eventsError } = await supabase
                .from('events')
                .select('id, title, location, country, event_date, category, participants, geotag, cover_image_path')
                .eq('family_id', familyId);

            if (eventsError) console.error('Error fetching events:', eventsError);

            // Fetch Albums - Using 'pages' table with nested 'assets' relationship
            const { data: albumsData, error: albumsError } = await supabase
                .from('albums')
                .select('id, title, location, country, created_at, category, geotag, config, pages(id, page_number, assets(*))')
                .eq('family_id', familyId);

            if (albumsError) console.error('Error fetching albums:', albumsError);

            // Combine and normalize results
            const normalizedEvents: MapItem[] = (eventsData || [])
                .map((e: any) => {
                    let tag = e.geotag;
                    if (typeof tag === 'string') {
                        try { tag = JSON.parse(tag); } catch (err) { tag = null; }
                    }

                    const lat = tag?.lat ?? tag?.latitude;
                    const lng = tag?.lng ?? tag?.lon ?? tag?.longitude;

                    return {
                        id: e.id,
                        type: 'event' as const,
                        title: e.title,
                        location: e.location || '',
                        country: e.country,
                        date: e.event_date,
                        category: e.category,
                        participants: e.participants,
                        lat: Number(lat),
                        lng: Number(lng),
                        coverImage: e.cover_image_path ? supabase.storage.from('family_media').getPublicUrl(e.cover_image_path).data.publicUrl : undefined,
                        link: `/event/${e.id}/view`
                    };
                })
                .filter(e => !isNaN(e.lat) && !isNaN(e.lng) && e.lat !== 0 && e.lng !== 0);

            const normalizedAlbums: MapItem[] = [];

            (albumsData || []).forEach((a: any) => {
                let config = a.config || {};
                if (typeof config === 'string') {
                    try { config = JSON.parse(config); } catch (err) { config = {}; }
                }

                // 1. Album-level location
                let albumTag = a.geotag || config.geotag;
                if (typeof albumTag === 'string') {
                    try { albumTag = JSON.parse(albumTag); } catch (e) { albumTag = null; }
                }

                if (albumTag) {
                    const valLat = Number(albumTag.lat ?? albumTag.latitude);
                    const valLng = Number(albumTag.lng ?? albumTag.lon ?? albumTag.longitude);
                    if (!isNaN(valLat) && !isNaN(valLng) && valLat !== 0 && valLng !== 0) {
                        normalizedAlbums.push({
                            id: a.id,
                            type: 'album',
                            title: a.title,
                            location: a.location || config.location || '',
                            country: a.country || config.country,
                            date: a.created_at,
                            category: a.category || config.category,
                            lat: valLat,
                            lng: valLng,
                            coverImage: config.coverImage || (config.cover && config.cover.url) || undefined,
                            link: `/album/${a.id}`
                        });
                    }
                }

                // 2. Page-level locations (assets from database)
                if (a.pages && Array.isArray(a.pages)) {
                    a.pages.forEach((p: any) => {
                        const assets = p.assets || [];
                        assets.forEach((asset: any) => {
                            // Assets from DB have their data in the 'config' column
                            let assetConfig = asset.config || {};
                            if (typeof assetConfig === 'string') {
                                try { assetConfig = JSON.parse(assetConfig); } catch (e) { assetConfig = {}; }
                            }

                            // Type is stored in config.originalType or can be inferred from asset_type
                            const assetType = assetConfig.originalType || asset.asset_type || asset.type;

                            // Coordinates are stored in config.lat/lng
                            const lat = Number(assetConfig.lat ?? assetConfig.latitude ?? asset.lat);
                            const lng = Number(assetConfig.lng ?? assetConfig.longitude ?? asset.lng);

                            // 1. Single Location Assets
                            if (assetType === 'location') {
                                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                                    normalizedAlbums.push({
                                        id: asset.id || `${a.id}-page-${p.page_number}-loc`,
                                        type: 'album',
                                        title: assetConfig.name || assetConfig.content || assetConfig.address || `${a.title} - Page ${p.page_number}`,
                                        location: assetConfig.content || assetConfig.address || '',
                                        country: '',
                                        date: a.created_at,
                                        category: a.category,
                                        lat: lat,
                                        lng: lng,
                                        coverImage: assetConfig.previewImage || (config.cover && config.cover.url) || undefined,
                                        link: `/album/${a.id}?page=${p.page_number}`
                                    });
                                }
                            }

                            // 2. Map Assets with multiple places
                            const mapConfig = assetConfig.mapConfig;
                            if (assetType === 'map' && mapConfig?.places && Array.isArray(mapConfig.places)) {
                                mapConfig.places.forEach((place: any, index: number) => {
                                    const pLat = Number(place.lat);
                                    const pLng = Number(place.lng);
                                    if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
                                        normalizedAlbums.push({
                                            id: `${asset.id}-place-${index}`,
                                            type: 'album',
                                            title: place.name || `${a.title} - Place ${index + 1}`,
                                            location: place.name || '',
                                            country: '',
                                            date: a.created_at,
                                            category: a.category,
                                            lat: pLat,
                                            lng: pLng,
                                            coverImage: assetConfig.previewImage || (config.cover && config.cover.url) || undefined,
                                            link: `/album/${a.id}?page=${p.page_number}`
                                        });
                                    }
                                });
                            }
                        });
                    });
                }
            });

            const allItems = [...normalizedEvents, ...normalizedAlbums].sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                return (isNaN(dateA) ? 0 : dateA) - (isNaN(dateB) ? 0 : dateB);
            });


            setItems(allItems);
            // Force filter update
            setFilteredItems(allItems);
        } catch (error) {
            console.error('Error fetching map items:', error);
        } finally {
            setLoading(false);
        }
    };

    // Initial fetch
    useEffect(() => {
        refreshData();
    }, [familyId]);

    // Zoom to location from URL
    useEffect(() => {
        if (!locationParam || !mapRef.current || items.length === 0) return;

        const decodedMsg = decodeURIComponent(locationParam).toLowerCase();
        // Find best match: check exact location string, then partial location, then partial title
        const match = items.find(i => i.location.toLowerCase() === decodedMsg)
            || items.find(i => i.location.toLowerCase().includes(decodedMsg))
            || items.find(i => i.title.toLowerCase().includes(decodedMsg));

        if (match) {
            setSelectedItem(match);
            mapRef.current.flyTo({
                center: [match.lng, match.lat],
                zoom: 15,
                essential: true
            });
        }
    }, [items, locationParam]);

    // Derived Filter values
    const years = useMemo(() => {
        const yearSet = new Set(items.map(i => new Date(i.date).getFullYear().toString()));
        return ['all', ...Array.from(yearSet).sort().reverse()];
    }, [items]);

    const countries = useMemo(() => {
        const countrySet = new Set(items.filter(i => i.country).map(i => i.country!));
        return ['all', ...Array.from(countrySet).sort()];
    }, [items]);

    const categories = useMemo(() => {
        const catSet = new Set(items.filter(i => i.category).map(i => i.category!));
        return ['all', ...Array.from(catSet).sort()];
    }, [items]);

    // Apply filters
    useEffect(() => {
        let filtered = [...items];

        if (yearFilter !== 'all') {
            filtered = filtered.filter(i => new Date(i.date).getFullYear().toString() === yearFilter);
        }

        if (countryFilter !== 'all') {
            filtered = filtered.filter(i => i.country === countryFilter);
        }

        if (categoryFilter !== 'all') {
            filtered = filtered.filter(i => i.category === categoryFilter);
        }

        if (typeFilter !== 'all') {
            filtered = filtered.filter(i => i.type === typeFilter);
        }

        setFilteredItems(filtered);
    }, [items, yearFilter, countryFilter, categoryFilter, typeFilter]);

    // Track selected item in ref for event listeners
    const selectedItemRef = useRef<MapItem | null>(null);
    useEffect(() => {
        selectedItemRef.current = selectedItem;
    }, [selectedItem]);

    // Initialize Map
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLES[mapStyle],
            center: defaultCenter,
            zoom: 2,
            attributionControl: false,
            // @ts-ignore
            preserveDrawingBuffer: true, // Allow canvas export
        });

        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl(), 'top-right');

        map.on('load', () => {
            map.resize();
            // Add 3D buildings if they exist in the tileset
            if (!map.getLayer('3d-buildings')) {
                map.addLayer({
                    'id': '3d-buildings',
                    'source': 'openmaptiles',
                    'source-layer': 'building',
                    'type': 'fill-extrusion',
                    'minzoom': 15,
                    'paint': {
                        'fill-extrusion-color': '#aaa',
                        'fill-extrusion-height': [
                            'interpolate', ['linear'], ['zoom'],
                            15, 0,
                            15.05, ['get', 'render_height']
                        ],
                        'fill-extrusion-base': [
                            'interpolate', ['linear'], ['zoom'],
                            15, 0,
                            15.05, ['get', 'render_min_height']
                        ],
                        'fill-extrusion-opacity': 0.6
                    }
                });
            }
        });

        // Handle container resize
        const resizeObserver = new ResizeObserver(() => {
            map.resize();
        });
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            map.remove();
            mapRef.current = null;
        };
    }, [mapStyle]); // Re-init on style change

    // Update Markers and Path
    useEffect(() => {
        if (!mapRef.current) return;
        const map = mapRef.current;

        // Update Path and Markers with style safety
        const redrawMap = () => {
            if (!map.getStyle()) return;

            // Clear existing markers
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            // Add Markers
            // Pastel Color Generator (Same as in Home Page)
            const getCountryColor = (country?: string) => {
                const colors = [
                    '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
                    '#E2F0CB', '#FFDAC1', '#FF9AA2', '#E0BBE4', '#957DAD'
                ];
                if (!country) return '#cbd5e1';
                let hash = 0;
                for (let i = 0; i < country.length; i++) {
                    hash = country.charCodeAt(i) + ((hash << 5) - hash);
                }
                return colors[Math.abs(hash) % colors.length];
            };

            filteredItems.forEach((item, index) => {
                const el = document.createElement('div');
                el.className = 'custom-marker transition-transform duration-300 hover:scale-125 z-10';

                // Use country-based pastel color
                const color = getCountryColor(item.country);

                // Marker HTML
                el.innerHTML = `
                    <div class="relative flex items-center justify-center cursor-pointer">
                        <div class="w-6 h-6 rounded-full shadow-md border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-700 hover:brightness-95 transition-all" style="background-color: ${color}">
                            ${index + 1}
                        </div>
                    </div>
                `;

                // Popup content
                const popupContent = document.createElement('div');
                popupContent.className = 'p-3 min-w-[200px] cursor-pointer group';
                popupContent.innerHTML = `
                    <div class="relative w-full h-24 bg-gray-100 overflow-hidden group-hover:opacity-90 transition-opacity">
                        ${item.coverImage
                        ? `<img src="${item.coverImage}" class="w-full h-full object-cover" alt="${item.title}" />`
                        : `<div class="w-full h-full flex items-center justify-center bg-catalog-stone/10 text-catalog-text/20">
                                ${item.type === 'album' ? '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>'
                            : '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>'}
                               </div>`
                    }
                        <div class="absolute top-2 left-2 flex items-center gap-1.5">
                            <span class="text-[9px] font-black text-white uppercase tracking-widest bg-catalog-accent/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm">
                                ${item.type === 'album' ? 'Album' : 'Moment'}
                            </span>
                        </div>
                    </div>
                    <div class="p-3">
                        <h3 class="text-sm font-serif italic text-catalog-text mb-1 leading-tight group-hover:text-catalog-accent transition-colors line-clamp-2">${item.title}</h3>
                        <div class="flex items-center gap-1.5 text-[9px] text-catalog-text/60">
                             <span className="font-sans font-bold uppercase tracking-tighter">${new Date(item.date).toLocaleDateString()}</span>
                        </div>
                        <p class="text-[9px] text-catalog-text/40 mt-1 italic truncate">${item.location}</p>
                    </div>
                `;
                popupContent.onclick = () => {
                    navigate(item.link);
                };

                const popup = new maplibregl.Popup({
                    offset: 15,
                    closeButton: false,
                    maxWidth: '300px',
                    className: 'custom-map-popup'
                }).setDOMContent(popupContent);

                const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat([item.lng, item.lat])
                    .addTo(map);

                // Hover behavior
                el.addEventListener('mouseenter', () => {
                    // Always show popup on hover
                    popup.addTo(map);
                });

                el.addEventListener('mouseleave', () => {
                    // Only remove if this is NOT the selected item
                    if (selectedItemRef.current?.id !== item.id) {
                        popup.remove();
                    }
                });

                // Click behavior
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setSelectedItem(item);
                    // Force popup to stay
                    popup.addTo(map);
                });

                markersRef.current.push(marker);
            });

            // Update Path Layer
            const sourceId = 'timeline-path';
            const layerId = 'timeline-path-layer';
            const coordinates = showPath && filteredItems.length > 1
                ? filteredItems.map(item => [item.lng, item.lat])
                : [];

            const geojson: any = {
                'type': 'Feature',
                'properties': {},
                'geometry': { 'type': 'LineString', 'coordinates': coordinates }
            };

            // Check if style is loaded enough to add sources
            try {
                if (map.getSource(sourceId)) {
                    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(geojson);
                } else {
                    map.addSource(sourceId, { 'type': 'geojson', 'data': geojson });
                    map.addLayer({
                        'id': layerId,
                        'type': 'line',
                        'source': sourceId,
                        'layout': { 'line-join': 'round', 'line-cap': 'round' },
                        'paint': {
                            'line-color': '#c2410c',
                            'line-width': 3,
                            'line-opacity': 0.6,
                            'line-dasharray': [2, 2]
                        }
                    });
                }
            } catch (e) {
                console.warn("Map style not ready for layers yet", e);
            }

            // Fit bounds - Skip if we are focusing on a specific location via URL
            if (filteredItems.length > 0 && !locationParam) {
                const bounds = new maplibregl.LngLatBounds();

                // Logic: If no filters are manually selected, default to zooming on the LATEST YEAR
                let itemsToFit = filteredItems;

                const isDefaultView = yearFilter === 'all' && countryFilter === 'all' && categoryFilter === 'all' && typeFilter === 'all';

                if (isDefaultView) {
                    const years = filteredItems.map(i => new Date(i.date).getFullYear()).filter(y => !isNaN(y));
                    if (years.length > 0) {
                        const maxYear = Math.max(...years);
                        const latestItems = filteredItems.filter(i => new Date(i.date).getFullYear() === maxYear);
                        if (latestItems.length > 0) {
                            itemsToFit = latestItems;
                        }
                    }
                }

                itemsToFit.forEach(item => bounds.extend([item.lng, item.lat]));

                // Use a higher maxZoom (17) to allow "Street View" level details if points are close
                try {
                    map.fitBounds(bounds, { padding: { top: 150, bottom: 50, left: 100, right: 100 }, maxZoom: 17 });
                } catch (e) {
                    console.warn("Could not fit bounds", e);
                }
            }
        };

        if (map.loaded() || map.isStyleLoaded()) {
            redrawMap();
        } else {
            map.once('load', redrawMap);
            map.once('style.load', redrawMap);
        }
    }, [filteredItems, showPath, mapStyle, locationParam]);

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col bg-catalog-bg animate-fade-in relative overflow-hidden">
            {/* Loading Overlay */}
            {loading && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-catalog-bg/80 backdrop-blur-sm">
                    <div className="text-center">
                        <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-catalog-text/60 font-serif italic">Whispering to the stars for coordinates...</p>
                    </div>
                </div>
            )}

            {/* Overlay Header */}
            <div className="absolute top-6 left-6 z-10 max-w-sm pointer-events-none">
                <Card className="p-6 bg-white/95 backdrop-blur-md border border-catalog-accent/10 shadow-2xl pointer-events-auto">
                    <div className="flex items-center justify-between mb-4">
                        <div className="space-y-0.5">
                            <h1 className="text-2xl font-serif italic text-catalog-text leading-tight">Family History</h1>
                            <div className="flex items-center gap-2">
                                <span className="flex items-center gap-1.5 px-2 py-0.5 bg-catalog-accent/10 rounded text-[10px] font-black text-catalog-accent uppercase tracking-widest">
                                    <MapPin className="w-3 h-3" /> {items.length} Marked
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={refreshData}
                                    className="h-6 px-2 gap-1 text-[10px] font-black uppercase text-catalog-text/40 hover:text-catalog-accent"
                                >
                                    <History className={cn("w-3 h-3", loading && "animate-spin")} />
                                    Sync
                                </Button>
                            </div>
                        </div>
                        <Button
                            variant="glass"
                            size="sm"
                            onClick={() => setShowFilters(!showFilters)}
                            className={cn(
                                "h-10 w-10 p-0 rounded-full",
                                showFilters ? "bg-catalog-accent text-white" : "text-catalog-accent"
                            )}
                        >
                            <Filter className="w-4 h-4" />
                        </Button>
                    </div>
                    <p className="text-sm text-catalog-text/70 leading-relaxed font-sans mb-4">
                        Discover the geographical footprint of your family's journey.
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1.5 px-2 py-1 bg-catalog-accent/10 rounded text-xs font-bold text-catalog-accent uppercase tracking-widest">
                            <MapPin className="w-3 h-3" /> {filteredItems.length} Places
                        </span>
                        <button
                            onClick={() => setShowPath(!showPath)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold uppercase tracking-widest transition-colors ${showPath ? 'bg-catalog-accent text-white' : 'bg-catalog-stone/50 text-catalog-text/60'}`}
                        >
                            <History className="w-3 h-3" /> Timeline Path
                        </button>
                        <button
                            onClick={async () => {
                                if (!mapRef.current) return;
                                try {
                                    const canvas = mapRef.current.getCanvas();
                                    const dataUrl = canvas.toDataURL('image/png');

                                    // Upload functionality
                                    const { storageService } = await import('../services/storage');
                                    const blob = await (await fetch(dataUrl)).blob();
                                    const file = new File([blob], `map-snapshot-${Date.now()}.png`, { type: 'image/png' });

                                    const { url, error } = await storageService.uploadFile(
                                        file,
                                        'album-assets',
                                        `maps/map-snapshot-${Date.now()}.png`,
                                        () => { }
                                    );

                                    if (url && familyId) {
                                        // Insert into family_media table correctly
                                        const { error: dbError } = await supabase.from('family_media').insert({
                                            family_id: familyId,
                                            url: url,
                                            type: 'image',
                                            filename: `map-snapshot-${Date.now()}.png`,
                                            folder: 'Map Snapshots',
                                            size: blob.size,
                                            mime_type: 'image/png'
                                        } as any);

                                        if (dbError) throw dbError;
                                        alert("Snapshot saved to 'Map Snapshots' in Media Library!");
                                    } else {
                                        throw new Error(error || 'Upload failed');
                                    }
                                } catch (err) {
                                    console.error('Snapshot failed:', err);
                                    alert('Failed to save snapshot');
                                }
                            }}
                            className="flex items-center gap-1.5 px-2 py-1 bg-catalog-stone/50 hover:bg-catalog-accent hover:text-white rounded text-xs font-bold uppercase tracking-widest text-catalog-text/60 transition-colors"
                        >
                            <Camera className="w-3 h-3" /> Snapshot
                        </button>
                    </div>

                    {/* Style Switcher */}
                    <div className="mt-4 flex gap-1 p-1 bg-catalog-stone/5 rounded-lg border border-catalog-accent/5">
                        {Object.entries(MAP_STYLES).map(([key, _]) => (
                            <button
                                key={key}
                                onClick={() => setMapStyle(key as any)}
                                className={cn(
                                    "flex-1 py-1.5 text-[9px] font-black uppercase tracking-widest rounded-md transition-all",
                                    mapStyle === key ? "bg-white text-catalog-accent shadow-sm" : "text-catalog-text/40 hover:text-catalog-text"
                                )}
                            >
                                {key}
                            </button>
                        ))}
                    </div>
                </Card>

                {/* Filters Expanded */}
                {
                    showFilters && (
                        <Card className="mt-4 p-4 bg-white/95 backdrop-blur-md border border-catalog-accent/10 shadow-xl pointer-events-auto">
                            <div className="grid grid-cols-2 gap-4">
                                {/* Year Filter */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-catalog-text/40 uppercase tracking-wider flex items-center gap-1">
                                        <Calendar className="w-3 h-3" /> Year
                                    </label>
                                    <select
                                        value={yearFilter}
                                        onChange={(e) => setYearFilter(e.target.value)}
                                        className="w-full bg-catalog-stone/10 border-0 rounded-lg px-2 py-1.5 text-xs text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                    >
                                        {years.map(year => (
                                            <option key={year} value={year}>{year === 'all' ? 'All Years' : year}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Country Filter */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-catalog-text/40 uppercase tracking-wider flex items-center gap-1">
                                        <Globe className="w-3 h-3" /> Country
                                    </label>
                                    <select
                                        value={countryFilter}
                                        onChange={(e) => setCountryFilter(e.target.value)}
                                        className="w-full bg-catalog-stone/10 border-0 rounded-lg px-2 py-1.5 text-xs text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                    >
                                        {countries.map(country => (
                                            <option key={country} value={country}>{country === 'all' ? 'All Countries' : country}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Category Filter */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-catalog-text/40 uppercase tracking-wider flex items-center gap-1">
                                        <Tag className="w-3 h-3" /> Category
                                    </label>
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className="w-full bg-catalog-stone/10 border-0 rounded-lg px-2 py-1.5 text-xs text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Type Filter */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-catalog-text/40 uppercase tracking-wider flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" /> Type
                                    </label>
                                    <select
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value)}
                                        className="w-full bg-catalog-stone/10 border-0 rounded-lg px-2 py-1.5 text-xs text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                    >
                                        <option value="all">All Items</option>
                                        <option value="event">Stories Only</option>
                                        <option value="album">Albums Only</option>
                                    </select>
                                </div>
                            </div>

                            {(yearFilter !== 'all' || countryFilter !== 'all' || categoryFilter !== 'all' || typeFilter !== 'all') && (
                                <button
                                    onClick={() => { setYearFilter('all'); setCountryFilter('all'); setCategoryFilter('all'); setTypeFilter('all'); }}
                                    className="mt-4 w-full flex items-center justify-center gap-1 text-[10px] font-bold text-catalog-accent uppercase tracking-widest hover:underline"
                                >
                                    <X className="w-3 h-3" /> Clear All Filters
                                </button>
                            )}
                        </Card>
                    )
                }
            </div >

            {/* Map Container */}
            < div ref={mapContainerRef} className="flex-1 w-full h-full relative" >
                {
                    items.length === 0 && !loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
                            <div className="text-center p-8 max-w-sm bg-white/90 backdrop-blur-md rounded-3xl shadow-xl border border-catalog-accent/10 pointer-events-auto">
                                <div className="p-4 bg-catalog-accent/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                                    <MapPin className="w-8 h-8 text-catalog-accent" />
                                </div>
                                <h3 className="text-xl font-serif italic text-catalog-text mb-2">The Map is Waiting...</h3>
                                <p className="text-sm text-catalog-text/50 font-sans leading-relaxed">
                                    Curate your family's journey by adding locations to your Moments or Albums. Use the <b>Location Picker</b> in the editor to drop pins here.
                                </p>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* Custom InfoWindow (Popup) */}
            {
                selectedItem && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-sm px-6 animate-slide-up">
                        <Card
                            className="p-4 bg-white shadow-2xl border border-catalog-accent/20 overflow-hidden relative pointer-events-auto cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => navigate(selectedItem.type === 'album' ? `/album/${selectedItem.id}` : `/event/${selectedItem.id}/view`)}
                        >
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedItem(null);
                                }}
                                className="absolute top-2 right-2 p-1 hover:bg-black/5 rounded-full transition-colors z-30"
                            >
                                <X className="w-4 h-4 text-catalog-text/40" />
                            </button>

                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[9px] font-bold text-catalog-accent uppercase tracking-widest bg-catalog-accent/5 px-1.5 py-0.5 rounded flex items-center gap-1">
                                    {selectedItem.type === 'album' ? <Book className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                                    {selectedItem.type === 'album' ? 'Digital Album' : 'Story'}
                                </span>
                                {selectedItem.category && (
                                    <span className="text-[9px] text-catalog-text/40 font-bold uppercase tracking-widest">
                                        {selectedItem.category}
                                    </span>
                                )}
                            </div>

                            <h3 className="text-xl font-serif italic text-catalog-text mb-1 leading-tight">{selectedItem.title}</h3>

                            <div className="space-y-1 mb-4">
                                <div className="flex items-center gap-1.5 text-[10px] text-catalog-text/60">
                                    <MapPin className="w-3 h-3 text-catalog-accent/50" />
                                    {selectedItem.location}{selectedItem.country ? `, ${selectedItem.country}` : ''}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-catalog-text/60">
                                    <Calendar className="w-3 h-3 text-catalog-accent/50" />
                                    {new Date(selectedItem.date).toLocaleDateString('en-US', {
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    })}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    className="flex-1 text-[10px] font-bold uppercase tracking-widest h-10 group"
                                >
                                    {selectedItem.type === 'album' ? 'Open Album' : 'Read Full Story'}
                                    <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </div>
                        </Card>
                    </div>
                )
            }

            <style>{`
                .maplibregl-ctrl-logo, .maplibregl-ctrl-attrib { display: none !important; }
                @keyframes slide-up {
                    from { transform: translate(-50%, 100%); opacity: 0; }
                    to { transform: translate(-50%, 0); opacity: 1; }
                }
                .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
                
                .custom-map-popup .maplibregl-popup-content {
                    padding: 0;
                    border-radius: 16px;
                    border: 1px solid rgba(160, 196, 255, 0.2);
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    overflow: hidden;
                }
                .custom-map-popup .maplibregl-popup-tip {
                    border-top-color: white;
                }
            `}</style>
        </div >
    );
}
