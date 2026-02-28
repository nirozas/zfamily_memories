import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { GooglePhotosService } from '../services/googlePhotos';
import { AlbumDataService } from '../services/albumDataService';
import {
    unifiedAlbumToContextAlbum,
    contextAlbumToUnifiedAlbum,
} from '../lib/albumAdapters';

export interface Asset {
    id: string;
    type: 'image' | 'video' | 'ribbon' | 'frame' | 'text' | 'sticker' | 'shape' | 'location' | 'map';
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scale?: number;
    zIndex: number;
    slotId?: number;

    // Transform
    flipX?: boolean;
    flipY?: boolean;
    opacity?: number;
    aspectRatio?: number;
    lockAspectRatio?: boolean;
    pivot?: { x: number; y: number }; // Relative focal point (0-1) for scaling/rotation

    // Clipping / Masking
    clipPoints?: {
        x: number;
        y: number;
        c1x?: number; // Control point 1 x
        c1y?: number; // Control point 1 y
        c2x?: number; // Control point 2 x
        c2y?: number; // Control point 2 y
        type: 'linear' | 'bezier';
    }[];

    // Smart Frames & Placeholders
    isPlaceholder?: boolean;
    fitMode?: 'fit' | 'fill' | 'original' | 'cover' | 'stretch';
    originalDimensions?: { width: number; height: number };

    // Visual Adjustments
    filter?: string;
    filterIntensity?: number;
    brightness?: number;
    contrast?: number;
    saturate?: number;
    hue?: number;
    sepia?: number;
    blur?: number;
    exposure?: number;
    highlights?: number;
    shadows?: number;
    warmth?: number;
    sharpness?: number;

    // Text Properties
    content?: string;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string | number;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: 'left' | 'center' | 'right' | 'justify';
    textDecoration?: 'none' | 'underline' | 'line-through';
    textColor?: string;
    textBackgroundColor?: string;
    textShadow?: string;
    color?: string; // Unified color property

    // Borders & Appearance
    borderRadius?: number;
    borderColor?: string;
    borderWidth?: number;

    // AI Effects
    isRemovingBackground?: boolean;
    aiEffect?: string;
    aiEffectReference?: string;
    chromaKeyColor?: string;
    chromaKeyColors?: string[];
    chromaKeyTolerance?: number;

    // Crop
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
        zoom: number;
    };

    // Layer Management
    id_name?: string;
    isLocked?: boolean;
    isHidden?: boolean;
    isStamp?: boolean;
    category?: string;
    folder?: string;

    // Location Data
    lat?: number;
    lng?: number;
    mapConfig?: {
        center: { lat: number; lng: number };
        zoom: number;
        places: { name: string; lat: number; lng: number }[];
    };
    googlePhotoId?: string;
    createdAt?: Date;
}

export interface AlbumConfig {
    dimensions: {
        width: number;
        height: number;
        unit: 'px' | 'in' | 'cm';
        bleed: number;
        gutter: number;
    };
    useSpreadView: boolean;
    gridSettings: {
        size: number;
        snap: boolean;
        visible: boolean;
    };
    styleSync?: boolean;
    isLocked?: boolean;
}

// ============================================================================
// UNIFIED SCHEMA - Critical for Studio/Preview/View Consistency
// ============================================================================

/**
 * LayoutBox - Universal layout element definition
 * MUST be used identically in Studio, Preview, and View modes
 */
export interface LayoutBox {
    id: string;
    role: 'slot' | 'text' | 'decoration';

    // Position (percentage-based, relative to page container)
    left: number;    // 0-100
    top: number;     // 0-100
    width: number;   // 0-100
    height: number;  // 0-100

    // Z-Index Hierarchy: Background(0) < Images(10) < Text(50) < Overlays(100)
    zIndex: number;
    z?: number; // Alias for compatibility

    // Content (for slots and text)
    content?: {
        type: 'image' | 'video' | 'text' | 'map' | 'location';
        url?: string;

        // Transform data (pixel-perfect across modes)
        zoom: number;        // 1.0 = 100%, must be preserved exactly
        x: number;           // 0-100 (focal point X percentage)
        y: number;           // 0-100 (focal point Y percentage)
        rotation: number;    // degrees, must be preserved exactly

        // Text-specific
        text?: string;
        fontSize?: number;
        fontFamily?: string;
        color?: string;
        textAlign?: 'left' | 'center' | 'right' | 'justify';
        fontWeight?: string | number;
        lineHeight?: number;

        // Additional config (preserved as-is)
        config?: Record<string, any>;
    };

    // Legacy field aliases for backward compatibility
    x?: number;
    y?: number;
}

/**
 * PageStyles - Universal page styling
 * MUST be consistent across all rendering modes
 */
export interface PageStyles {
    backgroundColor: string;
    backgroundOpacity: number;
    backgroundImage?: string;
    backgroundBlendMode?: string;
}

export interface Page {
    id: string;
    pageNumber: number;
    layoutTemplate?: string;
    layoutConfig?: LayoutBox[]; // MANDATORY: Never null, minimum []
    assets: Asset[]; // Legacy support, being phased out
    backgroundColor: string;
    backgroundOpacity?: number;
    backgroundImage?: string;
    backgroundScale?: 'cover' | 'contain' | 'stretch';
    backgroundPosition?: 'top' | 'center' | 'bottom';
    name?: string;
    isSpreadLayout?: boolean;

    // New unified fields
    pageStyles?: PageStyles;
    textLayers?: LayoutBox[]; // Separate text elements for easier editing
}

export interface AlbumPageData extends Page {
    // Ensuring unified fields are present
    layout_config: LayoutBox[];
    page_styles: PageStyles;
    text_layers: LayoutBox[];
}


export interface Album {
    id: string;
    family_id: string;
    title: string;
    description?: string;
    category?: string;
    coverUrl?: string;
    pages: Page[];
    unplacedMedia: Asset[];
    hashtags: string[];
    config: AlbumConfig;
    createdAt: Date;
    updatedAt: Date;
    isPublished: boolean;
    location?: string;
    country?: string;
    geotag?: { lat: number; lng: number };
}

interface AlbumContextType {
    album: Album | null;
    currentPageIndex: number;
    selectedAssetId: string | null;
    setAlbum: (album: Album) => void;
    setCurrentPageIndex: (index: number) => void;
    setSelectedAssetId: (id: string | null) => void;
    addPage: (template?: Page['layoutTemplate'], atIndex?: number) => void;
    removePage: (pageId: string) => void;
    updatePage: (pageId: string, updates: Partial<Page>) => void;
    addAsset: (pageId: string, asset: Omit<Asset, 'id'>) => void;
    updateAsset: (pageId: string, assetId: string, updates: Partial<Asset>, options?: { skipHistory?: boolean }) => void;
    removeAsset: (pageId: string, assetId: string) => void;
    duplicateAsset: (pageId: string, assetId: string) => void;
    updateAssetZIndex: (pageId: string, assetId: string, direction: 'front' | 'back' | 'forward' | 'backward') => void;
    uploadMedia: (files: File[], category?: string) => Promise<void>;
    addMediaByUrl: (url: string, type: 'image' | 'video', category?: string) => void;
    applyLayout: (pageId: string, layout: any) => void;
    moveFromLibrary: (assetId: string, pageId: string) => void;
    duplicatePage: (pageId: string) => void;
    movePage: (pageId: string, direction: 'left' | 'right') => void;
    reorderPages: (fromIndex: number, toIndex: number) => void;
    saveAlbum: () => Promise<{ success: boolean; error?: string }>;
    saveAlbumPage: (pageId: string) => Promise<{ success: boolean; error?: string }>;
    toggleLock: () => Promise<void>;
    fetchAlbum: (albumId: string) => Promise<{ success: boolean; error?: string }>;
    updateConfig: (updates: Partial<AlbumConfig>) => void;
    toggleSpreadView: () => void;
    getSpread: (pageIndex: number) => Page[];
    syncStyles: (sourceAsset?: Asset) => void;
    undo: () => void;
    redo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    saveStatus: 'idle' | 'saving' | 'saved' | 'error';
    isSaving: boolean;
    isLoading: boolean;
    uploadProgress: Record<string, number>;
    updatePageAssets: (pageId: string, assets: Asset[], options?: { skipHistory?: boolean }) => void;
    moveAssetToPage: (assetId: string, fromPageId: string, toPageId: string, newX: number, newY: number) => void;
    commitHistory: () => void;
    showLayoutOutlines: boolean;
    toggleLayoutOutlines: () => void;
    activeSlot: { pageId: string; index: number } | null;
    setActiveSlot: (slot: { pageId: string; index: number } | null) => void;
    clearPageMedia: (pageId: string) => void;
}

export const AlbumContext = createContext<AlbumContextType | undefined>(undefined);

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}



export function AlbumProvider({ children }: { children: React.ReactNode }) {
    const [album, setAlbumInternal] = useState<Album | null>(null);
    const [history, setHistory] = useState<Album[]>([]);
    const [redoStack, setRedoStack] = useState<Album[]>([]);
    const [currentPageIndex, setCurrentPageIndex] = useState(0);
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isLoading, setIsLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [showLayoutOutlines, setShowLayoutOutlines] = useState(true);
    const [activeSlot, setActiveSlot] = useState<{ pageId: string; index: number } | null>(null);
    const { googleAccessToken } = useAuth();
    const albumRef = useRef<Album | null>(null);

    const setAlbum = useCallback((
        newAlbum: Album | null | ((prev: Album | null) => Album | null),
        options?: { skipHistory?: boolean }
    ) => {
        setAlbumInternal(prev => {
            const resolved = typeof newAlbum === 'function' ? newAlbum(prev) : newAlbum;
            if (prev && resolved && prev !== resolved && !options?.skipHistory) {
                setHistory(h => [...h.slice(-49), prev]);
                setRedoStack([]);
            }
            albumRef.current = resolved;
            return resolved;
        });
    }, []);

    const commitHistory = useCallback(() => {
        setAlbumInternal(current => {
            if (current) {
                setHistory(h => [...h.slice(-49), current]);
                setRedoStack([]);
            }
            return current;
        });
    }, []);

    const undo = useCallback(() => {
        setHistory(h => {
            if (h.length === 0) return h;
            const previous = h[h.length - 1];
            setAlbumInternal(current => {
                if (current) setRedoStack(r => [...r, current]);
                return previous;
            });
            return h.slice(0, -1);
        });
    }, []);

    const redo = useCallback(() => {
        setRedoStack(r => {
            if (r.length === 0) return r;
            const next = r[r.length - 1];
            setAlbumInternal(current => {
                if (current) setHistory(h => [...h, current]);
                return next;
            });
            return r.slice(0, -1);
        });
    }, []);

    const addPage = useCallback((template: Page['layoutTemplate'] = 'freeform', atIndex?: number) => {
        if (!album || album.config.isLocked) return;

        // Find back cover index
        const backCoverIndex = album.pages.findIndex(p => p.layoutTemplate === 'cover-back');
        const insertIndex = atIndex !== undefined ? atIndex : (backCoverIndex !== -1 ? backCoverIndex : album.pages.length);

        const isSpread = album.config.useSpreadView;

        const newPage1: Page = {
            id: generateId(),
            pageNumber: insertIndex + 1,
            layoutTemplate: template,
            assets: [],
            backgroundColor: '#ffffff',
        };

        const newPages = [...album.pages];
        if (isSpread) {
            const newPage2: Page = {
                id: generateId(),
                pageNumber: insertIndex + 2,
                layoutTemplate: template,
                assets: [],
                backgroundColor: '#ffffff',
            };
            newPages.splice(insertIndex, 0, newPage1, newPage2);
        } else {
            newPages.splice(insertIndex, 0, newPage1);
        }

        setAlbum({
            ...album,
            pages: newPages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
            updatedAt: new Date(),
        });
        setCurrentPageIndex(insertIndex);
    }, [album, setAlbum]);

    const removePage = useCallback((pageId: string) => {
        if (!album || album.pages.length <= 1 || album.config.isLocked) return;
        const newPages = album.pages.filter(p => p.id !== pageId);
        setAlbum({
            ...album,
            pages: newPages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
            updatedAt: new Date(),
        });
        setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
    }, [album, currentPageIndex]);

    const updatePage = useCallback((pageId: string, updates: Partial<Page>) => {
        if (!album || album.config.isLocked) return;
        setAlbum({
            ...album,
            pages: album.pages.map(p => p.id === pageId ? { ...p, ...updates } : p),
            updatedAt: new Date(),
        });
    }, [album]);

    const clearPageMedia = useCallback((pageId: string) => {
        if (!album || album.config.isLocked) return;
        setAlbum({
            ...album,
            pages: album.pages.map(p => p.id === pageId ? { ...p, assets: [] } : p),
            updatedAt: new Date(),
        });
    }, [album]);

    const addAsset = useCallback((pageId: string, asset: Omit<Asset, 'id'>) => {
        if (!album || album.config.isLocked) return;
        const newAsset: Asset = { ...asset, id: generateId() };
        setAlbum({
            ...album,
            pages: album.pages.map(p =>
                p.id === pageId ? { ...p, assets: [...p.assets, newAsset] } : p
            ),
            updatedAt: new Date(),
        });
        setSelectedAssetId(newAsset.id);
    }, [album]);

    const updateAsset = useCallback((pageId: string, assetId: string, updates: any, options?: { skipHistory?: boolean }) => {
        if (!album || album.config.isLocked) return;
        setAlbum(prev => {
            if (!prev) return null;
            return {
                ...prev,
                pages: prev.pages.map(p => {
                    if (p.id !== pageId) return p;

                    // 1. Update Legacy Assets
                    let newAssets = p.assets.map(a => a.id === assetId ? { ...a, ...updates } : a);

                    // 2. Update Unified Layout Config (slots/freeform)
                    let newLayoutConfig = (p.layoutConfig || []).map(box => {
                        if (box.id === assetId) {
                            return {
                                ...box,
                                left: updates.x ?? box.left,
                                top: updates.y ?? box.top,
                                width: updates.width ?? box.width,
                                height: updates.height ?? box.height,
                                zIndex: updates.zIndex ?? box.zIndex,
                                content: {
                                    ...box.content,
                                    rotation: updates.rotation ?? box.content?.rotation,
                                    zoom: updates.zoom ?? box.content?.zoom,
                                    x: updates.focalX ?? box.content?.x,
                                    y: updates.focalY ?? box.content?.y,
                                    text: updates.content ?? box.content?.text,
                                    config: { ...(box.content?.config || {}), ...updates }
                                }
                            } as any;
                        }
                        return box;
                    });

                    // 3. Update Unified Text Layers
                    let newTextLayers = (p.textLayers || []).map(layer => {
                        if (layer.id === assetId) {
                            return {
                                ...layer,
                                left: updates.x ?? layer.left,
                                top: updates.y ?? layer.top,
                                width: updates.width ?? layer.width,
                                height: updates.height ?? layer.height,
                                content: {
                                    ...layer.content,
                                    rotation: updates.rotation ?? layer.content?.rotation,
                                    text: updates.content ?? layer.content?.text,
                                    config: { ...(layer.content?.config || {}), ...updates }
                                }
                            } as any;
                        }
                        return layer;
                    });

                    return { ...p, assets: newAssets, layoutConfig: newLayoutConfig, textLayers: newTextLayers };
                }),
                updatedAt: new Date(),
            };
        }, options);
    }, [album, setAlbum]);

    const removeAsset = useCallback((pageId: string, assetId: string) => {
        if (!album || album.config.isLocked) return;
        setAlbum({
            ...album,
            pages: album.pages.map(p =>
                p.id === pageId ? { ...p, assets: p.assets.filter(a => a.id !== assetId) } : p
            ),
            updatedAt: new Date(),
        });
        if (selectedAssetId === assetId) setSelectedAssetId(null);
    }, [album, selectedAssetId]);

    const duplicateAsset = useCallback((pageId: string, assetId: string) => {
        if (!album || album.config.isLocked) return;
        const page = album.pages.find(p => p.id === pageId);
        const sourceAsset = page?.assets.find(a => a.id === assetId);
        if (!sourceAsset) return;

        const newAsset: Asset = {
            ...sourceAsset,
            id: generateId(),
            x: sourceAsset.x + 20, // Offset slightly
            y: sourceAsset.y + 20,
            zIndex: (sourceAsset.zIndex || 0) + 1
        };

        setAlbum({
            ...album,
            pages: album.pages.map(p =>
                p.id === pageId ? { ...p, assets: [...p.assets, newAsset] } : p
            ),
            updatedAt: new Date(),
        });
        setSelectedAssetId(newAsset.id);
    }, [album]);

    const updateAssetZIndex = useCallback((pageId: string, assetId: string, direction: 'front' | 'back' | 'forward' | 'backward') => {
        if (!album || album.config.isLocked) return;

        setAlbum(prev => {
            if (!prev) return prev;
            const page = prev.pages.find(p => p.id === pageId);
            if (!page) return prev;

            const sortedAssets = [...page.assets].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            const assetIndex = sortedAssets.findIndex(a => a.id === assetId);
            if (assetIndex === -1) return prev;

            const asset = sortedAssets[assetIndex];
            let newZ = asset.zIndex || 0;

            if (direction === 'front') {
                newZ = Math.max(...page.assets.map(a => a.zIndex || 0), 0) + 1;
            } else if (direction === 'back') {
                const currentMin = Math.min(...page.assets.map(a => a.zIndex || 0), 0);
                newZ = currentMin - 1;
                // Preserve visibility: regular assets stay at or above 0
                if (asset.zIndex >= 0 && newZ < 0) newZ = 0;
            } else if (direction === 'forward') {
                if (assetIndex < sortedAssets.length - 1) {
                    const nextAsset = sortedAssets[assetIndex + 1];
                    newZ = (nextAsset.zIndex || 0) + 1;
                }
            } else if (direction === 'backward') {
                if (assetIndex > 0) {
                    const prevAsset = sortedAssets[assetIndex - 1];
                    newZ = (prevAsset.zIndex || 0) - 1;
                    // Preserve visibility: regular assets stay at or above 0
                    if (asset.zIndex >= 0 && newZ < 0) newZ = 0;
                }
            }

            return {
                ...prev,
                pages: prev.pages.map(p =>
                    p.id === pageId
                        ? { ...p, assets: p.assets.map(a => a.id === assetId ? { ...a, zIndex: newZ } : a) }
                        : p
                ),
                updatedAt: new Date(),
            };
        });
    }, [album]);

    const uploadMedia = useCallback(async (files: File[], category: string = 'general') => {
        if (!album || album.config.isLocked) return;
        const { supabase } = await import('../lib/supabase');
        const { mediaService } = await import('../services/mediaService');

        setSaveStatus('saving');
        try {
            const uploadedAssets: Asset[] = [];
            for (const file of files) {
                let fileToUpload = file;

                // Apply compression for images and videos to keep within 50MB and improve performance
                // Quality threshold: > 2MB for images, > 5MB for videos
                try {
                    if (file.type.startsWith('image/') && file.size > 2 * 1024 * 1024) {
                        fileToUpload = await mediaService.compressImage(file);
                    } else if (file.type.startsWith('video/') && file.size > 20 * 1024 * 1024) {
                        fileToUpload = await mediaService.compressVideo(file, (p) => {
                            setUploadProgress(prev => ({
                                ...prev,
                                [file.name]: Math.round(p * 100)
                            }));
                        });
                        // Reset progress for the actual upload after compression
                        setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
                    }
                } catch (err) {
                    console.warn(`Compression failed for ${file.name}, attempting original upload:`, err);
                    fileToUpload = file;
                }

                let url: string | null = null;
                let googlePhotoId: string | undefined;

                if (googleAccessToken) {
                    try {
                        // Step 1: Upload to Google Photos first
                        const photosService = new GooglePhotosService(googleAccessToken);
                        const mediaItem = await photosService.uploadMedia(fileToUpload, fileToUpload.name);
                        googlePhotoId = mediaItem.id;
                        url = mediaItem.baseUrl || null;

                        setUploadProgress(prev => ({ ...prev, [file.name]: 100 }));
                    } catch (err) {
                        console.error('Google Photos upload failed, falling back to storage:', err);
                    }
                }

                if (!url) {
                    // Fallback to Supabase ONLY if Google Photos is not connected or fails
                    // NOTE: The user requested no Supabase storage, but we need a fallback for robustness
                    // unless we want to strictly enforce Google Photos connection.
                    const { storageService } = await import('../services/storage');
                    const { url: storageUrl } = await storageService.uploadFile(
                        fileToUpload,
                        'album-assets',
                        `albums/${album.title}/`,
                        (progress) => {
                            const percent = Math.round((progress.loaded / progress.total) * 100);
                            setUploadProgress(prev => ({
                                ...prev,
                                [file.name]: percent
                            }));
                        }
                    );
                    url = storageUrl;
                }

                if (url) {
                    // Load image to get dimensions
                    let dimensions = { width: 400, height: 300 };
                    let originalDimensions = { width: 400, height: 300 };
                    let aspectRatio = 4 / 3;

                    if (fileToUpload.type.startsWith('image/')) {
                        const img = new Image();
                        img.src = url;
                        await new Promise((resolve) => {
                            img.onload = () => {
                                originalDimensions = { width: img.width, height: img.height };
                                aspectRatio = img.width / img.height;
                                const maxUnit = 40;
                                if (img.width > img.height) {
                                    dimensions = { width: maxUnit, height: maxUnit / aspectRatio };
                                } else {
                                    dimensions = { width: maxUnit * aspectRatio, height: maxUnit };
                                }
                                resolve(null);
                            };
                            img.onerror = () => resolve(null);
                        });
                    } else if (fileToUpload.type.startsWith('video/')) {
                        const video = document.createElement('video');
                        video.src = url;
                        video.preload = 'metadata';
                        await new Promise((resolve) => {
                            video.onloadedmetadata = () => {
                                originalDimensions = { width: video.videoWidth, height: video.videoHeight };
                                aspectRatio = (video.videoWidth / video.videoHeight) || (16 / 9);
                                const maxUnit = 40;
                                if (video.videoWidth > video.videoHeight) {
                                    dimensions = { width: maxUnit, height: maxUnit / aspectRatio };
                                } else {
                                    dimensions = { width: maxUnit * aspectRatio, height: maxUnit };
                                }
                                resolve(null);
                            };
                            video.onerror = () => resolve(null);
                        });
                    }

                    uploadedAssets.push({
                        id: generateId(),
                        type: fileToUpload.type.startsWith('video/') ? 'video' : 'image',
                        url,
                        x: 0,
                        y: 0,
                        ...dimensions,
                        originalDimensions,
                        aspectRatio,
                        lockAspectRatio: true,
                        rotation: 0,
                        zIndex: 1,
                        pivot: { x: 0.5, y: 0.5 }, // Default to center
                        createdAt: new Date(),
                        folder: album.title,
                        googlePhotoId
                    });

                    if (album.family_id) {
                        const { error: dbError } = await supabase
                            .from('family_media')
                            .insert({
                                family_id: album.family_id,
                                url: url,
                                type: fileToUpload.type.startsWith('video/') ? 'video' : 'image',
                                category: category,
                                folder: album.title,
                                filename: fileToUpload.name,
                                size: fileToUpload.size,
                                uploaded_by: (await supabase.auth.getUser()).data.user?.id,
                                metadata: googlePhotoId ? { googlePhotoId, syncedToGoogle: true } : undefined
                            } as any);
                        if (dbError) console.error('Error logging to family_media:', dbError);
                    }


                } else if (url === null) {
                    console.error('Upload error for file:', file.name);
                }
            }

            setAlbum(prev => prev ? {
                ...prev,
                unplacedMedia: [...prev.unplacedMedia, ...uploadedAssets],
                updatedAt: new Date(),
            } : null);

            // Clear progress after short delay
            setTimeout(() => {
                setUploadProgress({});
            }, 2000);
        } catch (error) {
            console.error('Bulk upload failed:', error);
        } finally {
            setSaveStatus('idle');
        }
    }, [album]);

    const addMediaByUrl = useCallback(async (url: string, type: 'image' | 'video', category: string = 'general') => {
        if (!album || album.config.isLocked) return;

        const newAsset: Asset = {
            id: generateId(),
            type,
            url,
            x: 0,
            y: 0,
            width: 40,
            height: 30,
            lockAspectRatio: true,
            rotation: 0,
            zIndex: 1,
            createdAt: new Date()
        };
        setAlbum(prev => prev ? {
            ...prev,
            unplacedMedia: [...prev.unplacedMedia, newAsset],
            updatedAt: new Date(),
        } : null);

        if (album.family_id) {
            const { supabase } = await import('../lib/supabase');
            const { error: dbError } = await supabase
                .from('family_media')
                .insert({
                    family_id: album.family_id,
                    url: url,
                    type: type,
                    category: category,
                    filename: 'URL Asset',
                    uploaded_by: (await supabase.auth.getUser()).data.user?.id
                } as any);
            if (dbError) console.error('Error logging to family_media:', dbError);
        }
    }, [album]);

    const moveFromLibrary = useCallback((assetId: string, pageId: string) => {
        if (!album || album.config.isLocked) return;
        const asset = album.unplacedMedia.find(a => a.id === assetId);
        if (!asset) return;

        const centerX = (100 - (asset.width || 30)) / 2;
        const centerY = (100 - (asset.height || 30)) / 2;

        setAlbum({
            ...album,
            unplacedMedia: album.unplacedMedia.filter(a => a.id !== assetId),
            pages: album.pages.map(p => p.id === pageId ? {
                ...p,
                assets: [...p.assets, { ...asset, x: centerX, y: centerY }]
            } : p),
            updatedAt: new Date(),
        });
    }, [album]);


    const duplicatePage = useCallback((pageId: string) => {
        if (!album || album.config.isLocked) return;
        const pageToDuplicate = album.pages.find(p => p.id === pageId);
        if (!pageToDuplicate) return;

        const newPage: Page = {
            ...pageToDuplicate,
            id: generateId(),
            pageNumber: album.pages.length + 1,
            assets: pageToDuplicate.assets.map(asset => ({ ...asset, id: generateId() }))
        };

        const pageIndex = album.pages.findIndex(p => p.id === pageId);
        const newPages = [...album.pages];
        newPages.splice(pageIndex + 1, 0, newPage);

        setAlbum({
            ...album,
            pages: newPages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
            updatedAt: new Date(),
        });
        setCurrentPageIndex(pageIndex + 1);
    }, [album]);

    const movePage = useCallback((pageId: string, direction: 'left' | 'right') => {
        if (!album || album.config.isLocked) return;
        const currentIndex = album.pages.findIndex(p => p.id === pageId);
        if (currentIndex === -1) return;

        // Front cover (0) and Back cover (last) cannot be moved manually
        if (currentIndex === 0 || currentIndex === album.pages.length - 1) return;

        const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;

        // Cannot move into front cover slot (0) or back cover slot
        if (newIndex <= 0 || newIndex >= album.pages.length - 1) return;

        const newPages = [...album.pages];
        const [movedPage] = newPages.splice(currentIndex, 1);
        newPages.splice(newIndex, 0, movedPage);

        setAlbum({
            ...album,
            pages: newPages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
            updatedAt: new Date(),
        });
        setCurrentPageIndex(newIndex);
    }, [album]);

    const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
        if (!album || album.config.isLocked) return;
        if (fromIndex === toIndex) return;

        // Prevent moving covers
        if (fromIndex === 0 || fromIndex === album.pages.length - 1) return;

        setAlbum(prev => {
            if (!prev) return prev;
            let pages = [...prev.pages];
            const isSpreadView = prev.config.useSpreadView;

            if (isSpreadView) {
                // Spreads always start at odd indices (1, 3, 5...) after the front cover (0)
                const fromStart = fromIndex % 2 === 1 ? fromIndex : fromIndex - 1;
                const toStart = toIndex % 2 === 1 ? toIndex : toIndex - 1;

                if (fromStart === toStart) return prev;

                const itemsToMove = pages.slice(fromStart, fromStart + 2);
                pages = pages.filter(p => !itemsToMove.some(m => m.id === p.id));

                let insertIndex = pages.findIndex(p => p.id === prev.pages[toStart].id);

                // If moving forward, we want to place it AFTER the target spread
                // Since the target spread consists of 2 pages, we add 2 to the insert point
                if (toStart > fromStart) {
                    insertIndex += 2;
                }

                // Boundary check: cannot insert before front cover (0) or after back cover
                if (insertIndex <= 0) insertIndex = 1;
                if (insertIndex > pages.length - 1) insertIndex = pages.length - 1;

                pages.splice(insertIndex, 0, ...itemsToMove);
            } else {
                const pageToMove = pages[fromIndex];
                const targetPage = pages[toIndex];

                pages = pages.filter(p => p.id !== pageToMove.id);

                let insertIndex = pages.findIndex(p => p.id === targetPage.id);

                // If moving forward, insert after target
                if (toIndex > fromIndex) insertIndex += 1;

                if (insertIndex <= 0) insertIndex = 1;
                if (insertIndex > pages.length - 1) insertIndex = pages.length - 1;

                pages.splice(insertIndex, 0, pageToMove);
            }

            return {
                ...prev,
                pages: pages.map((p, i) => ({ ...p, pageNumber: i + 1 })),
                updatedAt: new Date(),
            };
        });
    }, [album, setAlbum]);

    const updateConfig = useCallback((updates: Partial<AlbumConfig>) => {
        if (!album || album.config.isLocked) return;
        setAlbum({
            ...album,
            config: { ...album.config, ...updates },
            updatedAt: new Date(),
        });
    }, [album]);

    const updatePageAssets = useCallback((pageId: string, newAssets: Asset[], options?: { skipHistory?: boolean }) => {
        setAlbum(prev => {
            if (!prev || prev.config.isLocked) return prev;
            return {
                ...prev,
                pages: prev.pages.map(p => p.id === pageId ? { ...p, assets: newAssets } : p),
                updatedAt: new Date(),
            };
        }, options);
    }, [setAlbum]);

    const moveAssetToPage = useCallback((assetId: string, fromPageId: string, toPageId: string, newX: number, newY: number) => {
        setAlbum(prev => {
            if (!prev || prev.config.isLocked) return prev;
            const fromPage = prev.pages.find(p => p.id === fromPageId);
            const asset = fromPage?.assets.find(a => a.id === assetId);
            if (!asset) return prev;

            return {
                ...prev,
                pages: prev.pages.map(p => {
                    if (p.id === fromPageId) {
                        return { ...p, assets: p.assets.filter(a => a.id !== assetId) };
                    }
                    if (p.id === toPageId) {
                        return { ...p, assets: [...p.assets, { ...asset, x: newX, y: newY }] };
                    }
                    return p;
                }),
                updatedAt: new Date(),
            };
        });
    }, [setAlbum]);

    const toggleSpreadView = useCallback(() => {
        if (!album) return;
        updateConfig({ useSpreadView: !album.config.useSpreadView });
    }, [album, updateConfig]);

    const syncStyles = useCallback((sourceAsset?: Asset) => {
        if (!album || album.config.isLocked) return;

        let targetStyles: Partial<Asset> = {};
        if (sourceAsset) {
            // If syncing from a specific asset, take its key visual properties
            targetStyles = {
                borderRadius: sourceAsset.borderRadius,
                borderColor: sourceAsset.borderColor,
                borderWidth: sourceAsset.borderWidth,
                filter: sourceAsset.filter,
                filterIntensity: sourceAsset.filterIntensity,
                fontFamily: sourceAsset.fontFamily,
                fontSize: sourceAsset.fontSize,
                fontWeight: sourceAsset.fontWeight,
                color: sourceAsset.color,
                opacity: sourceAsset.opacity
            };
        }

        setAlbum(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                pages: prev.pages.map(p => ({
                    ...p,
                    assets: p.assets.map(a => {
                        // Apply to matching types (text or image)
                        if (a.type === sourceAsset?.type) {
                            return { ...a, ...targetStyles };
                        }
                        return a;
                    })
                })),
                updatedAt: new Date(),
            };
        });
    }, [album]);

    const getSpread = useCallback((pageIndex: number): Page[] => {
        if (!album) return [];
        const page = album.pages[pageIndex];
        if (!page) return [];

        if (!album.config.useSpreadView) return [page];

        // Cover is always single
        if (page.layoutTemplate === 'cover-front') return [page];
        if (page.layoutTemplate === 'cover-back') return [page];

        // Ensure we always return the same pair for both page indices in a spread
        // The first internal page (index 1) starts the first spread
        // Even index (2, 4, 6...) is the "right" page of a spread
        // Odd index (1, 3, 5...) is the "left" page of a spread
        const isLeftIdx = pageIndex % 2 === 1;

        if (isLeftIdx) {
            const nextPage = album.pages[pageIndex + 1];
            // Only pair if next isn't cover-back
            return (nextPage && nextPage.layoutTemplate !== 'cover-back') ? [page, nextPage] : [page];
        } else {
            const prevPage = album.pages[pageIndex - 1];
            // Only pair if prev isn't cover-front
            return (prevPage && prevPage.layoutTemplate !== 'cover-front') ? [prevPage, page] : [page];
        }
    }, [album]);

    const applyLayout = useCallback((pageId: string, layout: any) => {
        if (!album || album.config.isLocked) return;

        setAlbum(prev => {
            if (!prev) return null;
            const pages = [...prev.pages];
            const pageIndex = pages.findIndex(p => p.id === pageId);
            if (pageIndex === -1) return prev;

            const page = pages[pageIndex];
            const isSpreadView = prev.config.useSpreadView;
            const isLandscapeLayout = layout.target_ratio === 'landscape';

            // --- SPECIAL: FREEFORM / BLANK CANVAS LOGIC ---
            if (layout.name === 'freeform' || layout.id === 'freeform') {
                const updatedAssets = page.assets.map(asset => {
                    // If asset was in a slot, we must "freeze" its position as absolute before clearing the layout
                    if (asset.slotId !== undefined && page.layoutConfig) {
                        const slot = page.layoutConfig[asset.slotId];
                        if (slot) {
                            return {
                                ...asset,
                                slotId: undefined,
                                x: slot.left,
                                y: slot.top,
                                width: slot.width,
                                height: slot.height
                            };
                        }
                    }
                    return { ...asset, slotId: undefined };
                });

                return {
                    ...prev,
                    pages: prev.pages.map(p => p.id === pageId ? {
                        ...p,
                        layoutTemplate: 'freeform',
                        layoutConfig: [],
                        textLayers: [],
                        assets: updatedAssets,
                        isSpreadLayout: false
                    } : p),
                    updatedAt: new Date()
                };
            }

            let updatedAssets = [...page.assets];

            // Handle Spread logic: if landscape layout applied to spread, merge assets
            if (isSpreadView && isLandscapeLayout) {
                const spreadPages = getSpread(pageIndex);
                if (spreadPages.length > 1) {
                    const leftPage = spreadPages[0];
                    const rightPage = spreadPages[1];

                    // Merge media from both pages
                    const allMedia = [...leftPage.assets, ...rightPage.assets].filter(a => a.type === 'image' || a.type === 'video');
                    const otherAssets = [...leftPage.assets, ...rightPage.assets].filter(a => a.type !== 'image' && a.type !== 'video');

                    updatedAssets = allMedia.map((asset, idx) => ({
                        ...asset,
                        slotId: idx < layout.image_count ? idx : undefined,
                        x: 0, y: 0, width: 100, height: 100
                    }));
                    updatedAssets.push(...otherAssets.map(a => ({ ...a, slotId: undefined })));

                    return {
                        ...prev,
                        pages: prev.pages.map(p => {
                            if (p.id === leftPage.id) {
                                return {
                                    ...p,
                                    layoutTemplate: layout.name,
                                    layoutConfig: typeof layout.config === 'string' ? JSON.parse(layout.config) : layout.config,
                                    assets: updatedAssets,
                                    isSpreadLayout: true
                                };
                            }
                            if (p.id === rightPage.id) {
                                return { ...p, assets: [], layoutTemplate: 'freeform', layoutConfig: undefined, isSpreadLayout: false };
                            }
                            return p;
                        }),
                        updatedAt: new Date()
                    };
                }
            }

            // Standard single page logic
            const mediaAssets = page.assets.filter(a => a.type === 'image' || a.type === 'video');
            updatedAssets = page.assets.map(asset => {
                const mediaIndex = mediaAssets.findIndex(ma => ma.id === asset.id);
                if (mediaIndex !== -1 && mediaIndex < layout.image_count) {
                    return {
                        ...asset,
                        slotId: mediaIndex,
                        x: 0, y: 0, width: 100, height: 100
                    };
                }
                const { slotId, ...rest } = asset;
                return rest as any;
            });

            return {
                ...prev,
                pages: prev.pages.map(p => p.id === pageId ? {
                    ...p,
                    layoutTemplate: layout.name,
                    layoutConfig: typeof layout.config === 'string' ? JSON.parse(layout.config) : layout.config,
                    assets: updatedAssets,
                    isSpreadLayout: false
                } : p),
                updatedAt: new Date()
            };
        });
    }, [album, getSpread]);

    const toggleLayoutOutlines = useCallback(() => {
        setShowLayoutOutlines(prev => !prev);
    }, []);

    const fetchAlbum = useCallback(async (albumId: string) => {
        setIsLoading(true);
        try {
            console.log(`[AlbumContext] Fetching unified album: ${albumId}`);
            const unifiedAlbum = await AlbumDataService.fetchAlbum(albumId);
            if (!unifiedAlbum) {
                console.error(`[AlbumContext] Album not found or failed to load: ${albumId}`);
                return { success: false, error: 'Album not found' };
            }

            const album = unifiedAlbumToContextAlbum(unifiedAlbum);

            setAlbumInternal(album);
            albumRef.current = album;

            // Set first page as current
            setCurrentPageIndex(0);

            return { success: true };
        } catch (error: any) {
            console.error('[fetchAlbum] Fatal Hydration Failure:', error);
            return { success: false, error: 'Failed to parse archive components. Data may be corrupted.' };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const saveAlbum = useCallback(async () => {
        const currentAlbum = albumRef.current;
        if (!currentAlbum) return { success: false, error: 'No album to save' };

        setSaveStatus('saving');
        try {
            const unifiedAlbum = contextAlbumToUnifiedAlbum(currentAlbum);
            const success = await AlbumDataService.saveAlbum(unifiedAlbum);
            if (success) {
                setSaveStatus('saved');
                return { success: true };
            } else {
                setSaveStatus('error');
                return { success: false, error: 'Failed to save album' };
            }
        } catch (error: any) {
            console.error('[AlbumContext] saveAlbum error:', error);
            setSaveStatus('error');
            return { success: false, error: error.message };
        }
    }, []);

    const saveAlbumPage = useCallback(async (_pageId: string) => {
        return saveAlbum();
    }, [saveAlbum]);



    const toggleLock = useCallback(async () => {
        if (!album) return;
        setAlbum({
            ...album,
            config: {
                ...album.config,
                isLocked: !album.config.isLocked
            },
            updatedAt: new Date()
        });

        // The setAlbum call above updates state and ref, 
        // saveAlbum will pull the latest from ref.
        setTimeout(() => saveAlbum(), 100);
    }, [album, saveAlbum, setAlbum]);

    const value: AlbumContextType = {
        album,
        currentPageIndex,
        selectedAssetId,
        setAlbum,
        setCurrentPageIndex,
        setSelectedAssetId,
        addPage,
        removePage,
        updatePage,
        addAsset,
        updateAsset,
        removeAsset,
        updateAssetZIndex,
        uploadMedia,
        applyLayout,
        moveFromLibrary,
        addMediaByUrl,
        saveAlbum,
        saveAlbumPage,
        fetchAlbum,
        saveStatus,
        isSaving: saveStatus === 'saving',
        isLoading,
        uploadProgress,
        duplicateAsset,
        duplicatePage,
        movePage,
        reorderPages,
        updateConfig,
        toggleSpreadView,
        getSpread,
        syncStyles,
        undo,
        redo,
        canUndo: history.length > 0,
        canRedo: redoStack.length > 0,
        updatePageAssets,
        moveAssetToPage,
        toggleLock,
        commitHistory,
        showLayoutOutlines,
        toggleLayoutOutlines,
        activeSlot,
        setActiveSlot,
        clearPageMedia
    };

    return (
        <AlbumContext.Provider value={value}>
            {children}
        </AlbumContext.Provider>
    );
}

export function useAlbum() {
    const context = useContext(AlbumContext);
    if (!context) {
        throw new Error('useAlbum must be used within an AlbumProvider');
    }
    return context;
}
