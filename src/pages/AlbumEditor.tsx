import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
    ArrowLeft, Save, Share, X, Copy, Check, Settings as SettingsIcon, Tag,
    ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
    Layers, Bold, Italic, Underline, Pencil, Trash2, Wand2, Scissors,
    Lock, Unlock, Eye, Undo, Redo, Maximize, MapPin, Image as ImageIcon, Droplets, Shuffle, ArrowLeftRight,
    FlipHorizontal, FlipVertical, RotateCw, Maximize2, Type
} from 'lucide-react';
import { MediaPickerModal } from '../components/media/MediaPickerModal';
import { useAlbum } from '../contexts/AlbumContext';
import type { LayoutBox, Asset, Album } from '../contexts/AlbumContext';
import { EditorCanvas } from '../components/editor/EditorCanvas';
import { AssetControlPanel } from '../components/editor/AssetControlPanel';
import { Filmstrip } from '../components/editor/Filmstrip';
import { Button } from '../components/ui/Button';
import { HashtagInput } from '../components/ui/HashtagInput';
import { generateShareLink } from '../services/sharing';
import { cn } from '../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

import { useAlbumAutoSave } from '../hooks/useAlbumAutoSave';
import { AssetLibrary } from '../components/editor/AssetLibrary';
import { LayersPanel } from '../components/editor/LayersPanel';
import { FlipbookViewer } from '../components/viewer/FlipbookViewer';
import { ImageEditorModal } from '../components/editor/ImageEditorModal';
import { MaskEditorModal } from '../components/editor/MaskEditorModal';
import { LocationPicker } from '../components/ui/LocationPicker';
import { LocationPickerModal } from '../components/ui/LocationPickerModal';
import { MapAssetModal } from '../components/ui/MapAssetModal';
import { LayoutSidebar } from '../components/editor/LayoutSidebar';

import { useUpload } from '../contexts/UploadContext';
import { UploadOverlay } from '../components/ui/UploadOverlay';

function AlbumEditorContent() {
    const { id } = useParams<{ id: string }>();
    const {
        album,
        setAlbum,
        currentPageIndex,
        setCurrentPageIndex,
        selectedAssetId,
        setSelectedAssetId,
        addAsset,
        addPage,
        removeAsset,
        updateAsset,
        duplicateAsset,
        updateAssetZIndex,
        saveAlbum,
        fetchAlbum,
        getSpread,
        toggleSpreadView,
        updateConfig,
        undo,
        redo,
        isSaving: isManualSaving,
        isLoading,
        toggleLock,
        canUndo,
        canRedo,
        swapSlotAssets
    } = useAlbum();

    const {
        state: uploadState,
        uploadFiles,
        cancelUpload,
        cancelAll,
        dismissUpload,
        setMinimized
    } = useUpload();

    // --- CONSOLIDATED STUDIO INITIALIZATION ---
    useEffect(() => {
        if (!id || isLoading) return;

        const loadStudio = async () => {
            // Only fetch if data is missing or ID/Slug changed
            const slugifiedTitle = album?.title?.replace(/\s+/g, '_');
            if (!album || (album.id !== id && slugifiedTitle !== id)) {
                console.info(`[AlbumEditor] 🔄 Syncing Studio State for Asset: ${id}`);
                const { success, error } = await fetchAlbum(id);
                if (!success) {
                    console.error("[AlbumEditor] Initialization Failed:", error);
                    setLoadError(error || "Failed to load archive data");
                }
            } else if (album && album.pages.length === 0) {
                // AUTO-INITIALIZE EMPTY ALBUMS
                console.info("[AlbumEditor] ⚡ Initializing Empty Album with Default Spread");
                addPage('blank' as any);
            }
        };

        loadStudio();
    }, [id, album?.id, album?.pages.length, isLoading, fetchAlbum, addPage]);

    // Autosave Hook
    const autoSave = useAlbumAutoSave();

    const [isSharing, setIsSharing] = useState(false);
    const [shareUrl, setShareUrl] = useState<string | null>(null);
    const [showShareModal, setShowShareModal] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [hasCopied, setHasCopied] = useState(false);
    const [activeSidebarTab, setActiveSidebarTab] = useState<'properties' | 'layers' | 'layouts'>('properties');

    // Navigation State
    const [zoom, setZoom] = useState(0.5); // Start zoomed out to see full spread
    const [pan, setPan] = useState({ x: 0, y: 0 });

    const panRef = useRef(pan);
    const zoomRef = useRef(zoom);
    const touchStartRef = useRef<{
        distance: number;
        midpoint: { x: number; y: number };
        pan: { x: number; y: number };
        zoom: number;
    } | null>(null);

    useEffect(() => {
        panRef.current = pan;
    }, [pan]);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    const updateZoom = useCallback((newZoomOrUpdater: number | ((prev: number) => number)) => {
        setZoom(prev => {
            const next = typeof newZoomOrUpdater === 'function' ? newZoomOrUpdater(prev) : newZoomOrUpdater;
            const clamped = Math.max(0.2, Math.min(2.0, next));
            if (prev !== clamped) {
                const ratio = clamped / prev;
                setPan(p => {
                    if (clamped <= 0.55) {
                        return { x: 0, y: 0 };
                    }
                    return { x: p.x * ratio, y: p.y * ratio };
                });
            }
            return clamped;
        });
    }, []);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [navigationDirection, setNavigationDirection] = useState<'next' | 'prev'>('next');
    const [activePageId, setActivePageId] = useState<string | null>(null);

    // --- PROFESSIONAL LOCAL BACKUP SYSTEM ---
    const [hasLocalBackup, setHasLocalBackup] = useState(false);

    // 1. Monitor for changes and mirror to localStorage
    useEffect(() => {
        if (album && !isLoading && album.pages.length > 0) {
            const backupKey = `album_backup_${album.id}`;
            localStorage.setItem(backupKey, JSON.stringify({
                album,
                timestamp: Date.now()
            }));
        }
    }, [album, isLoading]);

    // 2. Check for existing backup on mount
    useEffect(() => {
        if (id) {
            const backup = localStorage.getItem(`album_backup_${id}`);
            if (backup) {
                try {
                    const parsed = JSON.parse(backup);
                    // Only flag as backup if it's valid and contains pages
                    if (parsed && parsed.album && Array.isArray(parsed.album.pages)) {
                        setHasLocalBackup(true);
                        console.log(`[BackupSystem] Local safety copy found for album ${id}`);
                    }
                } catch (e) {
                    localStorage.removeItem(`album_backup_${id}`);
                }
            }
        }
    }, [id]);

    const restoreBackup = () => {
        if (id) {
            const backup = localStorage.getItem(`album_backup_${id}`);
            if (backup) {
                const { album: backedUpAlbum } = JSON.parse(backup);
                setAlbum(backedUpAlbum);
                setHasLocalBackup(false);
                alert("Restored from local backup. Please save immediately to sync with cloud.");
            }
        }
    };

    // Sync activePageId when page changes
    useEffect(() => {
        if (album && album.pages[currentPageIndex]) {
            const current = album.pages[currentPageIndex];
            if (current) {
                setActivePageId(current.id);
            }
        }
    }, [currentPageIndex, album?.id]); // Only sync when page or album changes, not on every asset update

    // Layout logic removed
    const [editorMode, setEditorMode] = useState<'select' | 'mask' | 'pivot' | 'studio'>('select');
    const [isRearrangeMode, setIsRearrangeMode] = useState(false);
    const [rearrangeFirstId, setRearrangeFirstId] = useState<string | null>(null);

    // Handle asset click during rearrange mode
    const handleRearrangeClick = (assetId: string, pageId: string) => {
        if (!isRearrangeMode) return false;
        if (!rearrangeFirstId) {
            setRearrangeFirstId(assetId);
            return true;
        }
        // Swap the two assets
        if (rearrangeFirstId !== assetId) {
            swapSlotAssets(pageId, rearrangeFirstId, assetId);
        }
        setRearrangeFirstId(null);
        setIsRearrangeMode(false);
        return true;
    };

    const exitRearrangeMode = () => { setIsRearrangeMode(false); setRearrangeFirstId(null); };

    const handleLocalFileDrop = useCallback(async (files: File[], xPercent: number, yPercent: number, pageId: string) => {
        if (!album || album.config.isLocked) return;

        const folder = album.title ? `Albums/${album.title.trim()}` : 'Albums';

        await uploadFiles(files, {
            familyId: album.family_id,
            folder: folder,
            onComplete: (results) => {
                if (results.length === 0) return;
                
                setAlbum((prev: Album | null) => {
                    if (!prev) return null;
                    
                    const updatedPages = [...prev.pages];
                    
                    results.forEach((item, index) => {
                        const isVideo = item.type === 'video';
                        let natW = 800;
                        let natH = 600;
                        if (item.metadata?.resolution) {
                            const [wStr, hStr] = item.metadata.resolution.split('x');
                            natW = parseInt(wStr) || 800;
                            natH = parseInt(hStr) || 600;
                        }
                        const ratio = natW / natH;
                        const albumW = prev.config.dimensions.width || 1000;
                        const albumH = prev.config.dimensions.height || 700;

                        const offsetX = index * 4;
                        const offsetY = index * 4;
                        const targetX = xPercent + offsetX;
                        const targetY = yPercent + offsetY;

                        const pageIdx = updatedPages.findIndex(p => p.id === pageId);
                        if (pageIdx === -1) return;
                        const targetPageObj = updatedPages[pageIdx];

                        const newAssetId = generateId();

                        // 1. Check placeholders
                        const hitPlaceholder = targetPageObj.assets
                            .filter((a: Asset) => a.isPlaceholder)
                            .sort((a: Asset, b: Asset) => (b.zIndex || 0) - (a.zIndex || 0))
                            .find((a: Asset) => targetX >= a.x && targetX <= (a.x + a.width) && targetY >= a.y && targetY <= (a.y + a.height));

                        if (hitPlaceholder) {
                            const updatedAssets = targetPageObj.assets.map((a: Asset) => 
                                a.id === hitPlaceholder.id 
                                    ? { ...a, url: item.url, type: isVideo ? ('video' as const) : ('image' as const), isPlaceholder: false, fitMode: 'cover' as const } 
                                    : a
                            );
                            
                            const updatedLayoutConfig = (targetPageObj.layoutConfig || []).map((box: LayoutBox) => 
                                box.id === hitPlaceholder.id 
                                    ? { ...box, content: { ...box.content, type: isVideo ? 'video' : 'image', url: item.url, zoom: 1, x: 50, y: 50, rotation: 0 } as any } 
                                    : box
                            );

                            updatedPages[pageIdx] = {
                                ...targetPageObj,
                                assets: updatedAssets,
                                layoutConfig: updatedLayoutConfig
                            };
                            return;
                        }

                        // 2. Check layout slots
                        const layoutCfg = targetPageObj.layoutConfig || [];
                        const hitSlot = layoutCfg.find((box: LayoutBox, idx: number) => {
                            if (box.role !== 'slot') return false;
                            const isOccupied = targetPageObj.assets.some((a: Asset) => a.slotId === idx);
                            if (isOccupied) return false;
                            return targetX >= box.left && targetX <= (box.left + box.width) &&
                                targetY >= box.top && targetY <= (box.top + box.height);
                        });

                        if (hitSlot) {
                            const slotIdx = layoutCfg.indexOf(hitSlot);
                            const newAsset: Asset = {
                                id: newAssetId,
                                type: isVideo ? ('video' as const) : ('image' as const),
                                url: item.url,
                                x: hitSlot.left,
                                y: hitSlot.top,
                                width: hitSlot.width,
                                height: hitSlot.height,
                                zIndex: 10,
                                rotation: 0,
                                slotId: slotIdx,
                                isPlaceholder: false,
                                fitMode: 'cover'
                            };

                            const updatedLayoutConfig = (targetPageObj.layoutConfig || []).map((box: LayoutBox, idx: number) => 
                                idx === slotIdx 
                                    ? { ...box, content: { type: isVideo ? 'video' : 'image', url: item.url, zoom: 1, x: 50, y: 50, rotation: 0 } as any } 
                                    : box
                            );

                            updatedPages[pageIdx] = {
                                ...targetPageObj,
                                assets: [...targetPageObj.assets, newAsset],
                                layoutConfig: updatedLayoutConfig
                            };
                            return;
                        }

                        // 3. Freeform
                        let w = (natW / albumW) * 100;
                        let h = (natH / albumH) * 100;
                        const maxUnit = 60;
                        if (w > maxUnit || h > maxUnit) {
                            const scale = Math.min(maxUnit / w, maxUnit / h);
                            w *= scale;
                            h *= scale;
                        }
                        h = w / ratio;

                        const newAsset: Asset = {
                            id: newAssetId,
                            type: isVideo ? ('video' as const) : ('image' as const),
                            url: item.url,
                            x: Math.max(0, Math.min(100 - w, targetX - (w / 2))),
                            y: Math.max(0, Math.min(100 - h, targetY - (h / 2))),
                            width: w,
                            height: h,
                            originalDimensions: { width: natW, height: natH },
                            rotation: 0,
                            zIndex: (targetPageObj.assets.length || 0) + 10,
                            aspectRatio: ratio,
                            fitMode: 'cover',
                            lockAspectRatio: true,
                            folder: folder
                        };

                        updatedPages[pageIdx] = {
                            ...targetPageObj,
                            assets: [...targetPageObj.assets, newAsset]
                        };
                    });

                    return {
                        ...prev,
                        pages: updatedPages,
                        updatedAt: new Date()
                    };
                });
            }
        });
    }, [album, uploadFiles, setAlbum]);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [showMapModal, setShowMapModal] = useState(false);
    const [showCoverPicker, setShowCoverPicker] = useState(false);
    const showPrintSafe = true;
    const workspaceRef = useRef<HTMLDivElement>(null);

    const fitToWorkspace = useCallback(() => {
        if (!workspaceRef.current || !album) return;

        const workspaceRect = workspaceRef.current.getBoundingClientRect();
        const padding = 60; // Margin around the canvas
        const topToolbarH = 48; // Quick toolbar height

        const availableW = workspaceRect.width - (padding * 2);
        const availableH = workspaceRect.height - (padding * 2) - topToolbarH;

        const { width, height } = album.config.dimensions;
        const isSpread = album.config.useSpreadView && album.pages?.[currentPageIndex]?.layoutTemplate !== 'cover-front';
        const canvasW = isSpread ? width * 2 : width;
        const canvasH = height;

        const zoomW = availableW / canvasW;
        const zoomH = availableH / canvasH;
        const idealZoom = Math.min(zoomW, zoomH, 1.2); // Limit max auto-zoom to 1.2x

        updateZoom(Number(idealZoom.toFixed(2)));
        setPan({ x: 0, y: 0 }); // Reset pan when fitting
    }, [album, currentPageIndex]);

    const [containerWidth, setContainerWidth] = useState<number>(1200);

    const canvasW = useMemo(() => {
        if (!album) return 800;
        const { width } = album.config.dimensions;
        const isSpread = album.config.useSpreadView && album.pages?.[currentPageIndex]?.layoutTemplate !== 'cover-front';
        return isSpread ? width * 2 : width;
    }, [album, currentPageIndex]);

    const scaleRatio = useMemo(() => {
        const availableW = containerWidth - 80; // 80px padding
        if (availableW < canvasW) {
            return availableW / canvasW;
        }
        return 1;
    }, [containerWidth, canvasW]);

    useEffect(() => {
        if (!workspaceRef.current) return;
        const resizeObserver = new ResizeObserver((entries) => {
            for (let entry of entries) {
                setContainerWidth(entry.contentRect.width);
            }
            fitToWorkspace();
        });
        resizeObserver.observe(workspaceRef.current);
        return () => resizeObserver.disconnect();
    }, [fitToWorkspace]);

    // Vanilla Touch Gestures (Pinch to Zoom, Two-finger Pan) & Wheel Zoom
    useEffect(() => {
        const workspace = workspaceRef.current;
        if (!workspace) return;

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length === 2) {
                e.preventDefault(); // Prevent default browser pinch-zoom on viewport
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dx = t1.clientX - t2.clientX;
                const dy = t1.clientY - t2.clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const midpoint = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };
                
                touchStartRef.current = {
                    distance,
                    midpoint,
                    pan: { ...panRef.current },
                    zoom: zoomRef.current
                };
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length === 2 && touchStartRef.current) {
                e.preventDefault(); // Prevent browser scroll and pinch zoom
                
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dx = t1.clientX - t2.clientX;
                const dy = t1.clientY - t2.clientY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const midpoint = {
                    x: (t1.clientX + t2.clientX) / 2,
                    y: (t1.clientY + t2.clientY) / 2
                };

                const start = touchStartRef.current;
                const scale = distance / start.distance;
                const targetZoom = Math.max(0.2, Math.min(2.0, start.zoom * scale));
                
                const panDiffX = midpoint.x - start.midpoint.x;
                const panDiffY = midpoint.y - start.midpoint.y;
                const targetPanX = start.pan.x + panDiffX;
                const targetPanY = start.pan.y + panDiffY;
                
                updateZoom(targetZoom);
                setPan({
                    x: targetZoom <= 0.55 ? 0 : targetPanX,
                    y: targetZoom <= 0.55 ? 0 : targetPanY
                });
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) {
                touchStartRef.current = null;
            }
        };

        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault(); // Blocks browser page zoom!
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                updateZoom(z => Math.max(0.2, Math.min(2.0, z + delta)));
            } else {
                setPan(p => {
                    const zoomVal = zoomRef.current;
                    if (zoomVal <= 0.55) {
                        return { x: 0, y: 0 };
                    }
                    return { x: p.x - e.deltaX, y: p.y - e.deltaY };
                });
            }
        };

        workspace.addEventListener('touchstart', handleTouchStart, { passive: false });
        workspace.addEventListener('touchmove', handleTouchMove, { passive: false });
        workspace.addEventListener('touchend', handleTouchEnd, { passive: false });
        workspace.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        workspace.addEventListener('wheel', handleWheel, { passive: false });

        return () => {
            workspace.removeEventListener('touchstart', handleTouchStart);
            workspace.removeEventListener('touchmove', handleTouchMove);
            workspace.removeEventListener('touchend', handleTouchEnd);
            workspace.removeEventListener('touchcancel', handleTouchEnd);
            workspace.removeEventListener('wheel', handleWheel);
        };
    }, [updateZoom]);

    // Global multitouch detector for touch pan/zoom isolation
    useEffect(() => {
        const handleWindowTouchStart = (e: TouchEvent) => {
            if (e.touches.length >= 2) {
                (window as any).__isMultiTouchActive = true;
            }
        };
        const handleWindowTouchEnd = (e: TouchEvent) => {
            if (e.touches.length === 0) {
                (window as any).__isMultiTouchActive = false;
            }
        };
        window.addEventListener('touchstart', handleWindowTouchStart, { passive: true });
        window.addEventListener('touchend', handleWindowTouchEnd, { passive: true });
        window.addEventListener('touchcancel', handleWindowTouchEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', handleWindowTouchStart);
            window.removeEventListener('touchend', handleWindowTouchEnd);
            window.removeEventListener('touchcancel', handleWindowTouchEnd);
        };
    }, []);



    // --- CONSOLIDATED KEYBOARD SHORTCUTS ENGINE ---
    useEffect(() => {
        const handleGlobalKeydown = (e: KeyboardEvent) => {
            // Priority 1: Ignore input fields, textareas, and contentEditable elements
            const target = e.target as HTMLElement;
            const isEditingText =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable ||
                target.closest('[contenteditable="true"]');

            if (isEditingText) return;

            const isMod = e.ctrlKey || e.metaKey;

            // Priority 2: Undo/Redo (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
            if (isMod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
                return;
            }
            if (isMod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                redo();
                return;
            }

            // Priority 3: Deletion (Delete, Backspace)
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (!selectedAssetId || !album || album.config.isLocked) return;
                e.preventDefault();
                const pageId = album.pages.find(p => p.assets.some(a => a.id === selectedAssetId))?.id;
                if (pageId) {
                    removeAsset(pageId, selectedAssetId);
                    setSelectedAssetId(null);
                }
                return;
            }

            // Priority 4: Nudging (Arrows) - Asset or Canvas
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();

                if (selectedAssetId) {
                    // Nudge selected asset
                    const step = e.shiftKey ? 10 : 1;
                    const currentPage = album?.pages?.[currentPageIndex];
                    const asset = currentPage?.assets.find(a => a.id === selectedAssetId);

                    if (asset && currentPage) {
                        let newX = asset.x;
                        let newY = asset.y;

                        if (e.key === 'ArrowUp') newY -= step;
                        if (e.key === 'ArrowDown') newY += step;
                        if (e.key === 'ArrowLeft') newX -= step;
                        if (e.key === 'ArrowRight') newX += step;

                        updateAsset(currentPage.id, asset.id, { x: newX, y: newY });
                    }
                } else {
                    // Pan canvas when no asset is selected
                    const panStep = e.shiftKey ? 50 : 20;
                    setPan(p => {
                        let newX = p.x;
                        let newY = p.y;

                        if (e.key === 'ArrowUp') newY += panStep;
                        if (e.key === 'ArrowDown') newY -= panStep;
                        if (e.key === 'ArrowLeft') newX += panStep;
                        if (e.key === 'ArrowRight') newX -= panStep;

                        return { x: newX, y: newY };
                    });
                }
                return;
            }

            // Priority 5: Duplicate (Ctrl+D)
            if (isMod && e.key.toLowerCase() === 'd') {
                if (!selectedAssetId || !album || album.config.isLocked) return;
                e.preventDefault();
                const pageId = album.pages.find(p => p.assets.some(a => a.id === selectedAssetId))?.id;
                if (pageId) {
                    duplicateAsset(pageId, selectedAssetId);
                }
                return;
            }

            // Priority 6: Reset View (Ctrl+0 or Cmd+0)
            if (isMod && e.key === '0') {
                e.preventDefault();
                updateZoom(0.5);
                setPan({ x: 0, y: 0 });
                return;
            }
        };

        window.addEventListener('keydown', handleGlobalKeydown);
        return () => window.removeEventListener('keydown', handleGlobalKeydown);
    }, [undo, redo, removeAsset, selectedAssetId, album, currentPageIndex, updateAsset, setSelectedAssetId, setPan, updateZoom]);

    // Update zoom when album loads or spread view changes
    useEffect(() => {
        if (album && !isLoading) {
            // Slight delay to ensure DOM is settled
            const timer = setTimeout(fitToWorkspace, 100);
            return () => clearTimeout(timer);
        }
    }, [album?.id, album?.config.useSpreadView]);

    // REMOVED Redundant keyboard effect
    const [showPreview, setShowPreview] = useState(false);

    const selectedAsset = album?.pages.flatMap(p => [
        ...(p.assets || []),
        ...(p.layoutConfig || []).map(b => ({ ...b, ...b.content?.config, type: b.content?.type || 'image', content: b.content?.text })),
        ...(p.textLayers || []).map(l => ({ ...l, ...l.content?.config, type: 'text', content: l.content?.text }))
    ] as any[]).find(a => a.id === selectedAssetId);

    const activePage = album?.pages.find(p =>
        (p.assets || []).some(a => a.id === selectedAssetId) ||
        (p.layoutConfig || []).some(b => b.id === selectedAssetId) ||
        (p.textLayers || []).some(l => l.id === selectedAssetId)
    ) || album?.pages?.[currentPageIndex];

    // Sync active page and sidebar with selection
    useEffect(() => {
        if (selectedAssetId && album) {
            const page = album.pages.find(p =>
                (p.assets || []).some(a => a.id === selectedAssetId) ||
                (p.layoutConfig || []).some(b => b.id === selectedAssetId) ||
                (p.textLayers || []).some(l => l.id === selectedAssetId)
            );
            if (page) {
                if (page.id !== activePageId) setActivePageId(page.id);
                // Find asset to determine if we should auto-open properties
                const asset = [
                    ...(page.assets || []),
                    ...(page.layoutConfig || []).map(b => ({ ...b, ...b.content?.config, type: b.content?.type || 'image', content: b.content?.text })),
                    ...(page.textLayers || []).map(l => ({ ...l, ...l.content?.config, type: 'text', content: l.content?.text }))
                ].find(a => a.id === selectedAssetId);
                if (asset && (asset.type === 'image' || asset.type === 'video' || asset.type === 'frame' || asset.type === 'text')) {
                    setActiveSidebarTab('properties');
                }
            }
        }
    }, [selectedAssetId, album]);

    // REMOVED Redundant keyboard effect

    // REMOVED Redundant initialization hook

    // Safety timeout
    useEffect(() => {
        if (isLoading) {
            const timer = setTimeout(() => {
                if (isLoading) {
                    setLoadError('Loading is taking longer than expected. Please refresh.');
                }
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [isLoading]);

    const handleShare = async () => {
        if (!album) return;
        setIsSharing(true);
        // Reset previous state
        setShareUrl(null);
        setHasCopied(false);

        try {
            const { link, error } = await generateShareLink(album.id);
            if (link) {
                setShareUrl(link);
                setShowShareModal(true);
            } else {
                console.error(error);
                alert('Failed to generate share link');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setIsSharing(false);
        }
    };

    const copyToClipboard = () => {
        if (shareUrl) {
            navigator.clipboard.writeText(shareUrl);
            setHasCopied(true);
            setTimeout(() => setHasCopied(false), 2000);
        }
    };

    const currentPage = album?.pages[currentPageIndex];

    if (loadError) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="text-center max-w-md p-8 bg-white rounded-2xl shadow-xl border border-red-100">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <X className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-serif text-catalog-text mb-2">Something went wrong</h2>
                    <p className="text-catalog-text/60 mb-8">{loadError}</p>
                    <div className="flex flex-col gap-3">
                        <Button variant="primary" onClick={() => window.location.reload()}>
                            Try Again
                        </Button>
                        <Link to="/library" className="text-sm font-bold text-catalog-accent hover:underline uppercase tracking-widest">
                            Return to Library
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (isLoading || !album || !currentPage) {
        return (
            <div className="h-screen flex items-center justify-center bg-catalog-bg">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-catalog-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="font-serif italic text-catalog-text/70">{isLoading ? 'Loading archive...' : 'Setting up your studio...'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-gray-50 relative">
            {/* --- BACKUP RECOVERY BANNER --- */}
            <AnimatePresence>
                {hasLocalBackup && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-catalog-accent text-white px-6 py-2 flex items-center justify-between text-xs font-bold uppercase tracking-widest z-[70]"
                    >
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 animate-pulse" />
                            <span>Unsaved Local Backup Found (Recovering your session)</span>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={restoreBackup} className="hover:underline bg-white/20 px-3 py-1 rounded-sm">Restore Progress</button>
                            <button onClick={() => setHasLocalBackup(false)} className="opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Share Modal Overlay */}
            {showShareModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-serif text-catalog-text">Share Album</h3>
                            <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <p className="text-sm text-gray-500">
                                Share this temporary link with family. It will expire automatically in 48 hours.
                            </p>
                            <div className="flex items-center gap-2">
                                <input
                                    readOnly
                                    value={shareUrl || ''}
                                    className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm font-mono text-gray-600 focus:outline-none focus:border-catalog-accent"
                                />
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={copyToClipboard}
                                    className={cn("min-w-[80px]", hasCopied && "bg-green-50 text-green-600 border-green-200")}
                                >
                                    {hasCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                    {hasCopied ? 'Copied' : 'Copy'}
                                </Button>
                            </div>
                        </div>
                    
                        <div className="pt-2 flex justify-end">
                            <Button variant="ghost" onClick={() => setShowShareModal(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4 animate-slide-up">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-serif text-catalog-text">Album Settings</h3>
                            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-catalog-text/70 uppercase tracking-widest">Title</label>
                                <input
                                    value={album.title}
                                    onChange={(e) => setAlbum({ ...album, title: e.target.value })}
                                    className="w-full bg-catalog-stone/10 border-0 rounded-lg px-3 py-2 text-sm text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-catalog-text/70 uppercase tracking-widest">Description</label>
                                <textarea
                                    value={album.description || ''}
                                    onChange={(e) => setAlbum({ ...album, description: e.target.value })}
                                    rows={3}
                                    className="w-full bg-catalog-stone/10 border-0 rounded-lg px-3 py-2 text-sm text-catalog-text focus:ring-2 focus:ring-catalog-accent/30"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-catalog-text/70 uppercase tracking-widest">Cover Image</label>
                                <div className="flex items-center gap-3">
                                    <div className="relative w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                                        {album.coverUrl ? (
                                            <img src={album.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <ImageIcon className="w-8 h-8 opacity-50" />
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => setShowCoverPicker(true)}
                                    >
                                        Change Cover
                                    </Button>
                                    {album.coverUrl && (
                                        <button
                                            onClick={() => setAlbum({ ...album, coverUrl: undefined })}
                                            className="text-xs text-red-500 hover:underline"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-catalog-text/70 uppercase tracking-widest flex items-center gap-1">
                                    <Tag className="w-3.5 h-3.5" /> Hashtags
                                </label>
                                <HashtagInput
                                    tags={album.hashtags || []}
                                    onChange={(tags) => setAlbum({ ...album, hashtags: tags })}
                                    suggestions={['vacation', 'wedding', 'birthday', 'recipe', 'history']}
                                />
                            </div>
                            <div className="space-y-1">
                                <LocationPicker
                                    label="Location"
                                    value={album.location || ''}
                                    onChange={(address, lat, lng) => {
                                        if (album.config.isLocked) return;
                                        const updates: any = { location: address };
                                        // Support 0 as a valid coordinate
                                        if (typeof lat === 'number' && typeof lng === 'number') {
                                            updates.geotag = { lat, lng };
                                        } else if (!address) {
                                            updates.geotag = null;
                                        }
                                        setAlbum({ ...album, ...updates });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="pt-4 flex justify-end">
                            <Button variant="primary" onClick={() => { saveAlbum(); setShowSettings(false); }}>
                                Done
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Bar */}
            {/* Top Bar */}
            <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-black/5 flex items-center justify-between px-8 sticky top-0 z-[60] shadow-sm">
                <div className="flex items-center gap-8">
                    <Link
                        to="/library"
                        className="w-10 h-10 flex items-center justify-center hover:bg-black/5 rounded-2xl transition-all text-catalog-text/40 hover:text-catalog-accent border border-black/5"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="flex flex-col">
                        <div className="flex items-center gap-4">
                            <h1 className="font-outfit font-black text-xl text-catalog-text tracking-tight uppercase">{album.title}</h1>
                            {/* Autosave Status */}
                            <div className={cn(
                                "flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all",
                                autoSave.status === 'saving' ? "bg-catalog-accent/10 border-catalog-accent/20 text-catalog-accent" :
                                    autoSave.status === 'unsaved' ? "bg-orange-500/10 border-orange-500/20 text-orange-600" :
                                        "bg-green-500/10 border-green-500/20 text-green-600"
                            )}>
                                <span className={cn("w-1.5 h-1.5 rounded-full",
                                    autoSave.status === 'saving' ? "bg-catalog-accent animate-pulse" :
                                        autoSave.status === 'unsaved' ? "bg-orange-500" : "bg-green-500"
                                )} />
                                {autoSave.status === 'saving' ? 'Syncing Matrix' :
                                    autoSave.status === 'unsaved' ? 'Pending Changes' :
                                        'Archive Sync Ready'}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 mt-1">
                            <span className="text-[10px] text-catalog-text/30 font-black uppercase tracking-[0.2em]">
                                {(currentPage.layoutTemplate || 'freeform').replace('-', ' ')}
                            </span>
                            <div className="flex items-center bg-black/5 rounded-xl overflow-hidden p-0.5 border border-black/5">
                                <button className="w-8 h-6 flex items-center justify-center hover:bg-white rounded-lg text-[10px] font-bold transition-all" onClick={() => updateZoom(z => Math.max(0.2, z - 0.1))}>-</button>
                                <div className="flex items-center px-1">
                                    <input
                                        type="number"
                                        min="20"
                                        max="200"
                                        value={Math.round(zoom * 100)}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            if (!isNaN(val) && val >= 10 && val <= 300) {
                                                updateZoom(val / 100);
                                            }
                                        }}
                                        className="w-10 text-[10px] text-center bg-transparent border-none p-0 text-catalog-text/60 font-black focus:ring-0 appearance-none m-0"
                                    />
                                    <span className="text-[8px] text-catalog-text/40 font-black">%</span>
                                </div>
                                <button className="w-8 h-6 flex items-center justify-center hover:bg-white rounded-lg text-[10px] font-bold transition-all" onClick={() => updateZoom(z => Math.min(2.0, z + 0.1))}>+</button>
                            </div>
                            <button
                                className="px-3 h-6 flex items-center justify-center bg-black/5 hover:bg-black/10 rounded-xl text-[9px] font-black uppercase tracking-widest text-catalog-text/60 hover:text-catalog-accent transition-all border border-black/5"
                                onClick={() => {
                                    updateZoom(0.5);
                                    setPan({ x: 0, y: 0 });
                                }}
                                title="Reset view to center"
                            >
                                Reset
                            </button>
                            <span className="text-[9px] text-catalog-text/20 font-black uppercase tracking-widest italic">
                                {album.config.useSpreadView && currentPage.layoutTemplate !== 'cover-front'
                                    ? `CHANNELS ${currentPage.pageNumber} - ${Math.min(currentPage.pageNumber + 1, album.pages.length)}`
                                    : `CHANNEL ${currentPage.pageNumber}`}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white p-1 rounded-2xl border border-black/5 mr-4 overflow-hidden">
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canUndo}
                            onClick={undo}
                            className="h-9 w-9 p-0 rounded-xl hover:bg-black/5 transition-all"
                            title="Undo (Ctrl+Z)"
                        >
                            <Undo className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!canRedo}
                            onClick={redo}
                            className="h-9 w-9 p-0 rounded-xl hover:bg-black/5 transition-all"
                            title="Redo (Ctrl+Y)"
                        >
                            <Redo className="w-4 h-4" />
                        </Button>

                        {/* Lock/Unlock Toggle */}
                        {selectedAsset && (
                            <>
                                <div className="w-[1px] h-6 bg-black/10 mx-1" />
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        const pageId = album.pages.find(p => p.assets.some(a => a.id === selectedAsset.id))?.id;
                                        if (pageId) {
                                            updateAsset(pageId, selectedAsset.id, { isLocked: !selectedAsset.isLocked });
                                        }
                                    }}
                                    className={cn(
                                        "h-9 w-9 p-0 rounded-xl transition-all",
                                        selectedAsset.isLocked
                                            ? "bg-orange-500/10 text-orange-600 hover:bg-orange-500/20"
                                            : "hover:bg-black/5"
                                    )}
                                    title={selectedAsset.isLocked ? "Unlock Element" : "Lock Element"}
                                >
                                    {selectedAsset.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                </Button>

                                {/* Pro Studio Button */}
                                {(selectedAsset.type === 'image' || selectedAsset.type === 'video' || selectedAsset.type === 'frame') && selectedAsset.url && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setEditorMode('studio')}
                                        className="h-9 w-9 p-0 rounded-xl hover:bg-catalog-accent/10 text-catalog-accent transition-all"
                                        title="Open Pro Image Studio"
                                    >
                                        <Droplets className="w-4 h-4" />
                                    </Button>
                                )}
                            </>
                        )}
                    </div>

                    <div className="flex bg-black/5 p-1 rounded-2xl border border-black/5 mr-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "rounded-xl text-[9px] font-black uppercase tracking-widest h-9 px-4 transition-all",
                                album.config.useSpreadView && "bg-white shadow-lg text-catalog-accent"
                            )}
                            onClick={() => toggleSpreadView()}
                        >
                            Spread View
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                "rounded-xl text-[9px] font-black uppercase tracking-widest h-9 px-4 transition-all",
                                !album.config.useSpreadView && "bg-white shadow-lg text-catalog-accent"
                            )}
                            onClick={() => updateConfig({ useSpreadView: false })}
                        >
                            Solo Channel
                        </Button>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleLock()}
                        className={cn(
                            "h-10 px-5 gap-3 rounded-2xl transition-all border",
                            album.config.isLocked
                                ? "bg-orange-500/10 border-orange-500/20 text-orange-600"
                                : "bg-white border-black/5 text-catalog-text hover:bg-black/[0.02]"
                        )}
                        title={album.config.isLocked ? "Unlock Editing" : "Seal Archive"}
                    >
                        {album.config.isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">{album.config.isLocked ? "Locked" : "Seal Archive"}</span>
                    </Button>

                    <div className="flex items-center gap-1.5 p-1 bg-black/5 rounded-2xl border border-black/5">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleShare}
                            isLoading={isSharing}
                            className="h-8 w-8 p-0 rounded-xl hover:bg-white transition-all"
                            title="Circulate Access"
                        >
                            <Share className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSettings(true)}
                            className="h-8 w-8 p-0 rounded-xl hover:bg-white transition-all"
                            title="Archive Parameters"
                        >
                            <SettingsIcon className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPreview(true)}
                            className="h-8 w-8 p-0 rounded-xl hover:bg-white transition-all text-catalog-accent"
                            title="Visual Preview"
                        >
                            <Eye className="w-4 h-4" />
                        </Button>
                    </div>

                    <div className="w-[1px] h-8 bg-black/5 mx-2" />

                    <Button
                        onClick={async () => {
                            const { success, error } = await saveAlbum();
                            if (success) {
                                // Indication
                            } else {
                                alert('Failed to save: ' + error);
                            }
                        }}
                        isLoading={isManualSaving || autoSave.status === 'saving'}
                        className="h-10 px-8 bg-catalog-accent text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-catalog-accent/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                        {isManualSaving || autoSave.status === 'saving' ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Commit
                    </Button>
                </div>
            </header>
            
            <div className="flex-1 flex overflow-hidden bg-catalog-bg/40 min-h-0">
                {/* Left Sidebar: Assets & Media */}
                <AssetLibrary />

                {/* Center Canvas Area */}
                <main
                    ref={workspaceRef}
                    className="flex-1 flex flex-col min-w-0 overflow-hidden relative"
                    onClick={() => setSelectedAssetId(null)}
                    onMouseDown={(e) => {
                        // Global background click to deselect
                        if (e.target === e.currentTarget) setSelectedAssetId(null);
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="h-16 border-b border-black/5 bg-white/40 backdrop-blur-md z-30 shrink-0 overflow-x-auto styling-scrollbar-thin flex items-center px-4 md:px-8 relative justify-between whitespace-nowrap"
                    >
                        <div className="flex items-center gap-4 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (album.config.isLocked) return;
                                    // Use active clicked page or fallback to current left page
                                    const targetPageId = activePageId || album?.pages?.[currentPageIndex]?.id;

                                    if (targetPageId) {
                                        addAsset(targetPageId, {
                                            type: 'text',
                                            content: 'Your story here...',
                                            x: 35,
                                            y: 35,
                                            width: 30,
                                            height: 10,
                                            rotation: 0,
                                            zIndex: 20,
                                            fontFamily: 'Inter',
                                            fontSize: 32,
                                            fontWeight: 'normal',
                                            textAlign: 'center',
                                            textColor: '#000000'
                                        } as any);
                                    }
                                }}
                                disabled={album.config.isLocked}
                                className={cn(
                                    "h-10 gap-3 bg-catalog-accent text-white hover:bg-catalog-accent/90 transition-all shadow-lg shadow-catalog-accent/10 rounded-xl px-5",
                                    album.config.isLocked && "opacity-50 cursor-not-allowed grayscale"
                                )}
                            >
                                <Type className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Add Text</span>
                            </Button>

                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (album.config.isLocked) return;
                                    setShowLocationModal(true);
                                }}
                                disabled={album.config.isLocked}
                                className={cn(
                                    "h-10 gap-3 bg-black/5 text-catalog-text hover:bg-black/10 transition-all border border-black/5 rounded-xl px-5",
                                    album.config.isLocked && "opacity-50 cursor-not-allowed grayscale"
                                )}
                            >
                                <MapPin className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Add Location</span>
                            </Button>

                            <div className="w-[1px] h-6 bg-black/5 mx-2" />

                            {/* Rearrange Mode Button */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (album.config.isLocked) return;
                                    if (isRearrangeMode) {
                                        exitRearrangeMode();
                                    } else {
                                        setIsRearrangeMode(true);
                                        setSelectedAssetId(null);
                                    }
                                }}
                                disabled={album.config.isLocked}
                                className={cn(
                                    "h-10 gap-3 transition-all border rounded-xl px-5",
                                    isRearrangeMode
                                        ? "bg-purple-600 text-white border-purple-700 shadow-lg shadow-purple-500/20"
                                        : "bg-black/5 text-catalog-text hover:bg-black/10 border-black/5",
                                    album.config.isLocked && "opacity-50 cursor-not-allowed grayscale"
                                )}
                                title="Rearrange images by clicking two to swap them"
                            >
                                <Shuffle className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                                    {isRearrangeMode ? 'Cancel Swap' : 'Rearrange'}
                                </span>
                            </Button>

                            {/* Rearrange Banner */}
                            <AnimatePresence>
                                {isRearrangeMode && (
                                    <motion.div
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -20 }}
                                        className="flex items-center gap-3 px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl h-10"
                                    >
                                        <ArrowLeftRight className="w-4 h-4 text-purple-600 animate-pulse" />
                                        <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest">
                                            {rearrangeFirstId ? '✓ Now click the 2nd image' : 'Click image 1 to swap...'}
                                        </span>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="w-[1px] h-6 bg-black/5 mx-2" />

                            {selectedAsset && !album.config.isLocked ? (
                                <div className="flex items-center gap-6 shrink-0 animate-in fade-in slide-in-from-left-4 duration-500">
                                    <span className="text-[9px] font-black text-catalog-text/20 uppercase tracking-[0.4em] mr-2 hidden md:inline-block">Selection Context</span>

                                    <div className="flex items-center gap-3">
                                        {selectedAsset.type === 'text' && (
                                            <div className="flex items-center gap-4 glass p-1.5 rounded-2xl border border-black/5">
                                                <select
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    value={selectedAsset.fontFamily || 'Outfit'}
                                                    onChange={(e) => {
                                                        if (album.config.isLocked || selectedAsset.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAsset(pageId, selectedAsset.id, { fontFamily: e.target.value });
                                                    }}
                                                    className="text-[11px] font-black bg-transparent border-none focus:ring-0 cursor-pointer text-catalog-text uppercase tracking-widest py-1 px-4 disabled:opacity-50"
                                                >
                                                    <option value="Outfit">Outfit</option>
                                                    <option value="'Cormorant Garamond'">Garamond</option>
                                                    <option value="'Playfair Display'">Playfair</option>
                                                    <option value="'Dancing Script'">Dancing</option>
                                                    <option value="Montserrat">Montserrat</option>
                                                </select>

                                                <div className="w-[1px] h-5 bg-black/5" />

                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        min="6"
                                                        max="200"
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        value={selectedAsset.fontSize || 32}
                                                        onChange={(e) => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            const val = parseInt(e.target.value);
                                                            const pageId = activePage?.id;
                                                            if (pageId && !isNaN(val)) updateAsset(pageId, selectedAsset.id, { fontSize: val });
                                                        }}
                                                        className="w-12 bg-transparent border-none text-[11px] font-black text-catalog-accent focus:ring-0 text-center p-0 disabled:opacity-50"
                                                    />
                                                    <span className="text-[9px] text-catalog-text/20 font-black uppercase select-none">pt</span>
                                                </div>

                                                <div className="w-[1px] h-5 bg-black/5" />

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            const pageId = activePage?.id;
                                                            if (pageId) updateAsset(pageId, selectedAsset.id, { fontWeight: selectedAsset.fontWeight === 'bold' ? 'normal' : 'bold' });
                                                        }}
                                                        className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all", selectedAsset.fontWeight === 'bold' ? "text-catalog-accent bg-catalog-accent/10" : "text-catalog-text/20 hover:text-catalog-accent")}
                                                    >
                                                        <Bold className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            const pageId = activePage?.id;
                                                            if (pageId) updateAsset(pageId, selectedAsset.id, { fontStyle: selectedAsset.fontStyle === 'italic' ? 'normal' : 'italic' });
                                                        }}
                                                        className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all", selectedAsset.fontStyle === 'italic' ? "text-catalog-accent bg-catalog-accent/10" : "text-catalog-text/20 hover:text-catalog-accent")}
                                                    >
                                                        <Italic className="w-4 h-4" />
                                                    </button>

                                                    <button
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            const pageId = activePage?.id;
                                                            if (pageId) updateAsset(pageId, selectedAsset.id, { textDecoration: selectedAsset.textDecoration === 'underline' ? 'none' : 'underline' } as any);
                                                        }}
                                                        className={cn("w-8 h-8 flex items-center justify-center rounded-xl transition-all", selectedAsset.textDecoration === 'underline' ? "text-catalog-accent bg-catalog-accent/10" : "text-catalog-text/20 hover:text-catalog-accent")}
                                                    >
                                                        <Underline className="w-4 h-4" />
                                                    </button>

                                                    <div className={cn("relative w-7 h-7 rounded-xl overflow-hidden border border-black/5 cursor-pointer ml-1")}>
                                                        <input
                                                            type="color"
                                                            disabled={album.config.isLocked || selectedAsset.isLocked}
                                                            value={selectedAsset.textColor || '#000000'}
                                                            onChange={(e) => {
                                                                if (album.config.isLocked || selectedAsset.isLocked) return;
                                                                const pageId = activePage?.id;
                                                                if (pageId) updateAsset(pageId, selectedAsset.id, { textColor: e.target.value });
                                                            }}
                                                            className="absolute inset-0 w-full h-full scale-150 cursor-pointer border-none p-0 disabled:opacity-50"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* Image Editing Tools */}
                                        {(selectedAsset.type === 'image' || selectedAsset.type === 'frame') && (
                                            <div className="flex items-center gap-2 glass p-1 rounded-2xl border border-black/5">
                                                <button
                                                    onClick={() => {
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAsset(pageId, selectedAsset.id, { fitMode: selectedAsset.fitMode === 'cover' ? 'fit' : 'cover' });
                                                    }}
                                                    className="p-2 hover:bg-black/5 rounded-xl transition-all text-catalog-text/50 hover:text-catalog-accent flex items-center gap-1.5"
                                                    title="Toggle Fit/Cover"
                                                >
                                                    <Maximize2 className="w-4 h-4" />
                                                    <span className="text-[9px] font-black uppercase tracking-widest">{selectedAsset.fitMode === 'cover' ? 'TO FIT' : 'TO COVER'}</span>
                                                </button>

                                                <div className="w-[1px] h-4 bg-black/5 mx-1" />

                                                <button
                                                    onClick={() => {
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAsset(pageId, selectedAsset.id, { flipX: !selectedAsset.flipX });
                                                    }}
                                                    className="p-2 hover:bg-black/5 rounded-xl transition-all text-catalog-text/50 hover:text-catalog-accent"
                                                    title="Flip Horizontal"
                                                >
                                                    <FlipHorizontal className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAsset(pageId, selectedAsset.id, { flipY: !selectedAsset.flipY });
                                                    }}
                                                    className="p-2 hover:bg-black/5 rounded-xl transition-all text-catalog-text/50 hover:text-catalog-accent"
                                                    title="Flip Vertical"
                                                >
                                                    <FlipVertical className="w-4 h-4" />
                                                </button>

                                                <button
                                                    onClick={() => {
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAsset(pageId, selectedAsset.id, { rotation: ((selectedAsset.rotation || 0) + 90) % 360 });
                                                    }}
                                                    className="p-2 hover:bg-black/5 rounded-xl transition-all text-catalog-text/50 hover:text-catalog-accent"
                                                    title="Rotate 90°"
                                                >
                                                    <RotateCw className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-3">
                                            {selectedAsset.type === 'text' ? (
                                                <Button
                                                    variant="ghost"
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    onClick={() => {
                                                        if (album.config.isLocked || selectedAsset.isLocked) return;
                                                        const el = document.querySelector(`[data-text-asset-id="${selectedAsset.id}"]`) as HTMLElement;
                                                        if (el) {
                                                            el.focus();
                                                            const range = document.createRange();
                                                            const sel = window.getSelection();
                                                            range.selectNodeContents(el);
                                                            range.collapse(false);
                                                            sel?.removeAllRanges();
                                                            sel?.addRange(range);
                                                        }
                                                    }}
                                                    className="h-12 px-5 gap-3 bg-black/5 border border-black/5 rounded-2xl hover:bg-black/10 transition-all font-outfit"
                                                >
                                                    <Pencil className="w-5 h-5 text-catalog-accent" />
                                                    <span className="text-[11px] font-black uppercase tracking-widest">Edit Text</span>
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="ghost"
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        onClick={() => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            setEditorMode('mask');
                                                        }}
                                                        className="h-12 px-5 gap-3 bg-black/5 border border-black/5 rounded-2xl hover:bg-black/10 transition-all font-outfit"
                                                    >
                                                        <Scissors className="w-5 h-5 text-catalog-accent" />
                                                        <span className="text-[11px] font-black uppercase tracking-widest">Crop</span>
                                                    </Button>

                                                    {(selectedAsset.type === 'image' || selectedAsset.type === 'frame') && (
                                                        <Button
                                                            variant="ghost"
                                                            disabled={album.config.isLocked || selectedAsset.isLocked}
                                                            onClick={() => {
                                                                if (album.config.isLocked || selectedAsset.isLocked) return;
                                                                setEditorMode('studio');
                                                            }}
                                                            className="h-12 px-5 gap-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl hover:bg-purple-500/20 transition-all font-outfit text-purple-600"
                                                        >
                                                            <Wand2 className="w-5 h-5" />
                                                            <span className="text-[11px] font-black uppercase tracking-widest">Studio</span>
                                                        </Button>
                                                    )}
                                                </>
                                            )}

                                            <div className="flex items-center gap-1.5 p-1.5 bg-black/5 rounded-2xl border border-black/5">
                                                <button
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    onClick={() => {
                                                        if (album.config.isLocked || selectedAsset.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAssetZIndex(pageId, selectedAsset.id, 'front');
                                                    }}
                                                    className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-xl transition-all text-catalog-text/40 hover:text-catalog-accent"
                                                    title="Elevate Front"
                                                >
                                                    <ChevronUp className="w-5 h-5" />
                                                </button>
                                                <button
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    onClick={() => {
                                                        if (album.config.isLocked || selectedAsset.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) updateAssetZIndex(pageId, selectedAsset.id, 'back');
                                                    }}
                                                    className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-xl transition-all text-catalog-text/40 hover:text-catalog-accent"
                                                    title="Lower Back"
                                                >
                                                    <ChevronDown className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <div className="flex items-center gap-4 px-5 h-12 bg-black/5 rounded-2xl border border-black/5">
                                                <span className="text-[10px] font-black text-catalog-text/20 uppercase tracking-[0.2em]">Geometry</span>
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        type="number"
                                                        disabled={album.config.isLocked || selectedAsset.isLocked}
                                                        value={Math.round(selectedAsset.width)}
                                                        onChange={(e) => {
                                                            if (album.config.isLocked || selectedAsset.isLocked) return;
                                                            const val = parseFloat(e.target.value);
                                                            const pageId = activePage?.id;
                                                            if (pageId && !isNaN(val) && val > 0) {
                                                                const aspectRatio = selectedAsset.aspectRatio || (selectedAsset.width / selectedAsset.height);
                                                                updateAsset(pageId, selectedAsset.id, {
                                                                    width: val,
                                                                    height: val / aspectRatio
                                                                });
                                                            }
                                                        }}
                                                        className="w-14 bg-transparent border-none text-[11px] font-black text-catalog-accent focus:ring-0 text-center p-0 disabled:opacity-50"
                                                    />
                                                    <span className="text-[9px] text-catalog-text/20 font-black uppercase">px</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 p-1.5 bg-black/5 rounded-2xl border border-black/5">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (album.config.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) {
                                                            updateAsset(pageId, selectedAsset.id, { isLocked: !selectedAsset.isLocked });
                                                        }
                                                    }}
                                                    className={cn("w-9 h-9 flex items-center justify-center rounded-xl transition-all", selectedAsset.isLocked ? "bg-orange-500/10 text-orange-600" : "text-catalog-text/40 hover:text-catalog-accent")}
                                                    title={selectedAsset.isLocked ? "Unlock Narrative Element" : "Seal Element"}
                                                >
                                                    {selectedAsset.isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                                                </button>

                                                <button
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (album.config.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) {
                                                            duplicateAsset(pageId, selectedAsset.id);
                                                        }
                                                    }}
                                                    title="Duplicate Selection"
                                                    className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-xl transition-all text-catalog-text/40 hover:text-catalog-accent disabled:opacity-30"
                                                >
                                                    <Copy className="w-5 h-5" />
                                                </button>

                                                <button
                                                    disabled={album.config.isLocked || selectedAsset.isLocked}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (album.config.isLocked) return;
                                                        const pageId = activePage?.id;
                                                        if (pageId) {
                                                            const pageW = album.config.dimensions.width;
                                                            const pageH = album.config.dimensions.height;
                                                            const assetRatio = selectedAsset.aspectRatio ||
                                                                (selectedAsset.originalDimensions ? selectedAsset.originalDimensions.width / selectedAsset.originalDimensions.height :
                                                                    (selectedAsset.width / selectedAsset.height));
                                                            const newHeight = (100 * pageW) / (pageH * assetRatio);
                                                            updateAsset(pageId, selectedAsset.id, {
                                                                x: 0,
                                                                y: 0,
                                                                width: 100,
                                                                height: newHeight,
                                                                rotation: 0
                                                            });
                                                        }
                                                    }}
                                                    title="Visual Fit to Canvas"
                                                    className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-xl transition-all text-catalog-text/40 hover:text-catalog-accent disabled:opacity-30"
                                                >
                                                    <Maximize className="w-5 h-5" />
                                                </button>
                                            </div>

                                            <button
                                                disabled={album.config.isLocked || selectedAsset.isLocked}
                                                className="w-12 h-12 flex items-center justify-center bg-red-500/10 text-red-600 rounded-2xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20 disabled:opacity-30"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (album.config.isLocked || selectedAsset.isLocked) return;
                                                    const pageId = activePage?.id;
                                                    if (pageId) {
                                                        removeAsset(pageId, selectedAsset.id);
                                                        setSelectedAssetId(null);
                                                    }
                                                }} title="Exterminate"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 text-catalog-text/20 animate-in fade-in duration-700 font-outfit">
                                    <Layers className="w-4 h-4 opacity-40 rotate-12" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.4em]">Initialize creative input</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-4 shrink-0 px-2">
                            <div className="flex items-center gap-3 px-4 py-1.5 bg-black/5 rounded-full border border-black/5">
                                <span className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest">Scalar</span>
                                <span className="text-[10px] font-black text-catalog-accent tracking-widest">{Math.round(zoom * 100)}%</span>
                            </div>
                            <div
                                className="flex items-center gap-2 px-3 py-1.5 bg-black/5 rounded-full border border-black/5 group relative"
                                title="Pan: Drag canvas, scroll, or arrow keys | Reset: Ctrl+0"
                            >
                                <svg className="w-3.5 h-3.5 text-catalog-text/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                                <span className="text-[9px] font-black text-catalog-text/20 uppercase tracking-widest">Pan</span>
                            </div>
                            {autoSave.status === 'saving' && (
                                <div className="flex items-center gap-2 px-3 py-1 bg-catalog-accent/5 rounded-full border border-catalog-accent/10">
                                    <div className="w-2 h-2 bg-catalog-accent rounded-full animate-ping" />
                                    <span className="text-[9px] font-black text-catalog-accent uppercase tracking-widest leading-none">Matrix Updating</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex overflow-hidden w-full relative">
                        <div
                            className="flex-1 relative flex flex-col items-center justify-center bg-catalog-stone/5 p-8 overflow-hidden cursor-grab active:cursor-grabbing"
                            onMouseDown={(e) => {
                                if (e.button !== 0) return; // Only left click
                                if (e.target !== e.currentTarget) return; // Only if clicking background

                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startPan = { ...pan };

                            const onMouseMove = (moveEvent: MouseEvent) => {
                                setPan({
                                    x: startPan.x + (moveEvent.clientX - startX),
                                    y: startPan.y + (moveEvent.clientY - startY)
                                });
                            };

                            const onMouseUp = () => {
                                window.removeEventListener('mousemove', onMouseMove);
                                window.removeEventListener('mouseup', onMouseUp);
                            };

                            window.addEventListener('mousemove', onMouseMove);
                            window.addEventListener('mouseup', onMouseUp);
                        }}
                    >
                        {/* Panning Container */}
                        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)`, transition: 'transform 0.05s linear' }} className="flex items-center justify-center w-full h-full pointer-events-none">
                            <div 
                                className="pointer-events-auto"
                                style={{
                                    transform: scaleRatio < 1 ? `scale(${scaleRatio})` : undefined,
                                    transformOrigin: 'center top'
                                }}
                            >
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={currentPageIndex}
                                        style={{ scale: zoom, originX: 0.5, originY: 0.5 }}
                                        initial={{ x: navigationDirection === 'next' ? 50 : -50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        exit={{ x: navigationDirection === 'next' ? -50 : 50, opacity: 0 }}
                                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                        className={cn(
                                            "relative flex transition-all duration-500",
                                            album.config.useSpreadView ? "gap-0" : "gap-8"
                                        )}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {(() => {
                                            const spread = getSpread(currentPageIndex);
                                            const isSpreadView = album.config.useSpreadView;

                                            if (isSpreadView && spread.length > 1) {
                                                // Unified Spread View: One canvas for both pages or placeholder
                                                return (
                                                    <div className="relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white rounded-sm select-none">
                                                        <EditorCanvas
                                                            page={spread[0]}
                                                            nextPage={spread[1]}
                                                            side="single" // Signifies this is the start of a spread
                                                            showPrintSafe={showPrintSafe}
                                                            zoom={zoom}
                                                            onPageSelect={(id: string) => setCurrentPageIndex(album.pages.findIndex(p => p.id === id))}
                                                            onOpenMapEditor={(id: string) => { setSelectedAssetId(id); setShowMapModal(true); }}
                                                            onOpenLocationEditor={(id: string) => { setSelectedAssetId(id); setShowLocationModal(true); }}
                                                            onAssetClick={handleRearrangeClick}
                                                            rearrangeFirstId={rearrangeFirstId}
                                                            isRearrangeMode={isRearrangeMode}
                                                            onLocalFileDrop={handleLocalFileDrop}
                                                        />
                                                        {/* Gutter Guide */}
                                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-full z-10 pointer-events-none flex">
                                                            <div className="flex-1 bg-gradient-to-r from-black/10 to-transparent" />
                                                            <div className="flex-1 bg-gradient-to-l from-black/10 to-transparent" />
                                                        </div>
                                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-full bg-black/5 z-20 pointer-events-none" />
                                                    </div>
                                                );
                                            }

                                            // Single Page View
                                            return spread.map((page) => {
                                                // Covers are always treated as 'single' when they appear alone
                                                const side: 'left' | 'right' | 'single' = 'single';

                                                return (
                                                    <div
                                                        key={page.id}
                                                        className="relative shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white rounded-sm"
                                                    >
                                                        <EditorCanvas
                                                            page={page}
                                                            side={side}
                                                            showPrintSafe={showPrintSafe}
                                                            zoom={zoom}
                                                            onPageSelect={(id: string) => setCurrentPageIndex(album.pages.findIndex(p => p.id === id))}
                                                            onOpenMapEditor={(id: string) => { setSelectedAssetId(id); setShowMapModal(true); }}
                                                            onOpenLocationEditor={(id: string) => { setSelectedAssetId(id); setShowLocationModal(true); }}
                                                            onAssetClick={handleRearrangeClick}
                                                            rearrangeFirstId={rearrangeFirstId}
                                                            isRearrangeMode={isRearrangeMode}
                                                            onLocalFileDrop={handleLocalFileDrop}
                                                        />
                                                    </div>
                                                );
                                            });
                                        })()}
                                    </motion.div>
                                </AnimatePresence>
                        </div>
                    
                            {/* Navigation Arrows */}
                            <div className="absolute inset-x-8 bottom-6 flex justify-between pointer-events-none z-50">
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        "w-10 h-10 rounded-full bg-white/50 backdrop-blur-md shadow-xl pointer-events-auto border border-white/50 hover:bg-white hover:scale-110 transition-all",
                                        currentPageIndex === 0 && "opacity-0 pointer-events-none"
                                    )}
                                    onClick={() => {
                                        const prevPageIndex = Math.max(0, currentPageIndex - 1);
                                        const prevSpread = getSpread(prevPageIndex);
                                        const step = (album.config.useSpreadView && prevSpread.length > 1) ? 2 : 1;
                                        setNavigationDirection('prev');
                                        setCurrentPageIndex(Math.max(0, currentPageIndex - step));
                                    }}
                                >
                                    <ChevronLeft className="w-6 h-6 text-catalog-accent" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    className={cn(
                                        "w-10 h-10 rounded-full bg-white/50 backdrop-blur-md shadow-xl pointer-events-auto border border-white/50 hover:bg-white hover:scale-110 transition-all",
                                        currentPageIndex >= album.pages.length - 1 && "opacity-0 pointer-events-none"
                                    )}
                                    onClick={() => {
                                        const spread = getSpread(currentPageIndex);
                                        const step = (album.config.useSpreadView && spread.length > 1) ? 2 : 1;
                                        setNavigationDirection('next');
                                        setCurrentPageIndex(Math.min(album.pages.length - 1, currentPageIndex + step));
                                    }}
                                >
                                    <ChevronRight className="w-6 h-6 text-catalog-accent" />
                                </Button>
                            </div>
                        </div>
                    </div>
                        {/* Right Sidebar: Properties & Layouts - MOVED TO GREEN POSITION */}
                        <aside 
                            onClick={(e) => e.stopPropagation()}
                            className="w-72 hidden md:flex flex-col glass border-l border-white/20 shadow-2xl z-[30] h-full overflow-hidden shrink-0"
                        >
                            <div className="flex p-2 gap-1 bg-black/5">
                                {['layouts', 'properties', 'layers'].map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveSidebarTab(tab as any)}
                                        className={cn(
                                            "flex-1 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] transition-all rounded-xl font-outfit",
                                            activeSidebarTab === tab
                                                ? "bg-white text-catalog-text shadow-sm border border-black/5"
                                                : "text-catalog-text/40 hover:bg-white/40 hover:text-catalog-text"
                                        )}
                                    >
                                        <span className="capitalize">{tab}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-hidden relative">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeSidebarTab}
                                        initial={{ opacity: 0, x: 10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: -10 }}
                                        transition={{ duration: 0.2 }}
                                        className="h-full"
                                    >
                                        {activeSidebarTab === 'properties' && (
                                            <AssetControlPanel
                                                editorMode={editorMode}
                                                setEditorMode={setEditorMode}
                                            />
                                        )}
                                        {activeSidebarTab === 'layers' && <LayersPanel activePageId={activePageId} />}
                                        {activeSidebarTab === 'layouts' && <LayoutSidebar activePageId={activePageId || ''} />}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </aside>
                    </div>
                </main>
            </div>

            {/* Filmstrip */}
            < Filmstrip />

            {/* Preview Modal */}
            <AnimatePresence>
                {
                    showPreview && (
                        <FlipbookViewer
                            pages={album.pages}
                            album={album}
                            onClose={() => setShowPreview(false)}
                        />
                    )
                }
            </AnimatePresence >

            {/* Advanced Mask Modal */}
            {
                editorMode === 'mask' && selectedAsset && activePage && (
                    <MaskEditorModal
                        asset={selectedAsset}
                        pageId={activePage.id}
                        updateAsset={updateAsset}
                        onClose={() => setEditorMode('select')}
                    />
                )
            }

            {/* Pro Image Studio Modal */}
            {
                editorMode === 'studio' && selectedAsset && activePage && (
                    <ImageEditorModal
                        asset={selectedAsset}
                        pageId={activePage.id}
                        updateAsset={updateAsset}
                        onClose={() => setEditorMode('select')}
                    />
                )
            }

            {/* Location Picker Modal */}
            <LocationPickerModal
                isOpen={showLocationModal}
                onClose={() => setShowLocationModal(false)}
                onSelect={(address, lat, lng) => {
                    const targetPageId = activePageId || album?.pages?.[currentPageIndex]?.id;
                    if (targetPageId) {
                        const existingAsset = selectedAsset?.type === 'location' ? selectedAsset : null;
                        if (existingAsset) {
                            updateAsset(targetPageId, existingAsset.id, {
                                content: address,
                                lat,
                                lng
                            });
                        } else {
                            addAsset(targetPageId, {
                                type: 'location',
                                content: address,
                                x: 30,
                                y: 85,
                                width: 40,
                                height: 8,
                                rotation: 0,
                                zIndex: 25,
                                lat,
                                lng,
                                fontFamily: 'Inter',
                                fontSize: 14,
                                fontWeight: 'normal',
                                textAlign: 'left',
                                textColor: '#6b7280'
                            } as any);
                        }
                    }
                    setShowLocationModal(false);
                }}
            />

            <MapAssetModal
                isOpen={showMapModal}
                onClose={() => setShowMapModal(false)}
                existingLocations={album?.pages.flatMap(p => p.assets) || []}
                initialConfig={selectedAsset?.type === 'map' ? selectedAsset.mapConfig : undefined}
                onAddSnapshot={async (dataUrl) => {
                    const targetPageId = activePageId || album?.pages?.[currentPageIndex]?.id;
                    if (targetPageId && album.family_id) {
                        try {
                            const res = await fetch(dataUrl);
                            const blob = await res.blob();
                            const file = new File([blob], `map-snapshot-${Date.now()}.png`, { type: 'image/png' });

                            // Dynamic import to use storage service
                            const { storageService } = await import('../services/storage');
                            const { url, error } = await storageService.uploadFile(
                                file,
                                'album-assets',
                                `maps/${file.name}`,
                                () => { }
                            );

                            if (url) {
                                // Add to family_media table
                                const { error: dbError } = await supabase.from('family_media').insert({
                                    family_id: album.family_id,
                                    url: url,
                                    type: 'image',
                                    filename: file.name,
                                    folder: album.title ? `Albums/${album.title.trim()}/Maps` : 'Map Snapshots', // Nested in album
                                    size: file.size,
                                    mime_type: file.type
                                } as any);

                                if (dbError) throw dbError;

                                // Optionally add to the page
                                // Note: uploadMedia logic in context usually handles this, but here we did it manually
                                // so we could specify the folder and effectively "place" it if we wanted.
                                // For now, we'll just add it to library as requested, but also placing it on the page is nice.
                            } else {
                                console.error('Failed to upload map snapshot:', error);
                            }
                        } catch (e) {
                            console.error("Failed to process map snapshot", e);
                        }
                    }
                    setShowMapModal(false);
                }}
                onAddMap={(center, zoom, places) => {
                    const targetPageId = activePageId || album?.pages?.[currentPageIndex]?.id;
                    if (targetPageId) {
                        const existingAsset = selectedAsset?.type === 'map' ? selectedAsset : null;
                        if (existingAsset) {
                            updateAsset(targetPageId, existingAsset.id, {
                                mapConfig: { center, zoom, places }
                            });
                        } else {
                            addAsset(targetPageId, {
                                type: 'map',
                                url: '',
                                x: 10,
                                y: 10,
                                width: 80,
                                height: 60,
                                rotation: 0,
                                zIndex: 30,
                                mapConfig: { center, zoom, places }
                            } as any);
                        }
                    }
                    setShowMapModal(false);
                }}
            />

            {/* TextEditorModal has been replaced with inline editing on the canvas */}

            {
                showCoverPicker && (
                    <MediaPickerModal
                        isOpen={showCoverPicker}
                        onClose={() => setShowCoverPicker(false)}
                        onSelect={(item) => {
                            if (album) {
                                setAlbum({ ...album, coverUrl: item.url });
                            }
                            setShowCoverPicker(false);
                        }}
                        allowedTypes={['image']}
                    />
                )
            }

            <UploadOverlay
                state={uploadState}
                onDismiss={dismissUpload}
                onCancelFile={cancelUpload}
                onCancelAll={cancelAll}
                onMinimize={() => setMinimized(true)}
            />
        </div>
    );
}

export function AlbumEditor() {
    return <AlbumEditorContent />;
}

function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
}
