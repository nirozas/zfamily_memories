import { Loader2, CheckCircle2, AlertCircle, X, Minus } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { UploadManagerState } from '../../hooks/useUploadManager';

// ── Legacy simple interface (backward compat) ───────────────────────────────
interface LegacyProps {
    isOpen: boolean;
    progress: Record<string, number>;
    title?: string;
}

// ── New rich interface from useUploadManager ─────────────────────────────────
interface RichProps {
    state: UploadManagerState;
    title?: string;
    onDismiss?: () => void;
    onCancelFile?: (name: string) => void;
    onCancelAll?: () => void;
    onMinimize?: () => void;
}

type UploadOverlayProps = LegacyProps | RichProps;

function isRichProps(p: UploadOverlayProps): p is RichProps {
    return 'state' in p;
}

export function UploadOverlay(props: UploadOverlayProps) {
    // ── Normalise both interfaces into one shape ───────────────────────────
    let isOpen: boolean;
    let isMinimized: boolean = false;
    let files: { name: string; progress: number; status: string }[];
    let totalCount: number;
    let doneCount: number;
    let overallProgress: number;
    let title: string;
    let onDismiss: (() => void) | undefined;

    if (isRichProps(props)) {
        const { state, title: propsTitle = 'Uploading…', onDismiss: propsOnDismiss } = props;
        ({ isOpen, isMinimized, files, totalCount, doneCount, overallProgress } = state);
        title = propsTitle;
        onDismiss = propsOnDismiss;
    } else {
        const { isOpen: propsIsOpen, progress: propsProgress, title: propsTitle = 'Uploading to Cloud…' } = props;
        isOpen = propsIsOpen;
        files = Object.entries(propsProgress).map(([name, p]) => ({ name, progress: p, status: p >= 100 ? 'done' : 'uploading' }));
        totalCount = files.length;
        doneCount = files.filter(f => f.progress >= 100).length;
        overallProgress = files.length > 0
            ? Math.round(files.reduce((acc, f) => acc + f.progress, 0) / files.length)
            : 0;
        title = propsTitle;
        onDismiss = undefined;
    }

    if (!isOpen || isMinimized || (files.length === 0 && !isRichProps(props))) return null;

    const allDone = doneCount === totalCount && totalCount > 0;
    const hasErrors = files.some(f => f.status === 'error');
    const circumference = 2 * Math.PI * 52; // r=52

    return (
        <div className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20">

                {/* ── Header ────────────────────────────────────────────────────── */}
                <div className="px-6 pt-6 pb-4 flex items-start gap-4">
                    {/* Circular progress */}
                    <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                            <circle cx="60" cy="60" r="52" stroke="#f3f4f6" strokeWidth="10" fill="none" />
                            <circle
                                cx="60" cy="60" r="52"
                                stroke={allDone ? '#22c55e' : hasErrors ? '#ef4444' : '#f59e0b'}
                                strokeWidth="10"
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference - (circumference * overallProgress) / 100}
                                className="transition-all duration-500 ease-out"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {allDone
                                ? <CheckCircle2 className="w-7 h-7 text-green-500" />
                                : <span className="text-xl font-black text-gray-800">{overallProgress}%</span>
                            }
                        </div>
                    </div>

                    {/* Title + count */}
                    <div className="flex-1 min-w-0 pt-1">
                        <h3 className="text-lg font-bold text-gray-900 font-serif italic leading-tight">
                            {allDone ? 'Upload complete!' : title}
                        </h3>
                        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400 mt-1">
                            {doneCount} of {totalCount} file{totalCount !== 1 ? 's' : ''} · {overallProgress}%
                        </p>
                        {!allDone && (
                            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: `${overallProgress}%`,
                                        background: hasErrors
                                            ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                            : 'linear-gradient(90deg, #f9a8d4, #ec4899)',
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Dismiss / Minimize buttons */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {isRichProps(props) && !allDone && !hasErrors && (
                            <button
                                onClick={props.onMinimize}
                                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                                title="Minimize to background"
                            >
                                <Minus className="w-4 h-4 text-gray-400" />
                            </button>
                        )}
                        {(allDone || hasErrors) && onDismiss && (
                            <button
                                onClick={onDismiss}
                                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Per-file list ──────────────────────────────────────────────── */}
                <div className="px-6 pb-6 space-y-3 max-h-56 overflow-y-auto custom-scrollbar">
                    {files.map(f => (
                        <div key={f.name} className="flex items-center gap-3 group">
                            {/* Status icon */}
                            <div className="shrink-0">
                                {f.status === 'done'
                                    ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                                    : f.status === 'error'
                                    ? <AlertCircle className="w-5 h-5 text-red-400" />
                                    : f.status === 'aborted'
                                    ? <X className="w-5 h-5 text-gray-400" />
                                    : f.status === 'uploading'
                                    ? <Loader2 className="w-5 h-5 text-catalog-accent animate-spin" />
                                    : <div className="w-5 h-5 rounded-full border-2 border-gray-100" />
                                }
                            </div>
                            
                            {/* Name + bar */}
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline mb-1">
                                    <span className={cn(
                                        "text-[12px] font-bold text-gray-600 truncate max-w-[200px] block transition-colors",
                                        f.status === 'aborted' && "text-gray-300 line-through"
                                    )}>
                                        {f.name}
                                    </span>
                                    <div className="flex items-center gap-2 shrink-0 ml-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">
                                            {f.status === 'error' ? 'Error' : f.status === 'aborted' ? 'Cancelled' : `${f.progress}%`}
                                        </span>
                                        {isRichProps(props) && (f.status === 'uploading' || f.status === 'pending') && (
                                            <button 
                                                onClick={() => props.onCancelFile?.(f.name)}
                                                className="p-1 hover:bg-red-50 hover:text-red-500 text-gray-300 rounded-md transition-all active:scale-95"
                                                title="Cancel this upload"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all duration-300"
                                        style={{
                                            width: `${f.progress}%`,
                                            background: f.status === 'error'
                                                ? '#ef4444'
                                                : f.status === 'aborted'
                                                ? '#d1d5db'
                                                : f.status === 'done'
                                                ? '#22c55e'
                                                : 'linear-gradient(90deg, #f9a8d4, #ec4899)',
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Footer ────────────────────────────────────────────────────── */}
                {!allDone && (
                    <div className="px-6 pb-5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 font-serif italic">
                            <Loader2 className="w-3 h-3 animate-spin text-catalog-accent" />
                            Please keep this window open
                        </div>
                        {isRichProps(props) && (
                            <button
                                onClick={() => props.onCancelAll?.()}
                                className="text-[10px] font-black uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors px-3 py-1 bg-red-50 rounded-lg"
                            >
                                Stop All
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
