import { useState, useEffect } from 'react';
import { Search, Music, Upload, X, Check, Play, Pause, Loader2, Plus, ExternalLink, Link } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const JAMENDO_CLIENT_ID = '9da689ea'; // A common public client ID for demo, should be user provided in prod

// Default pinned music resource shown to all users
const DEFAULT_MUSIC_SITE = { name: 'Mobiles24 – Free Music', url: 'https://www.mobiles24.co/' };

interface Track {
    id: string;
    name: string;
    artist_name: string;
    album_image: string;
    audio: string;
}

interface MusicSite {
    name: string;
    url: string;
}

interface MusicPickerModalProps {
    onClose: () => void;
    onSelect: (trackUrl: string, trackName: string) => void;
}

export function MusicPickerModal({ onClose, onSelect }: MusicPickerModalProps) {
    const { userRole } = useAuth();
    const isAdmin = userRole === 'admin';

    const [searchQuery, setSearchQuery] = useState('');
    const [tracks, setTracks] = useState<Track[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');
    const [previewTrack, setPreviewTrack] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Admin-only: extra music site links
    const [extraSites, setExtraSites] = useState<MusicSite[]>([]);
    const [showAddSite, setShowAddSite] = useState(false);
    const [newSiteName, setNewSiteName] = useState('');
    const [newSiteUrl, setNewSiteUrl] = useState('');

    const [uploadedTracks, setUploadedTracks] = useState<{ url: string, name: string, audio: string, created_at: string }[]>([]);
    const [loadingUploaded, setLoadingUploaded] = useState(false);

    useEffect(() => {
        if (activeTab === 'search' && !searchQuery) {
            fetchPopularTracks();
        } else if (activeTab === 'upload') {
            loadUploadedTracks();
        }
    }, [activeTab]);

    const loadUploadedTracks = async () => {
        setLoadingUploaded(true);
        try {
            const { data, error } = await supabase.storage.from('background_music').list('music');
            if (error) throw error;
            if (data) {
                const tracks = data
                    .filter(f => f.name !== '.emptyFolderPlaceholder' && f.metadata)
                    .map(f => {
                        const { data: { publicUrl } } = supabase.storage.from('background_music').getPublicUrl(`music/${f.name}`);
                        const nameParts = f.name.split('_');
                        const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : f.name;
                        return { url: publicUrl, name: displayName, audio: publicUrl, created_at: f.created_at };
                    })
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
                setUploadedTracks(tracks);
            }
        } catch (err) {
            console.error('Failed to load uploaded tracks:', err);
        } finally {
            setLoadingUploaded(false);
        }
    };


    const fetchPopularTracks = async () => {
        setLoading(true);
        try {
            const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=jsonpretty&limit=10&order=popularity_week`);
            const data = await res.json();
            setTracks(data.results);
        } catch (err) {
            console.error('Jamendo fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async () => {
        if (!searchQuery) return;
        setLoading(true);
        try {
            const res = await fetch(`https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=jsonpretty&limit=20&search=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setTracks(data.results);
        } catch (err) {
            console.error('Jamendo search error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const path = `music/${Date.now()}_${file.name}`;
            const { error } = await supabase.storage
                .from('background_music')
                .upload(path, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('background_music')
                .getPublicUrl(path);

            await loadUploadedTracks(); // Refresh the list
            onSelect(publicUrl, file.name);
        } catch (err) {
            console.error('Upload error:', err);
            alert('Failed to upload music');
        } finally {
            setIsUploading(false);
        }
    };

    const handleAddSite = () => {
        const name = newSiteName.trim();
        let url = newSiteUrl.trim();
        if (!name || !url) return;
        if (!url.startsWith('http')) url = `https://${url}`;
        setExtraSites(prev => [...prev, { name, url }]);
        setNewSiteName('');
        setNewSiteUrl('');
        setShowAddSite(false);
    };

    const removeExtraSite = (idx: number) => {
        setExtraSites(prev => prev.filter((_, i) => i !== idx));
    };

    const allMusicSites = [DEFAULT_MUSIC_SITE, ...extraSites];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-hidden">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-white w-full max-w-2xl h-[80vh] rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-8 border-b border-black/5 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-2xl font-outfit font-black text-catalog-text">Atmosphere</h3>
                        <p className="text-catalog-text/60">Choose background music for your memories</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex px-8 border-b border-black/5 shrink-0">
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`px-6 py-4 font-bold text-sm uppercase tracking-widest transition-all border-b-2 ${activeTab === 'search' ? 'border-catalog-accent text-catalog-accent' : 'border-transparent text-gray-400'}`}
                    >
                        Search Jamendo
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`px-6 py-4 font-bold text-sm uppercase tracking-widest transition-all border-b-2 ${activeTab === 'upload' ? 'border-catalog-accent text-catalog-accent' : 'border-transparent text-gray-400'}`}
                    >
                        Upload File
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-8">
                    {activeTab === 'search' ? (
                        <div className="space-y-6">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    placeholder="Search by vibe, genre, or mood..."
                                    className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all font-medium"
                                />
                            </div>

                            {loading ? (
                                <div className="flex justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin text-catalog-accent" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-3">
                                    {tracks.map((track) => (
                                        <div
                                            key={track.id}
                                            className="flex items-center gap-4 p-3 rounded-2xl border border-black/5 hover:bg-catalog-stone/5 transition-all group"
                                        >
                                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-sm relative">
                                                <img src={track.album_image} alt={track.name} className="w-full h-full object-cover" />
                                                <button
                                                    onClick={() => setPreviewTrack(previewTrack === track.audio ? null : track.audio)}
                                                    className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    {previewTrack === track.audio ? <Pause className="w-4 h-4 text-white fill-white" /> : <Play className="w-4 h-4 text-white fill-white" />}
                                                </button>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-bold text-sm truncate">{track.name}</h4>
                                                <p className="text-xs text-gray-400 truncate">{track.artist_name}</p>
                                            </div>
                                            <button
                                                onClick={() => onSelect(track.audio, track.name)}
                                                className="p-2 bg-catalog-accent/10 rounded-full text-catalog-accent opacity-0 group-hover:opacity-100 transition-all hover:bg-catalog-accent hover:text-white"
                                            >
                                                <Check className="w-5 h-5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* ===== UPLOAD TAB ===== */
                        <div className="space-y-6">
                            {/* Upload Area */}
                            <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-gray-100 rounded-[2rem]">
                                <div className="w-16 h-16 rounded-full bg-catalog-accent/10 flex items-center justify-center mb-4">
                                    <Upload className="w-8 h-8 text-catalog-accent" />
                                </div>
                                <h4 className="font-outfit font-black text-lg">Upload Audio File</h4>
                                <p className="text-catalog-text/60 mt-1 max-w-[240px] text-sm">
                                    Upload your family's favorite tracks. MP3, WAV, and M4A supported.
                                </p>

                                <div className="mt-6">
                                    <input
                                        type="file"
                                        id="music-upload"
                                        className="hidden"
                                        accept="audio/*"
                                        onChange={handleFileUpload}
                                        disabled={isUploading}
                                    />
                                    <label
                                        htmlFor="music-upload"
                                        className={`px-8 py-3 bg-catalog-accent text-white rounded-2xl font-bold font-outfit uppercase tracking-widest cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-3 ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Music className="w-5 h-5" />}
                                        <span>{isUploading ? 'Uploading...' : 'Select File'}</span>
                                    </label>
                                </div>
                            </div>

                            {/* Previously Uploaded Tracks */}
                            {loadingUploaded ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-catalog-accent/50" />
                                </div>
                            ) : uploadedTracks.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="font-outfit font-black text-sm uppercase tracking-widest text-catalog-text/40 px-2">Your Uploaded Music</h4>
                                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto content-scrollbar pr-2">
                                        {uploadedTracks.map((track, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-4 p-3 rounded-2xl border border-black/5 hover:bg-catalog-stone/5 transition-all group cursor-pointer"
                                                onClick={() => onSelect(track.url, track.name)}
                                            >
                                                <div className="w-10 h-10 rounded-xl bg-catalog-accent/10 flex items-center justify-center shrink-0 relative">
                                                    <Music className="w-5 h-5 text-catalog-accent" />
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPreviewTrack(previewTrack === track.url ? null : track.url);
                                                        }}
                                                        className="absolute inset-0 bg-black/40 rounded-xl items-center justify-center opacity-0 group-hover:opacity-100 flex transition-opacity"
                                                    >
                                                        {previewTrack === track.url ? <Pause className="w-4 h-4 fill-white text-white" /> : <Play className="w-4 h-4 fill-white text-white" />}
                                                    </button>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-bold text-sm truncate group-hover:text-catalog-accent transition-colors">{track.name}</h4>
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelect(track.url, track.name);
                                                    }}
                                                    className="p-2 bg-catalog-accent/10 rounded-full text-catalog-accent opacity-0 group-hover:opacity-100 transition-all hover:bg-catalog-accent hover:text-white"
                                                >
                                                    <Check className="w-5 h-5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Music Sources Section */}
                            <div className="rounded-2xl border border-gray-100 overflow-hidden">
                                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                                        <Link className="w-3 h-3" /> Find Free Music Online
                                    </p>
                                </div>

                                <div className="divide-y divide-gray-50">
                                    {allMusicSites.map((site, idx) => (
                                        <div key={idx} className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                                            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                                <Music className="w-4 h-4 text-amber-500" />
                                            </div>
                                            <a
                                                href={site.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="flex-1 flex items-center gap-2 text-sm font-bold text-catalog-text hover:text-catalog-accent transition-colors"
                                            >
                                                {site.name}
                                                <ExternalLink className="w-3 h-3 text-gray-300 group-hover:text-catalog-accent/50 transition-colors" />
                                            </a>
                                            {/* Admin only: remove extra sites (not the default) */}
                                            {isAdmin && idx > 0 && (
                                                <button
                                                    onClick={() => removeExtraSite(idx - 1)}
                                                    className="p-1 hover:bg-red-50 text-gray-300 hover:text-red-400 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Remove"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Admin: Add new site */}
                                {isAdmin && (
                                    <div className="border-t border-gray-100">
                                        {showAddSite ? (
                                            <div className="p-4 space-y-3 bg-blue-50/40">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Add Music Website</p>
                                                <input
                                                    type="text"
                                                    value={newSiteName}
                                                    onChange={e => setNewSiteName(e.target.value)}
                                                    placeholder="Website name (e.g. Free Music Archive)"
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all"
                                                />
                                                <input
                                                    type="url"
                                                    value={newSiteUrl}
                                                    onChange={e => setNewSiteUrl(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleAddSite()}
                                                    placeholder="https://..."
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 transition-all"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleAddSite}
                                                        className="flex-1 py-2 bg-catalog-accent text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-catalog-accent/90 transition-colors"
                                                    >
                                                        Add
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowAddSite(false); setNewSiteName(''); setNewSiteUrl(''); }}
                                                        className="px-4 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-bold hover:bg-gray-200 transition-colors"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setShowAddSite(true)}
                                                className="w-full flex items-center gap-2 px-5 py-3 text-sm font-bold text-catalog-accent hover:bg-catalog-accent/5 transition-colors"
                                            >
                                                <div className="w-6 h-6 rounded-full bg-catalog-accent/10 flex items-center justify-center">
                                                    <Plus className="w-3.5 h-3.5" />
                                                </div>
                                                Add music website
                                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest ml-auto">Admin only</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Hidden Audio for Preview */}
                {previewTrack && (
                    <audio autoPlay src={previewTrack} onEnded={() => setPreviewTrack(null)} />
                )}
            </div>
        </div>
    );
}
