import { Loader2 } from 'lucide-react';

interface UploadOverlayProps {
    isOpen: boolean;
    progress: Record<string, number>;
    title?: string;
}

export function UploadOverlay({ isOpen, progress, title = "Uploading to Cloud..." }: UploadOverlayProps) {
    if (!isOpen || Object.keys(progress).length === 0) return null;

    const items = Object.entries(progress);
    const overallProgress = items.length > 0
        ? Math.round(items.reduce((acc, [_, p]) => acc + p, 0) / items.length)
        : 0;

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl max-w-sm w-full mx-4 flex flex-col items-center gap-8 border border-white/20">
                {/* Spinning Loader with Central Percentage */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90 transform">
                        {/* Background track */}
                        <circle
                            cx="64"
                            cy="64"
                            r="58"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            className="text-gray-100"
                        />
                        {/* Progress track */}
                        <circle
                            cx="64"
                            cy="64"
                            r="58"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={364.4}
                            strokeDashoffset={364.4 - (364.4 * overallProgress) / 100}
                            className="text-catalog-accent transition-all duration-500 ease-out"
                            strokeLinecap="round"
                        />
                    </svg>
                    
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-catalog-text font-outfit select-none">
                            {overallProgress}%
                        </span>
                    </div>

                    {/* Outer pulse effect */}
                    <div className="absolute inset-0 rounded-full bg-catalog-accent/10 animate-ping opacity-30" />
                </div>

                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-serif italic text-gray-900">{title}</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                        Processing {items.length} item{items.length !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Individual file progress hints */}
                <div className="w-full space-y-3 max-h-40 overflow-y-auto px-2">
                    {items.map(([name, p]) => (
                        <div key={name} className="space-y-1">
                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-gray-400">
                                <span className="truncate max-w-[200px]">{name}</span>
                                <span>{p}%</span>
                            </div>
                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-catalog-accent transition-all duration-300"
                                    style={{ width: `${p}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-2 text-catalog-accent/60 font-medium text-[11px] font-serif italic">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Please don't close this window
                </div>
            </div>
        </div>
    );
}
