import { useUpload } from '../../contexts/UploadContext';
import { Loader2, CloudUpload } from 'lucide-react';
import { cn } from '../../lib/utils';

export function MinimizedUploadBadge() {
    const { state, setMinimized } = useUpload();
    const { isOpen, isMinimized, overallProgress, doneCount, totalCount } = state;

    if (!isOpen || !isMinimized) return null;

    return (
        <button
            onClick={() => setMinimized(false)}
            className={cn(
                "flex items-center gap-2 bg-white border border-catalog-accent/20 px-3 py-1.5 rounded-full shadow-lg shadow-catalog-accent/5 hover:scale-105 transition-all animate-in slide-in-from-top duration-300 active:scale-95 group",
                overallProgress === 100 && "border-green-100 bg-green-50 shadow-green-100"
            )}
            title="Restore upload progress window"
        >
            <div className="relative w-5 h-5 flex items-center justify-center">
                <Loader2 
                    className={cn(
                        "w-full h-full text-catalog-accent animate-spin",
                        overallProgress === 100 && "text-green-500 animate-none"
                    )} 
                />
                <div className="absolute inset-0 flex items-center justify-center">
                    <CloudUpload className={cn("w-2.5 h-2.5 text-catalog-accent", overallProgress === 100 && "text-green-500")} />
                </div>
            </div>
            
            <div className="flex flex-col items-start leading-none">
                <span className={cn(
                    "text-[10px] font-black uppercase tracking-widest text-catalog-accent",
                    overallProgress === 100 && "text-green-600"
                )}>
                    {overallProgress === 100 ? 'Complete' : `Uploading… ${overallProgress}%`}
                </span>
                <span className="text-[8px] font-black text-gray-400 mt-0.5">
                    {doneCount} of {totalCount} files
                </span>
            </div>
        </button>
    );
}
