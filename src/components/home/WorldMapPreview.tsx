import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '../../lib/supabase';
import { Globe, ArrowRight, Loader2 } from 'lucide-react';
import { Card } from '../ui/Card';

interface LocationData {
    id: string;
    type: 'album' | 'event';
    title: string;
    lat: number;
    lng: number;
    location: string;
    country?: string;
    coverImage?: string;
    date?: string;
    link?: string;
}

interface WorldMapPreviewProps {
    familyId: string;
}

export function WorldMapPreview({ familyId }: WorldMapPreviewProps) {
    const navigate = useNavigate();
    const [locations, setLocations] = useState<LocationData[]>([]);
    const [loading, setLoading] = useState(true);

    // Map Styles Definition
    const MAP_STYLES: Record<string, any> = {
        light: "https://tiles.openfreemap.org/styles/positron",
        streets: "https://tiles.openfreemap.org/styles/liberty",
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

    const [currentStyle, setCurrentStyle] = useState<string>('streets');

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);

    useEffect(() => {
        async function fetchLocations() {
            if (!familyId) {
                setLoading(false);
                return;
            }

            try {
                // Fetch Albums with pages and assets using correct table relationship
                const { data: albumsData, error: albumsError } = await supabase
                    .from('albums')
                    .select('id, title, location, country, geotag, config, created_at, cover_image_url, pages(page_number, assets(*))')
                    .eq('family_id', familyId);

                if (albumsError) console.error('Albums fetch error:', albumsError);

                // Fetch Events
                const { data: eventsData, error: eventsError } = await supabase
                    .from('events')
                    .select('id, title, location, country, geotag, event_date, cover_image_path')
                    .eq('family_id', familyId);

                if (eventsError) console.error('Events fetch error:', eventsError);

                const normalizedAlbums: LocationData[] = [];

                // Process Albums
                (albumsData || []).forEach((a: any) => {
                    let config = a.config || {};
                    if (typeof config === 'string') {
                        try { config = JSON.parse(config); } catch (e) { config = {}; }
                    }
                    const cover = a.cover_image_url || (config.cover && config.cover.url) || undefined;

                    // 1. Album-level geotag
                    let tagSource = a.geotag;
                    if (!tagSource && config.geotag) tagSource = config.geotag;

                    if (typeof tagSource === 'string') {
                        try { tagSource = JSON.parse(tagSource); } catch (e) { tagSource = null; }
                    }

                    if (tagSource) {
                        const rawLat = tagSource.lat ?? tagSource.latitude;
                        const rawLng = tagSource.lng ?? tagSource.lon ?? tagSource.longitude;
                        const parsedLat = Number(rawLat);
                        const parsedLng = Number(rawLng);

                        if (!isNaN(parsedLat) && !isNaN(parsedLng) && parsedLat !== 0 && parsedLng !== 0) {
                            normalizedAlbums.push({
                                id: a.id,
                                type: 'album',
                                title: a.title,
                                location: a.location || config.location || '',
                                country: a.country || config.country,
                                lat: parsedLat,
                                lng: parsedLng,
                                coverImage: cover,
                                date: a.created_at,
                                link: `/album/${a.id}`
                            });
                        }
                    }

                    // 2. Page-level assets (from database)
                    if (a.pages && Array.isArray(a.pages)) {
                        a.pages.forEach((p: any) => {
                            const assets = p.assets || [];
                            assets.forEach((asset: any) => {
                                // Assets from DB have their data in the 'config' column
                                let assetConfig = asset.config || {};
                                if (typeof assetConfig === 'string') {
                                    try { assetConfig = JSON.parse(assetConfig); } catch (e) { assetConfig = {}; }
                                }

                                // Type is stored in config.originalType
                                const assetType = assetConfig.originalType || asset.asset_type || asset.type;

                                // Coordinates are stored in config.lat/lng
                                const lat = Number(assetConfig.lat ?? assetConfig.latitude ?? asset.lat);
                                const lng = Number(assetConfig.lng ?? assetConfig.longitude ?? asset.lng);

                                // Single Location Asset
                                if (assetType === 'location') {
                                    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                                        normalizedAlbums.push({
                                            id: asset.id || `${a.id}-p${p.page_number}-loc`,
                                            type: 'album',
                                            title: assetConfig.name || assetConfig.content || assetConfig.address || `${a.title} - Page ${p.page_number}`,
                                            location: assetConfig.content || assetConfig.address || '',
                                            country: '',
                                            lat: lat,
                                            lng: lng,
                                            coverImage: assetConfig.previewImage || cover,
                                            date: a.created_at,
                                            link: `/album/${a.id}?page=${p.page_number}`
                                        });
                                    }
                                }

                                // Map Asset with Places
                                const mapConfig = assetConfig.mapConfig;
                                if (assetType === 'map' && mapConfig?.places && Array.isArray(mapConfig.places)) {
                                    mapConfig.places.forEach((place: any, idx: number) => {
                                        const pLat = Number(place.lat);
                                        const pLng = Number(place.lng);
                                        if (!isNaN(pLat) && !isNaN(pLng) && pLat !== 0 && pLng !== 0) {
                                            normalizedAlbums.push({
                                                id: `${asset.id}-place-${idx}`,
                                                type: 'album',
                                                title: place.name || `${a.title} - Page ${p.page_number}`,
                                                location: place.name || '',
                                                country: '',
                                                lat: pLat,
                                                lng: pLng,
                                                coverImage: assetConfig.previewImage || cover,
                                                date: a.created_at,
                                                link: `/album/${a.id}?page=${p.page_number}`
                                            });
                                        }
                                    });
                                }
                            });
                        });
                    }
                });

                // Process Events
                const normalizedEvents: LocationData[] = (eventsData || [])
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
                            lat: Number(lat),
                            lng: Number(lng),
                            coverImage: e.cover_image_path ? supabase.storage.from('family_media').getPublicUrl(e.cover_image_path).data.publicUrl : undefined,
                            date: e.event_date,
                            link: `/event/${e.id}/view`
                        };
                    })
                    .filter(a => !isNaN(a.lat) && !isNaN(a.lng) && a.lat !== 0 && a.lng !== 0);

                setLocations([...normalizedAlbums, ...normalizedEvents]);
            } catch (error) {
                console.error('Error fetching world map markers:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchLocations();
    }, [familyId]);

    const countriesVisitedCount = useMemo(() => {
        const countries = new Set(locations.filter(l => l.country).map(l => l.country));
        return countries.size;
    }, [locations]);

    // Pastel Color Generator
    const getCountryColor = (country?: string) => {
        const colors = [
            '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF',
            '#E2F0CB', '#FFDAC1', '#FF9AA2', '#E0BBE4', '#957DAD'
        ];
        if (!country) return '#cbd5e1'; // Slate-300 for unknown
        let hash = 0;
        for (let i = 0; i < country.length; i++) {
            hash = country.charCodeAt(i) + ((hash << 5) - hash);
        }
        return colors[Math.abs(hash) % colors.length];
    };

    // Robust Map Initialization
    useEffect(() => {
        if (!mapContainerRef.current || loading) return;

        const map = new maplibregl.Map({
            container: mapContainerRef.current,
            style: MAP_STYLES['streets'],
            center: [0, 20],
            zoom: 1.2,
            attributionControl: false,
            interactive: true,
            renderWorldCopies: false,
            scrollZoom: false,
        });

        // Add zoom controls
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

        mapRef.current = map;

        const setupMap = () => {
            if (!map.getStyle()) return;
            map.resize();

            // Clear old markers
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];

            if (locations.length > 0) {
                locations.forEach(loc => {
                    const el = document.createElement('div');
                    // Smaller marker with pastel color
                    el.className = 'w-3 h-3 rounded-full shadow-md cursor-pointer hover:scale-150 transition-transform bg-white border-2 border-white box-content';
                    el.style.backgroundColor = getCountryColor(loc.country);

                    // Create Rich Popup Content
                    const popupContent = document.createElement('div');
                    popupContent.className = 'min-w-[200px] overflow-hidden rounded-md font-sans';
                    popupContent.innerHTML = `
                        <div class="relative h-24 bg-gray-100 flex items-center justify-center overflow-hidden">
                             ${loc.coverImage
                            ? `<img src="${loc.coverImage}" class="w-full h-full object-cover" />`
                            : `<div class="text-catalog-accent/20"><svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg></div>`
                        }
                             <div class="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                ${loc.type}
                             </div>
                        </div>
                        <div class="p-3 bg-white">
                            <h4 class="font-bold text-gray-800 text-sm mb-1 leading-tight line-clamp-1">${loc.title}</h4>
                            <div class="flex items-center gap-1 text-[10px] text-gray-500 mb-2">
                                <span>${loc.location}</span>
                            </div>
                            <button id="btn-${loc.id}" class="w-full py-1.5 bg-catalog-accent text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-catalog-accent/90 transition-colors">
                                View ${loc.type === 'album' ? 'Album' : 'Event'}
                            </button>
                        </div>
                    `;

                    // Add Click Listener to the Button inside popup
                    // Simple onclick in HTML string doesn't work well with React router navigate
                    // So we attach it after adding to DOM logic, or usage of global event delegation?
                    // Safer: bind click on the popup instance open? MapLibre popups are tricky with React events.
                    // We can use a vanilla onclick that calls a global function, 
                    // OR we can add event listener to the button once popup is added.

                    const popup = new maplibregl.Popup({
                        offset: 15,
                        closeButton: true,
                        className: 'custom-map-popup-window',
                        maxWidth: '240px'
                    })
                        .setDOMContent(popupContent);

                    // Add event listener for the button when popup opens
                    popup.on('open', () => {
                        const btn = popupContent.querySelector(`#btn-${loc.id}`);
                        if (btn) {
                            btn.addEventListener('click', () => {
                                navigate(loc.link || '#');
                            });
                        }
                    });

                    const marker = new maplibregl.Marker({ element: el })
                        .setLngLat([loc.lng, loc.lat])
                        .setPopup(popup) // Binds click to toggle popup
                        .addTo(map);

                    markersRef.current.push(marker);
                });
            }
        };

        if (map.loaded()) {
            setupMap();
        } else {
            map.once('load', () => {
                setTimeout(setupMap, 150);
            });
        }

        // Handle Style Changes dynamically (some markers might need re-adding if layer context clears, though usually markers are DOM)
        map.on('style.load', () => {
            setupMap();
        });

        const resizeObserver = new ResizeObserver(() => map.resize());
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [loading, locations]);

    // Effect for changing style
    useEffect(() => {
        if (mapRef.current) {
            mapRef.current.setStyle(MAP_STYLES[currentStyle]);
        }
    }, [currentStyle]);

    if (loading) {
        return (
            <div className="relative w-full h-[500px] rounded-2xl overflow-hidden bg-catalog-stone/5 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-catalog-accent animate-spin" />
            </div>
        );
    }

    if (locations.length === 0) {
        return (
            <div
                className="relative w-full h-[500px] rounded-2xl overflow-hidden bg-catalog-stone/5 border border-catalog-accent/10 flex items-center justify-center cursor-pointer group hover:border-catalog-accent/30 transition-all"
                onClick={() => navigate('/map')}
            >
                <div className="text-center p-8 max-w-sm">
                    <div className="p-4 bg-catalog-accent/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                        <Globe className="w-8 h-8 text-catalog-accent" />
                    </div>
                    <h3 className="text-xl font-serif italic text-catalog-text mb-2">Our World Map</h3>
                    <p className="text-sm text-catalog-text/50 font-sans leading-relaxed">
                        Your family's geographical footprint is waiting to be discovered. Add locations to your moments to see them here.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between border-b-2 border-rainbow pb-4">
                <div className="space-y-1">
                    <h2 className="text-3xl font-sans font-bold text-catalog-text">Our Family Footprint</h2>
                    <p className="text-sm text-catalog-text/50">Across {countriesVisitedCount} countries and {locations.length} special places.</p>
                </div>
                <button
                    onClick={() => navigate('/map')}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-catalog-accent/10 text-xs font-bold uppercase tracking-widest text-catalog-accent hover:bg-catalog-accent hover:text-white transition-all group"
                >
                    Expand Map <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
            </div>

            <Card
                className="p-0 overflow-hidden relative group h-[650px]"
            >
                <div ref={mapContainerRef} className="w-full h-full" />

                {/* Visual Overlay */}
                <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-black/5 rounded-2xl" />

                {/* Stats Overlay */}
                <div className="absolute top-4 right-12 flex gap-2 z-10">
                    <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-catalog-accent/10 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-600"></div>
                        <span className="text-[10px] font-bold text-catalog-text uppercase tracking-widest">Digital Albums</span>
                    </div>
                    <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-catalog-accent/10 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-600"></div>
                        <span className="text-[10px] font-bold text-catalog-text uppercase tracking-widest">Stories</span>
                    </div>
                </div>

                {/* Style Switcher (Stop Propagation to prevent Navigation) */}
                <div
                    className="absolute bottom-4 right-4 flex gap-1 p-1 bg-white/90 backdrop-blur-md rounded-lg border border-gray-200 shadow-lg pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    {Object.keys(MAP_STYLES).map((style) => (
                        <button
                            key={style}
                            onClick={() => setCurrentStyle(style)}
                            className={`
                                px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-md transition-all
                                ${currentStyle === style
                                    ? "bg-catalog-accent text-white shadow-sm"
                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}
                            `}
                        >
                            {style.charAt(0).toUpperCase() + style.slice(1)}
                        </button>
                    ))}
                </div>

                {/* MapLibre Global Styles for Popups */}
                <style>{`
                    .maplibregl-popup-content {
                        background: transparent;
                        box-shadow: none;
                        padding: 0;
                        border-radius: 8px;
                    }
                    .custom-map-popup-window .maplibregl-popup-content {
                         box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                    }
                    .maplibregl-popup-tip {
                        border-top-color: rgba(255, 255, 255, 0.9);
                    }
                `}</style>
            </Card>
        </section>
    );
}
