import { useState } from 'react';
import { X, MapPin, Search, Loader2, Globe } from 'lucide-react';
import { Button } from './Button';

interface LocationPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (address: string, lat: number, lng: number) => void;
}

export function LocationPickerModal({ isOpen, onClose, onSelect }: LocationPickerModalProps) {
    const [query, setQuery] = useState('');
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedLocation, setSelectedLocation] = useState<{
        address: string;
        lat: number;
        lng: number;
    } | null>(null);

    if (!isOpen) return null;

    const searchLocation = async (text: string) => {
        if (text.length < 3) {
            setSuggestions([]);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(text)}&limit=5`);
            const data = await response.json();
            setSuggestions(data);
        } catch (error) {
            console.error('Geocoding error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (item: any) => {
        const address = item.display_name;
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        setSelectedLocation({ address, lat, lng });
        setSuggestions([]);
        setQuery(address);
    };

    const handleConfirm = () => {
        if (selectedLocation) {
            onSelect(selectedLocation.address, selectedLocation.lat, selectedLocation.lng);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in slide-in-from-bottom-4">
                {/* Header */}
                <div className="bg-gradient-to-r from-catalog-accent to-purple-600 p-6 text-white">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-xl">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Add Location</h3>
                                <p className="text-white/70 text-sm">Pin a place on your album page</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Search */}
                <div className="p-6 space-y-4">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search for a city, country, or address..."
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                searchLocation(e.target.value);
                            }}
                            className="w-full px-4 py-3 pl-11 bg-catalog-stone/10 border border-catalog-accent/20 rounded-xl text-catalog-text placeholder:text-catalog-text/40 focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 transition-all"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-text/40" />
                        {loading && (
                            <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-catalog-accent animate-spin" />
                        )}
                    </div>

                    {/* Suggestions */}
                    {suggestions.length > 0 && (
                        <div className="border border-catalog-accent/10 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                            {suggestions.map((item, idx) => (
                                <button
                                    key={idx}
                                    className="w-full text-left px-4 py-3 hover:bg-catalog-accent/5 transition-colors border-b border-catalog-accent/5 last:border-0 flex items-start gap-3 group"
                                    onClick={() => handleSelect(item)}
                                >
                                    <MapPin className="w-4 h-4 mt-0.5 text-catalog-text/20 group-hover:text-catalog-accent transition-colors flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-catalog-text font-medium truncate">
                                            {item.display_name.split(',')[0]}
                                        </p>
                                        <p className="text-[10px] text-catalog-text/40 truncate">
                                            {item.display_name.split(',').slice(1).join(',').trim()}
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Selected Location Preview */}
                    {selectedLocation && (
                        <div className="bg-gradient-to-br from-catalog-accent/5 to-purple-50 border border-catalog-accent/20 rounded-xl p-4 flex items-center gap-3">
                            <div className="p-2 bg-catalog-accent/10 rounded-lg">
                                <Globe className="w-5 h-5 text-catalog-accent" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-catalog-text truncate">
                                    {selectedLocation.address.split(',')[0]}
                                </p>
                                <p className="text-[10px] text-catalog-text/50 truncate">
                                    {selectedLocation.address.split(',').slice(1, 3).join(',').trim()}
                                </p>
                                <p className="text-[9px] text-catalog-accent font-mono mt-1">
                                    {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Help text */}
                    {!selectedLocation && suggestions.length === 0 && !loading && (
                        <div className="text-center py-8 text-catalog-text/40">
                            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">Start typing to search for a location</p>
                            <p className="text-xs mt-1">Cities, countries, landmarks, addresses...</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-catalog-stone/5 border-t border-catalog-accent/10 flex justify-end gap-3">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={!selectedLocation}
                        className="gap-2"
                    >
                        <MapPin className="w-4 h-4" />
                        Add to Page
                    </Button>
                </div>
            </div>
        </div>
    );
}
