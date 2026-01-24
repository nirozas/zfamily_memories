import { type Asset, type Page } from '../contexts/AlbumContext';

/**
 * Layout Utilities
 * Helper functions for managing layout configurations and asset mapping
 */

/**
 * Maps assets with slotId into their corresponding layout slots
 * Creates the nested content structure expected by AlbumPage
 */
export function mapAssetsToLayoutSlots(layoutConfig: any[], assets: Asset[]): any[] {
    if (!layoutConfig || layoutConfig.length === 0) return [];

    return layoutConfig.map((slot, index) => {
        // Find asset assigned to this slot
        const slottedAsset = assets.find(a => a.slotId === index);

        if (slottedAsset) {
            // Nest the asset data inside the slot's content
            return {
                ...slot,
                id: slot.id || `slot-${index}`,
                content: {
                    type: slottedAsset.type,
                    url: slottedAsset.url,
                    zoom: slottedAsset.crop?.zoom || 1,
                    x: slottedAsset.crop?.x || 50,
                    y: slottedAsset.crop?.y || 50,
                    rotation: slottedAsset.rotation || 0,
                    config: {
                        ...slottedAsset,
                        // Remove positioning since it's relative to slot
                        x: undefined,
                        y: undefined,
                        width: undefined,
                        height: undefined,
                        slotId: undefined
                    }
                }
            };
        }

        // Empty slot - keep structure but no content
        return {
            ...slot,
            id: slot.id || `slot-${index}`,
            content: null
        };
    });
}

/**
 * Extracts assets from nested layout structure
 * Converts layoutConfig with nested content back to flat asset list
 */
export function extractAssetsFromLayout(layoutConfig: any[]): Asset[] {
    if (!layoutConfig || layoutConfig.length === 0) return [];

    const assets: Asset[] = [];

    layoutConfig.forEach((slot, index) => {
        if (slot.content && slot.content.url) {
            const asset: Asset = {
                ...(slot.content.config || {}),
                id: slot.content.config?.id || slot.id || `asset-${index}`,
                type: slot.content.type || 'image',
                url: slot.content.url,
                slotId: index,
                // Slot-relative positioning (usually 0,0,100,100 to fill slot)
                x: slot.content.config?.x || 0,
                y: slot.content.config?.y || 0,
                width: slot.content.config?.width || 100,
                height: slot.content.config?.height || 100,
                rotation: slot.content.rotation || slot.content.config?.rotation || 0,
                zIndex: slot.z || slot.zIndex || slot.content.config?.zIndex || 1,
                crop: {
                    zoom: slot.content.zoom || 1,
                    x: slot.content.x || 50,
                    y: slot.content.y || 50,
                    width: 1,
                    height: 1
                }
            };
            assets.push(asset);
        }
    });

    return assets;
}

/**
 * Prepares layout config for database storage
 * Ensures proper nesting of content within slots
 */
export function prepareLayoutForSave(page: Page): any[] {
    if (!page.layoutConfig || page.layoutConfig.length === 0) {
        // Freeform layout - return empty array
        return [];
    }

    // Map current assets into the layout structure
    return mapAssetsToLayoutSlots(page.layoutConfig, page.assets);
}

/**
 * Validates that a layout config has the correct structure
 */
export function isValidLayoutConfig(config: any): boolean {
    if (!Array.isArray(config)) return false;
    if (config.length === 0) return true; // Empty is valid (freeform)

    // Check that each slot has required properties
    return config.every(slot =>
        typeof slot === 'object' &&
        (slot.left !== undefined || slot.x !== undefined) &&
        (slot.top !== undefined || slot.y !== undefined) &&
        slot.width !== undefined &&
        slot.height !== undefined
    );
}

/**
 * Merges layout config with assets, ensuring all slotted assets are properly nested
 */
export function syncLayoutWithAssets(layoutConfig: any[], assets: Asset[]): {
    layoutConfig: any[];
    freeformAssets: Asset[];
} {
    const slottedAssets = assets.filter(a => a.slotId !== undefined && a.slotId !== null);
    const freeformAssets = assets.filter(a => a.slotId === undefined || a.slotId === null);

    const syncedLayout = mapAssetsToLayoutSlots(layoutConfig, slottedAssets);

    return {
        layoutConfig: syncedLayout,
        freeformAssets
    };
}
