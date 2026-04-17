// useUploadManager.ts
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface FileUploadState {
    name: string;
    progress: number; // 0-100
    status: 'pending' | 'uploading' | 'done' | 'error' | 'aborted';
    error?: string;
}

export interface UploadManagerState {
    isOpen: boolean;
    files: FileUploadState[];
    totalCount: number;
    doneCount: number;
    overallProgress: number;
}

export interface UseUploadManagerOptions {
    familyId?: string | null;
    folder?: string;
    onComplete?: (uploadedItems: UploadedItem[]) => void;
    useHls?: boolean;
    isSystemAsset?: boolean;
}

export interface UploadedItem {
    url: string;
    type: 'image' | 'video';
    filename: string;
    r2Key?: string;
    size?: number;
    metadata?: any;
}

const INITIAL_STATE: UploadManagerState = {
    isOpen: false,
    files: [],
    totalCount: 0,
    doneCount: 0,
    overallProgress: 0,
};

export function useUploadManager(options: UseUploadManagerOptions = {}) {
    const { familyId, folder = '/', onComplete, useHls = false, isSystemAsset = false } = options;
    const { user } = useAuth();
    const abortControllersRef = import.meta.env.SSR ? { current: new Map() } : (function() {
        const ref = { current: new Map<string, AbortController>() };
        return ref;
    })();

    const [state, setState] = useState<UploadManagerState>(INITIAL_STATE);
    const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);

    const updateFile = useCallback((name: string, update: Partial<FileUploadState>) => {
        setState(prev => {
            const files = prev.files.map(f => f.name === name ? { ...f, ...update } : f);
            const doneCount = files.filter(f => f.status === 'done' || f.status === 'error' || f.status === 'aborted').length;
            const totalCount = files.length;
            const overallProgress = totalCount > 0
                ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / totalCount)
                : 0;
            return { ...prev, files, doneCount, totalCount, overallProgress };
        });
    }, []);

    const saveToDatabase = useCallback(async (item: UploadedItem, targetFolder: string) => {
        try {
            if (isSystemAsset) {
                const { error } = await (supabase.from('library_assets') as any).insert({
                    category: targetFolder === '/' ? 'sticker' : targetFolder.toLowerCase(), // fallback to sticker
                    name: item.filename,
                    url: item.url,
                    tags: []
                });
                if (error) console.error('[Upload] Library insert error:', error);
            } else {
                if (!familyId) return;
                const { error } = await (supabase.from('family_media') as any).insert({
                    family_id: familyId,
                    url: item.url,
                    type: item.type,
                    filename: item.filename,
                    folder: targetFolder,
                    size: item.size,
                    category: 'general',
                    uploaded_by: user?.id,
                    metadata: { 
                        storage: 'r2', 
                        r2Key: item.r2Key,
                        ...(item.metadata || {})
                    }
                });
                if (error) console.error('[Upload] DB insert error:', error);
            }
        } catch (err) {
            console.error('[Upload] Failed to save to DB:', err);
        }
    }, [familyId, user?.id, isSystemAsset]);

    const uploadFiles = useCallback(async (files: File[], targetFolder?: string) => {
        if (!files || files.length === 0) return;

        const effectiveFolder = targetFolder ?? folder;

        const fileStates: FileUploadState[] = files.map(f => ({
            name: f.name,
            progress: 0,
            status: 'pending',
        }));

        setState({
            isOpen: true,
            files: fileStates,
            totalCount: files.length,
            doneCount: 0,
            overallProgress: 0,
        });
        setUploadedItems([]);

        const { storageService } = await import('../services/storage');
        const results: UploadedItem[] = [];

        const getImageDimensions = (file: File): Promise<{ w: number, h: number } | null> => {
            if (!file.type.startsWith('image/')) return Promise.resolve(null);
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    resolve({ w: img.naturalWidth, h: img.naturalHeight });
                    URL.revokeObjectURL(img.src);
                };
                img.onerror = () => resolve(null);
                img.src = URL.createObjectURL(file);
            });
        };

        // --- Parallel Upload Logic with Concurrency Limit ---
        const CONCURRENCY_LIMIT = 5;
        let currentIndex = 0;

        const uploadFileTask = async (file: File) => {
            const controller = new AbortController();
            (abortControllersRef as any).current.set(file.name, controller);

            updateFile(file.name, { status: 'uploading', progress: 0 });

            const isVideo = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i);
            
            const pathPrefix = isSystemAsset
                ? (folder === '/' ? 'sticker' : folder.toLowerCase())
                : (effectiveFolder && effectiveFolder !== '/'
                    ? `mediaItems/${familyId}/${effectiveFolder.replace(/^\/+|\/+$/g, '')}`
                    : `mediaItems/${familyId}/vault`);

            try {
                const { url, error, r2Key } = await (storageService as any).uploadFile(
                    file,
                    'zoabimemories',
                    pathPrefix,
                    (p: any) => updateFile(file.name, { progress: Math.floor((p.loaded / p.total) * 100) }),
                    useHls,
                    isSystemAsset,
                    controller.signal
                );

                if (error || !url) throw new Error(error || 'Upload returned no URL');

                const dims = await getImageDimensions(file);

                const uploadedItem: UploadedItem = {
                    url,
                    type: isVideo ? 'video' : 'image',
                    filename: file.name,
                    r2Key,
                    size: file.size,
                    metadata: {
                        resolution: dims ? `${dims.w}x${dims.h}` : undefined,
                        dateTaken: file.lastModified ? new Date(file.lastModified).toISOString() : undefined
                    }
                };

                updateFile(file.name, { status: 'done', progress: 100 });
                results.push(uploadedItem);
                await saveToDatabase(uploadedItem, effectiveFolder);
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    console.log(`[Upload] Cancelled: ${file.name}`);
                    updateFile(file.name, { status: 'aborted', progress: 0 });
                } else {
                    console.error(`[Upload] Failed for ${file.name}:`, err);
                    updateFile(file.name, { status: 'error', progress: 0, error: err.message });
                }
            } finally {
                (abortControllersRef as any).current.delete(file.name);
            }
        };

        // Worker function to consume files from the queue
        const worker = async () => {
            while (currentIndex < files.length) {
                const file = files[currentIndex++];
                await uploadFileTask(file);
            }
        };

        // Start initial workers
        const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, files.length) }, () => worker());
        await Promise.all(workers);

        setUploadedItems(results);
        onComplete?.(results);

        setTimeout(() => {
            setState(prev => {
                const allDone = prev.files.every(f => f.status === 'done' || f.status === 'error');
                if (allDone) return { ...prev, isOpen: false };
                return prev;
            });
        }, 2500);
    }, [folder, familyId, user?.id, useHls, isSystemAsset, updateFile, saveToDatabase, onComplete]);

    const cancelUpload = useCallback((name: string) => {
        const controller = (abortControllersRef as any).current.get(name);
        if (controller) {
            controller.abort();
            (abortControllersRef as any).current.delete(name);
        }
    }, [abortControllersRef]);

    const cancelAll = useCallback(() => {
        (abortControllersRef as any).current.forEach((c: any) => c.abort());
        (abortControllersRef as any).current.clear();
    }, [abortControllersRef]);

    const dismissUpload = useCallback(() => {
        cancelAll();
        setState(INITIAL_STATE);
        setUploadedItems([]);
    }, [cancelAll]);

    return {
        uploadState: state,
        uploadedItems,
        uploadFiles,
        cancelUpload,
        cancelAll,
        dismissUpload,
    };
}
