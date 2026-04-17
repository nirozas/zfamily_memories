/**
 * UniversalUploadButton — Drop-in upload trigger for any page.
 *
 * Renders a button that opens a source picker modal with:
 *  - Device upload (images + videos)
 *  - Google Photos picker
 *  - Direct URL import
 *
 * Also renders the UploadOverlay progress panel automatically.
 *
 * Usage:
 *   <UniversalUploadButton
 *     familyId={familyId}
 *     folder="Stacks/Kids"
 *     onComplete={(items) => console.log(items)}
 *   />
 */
import { useRef, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, Link as LinkIcon, X, CloudUpload, Grid, Folder, Plus, ChevronRight, Check } from 'lucide-react';
import { type UseUploadManagerOptions, type UploadedItem } from '../../hooks/useUploadManager';
import { useUpload } from '../../contexts/UploadContext';
import { UploadOverlay } from './UploadOverlay';
import { cn } from '../../lib/utils';

interface UniversalUploadButtonProps extends UseUploadManagerOptions {
    variant?: 'primary' | 'secondary' | 'icon' | 'sidebar';
    label?: string;
    className?: string;
    showUrlImport?: boolean;
    onComplete?: (items: UploadedItem[]) => void;
    showLibraryImport?: boolean;
    onSelectExisting?: () => void;
}

export function UniversalUploadButton({
    variant = 'primary',
    label = 'Add Media',
    className,
    showUrlImport = true,
    familyId,
    folder,
    useHls,
    onComplete,
    showLibraryImport = false,
    onSelectExisting,
    isSystemAsset = false,
}: UniversalUploadButtonProps) {
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlInputValue, setUrlInputValue] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [selectedFolder, setSelectedFolder] = useState(folder || '/');
    const [showFolderPicker, setShowFolderPicker] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [existingFolders, setExistingFolders] = useState<string[]>([]);

    const fetchExistingFolders = async () => {
        try {
            if (isSystemAsset) {
                const { data, error } = await supabase.from('library_assets').select('category');
                if (error) throw error;
                const categories = Array.from(new Set((data as any[])?.map(i => i.category) || []))
                    .sort((a, b) => a.localeCompare(b)) as string[];
                setExistingFolders(categories);
            } else {
                if (!familyId) return;
                const { data, error } = await (supabase.from('family_media' as any) as any)
                    .select('folder')
                    .eq('family_id', familyId);
                if (error) throw error;
                const folders = Array.from(new Set(data?.map((i: any) => i.folder || '/') || []))
                    .sort((a: any, b: any) => a.localeCompare(b)) as string[];
                setExistingFolders(folders);
            }
        } catch (err) {
            console.error('[Upload] Failed to fetch folders:', err);
        }
    };

    // Build tree structure from flat paths
    const folderHierarchy = useMemo(() => {
        const root: any = { name: 'Library Root', path: '/', children: [] };
        const map: Record<string, any> = { '/': root };

        existingFolders.forEach(path => {
            if (path === '/') return;
            const parts = path.split('/');
            let currentPath = '';
            
            parts.forEach((part) => {
                const parentPath = currentPath || '/';
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                if (!map[currentPath]) {
                    const newNode = { name: part, path: currentPath, children: [] };
                    map[currentPath] = newNode;
                    map[parentPath].children.push(newNode);
                }
            });
        });
        return root;
    }, [existingFolders]);

    const [browsingPath, setBrowsingPath] = useState('/');
    const currentFolderNode = useMemo(() => {
        // Simple search in the map logic
        const findNode = (node: any, path: string): any => {
            if (node.path === path) return node;
            for (const child of node.children) {
                const found = findNode(child, path);
                if (found) return found;
            }
            return null;
        };
        return findNode(folderHierarchy, browsingPath) || folderHierarchy;
    }, [folderHierarchy, browsingPath]);

    const { state: uploadState, uploadFiles, dismissUpload, cancelUpload, cancelAll, setMinimized } = useUpload();

    async function handleFileSelect(filesToUpload: File[]) {
        if (filesToUpload.length === 0) return;
        
        // 1. Determine target folder
        const targetFolder = browsingPath === '/' 
            ? (selectedFolder === '/' ? (isSystemAsset ? 'sticker' : 'vault') : selectedFolder) 
            : browsingPath;
        
        // 2. Upload
        await uploadFiles(filesToUpload, {
            familyId,
            folder: targetFolder,
            useHls,
            isSystemAsset,
            onComplete: (items) => {
                onComplete?.(items);
            }
        });
    }

    function openFilePicker() {
        setShowSourceModal(false);
        fileInputRef.current?.click();
    }

    async function handleUrlImport() {
        const url = urlInputValue.trim();
        if (!url || !url.startsWith('http')) return;
        setShowUrlInput(false);
        setUrlInputValue('');
        const isVideo = /\.(mp4|mov|webm|mkv|avi|m4v)(\?.*)?$/i.test(url);
        const filename = url.split('/').pop()?.split('?')[0] || `import-${Date.now()}`;

        try {
            const resp = await fetch(url);
            const blob = await resp.blob();
            const file = new File([blob], filename, { type: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg') });
            await handleFileSelect([file]);
        } catch (e: any) {
            alert(`Failed to import URL: ${e.message}`);
        }
    }

    // ── Trigger button variants ───────────────────────────────────────────────
    const triggerButton = (() => {
        if (variant === 'icon') {
            return (
                <button
                    type="button"
                    id="universal-upload-trigger"
                    onClick={() => setShowSourceModal(true)}
                    className={cn("p-2.5 bg-catalog-accent text-white rounded-xl shadow hover:bg-catalog-accent/90 transition-all hover:scale-105 active:scale-95", className)}
                    title={label}
                >
                    <Upload className="w-4 h-4" />
                </button>
            );
        }
        if (variant === 'sidebar') {
            return (
                <button
                    type="button"
                    id="universal-upload-trigger"
                    onClick={() => setShowSourceModal(true)}
                    className={cn("w-full flex items-center justify-center gap-2 bg-catalog-accent text-white py-2.5 rounded-lg hover:bg-catalog-accent/90 transition-all shadow-sm font-medium text-sm", className)}
                >
                    <Upload className="w-4 h-4" />
                    {label}
                </button>
            );
        }
        if (variant === 'secondary') {
            return (
                <button
                    type="button"
                    id="universal-upload-trigger"
                    onClick={() => setShowSourceModal(true)}
                    className={cn("flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all", className)}
                >
                    <Upload className="w-4 h-4" />
                    {label}
                </button>
            );
        }
        // Primary (default)
        return (
            <button
                type="button"
                id="universal-upload-trigger"
                onClick={() => setShowSourceModal(true)}
                className={cn(
                    "flex items-center gap-2 px-5 py-2.5 bg-catalog-accent text-white rounded-full font-semibold shadow-md hover:bg-catalog-accent/90 hover:shadow-lg hover:-translate-y-0.5 transition-all active:scale-95 text-sm",
                    className
                )}
            >
                <CloudUpload className="w-4 h-4" />
                {label}
            </button>
        );
    })();

    return (
        <>
            {triggerButton}

            {/* Hidden file input */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={e => {
                    if (e.target.files && e.target.files.length > 0) {
                        handleFileSelect(Array.from(e.target.files));
                    }
                    e.target.value = '';
                }}
            />

            {/* ── Source picker modal ────────────────────────────────────────── */}
            {showSourceModal && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setShowSourceModal(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">{isSystemAsset ? 'Add System Asset' : 'Add Media'}</h2>
                            <button onClick={() => setShowSourceModal(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>

                        {(true) && (
                            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Destination</span>
                                    <button 
                                        onClick={() => {
                                            fetchExistingFolders();
                                            setShowFolderPicker(!showFolderPicker);
                                        }}
                                        className="text-[10px] font-semibold text-catalog-accent hover:underline flex items-center gap-1"
                                    >
                                        {showFolderPicker ? 'Close' : 'Change'}
                                        <ChevronRight className={cn("w-2.5 h-2.5 transition-transform", showFolderPicker && "rotate-90")} />
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 group">
                                    <div className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-100">
                                        <Folder className="w-3.5 h-3.5 text-catalog-accent" />
                                    </div>
                                    <span className="text-xs font-semibold text-gray-700 truncate">
                                        {selectedFolder === '/' ? 'Library Root' : selectedFolder}
                                    </span>
                                </div>

                                {showFolderPicker && (
                                    <div className="mt-3 space-y-3 pt-3 border-t border-gray-100">
                                        {/* Breadcrumbs */}
                                        <div className="flex items-center flex-wrap gap-1 text-[10px] text-gray-400 bg-white/50 p-1.5 rounded-lg border border-gray-50 mb-2">
                                            <button 
                                                onClick={() => setBrowsingPath('/')}
                                                className={cn("hover:text-catalog-accent transition-colors", browsingPath === '/' && "text-catalog-accent font-bold")}
                                            >
                                                Root
                                            </button>
                                            {browsingPath !== '/' && browsingPath.split('/').map((part, idx, arr) => {
                                                const path = arr.slice(0, idx + 1).join('/');
                                                return (
                                                    <div key={path} className="flex items-center gap-1">
                                                        <ChevronRight className="w-2 h-2" />
                                                        <button 
                                                            onClick={() => setBrowsingPath(path)}
                                                            className={cn("hover:text-catalog-accent transition-colors", browsingPath === path && "text-catalog-accent font-bold")}
                                                        >
                                                            {part}
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Folder List */}
                                        <div className="max-h-40 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                            {/* Parent Directory Link */}
                                            {browsingPath !== '/' && (
                                                <button
                                                    onClick={() => {
                                                        const parts = browsingPath.split('/');
                                                        parts.pop();
                                                        setBrowsingPath(parts.join('/') || '/');
                                                    }}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] text-gray-400 hover:bg-white transition-colors"
                                                >
                                                    <div className="w-1 h-1 rounded-full bg-gray-300" />
                                                    .. Back
                                                </button>
                                            )}

                                            {currentFolderNode.children.length > 0 ? (
                                                currentFolderNode.children.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((child: any) => (
                                                    <div key={child.path} className="group/item relative">
                                                        <div
                                                            onClick={() => setSelectedFolder(child.path)}
                                                            className={cn(
                                                                "w-full flex items-center justify-between px-2 py-2 rounded-lg text-[11px] transition-all cursor-pointer",
                                                                selectedFolder === child.path 
                                                                    ? "bg-catalog-accent/10 text-catalog-accent font-bold border border-catalog-accent/20" 
                                                                    : "hover:bg-white text-gray-600 border border-transparent"
                                                                )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <Folder className={cn("w-3 h-3", selectedFolder === child.path ? "text-catalog-accent fill-catalog-accent/20" : "text-gray-400")} />
                                                                <span className="truncate">{child.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                {selectedFolder === child.path && <Check className="w-3 h-3" />}
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setBrowsingPath(child.path);
                                                                    }}
                                                                    className="p-1 hover:bg-catalog-accent/20 rounded-md transition-colors"
                                                                >
                                                                    <ChevronRight className="w-3 h-3 text-catalog-accent" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="py-4 text-center">
                                                    <div className="text-[10px] text-gray-400 italic">No subfolders here</div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Selection Actions */}
                                        <div className="pt-2 border-t border-gray-100 flex items-center gap-2">
                                            <button 
                                                onClick={() => {
                                                    setSelectedFolder(browsingPath);
                                                    setShowFolderPicker(false);
                                                }}
                                                className="flex-1 py-1.5 bg-gray-100 text-gray-600 hover:bg-catalog-accent hover:text-white rounded-lg text-[10px] font-bold transition-all"
                                            >
                                                Select Current: {browsingPath === '/' ? 'Root' : browsingPath.split('/').pop()}
                                            </button>
                                        </div>
                                        
                                        <div className="flex items-center gap-2">
                                            <div className="relative flex-1">
                                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                                                    <Plus className="w-3 h-3" />
                                                </div>
                                                <input 
                                                    type="text"
                                                    placeholder="Subfolder name..."
                                                    value={newFolderName}
                                                    onChange={e => setNewFolderName(e.target.value)}
                                                    className="w-full pl-7 pr-2 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] focus:outline-none focus:ring-2 focus:ring-catalog-accent/20 focus:border-catalog-accent transition-all"
                                                />
                                            </div>
                                            <button 
                                                disabled={!newFolderName.trim()}
                                                onClick={() => {
                                                    const trimmed = newFolderName.trim().replace(/^\/+|\/+$/g, '');
                                                    if (trimmed) {
                                                        const fullPath = browsingPath === '/' ? trimmed : `${browsingPath}/${trimmed}`;
                                                        setSelectedFolder(fullPath);
                                                        setNewFolderName('');
                                                        setShowFolderPicker(false);
                                                    }
                                                }}
                                                className="px-3 py-1.5 bg-catalog-accent text-white rounded-lg disabled:opacity-50 text-[10px] font-bold shadow-sm shadow-catalog-accent/20"
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="p-3 space-y-1">
                            {/* Vault Library */}
                            {showLibraryImport && (
                                <button
                                    onClick={() => { setShowSourceModal(false); onSelectExisting?.(); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-emerald-50 transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Grid className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 text-sm">Vault Library</div>
                                        <div className="text-xs text-gray-400">Pick from existing media</div>
                                    </div>
                                </button>
                            )}

                            {/* Device upload */}
                            <button
                                onClick={openFilePicker}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors text-left group"
                            >
                                <div className="w-10 h-10 rounded-full bg-catalog-accent/10 text-catalog-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Upload className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="font-semibold text-gray-900 text-sm">From Device</div>
                                    <div className="text-xs text-gray-400">Photos & videos from your device</div>
                                </div>
                            </button>

                            {/* URL import */}
                            {showUrlImport && (
                                <button
                                    onClick={() => { setShowSourceModal(false); setShowUrlInput(true); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-purple-50 transition-colors text-left group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <LinkIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900 text-sm">From URL</div>
                                        <div className="text-xs text-gray-400">Paste an image or video link</div>
                                    </div>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── URL import modal ───────────────────────────────────────────── */}
            {showUrlInput && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setShowUrlInput(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-sm overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <h2 className="text-base font-bold text-gray-900">Import from URL</h2>
                            <button onClick={() => setShowUrlInput(false)} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <input
                                autoFocus
                                type="url"
                                placeholder="https://example.com/photo.jpg"
                                value={urlInputValue}
                                onChange={e => setUrlInputValue(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleUrlImport()}
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-catalog-accent/30 focus:border-catalog-accent"
                            />
                            <button
                                disabled={!urlInputValue.trim().startsWith('http')}
                                onClick={handleUrlImport}
                                className="w-full py-2.5 bg-catalog-accent text-white rounded-xl text-sm font-bold hover:bg-catalog-accent/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Import
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Upload progress overlay ────────────────────────────────────── */}
            <UploadOverlay
                state={uploadState}
                title="Uploading to your library…"
                onDismiss={dismissUpload}
                onCancelFile={cancelUpload}
                onCancelAll={cancelAll}
                onMinimize={() => setMinimized(true)}
            />
        </>
    );
}
