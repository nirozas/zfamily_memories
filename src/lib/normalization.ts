import { generateId } from './utils';
import { type Page, type LayoutBox, type PageStyles, type Asset } from '../contexts/AlbumContext';

/**
 * Normalizes raw database page records into strictly typed AlbumPageData.
 * Implements Fallback-to-Legacy and Progressive-Enhancement patterns.
 */
export function normalizePageData(p: any): Page {
    // --- DEFENSIVE PARSING ENGINE ---
    const parseJSON = (data: any) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (typeof data === 'string') {
            try {
                return JSON.parse(data);
            } catch (e) {
                console.error('[Normalization] JSON Parse Failure:', e);
                return [];
            }
        }
        return [data];
    };

    // 1. Identify schema format (Prioritize layout_config -> layout_json -> content)
    const rawLayout = p.layout_config || p.layout_json || p.content || [];
    const layoutArray = parseJSON(rawLayout);
    const textArray = parseJSON(p.text_layers || []);

    const isUnified = Array.isArray(layoutArray) && (layoutArray.length > 0 || !!p.layout_config || !!p.layout_json);

    if (isUnified) {
        // --- NEW UNIFIED SCHEMA (v5.0) ---
        // Combine everything to filter roles (some formats might mix them)
        const allItems = [...layoutArray, ...textArray];

        const layoutConfig: LayoutBox[] = allItems
            .filter((item: any) => item && item.role !== 'text')
            .map((frame: any) => ({
                id: frame.id || generateId(),
                role: frame.role || 'slot',
                left: Number(frame.left ?? frame.x ?? 0),
                top: Number(frame.top ?? frame.y ?? 0),
                width: Number(frame.width ?? 30),
                height: Number(frame.height ?? 30),
                zIndex: Number(frame.zIndex ?? frame.z ?? 10),
                content: {
                    type: frame.content?.type || frame.type || 'image',
                    url: frame.content?.url || frame.url || null,
                    zoom: Number(frame.content?.zoom ?? frame.zoom ?? 1),
                    x: Number(frame.content?.x ?? frame.focalX ?? 50),
                    y: Number(frame.content?.y ?? frame.focalY ?? 50),
                    rotation: Number(frame.content?.rotation ?? frame.rotation ?? 0),
                    text: frame.content?.text || frame.content?.config?.content || frame.content || null,
                    config: frame.content?.config || frame.config || {}
                }
            }));

        const textLayers: LayoutBox[] = allItems
            .filter((item: any) => item && (item.role === 'text' || item.type === 'text'))
            .map((frame: any) => ({
                id: frame.id || generateId(),
                role: 'text',
                left: Number(frame.left ?? frame.x ?? 0),
                top: Number(frame.top ?? frame.y ?? 0),
                width: Number(frame.width ?? 50),
                height: Number(frame.height ?? 10),
                zIndex: Number(frame.zIndex ?? frame.z ?? 50),
                content: {
                    type: 'text',
                    url: undefined,
                    zoom: 1,
                    x: 50,
                    y: 50,
                    rotation: Number(frame.content?.rotation || frame.rotation || 0),
                    text: frame.content?.text || frame.content?.config?.content || frame.content || 'Double click to edit',
                    config: frame.content?.config || frame.config || {}
                }
            }));

        const pageStyles: PageStyles = {
            backgroundColor: p.page_styles?.backgroundColor || p.background_config?.color || p.background_color || '#ffffff',
            backgroundOpacity: Number(p.page_styles?.backgroundOpacity ?? p.background_config?.opacity ?? p.background_opacity ?? 100),
            backgroundImage: p.page_styles?.backgroundImage || p.background_config?.image || p.background_image || undefined,
            backgroundBlendMode: p.page_styles?.backgroundBlendMode || p.background_config?.blendMode || 'normal'
        };

        return {
            id: p.id || `page-${p.page_number}`,
            pageNumber: p.page_number,
            layoutTemplate: p.layout_template || p.template_id || 'freeform',
            layoutConfig,
            textLayers,
            pageStyles,
            backgroundColor: pageStyles.backgroundColor,
            backgroundOpacity: pageStyles.backgroundOpacity,
            backgroundImage: pageStyles.backgroundImage,
            assets: []
        };
    } else {
        // --- LEGACY SCHEMA (v1.0 - v4.0) ---
        const assets: Asset[] = (p.assets || []).map((a: any) => {
            let restoredType = a.asset_type;
            if (a.config?.originalType) {
                restoredType = a.config.originalType;
            } else if (a.asset_type === 'image' && a.config?.mapConfig) {
                restoredType = 'map';
            } else if (a.asset_type === 'text' && (a.config?.location || a.config?.isLocation)) {
                restoredType = 'location';
            }

            return {
                id: a.id,
                type: restoredType,
                url: a.url,
                zIndex: a.z_index || 0,
                slotId: a.slot_id,
                ...(a.config || {})
            };
        });

        return {
            id: p.id,
            pageNumber: p.page_number,
            layoutTemplate: p.template_id || 'freeform',
            backgroundColor: p.background_color || '#ffffff',
            backgroundOpacity: p.background_opacity ?? 100,
            backgroundImage: p.background_image,
            assets: assets,
            layoutConfig: [],
            textLayers: []
        };
    }
}
