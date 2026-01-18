import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapAssetProps {
    center: { lat: number; lng: number };
    zoom: number;
    places: { name: string; lat: number; lng: number }[];
    interactive?: boolean;
}

export function MapAsset({ center, zoom, places, interactive = false, lazyLoad = false }: MapAssetProps & { lazyLoad?: boolean }) {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const [isMapLoaded, setIsMapLoaded] = useState(!lazyLoad);

    useEffect(() => {
        if (!isMapLoaded || !mapContainerRef.current) return;

        // Use a small delay to ensure the Page Flip software has 
        // actually rendered the container in the DOM
        const timer = setTimeout(() => {
            if (!mapContainerRef.current) return;

            const map = new maplibregl.Map({
                container: mapContainerRef.current,
                style: 'https://tiles.openfreemap.org/styles/positron',
                center: [center.lng, center.lat],
                zoom: zoom,
                trackResize: true, // Crucial for responsive album pages
                attributionControl: false,
                interactive: interactive,
            });

            mapRef.current = map;

            map.on('load', () => {
                // This is the "Magic Fix": Force the map to fill its container
                // after the 3D flip software has finished its entrance animation
                map.resize();

                // Add markers after load
                markersRef.current.forEach(m => m.remove());
                markersRef.current = [];

                if (places && places.length > 0) {
                    places.forEach((place, idx) => {
                        const el = document.createElement('div');
                        el.className = 'map-asset-marker-small';
                        // Add high z-index to prevent clipping through page
                        el.style.zIndex = '1000';
                        el.innerHTML = `
                            <div class="relative flex flex-col items-center">
                                <div class="w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center shadow-md border border-white text-white text-[8px] font-bold">
                                    ${idx + 1}
                                </div>
                            </div>
                        `;

                        const marker = new maplibregl.Marker(el)
                            .setLngLat([place.lng, place.lat])
                            .addTo(map);
                        markersRef.current.push(marker);
                    });
                }
            });

        }, 100);

        // Handle container resize
        const resizeObserver = new ResizeObserver(() => {
            if (mapRef.current) {
                mapRef.current.resize();
            }
        });
        resizeObserver.observe(mapContainerRef.current);

        return () => {
            clearTimeout(timer);
            resizeObserver.disconnect();
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [center.lat, center.lng, zoom, JSON.stringify(places), interactive, isMapLoaded]); // Re-init on prop change or load triggers

    return (
        <div className="w-full h-full relative border border-gray-200 rounded-lg overflow-hidden shadow-sm bg-gray-50 group">
            {/* Placeholder / Preview Mode */}
            {!isMapLoaded && (
                <div
                    className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center cursor-pointer z-20 hover:bg-slate-50 transition-colors"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsMapLoaded(true);
                    }}
                >
                    <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-2">
                        <svg className="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0121 18.382V7.618a1 1 0 01-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <span className="text-xs font-medium text-slate-500">Click to Load Map</span>
                </div>
            )}

            <div ref={mapContainerRef} className="absolute inset-0" />

            {/* If not interactive, we put a transparent overlay to avoid interception by maplibre while allowing drag in editor */}
            {!interactive && isMapLoaded && (
                <div className="absolute inset-0 bg-transparent z-10" />
            )}

            <style>{`
                .map-asset-marker-small {
                    pointer-events: none;
                }
                .maplibregl-ctrl-logo, .maplibregl-ctrl-attrib {
                    display: none !important;
                }
            `}</style>
        </div>
    );
}
