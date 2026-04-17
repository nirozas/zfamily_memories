import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface FileUploadState {
    name: string;
    progress: number; // 0-100
    status: 'pending' | 'uploading' | 'done' | 'error' | 'aborted';
    error?: string;
}

export interface UploadManagerState {
    isOpen: boolean;
    isMinimized: boolean;
    files: FileUploadState[];
    totalCount: number;
    doneCount: number;
    overallProgress: number;
}

export interface UploadedItem {
    url: string;
    type: 'image' | 'video';
    filename: string;
    r2Key?: string;
    size?: number;
    metadata?: any;
}

interface UploadContextType {
    state: UploadManagerState;
    uploadedItems: UploadedItem[];
    uploadFiles: (files: File[], options: { familyId?: string | null; folder?: string; useHls?: boolean; isSystemAsset?: boolean; onComplete?: (results: UploadedItem[]) => void }) => Promise<void>;
    cancelUpload: (name: string) => void;
    cancelAll: () => void;
    dismissUpload: () => void;
    setMinimized: (minimized: boolean) => void;
}

const INITIAL_STATE: UploadManagerState = {
    isOpen: false,
    isMinimized: false,
    files: [],
    totalCount: 0,
    doneCount: 0,
    overallProgress: 0,
};

const UploadContext = createContext<UploadContextType | undefined>(undefined);

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const abortControllersRef = useRef(new Map<string, AbortController>());
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

    const saveToDatabase = useCallback(async (item: UploadedItem, targetFolder: string, familyId?: string | null, isSystemAsset?: boolean) => {
        try {
            if (isSystemAsset) {
                const { error } = await (supabase.from('library_assets') as any).insert({
                    category: targetFolder === '/' ? 'sticker' : targetFolder.toLowerCase(),
                    name: item.filename,
                    url: item.url,
                    tags: []
                });
                if (error) console.error('[Upload] Library insert error:', error);
            } else {
                if (!familyId) {
                    console.warn('[Upload] skipping DB save: No familyId provided');
                    return;
                }
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
    }, [user?.id]);

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

    const uploadFiles = useCallback(async (files: File[], options: { familyId?: string | null; folder?: string; useHls?: boolean; isSystemAsset?: boolean; onComplete?: (results: UploadedItem[]) => void }) => {
        const { familyId, folder = '/', useHls = false, isSystemAsset = false, onComplete } = options;
        if (!files || files.length === 0) return;

        // Force reset state for new batch
        setState({
            isOpen: true,
            isMinimized: false,
            files: files.map(f => ({ name: f.name, progress: 0, status: 'pending' })),
            totalCount: files.length,
            doneCount: 0,
            overallProgress: 0,
        });
        setUploadedItems([]);

        // Dynamic import to avoid circular dependencies
        const { storageService } = await import('../services/storage');

        const results: UploadedItem[] = [];
        const CONCURRENCY_LIMIT = 5;
        let currentIndex = 0;

        const uploadFileTask = async (file: File) => {
            const controller = new AbortController();
            abortControllersRef.current.set(file.name, controller);

            updateFile(file.name, { status: 'uploading', progress: 0 });

            const isVideo = file.type.startsWith('video/') || !!file.name.match(/\.(mp4|mov|webm|mkv|avi|m4v)$/i);
            
            // Normalize categories to match DB check constraints (singular)
            const categoryMap: Record<string, string> = {
                'stickers': 'sticker',
                'backgrounds': 'background',
                'frames': 'frame',
                'ribbons': 'ribbon'
            };

            const normalizedCategory = isSystemAsset 
                ? (categoryMap[folder.toLowerCase()] || folder.toLowerCase())
                : folder;

            const pathPrefix = isSystemAsset 
                ? (normalizedCategory === 'sticker' || folder === '/' ? 'sticker' : normalizedCategory) 
                : (`mediaItems/${familyId}/${folder === '/' || folder === 'vault' ? 'vault' : folder.replace(/^\/+|\/+$/g, '')}`);

            try {
                const { url, error, r2Key } = await storageService.uploadFile(
                    file,
                    'zoabimemories',
                    pathPrefix,
                    (p) => updateFile(file.name, { progress: Math.floor((p.loaded / p.total) * 100) }),
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
                
                // Use normalized category for DB insert
                await saveToDatabase(uploadedItem, normalizedCategory, familyId, isSystemAsset);
            } catch (err: any) {
                if (err.name === 'AbortError') {
                    updateFile(file.name, { status: 'aborted', progress: 0 });
                } else {
                    updateFile(file.name, { status: 'error', progress: 0, error: err.message });
                }
            } finally {
                abortControllersRef.current.delete(file.name);
            }
        };

        const worker = async () => {
            while (currentIndex < files.length) {
                const fileIndex = currentIndex++;
                const file = files[fileIndex];
                if (file) await uploadFileTask(file);
            }
        };

        const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, files.length) }, () => worker());
        await Promise.all(workers);

        setUploadedItems(results);
        if (onComplete) onComplete(results);

        // Auto-close if not minimized and everything is done
        setTimeout(() => {
            setState(prev => {
                const allDone = prev.files.every(f => f.status === 'done' || f.status === 'error' || f.status === 'aborted');
                if (allDone && !prev.isMinimized) return { ...prev, isOpen: false };
                return prev;
            });
        }, 3000);
    }, [user?.id, updateFile, saveToDatabase]);

    const cancelUpload = useCallback((name: string) => {
        const controller = abortControllersRef.current.get(name);
        if (controller) {
            controller.abort();
            abortControllersRef.current.delete(name);
        }
    }, []);

    const cancelAll = useCallback(() => {
        abortControllersRef.current.forEach(c => c.abort());
        abortControllersRef.current.clear();
    }, []);

    const dismissUpload = useCallback(() => {
        cancelAll();
        setState(INITIAL_STATE);
        setUploadedItems([]);
    }, [cancelAll]);

    const setMinimized = useCallback((minimized: boolean) => {
        setState(prev => ({ ...prev, isMinimized: minimized }));
    }, []);

    return (
        <UploadContext.Provider value={{
            state,
            uploadedItems,
            uploadFiles,
            cancelUpload,
            cancelAll,
            dismissUpload,
            setMinimized
        }}>
            {children}
        </UploadContext.Provider>
    );
}

export function useUpload() {
    const context = useContext(UploadContext);
    if (!context) throw new Error('useUpload must be used within an UploadProvider');
    return context;
}
