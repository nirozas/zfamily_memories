/**
 * Album Adapters - Bridge between AlbumContext types and UnifiedAlbum types
 * 
 * This adapter layer allows the existing AlbumContext to work with the new
 * AlbumDataService without breaking existing code.
 */

import type {
    UnifiedAlbum,
    UnifiedPage,
    UnifiedAsset,
    BackgroundConfig,
    AssetType,
} from '../types/album';
import { getDefaultZIndex } from '../types/album';
import type { Album, Page, Asset, LayoutBox } from '../contexts/AlbumContext';

// ============================================================================
// UNIFIED → CONTEXT (Service to Context)
// ============================================================================

/**
 * Convert UnifiedAsset to context Asset
 */
export function unifiedAssetToContextAsset(unifiedAsset: UnifiedAsset): Asset {
    const asset: Asset = {
        id: unifiedAsset.id,
        type: unifiedAsset.type as any,
        url: unifiedAsset.url || '',
        x: unifiedAsset.position.x,
        y: unifiedAsset.position.y,
        width: unifiedAsset.size.width,
        height: unifiedAsset.size.height,
        rotation: unifiedAsset.transform.rotation,
        scale: unifiedAsset.transform.scale,
        zIndex: unifiedAsset.zIndex,
        slotId: unifiedAsset.slotId ? parseInt(unifiedAsset.slotId) : undefined,

        // Transform
        opacity: unifiedAsset.config.opacity,
        lockAspectRatio: true,

        // Crop
        crop: unifiedAsset.transform.crop ? {
            x: unifiedAsset.transform.crop.x,
            y: unifiedAsset.transform.crop.y,
            width: 100, // Normalized width
            height: 100, // Normalized height
            zoom: unifiedAsset.transform.crop.zoom,
        } : undefined,

        // Fit mode
        fitMode: unifiedAsset.fitMode as any,

        // Filters
        filter: unifiedAsset.config.filter,
        filterIntensity: unifiedAsset.config.filterIntensity,
        brightness: unifiedAsset.config.brightness,
        contrast: unifiedAsset.config.contrast,
        saturate: unifiedAsset.config.saturation,

        // Text properties
        content: unifiedAsset.config.content,
        fontFamily: unifiedAsset.config.fontFamily,
        fontSize: unifiedAsset.config.fontSize,
        fontWeight: unifiedAsset.config.fontWeight,
        textAlign: unifiedAsset.config.textAlign,
        textColor: unifiedAsset.config.color,
        color: unifiedAsset.config.color,

        // Map properties
        lat: unifiedAsset.config.latitude,
        lng: unifiedAsset.config.longitude,
        mapConfig: unifiedAsset.config.latitude && unifiedAsset.config.longitude ? {
            center: { lat: unifiedAsset.config.latitude, lng: unifiedAsset.config.longitude },
            zoom: unifiedAsset.config.zoom || 12,
            places: [],
        } : undefined,

        // State
        isLocked: unifiedAsset.locked,
        isHidden: !unifiedAsset.visible,

        // Timestamps
        createdAt: unifiedAsset.createdAt ? new Date(unifiedAsset.createdAt) : undefined,
    };

    return asset;
}

/**
 * Convert UnifiedPage to context Page
 */
export function unifiedPageToContextPage(unifiedPage: UnifiedPage, pageId: string): Page {
    // Convert assets
    const assets = unifiedPage.assets.map(unifiedAssetToContextAsset);

    // Build layoutConfig from slotted assets
    const layoutConfig: LayoutBox[] = unifiedPage.layoutSlots?.map((slot) => {
        const slottedAsset = unifiedPage.assets.find(a => a.slotId === slot.id);

        const box: LayoutBox = {
            id: slot.id,
            role: 'slot',
            left: slot.position.x,
            top: slot.position.y,
            width: slot.size.width,
            height: slot.size.height,
            zIndex: slottedAsset?.zIndex || 10,
        };

        if (slottedAsset) {
            box.content = {
                type: slottedAsset.type as any,
                url: slottedAsset.url,
                zoom: slottedAsset.transform.crop?.zoom || 1,
                x: slottedAsset.transform.crop?.x || 50,
                y: slottedAsset.transform.crop?.y || 50,
                rotation: slottedAsset.transform.rotation,
                config: slottedAsset.config,
            };
        }

        return box;
    }) || [];

    // Extract text layers
    const textLayers: LayoutBox[] = unifiedPage.assets
        .filter(a => a.type === 'text')
        .map(textAsset => ({
            id: textAsset.id,
            role: 'text' as const,
            left: textAsset.position.x,
            top: textAsset.position.y,
            width: textAsset.size.width,
            height: textAsset.size.height,
            zIndex: textAsset.zIndex,
            content: {
                type: 'text' as const,
                zoom: 1,
                x: 50,
                y: 50,
                text: textAsset.config.content,
                fontSize: textAsset.config.fontSize,
                fontFamily: textAsset.config.fontFamily,
                color: textAsset.config.color,
                textAlign: textAsset.config.textAlign as any,
                fontWeight: textAsset.config.fontWeight as any,
                rotation: textAsset.transform.rotation,
            },
        }));

    const page: Page = {
        id: pageId,
        pageNumber: unifiedPage.pageNumber,
        layoutTemplate: unifiedPage.layoutTemplate,
        layoutConfig,
        assets,
        backgroundColor: unifiedPage.background.color || '#ffffff',
        backgroundOpacity: unifiedPage.background.opacity,
        backgroundImage: unifiedPage.background.imageUrl,
        textLayers,
        pageStyles: {
            backgroundColor: unifiedPage.background.color || '#ffffff',
            backgroundOpacity: unifiedPage.background.opacity || 1,
            backgroundImage: unifiedPage.background.imageUrl,
            backgroundBlendMode: unifiedPage.background.blendMode,
        },
    };

    return page;
}

/**
 * Convert UnifiedAlbum to context Album
 */
export function unifiedAlbumToContextAlbum(unifiedAlbum: UnifiedAlbum): Album {
    const pages = unifiedAlbum.pages.map((unifiedPage, index) =>
        unifiedPageToContextPage(unifiedPage, `page-${index}`)
    );

    const album: Album = {
        id: unifiedAlbum.id,
        family_id: unifiedAlbum.familyId,
        title: unifiedAlbum.title,
        description: unifiedAlbum.description,
        category: unifiedAlbum.category,
        coverUrl: unifiedAlbum.coverImageUrl,
        pages,
        unplacedMedia: [], // Will be populated from config if exists
        hashtags: unifiedAlbum.hashtags || [],
        config: {
            dimensions: unifiedAlbum.config.pageSize ? {
                width: 1000,
                height: 700,
                unit: 'px' as const,
                bleed: 25,
                gutter: 40,
            } : {
                width: 1000,
                height: 700,
                unit: 'px' as const,
                bleed: 25,
                gutter: 40,
            },
            useSpreadView: unifiedAlbum.config.orientation === 'landscape' || true,
            gridSettings: {
                size: 20,
                snap: true,
                visible: false,
            },
            ...unifiedAlbum.config,
        },
        createdAt: new Date(unifiedAlbum.createdAt),
        updatedAt: new Date(unifiedAlbum.updatedAt),
        isPublished: unifiedAlbum.isPublished,
        location: unifiedAlbum.location,
        country: unifiedAlbum.country,
        geotag: unifiedAlbum.geotag,
    };

    // Extract unplacedMedia from config if it exists
    if (unifiedAlbum.config.unplacedMedia) {
        album.unplacedMedia = (unifiedAlbum.config.unplacedMedia as any[]).map(
            (asset: any) => unifiedAssetToContextAsset(asset)
        );
    }

    return album;
}

// ============================================================================
// CONTEXT → UNIFIED (Context to Service)
// ============================================================================

/**
 * Convert context Asset to UnifiedAsset
 */
export function contextAssetToUnifiedAsset(asset: Asset): UnifiedAsset {
    const unifiedAsset: UnifiedAsset = {
        id: asset.id,
        type: asset.type as AssetType,
        url: asset.url,
        position: {
            x: asset.x,
            y: asset.y,
        },
        size: {
            width: asset.width,
            height: asset.height,
        },
        transform: {
            rotation: asset.rotation,
            scale: asset.scale || 1,
            crop: asset.crop,
        },
        slotId: asset.slotId?.toString() || null,
        fitMode: asset.fitMode as any,
        zIndex: asset.zIndex || getDefaultZIndex(asset.type as AssetType),
        locked: asset.isLocked || false,
        visible: !asset.isHidden,
        config: {
            // Filters
            filter: asset.filter as any,
            filterIntensity: asset.filterIntensity,
            brightness: asset.brightness,
            contrast: asset.contrast,
            saturation: asset.saturate,

            // Text
            content: asset.content,
            fontFamily: asset.fontFamily,
            fontSize: asset.fontSize,
            fontWeight: asset.fontWeight as any,
            textAlign: (asset.textAlign === 'justify' ? 'left' : asset.textAlign) as any,
            color: asset.textColor || asset.color,

            // Map
            latitude: asset.lat,
            longitude: asset.lng,
            zoom: asset.mapConfig?.zoom,

            // Opacity
            opacity: asset.opacity,
        },
        createdAt: asset.createdAt?.toISOString(),
    };

    return unifiedAsset;
}

/**
 * Convert context Page to UnifiedPage
 */
export function contextPageToUnifiedPage(page: Page): UnifiedPage {
    // Convert all assets
    const assets = page.assets.map(contextAssetToUnifiedAsset);

    // Add text layers as assets if not already included
    if (page.textLayers) {
        page.textLayers.forEach(textLayer => {
            if (!assets.find(a => a.id === textLayer.id)) {
                assets.push({
                    id: textLayer.id,
                    type: 'text',
                    position: { x: textLayer.left, y: textLayer.top },
                    size: { width: textLayer.width, height: textLayer.height },
                    transform: {
                        rotation: textLayer.content?.rotation || 0,
                        scale: 1,
                    },
                    slotId: null,
                    zIndex: textLayer.zIndex || 20,
                    locked: false,
                    visible: true,
                    config: {
                        content: textLayer.content?.text,
                        fontSize: textLayer.content?.fontSize,
                        fontFamily: textLayer.content?.fontFamily,
                        color: textLayer.content?.color,
                        textAlign: (textLayer.content?.textAlign === 'justify' ? 'left' : textLayer.content?.textAlign) as any,
                        fontWeight: textLayer.content?.fontWeight as any,
                    },
                });
            }
        });
    }

    // Build background config
    const background: BackgroundConfig = {
        type: page.backgroundImage ? 'image' : 'color',
        color: page.pageStyles?.backgroundColor || page.backgroundColor,
        imageUrl: page.pageStyles?.backgroundImage || page.backgroundImage,
        opacity: page.pageStyles?.backgroundOpacity ?? page.backgroundOpacity ?? 1,
        blendMode: page.pageStyles?.backgroundBlendMode as any,
        imageScale: 'cover',
        imagePosition: 'center',
    };

    const unifiedPage: UnifiedPage = {
        pageNumber: page.pageNumber,
        background,
        layoutTemplate: page.layoutTemplate,
        assets,
    };

    return unifiedPage;
}

/**
 * Convert context Album to UnifiedAlbum
 */
export function contextAlbumToUnifiedAlbum(album: Album): UnifiedAlbum {
    const pages = album.pages.map(contextPageToUnifiedPage);

    const unifiedAlbum: UnifiedAlbum = {
        id: album.id,
        title: album.title,
        description: album.description,
        familyId: album.family_id,
        category: album.category,
        coverImageUrl: album.coverUrl,
        hashtags: album.hashtags,
        config: {
            ...album.config,
            unplacedMedia: album.unplacedMedia.map(contextAssetToUnifiedAsset),
        },
        pages,
        totalPages: pages.length,
        isPublished: album.isPublished,
        location: album.location,
        country: album.country,
        geotag: album.geotag,
        createdAt: album.createdAt.toISOString(),
        updatedAt: album.updatedAt.toISOString(),
    };

    return unifiedAlbum;
}
