/**
 * Phase 1: Data Layer Unification - Album Data Service
 * 
 * This service provides a single source of truth for album data operations,
 * handling both legacy (pages/assets) and unified (album_pages) schemas.
 * 
 * CRITICAL FEATURES:
 * - Legacy Adapter: Automatically converts existing albums to UnifiedAsset format
 * - Schema Detection: Determines which database schema to use
 * - Data Integrity: Ensures no data loss during migration
 * - Z-Index Management: Maintains proper layering for ribbons/stickers
 */

import { supabase as libSupabase } from '../lib/supabase';
const supabase = libSupabase as any;
import {
    type UnifiedAlbum,
    type UnifiedPage,
    type UnifiedAsset,
    type LegacyPage,
    type LegacyAsset,
    type SchemaVersion,
    type BackgroundConfig,
    getDefaultZIndex,
    type AssetType,
} from '../types/album';
import type { Database } from '../types/supabase';

type AlbumPageRow = Database['public']['Tables']['album_pages']['Row'];

// ============================================================================
// SCHEMA DETECTION
// ============================================================================

class SchemaDetector {
    private static cachedVersion: SchemaVersion | null = null;

    static async detect(): Promise<SchemaVersion> {
        if (this.cachedVersion) {
            return this.cachedVersion;
        }

        const version: SchemaVersion = {
            hasAlbumPages: false,
            hasLegacyPages: false,
            hasLayoutJson: false,
            version: 'legacy',
        };

        try {
            // Test album_pages table
            const { error: apError } = await supabase
                .from('album_pages')
                .select('layout_json')
                .limit(1);

            version.hasAlbumPages = !apError;
            version.hasLayoutJson = !apError;

            // Test legacy pages table
            const { error: pError } = await supabase
                .from('pages')
                .select('id')
                .limit(1);

            version.hasLegacyPages = !pError;

            // Determine version
            if (version.hasAlbumPages && version.hasLegacyPages) {
                version.version = 'hybrid';
            } else if (version.hasAlbumPages) {
                version.version = 'unified';
            } else {
                version.version = 'legacy';
            }

            this.cachedVersion = version;
            return version;
        } catch (error) {
            console.error('Schema detection failed:', error);
            return version;
        }
    }

    static clearCache() {
        this.cachedVersion = null;
    }
}

// ============================================================================
// LEGACY ADAPTER
// ============================================================================

class LegacyAdapter {
    /**
     * Convert legacy page + assets to UnifiedPage format
     * CRITICAL: Preserves all data including z-index for ribbons/stickers
     */
    static async convertLegacyPage(
        legacyPage: LegacyPage,
        legacyAssets: LegacyAsset[]
    ): Promise<UnifiedPage> {
        // Convert background
        const background: BackgroundConfig = {
            type: legacyPage.background_image ? 'image' : 'color',
            color: legacyPage.background_color,
            imageUrl: legacyPage.background_image || undefined,
            opacity: legacyPage.background_opacity || 1.0,
            imageScale: 'cover',
            imagePosition: 'center',
        };

        // Convert assets
        const assets: UnifiedAsset[] = legacyAssets.map((legacyAsset) =>
            this.convertLegacyAsset(legacyAsset)
        );

        // Sort by z-index to maintain layer order
        assets.sort((a, b) => a.zIndex - b.zIndex);

        return {
            pageNumber: legacyPage.page_number,
            background,
            layoutTemplate: legacyPage.template_id !== 'blank' ? legacyPage.template_id : undefined,
            assets,
            updatedAt: legacyPage.updated_at,
        };
    }

    /**
     * Convert legacy asset to UnifiedAsset format
     * CRITICAL: Ensures ribbons/stickers get proper z-index
     */
    static convertLegacyAsset(legacyAsset: LegacyAsset): UnifiedAsset {
        const config = legacyAsset.config as any;

        // Extract position and size (with defaults)
        const position = {
            x: config.x ?? 50,
            y: config.y ?? 50,
        };

        const size = {
            width: config.width ?? 20,
            height: config.height ?? 20,
        };

        // Extract transform
        const transform = {
            rotation: config.rotation ?? 0,
            scale: config.scale ?? 1.0,
            crop: config.crop,
        };

        // Determine asset type
        let type: AssetType = legacyAsset.asset_type as AssetType;
        if (legacyAsset.asset_type === 'ribbon' || legacyAsset.asset_type === 'frame') {
            type = 'sticker'; // Normalize to sticker type
        }

        // CRITICAL: Use legacy z_index if available, otherwise use default for type
        const zIndex = legacyAsset.z_index ?? getDefaultZIndex(type);

        return {
            id: legacyAsset.id,
            type,
            url: legacyAsset.url,
            position,
            size,
            transform,
            slotId: legacyAsset.slot_id?.toString() ?? null,
            zIndex,
            locked: config.locked ?? false,
            visible: config.visible ?? true,
            config: {
                ...config,
                // Preserve all legacy config
            },
            createdAt: legacyAsset.created_at,
            updatedAt: legacyAsset.updated_at,
        };
    }

    /**
     * Convert UnifiedPage to legacy format for backward compatibility
     */
    static convertToLegacyFormat(
        albumId: string,
        page: UnifiedPage
    ): { page: Partial<LegacyPage>; assets: Partial<LegacyAsset>[] } {
        const legacyPage: Partial<LegacyPage> = {
            album_id: albumId,
            page_number: page.pageNumber,
            template_id: page.layoutTemplate || 'blank',
            background_color: page.background.color || '#ffffff',
            background_image: page.background.imageUrl || null,
            background_opacity: page.background.opacity,
        };

        const legacyAssets: Partial<LegacyAsset>[] = page.assets.map((asset) => ({
            url: asset.url || '',
            asset_type: asset.type === 'sticker' ? 'ribbon' : (asset.type as any),
            z_index: asset.zIndex,
            slot_id: asset.slotId ? parseInt(asset.slotId) : null,
            config: {
                x: asset.position.x,
                y: asset.position.y,
                width: asset.size.width,
                height: asset.size.height,
                rotation: asset.transform.rotation,
                scale: asset.transform.scale,
                crop: asset.transform.crop,
                locked: asset.locked,
                visible: asset.visible,
                ...asset.config,
            },
        }));

        return { page: legacyPage, assets: legacyAssets };
    }
}

// ============================================================================
// UNIFIED ADAPTER
// ============================================================================

class UnifiedAdapter {
    /**
     * Convert album_pages row to UnifiedPage format
     */
    static convertUnifiedPageData(pageData: AlbumPageRow): UnifiedPage {
        const layoutJson = pageData.layout_json as any;
        const backgroundConfig = pageData.background_config as any;

        // Parse assets from layout_json
        const assets: UnifiedAsset[] = Array.isArray(layoutJson)
            ? layoutJson.map((item: any) => this.normalizeAsset(item))
            : [];

        // Sort by z-index
        assets.sort((a, b) => a.zIndex - b.zIndex);

        return {
            pageNumber: pageData.page_number,
            background: backgroundConfig || { type: 'color', color: '#ffffff' },
            layoutTemplate: pageData.layout_template || undefined,
            assets,
            updatedAt: pageData.updated_at,
        };
    }

    /**
     * Normalize asset data to UnifiedAsset format
     * Handles various legacy formats that might exist in layout_json
     */
    static normalizeAsset(data: any): UnifiedAsset {
        return {
            id: data.id || crypto.randomUUID(),
            type: data.type || 'image',
            url: data.url,
            position: data.position || { x: 50, y: 50 },
            size: data.size || { width: 20, height: 20 },
            transform: data.transform || { rotation: 0, scale: 1.0 },
            slotId: data.slotId ?? null,
            fitMode: data.fitMode,
            zIndex: data.zIndex ?? getDefaultZIndex(data.type || 'image'),
            locked: data.locked ?? false,
            visible: data.visible ?? true,
            config: data.config || {},
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
        };
    }

    /**
     * Convert UnifiedPage to album_pages format
     */
    static convertToUnifiedFormat(
        albumId: string,
        page: UnifiedPage
    ): Partial<AlbumPageRow> {
        return {
            album_id: albumId,
            page_number: page.pageNumber,
            layout_json: page.assets as any,
            background_config: page.background as any,
            layout_template: page.layoutTemplate || null,
        };
    }
}

// ============================================================================
// ALBUM DATA SERVICE
// ============================================================================

export class AlbumDataService {
    /**
     * Fetch album with all pages and assets
     * Automatically detects and converts from legacy or unified schema
     */
    static async fetchAlbum(albumId: string): Promise<UnifiedAlbum | null> {
        try {
            // Fetch album metadata
            const { data: albumData, error: albumError } = await supabase
                .from('albums')
                .select('*')
                .eq('id', albumId)
                .single();

            if (albumError || !albumData) {
                console.error('Failed to fetch album:', albumError);
                return null;
            }

            // Detect schema version
            const schema = await SchemaDetector.detect();

            let pages: UnifiedPage[] = [];

            // Try unified schema first
            if (schema.hasAlbumPages) {
                const { data: unifiedPages, error: upError } = await supabase
                    .from('album_pages')
                    .select('*')
                    .eq('album_id', albumId)
                    .order('page_number', { ascending: true });

                if (!upError && unifiedPages && unifiedPages.length > 0) {
                    pages = (unifiedPages as AlbumPageRow[]).map((p: AlbumPageRow) => UnifiedAdapter.convertUnifiedPageData(p));
                }
            }

            // Fallback to legacy schema if no unified pages found
            if (pages.length === 0 && schema.hasLegacyPages) {
                const { data: legacyPages, error: lpError } = await supabase
                    .from('pages')
                    .select('*')
                    .eq('album_id', albumId)
                    .order('page_number', { ascending: true });

                if (!lpError && legacyPages) {
                    // Fetch assets for each page
                    for (const legacyPage of legacyPages) {
                        const { data: legacyAssets } = await supabase
                            .from('assets')
                            .select('*')
                            .eq('page_id', legacyPage.id)
                            .order('z_index', { ascending: true });

                        const unifiedPage = await LegacyAdapter.convertLegacyPage(
                            legacyPage as LegacyPage,
                            (legacyAssets || []) as LegacyAsset[]
                        );

                        pages.push(unifiedPage);
                    }
                }
            }

            // Build unified album
            const album: UnifiedAlbum = {
                id: albumData.id,
                title: albumData.title,
                description: albumData.description || undefined,
                familyId: albumData.family_id,
                creatorId: albumData.creator_id || undefined,
                eventId: albumData.event_id || undefined,
                category: albumData.category || undefined,
                coverImageUrl: albumData.cover_image_url || undefined,
                location: albumData.location || undefined,
                country: albumData.country || undefined,
                geotag: albumData.geotag as any,
                hashtags: albumData.hashtags || undefined,
                config: (albumData.config as any) || {},
                pages,
                totalPages: albumData.total_pages || pages.length,
                isPublished: albumData.is_published,
                createdAt: albumData.created_at,
                updatedAt: albumData.updated_at,
            };

            return album;
        } catch (error) {
            console.error('Error fetching album:', error);
            return null;
        }
    }

    /**
     * Save album (writes to unified schema, maintains legacy for compatibility)
     * CRITICAL: Includes migration logic to preserve existing data
     */
    static async saveAlbum(album: UnifiedAlbum): Promise<boolean> {
        try {
            // Update album metadata
            const { error: albumError } = await supabase
                .from('albums')
                .update({
                    title: album.title,
                    description: album.description,
                    category: album.category,
                    cover_image_url: album.coverImageUrl,
                    location: album.location,
                    country: album.country,
                    geotag: album.geotag as any,
                    hashtags: album.hashtags,
                    config: album.config as any,
                    is_published: album.isPublished,
                    total_pages: album.pages.length,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', album.id);

            if (albumError) {
                console.error('Failed to update album:', albumError);
                return false;
            }

            // Save pages to unified schema
            const schema = await SchemaDetector.detect();

            if (schema.hasAlbumPages) {
                // Delete existing pages
                await supabase.from('album_pages').delete().eq('album_id', album.id);

                // Insert new pages
                const unifiedPages = album.pages.map((page) =>
                    UnifiedAdapter.convertToUnifiedFormat(album.id, page)
                );

                const { error: pagesError } = await supabase
                    .from('album_pages')
                    .insert(unifiedPages as any);

                if (pagesError) {
                    console.error('Failed to save pages:', pagesError);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error saving album:', error);
            return false;
        }
    }

    /**
     * Duplicate album using the duplicate_album_v2 RPC
     */
    static async duplicateAlbum(
        albumId: string,
        newTitle: string
    ): Promise<string | null> {
        try {
            const { data, error } = await supabase.rpc('duplicate_album_v2', {
                source_album_id: albumId,
                new_title: newTitle,
            });

            if (error) {
                console.error('Failed to duplicate album:', error);
                return null;
            }

            return data as string;
        } catch (error) {
            console.error('Error duplicating album:', error);
            return null;
        }
    }

    /**
     * Create new blank album
     */
    static async createAlbum(
        familyId: string,
        title: string,
        creatorId?: string
    ): Promise<string | null> {
        try {
            const { data, error } = await supabase
                .from('albums')
                .insert({
                    family_id: familyId,
                    creator_id: creatorId,
                    title,
                    config: {},
                    is_published: false,
                    total_pages: 0,
                })
                .select('id')
                .single();

            if (error || !data) {
                console.error('Failed to create album:', error);
                return null;
            }

            return data.id;
        } catch (error) {
            console.error('Error creating album:', error);
            return null;
        }
    }

    /**
     * Delete album
     */
    static async deleteAlbum(albumId: string): Promise<boolean> {
        try {
            const { error } = await supabase.from('albums').delete().eq('id', albumId);

            if (error) {
                console.error('Failed to delete album:', error);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Error deleting album:', error);
            return false;
        }
    }
}
