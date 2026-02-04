/**
 * Phase 1: Data Layer Unification - Unified Album Types
 * 
 * This file defines the standardized data structures for the album system,
 * ensuring consistency across Editor, Preview, and Viewer modes.
 */

import type { Json } from './supabase';

// ============================================================================
// UNIFIED ASSET STRUCTURE
// ============================================================================

export type AssetType = 'image' | 'video' | 'text' | 'ribbon' | 'frame' | 'sticker' | 'map' | 'address';

export type FitMode = 'fill' | 'fit' | 'stretch';

export interface Transform {
    rotation: number;      // Degrees
    scale: number;         // Multiplier (1.0 = 100%)
    crop?: {
        zoom: number;        // Zoom level for crop
        x: number;           // Pan X offset (%)
        y: number;           // Pan Y offset (%)
    };
}

export interface Position {
    x: number;             // Always in % (0-100)
    y: number;             // Always in % (0-100)
}

export interface Size {
    width: number;         // Always in % (0-100)
    height: number;        // Always in % (0-100)
}

/**
 * UnifiedAsset - The single source of truth for all asset types
 * 
 * CRITICAL: This structure includes zIndex to ensure ribbons and stickers
 * always stay on top of photos (as per Phase 1 requirements)
 */
export interface UnifiedAsset {
    id: string;
    type: AssetType;
    url?: string;          // Optional for text/map assets

    // Position & Size (always in percentages)
    position: Position;
    size: Size;

    // Transform properties
    transform: Transform;

    // Layout integration
    slotId: string | null; // null = freeform asset
    fitMode?: FitMode;     // How asset fits in slot (if slotted)

    // Z-ordering (CRITICAL for stickers/ribbons)
    zIndex: number;        // Higher = on top

    // State
    locked: boolean;       // Prevent accidental edits
    visible: boolean;      // Show/hide toggle

    // Type-specific config
    config: AssetConfig;

    // Metadata
    createdAt?: string;
    updatedAt?: string;
}

/**
 * Type-specific configuration
 */
export interface AssetConfig {
    // Text assets
    content?: string;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    textAlign?: 'left' | 'center' | 'right';
    fontWeight?: 'normal' | 'bold';
    fontStyle?: 'normal' | 'italic';

    // Image/Video filters
    filter?: 'cartoon' | 'pencil' | 'watercolor' | 'portrait' | 'auto-touch' | 'none';
    filterIntensity?: number;
    brightness?: number;
    contrast?: number;
    saturation?: number;

    // Video-specific
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;

    // Map assets
    latitude?: number;
    longitude?: number;
    zoom?: number;

    // Address assets
    address?: string;

    // AI enhancements
    aiPrompt?: string;

    // Additional properties
    [key: string]: any;
}

// ============================================================================
// BACKGROUND CONFIGURATION
// ============================================================================

export interface BackgroundConfig {
    type: 'color' | 'image' | 'gradient';

    // Color background
    color?: string;

    // Image background
    imageUrl?: string;
    imagePosition?: 'top' | 'center' | 'bottom';
    imageScale?: 'cover' | 'contain' | 'stretch';
    opacity?: number;

    // Gradient background
    gradient?: {
        type: 'linear' | 'radial';
        colors: string[];
        angle?: number;
    };

    // Blend mode
    blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
}

// ============================================================================
// LAYOUT SLOT STRUCTURE
// ============================================================================

export interface LayoutSlot {
    id: string;
    position: Position;
    size: Size;
    type: 'photo' | 'text' | 'video' | 'any';
    locked?: boolean;
    aspectRatio?: number; // e.g., 1.5 for 3:2
}

export interface LayoutTemplate {
    id: string;
    name: string;
    slots: LayoutSlot[];
    thumbnail?: string;
    category?: string;
}

// ============================================================================
// UNIFIED PAGE STRUCTURE
// ============================================================================

export interface UnifiedPage {
    pageNumber: number;

    // Background
    background: BackgroundConfig;

    // Layout (optional)
    layoutTemplate?: string; // Template ID
    layoutSlots?: LayoutSlot[];

    // Assets (includes both slotted and freeform)
    assets: UnifiedAsset[];

    // Metadata
    updatedAt?: string;
}

// ============================================================================
// UNIFIED ALBUM STRUCTURE
// ============================================================================

export interface UnifiedAlbum {
    id: string;
    title: string;
    description?: string;

    // Ownership
    familyId: string;
    creatorId?: string;
    eventId?: string;

    // Metadata
    category?: string;
    coverImageUrl?: string;
    location?: string;
    country?: string;
    geotag?: { lat: number; lng: number };
    hashtags?: string[];

    // Configuration
    config: {
        theme?: string;
        pageSize?: 'A4' | 'Letter' | 'Square' | 'Custom';
        orientation?: 'portrait' | 'landscape';
        [key: string]: any;
    };

    // Pages
    pages: UnifiedPage[];
    totalPages: number;

    // State
    isPublished: boolean;

    // Timestamps
    createdAt: string;
    updatedAt: string;
}

// ============================================================================
// LEGACY SCHEMA TYPES (for adapter)
// ============================================================================

export interface LegacyPage {
    id: string;
    album_id: string;
    page_number: number;
    template_id: string;
    background_color: string;
    background_image: string | null;
    background_opacity?: number;
    created_at: string;
    updated_at: string;
}

export interface LegacyAsset {
    id: string;
    page_id: string;
    url: string;
    asset_type: 'image' | 'video' | 'ribbon' | 'frame' | 'text';
    config: Json;
    z_index: number;
    slot_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface UnifiedPageData {
    album_id: string;
    page_number: number;
    layout_json: Json;
    background_config: Json;
    layout_template: string | null;
    updated_at: string;
}

// ============================================================================
// SCHEMA DETECTION
// ============================================================================

export interface SchemaVersion {
    hasAlbumPages: boolean;
    hasLegacyPages: boolean;
    hasLayoutJson: boolean;
    version: 'legacy' | 'unified' | 'hybrid';
}

// ============================================================================
// Z-INDEX CONSTANTS (for consistent layering)
// ============================================================================

export const Z_INDEX = {
    BACKGROUND: 0,
    PHOTO: 10,
    VIDEO: 15,
    TEXT: 20,
    FRAME: 30,
    RIBBON: 40,
    STICKER: 50,
    MAP: 25,
    ADDRESS: 25,
} as const;

/**
 * Get default z-index for asset type
 */
export function getDefaultZIndex(type: AssetType): number {
    switch (type) {
        case 'image':
            return Z_INDEX.PHOTO;
        case 'video':
            return Z_INDEX.VIDEO;
        case 'text':
            return Z_INDEX.TEXT;
        case 'frame':
            return Z_INDEX.FRAME;
        case 'ribbon':
            return Z_INDEX.RIBBON;
        case 'sticker':
            return Z_INDEX.STICKER;
        case 'map':
            return Z_INDEX.MAP;
        case 'address':
            return Z_INDEX.ADDRESS;
        default:
            return Z_INDEX.PHOTO;
    }
}
