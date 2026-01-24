# Unified Album Schema - Architectural Specification
## Date: 2026-01-24 09:44 AM

## CRITICAL ALIGNMENT OBJECTIVE
Ensure pixel-perfect consistency between Studio (Editor), Preview, and View modes.

---

## 1. UNIFIED DATA INTERFACE

### AlbumPageData (Strict Schema)

```typescript
export interface LayoutBox {
    id: string;
    role: 'slot' | 'text' | 'decoration';
    
    // Position (percentage-based, relative to page)
    left: number;    // 0-100
    top: number;     // 0-100
    width: number;   // 0-100
    height: number;  // 0-100
    
    // Z-Index Hierarchy
    zIndex: number;  // Background: 0, Images: 10, Text: 50, Overlays: 100
    
    // Content (for slots)
    content?: {
        type: 'image' | 'video' | 'text';
        url?: string;
        
        // Transform data (Cloudinary-compatible)
        zoom: number;        // 1.0 = 100%
        x: number;           // 0-100 (focal point X)
        y: number;           // 0-100 (focal point Y)
        rotation: number;    // degrees
        
        // Text-specific
        text?: string;
        fontSize?: number;
        fontFamily?: string;
        color?: string;
        textAlign?: 'left' | 'center' | 'right';
        
        // Additional config
        config?: Record<string, any>;
    };
}

export interface PageStyles {
    backgroundColor: string;
    backgroundOpacity: number;
    backgroundImage?: string;
    backgroundBlendMode?: string;
}

export interface AlbumPageData {
    id: string;
    pageNumber: number;
    
    // MANDATORY: Layout configuration
    layout_config: LayoutBox[];  // Never null, minimum []
    
    // MANDATORY: Page styling
    page_styles: PageStyles;
    
    // MANDATORY: Text layers (separate from layout boxes for editing)
    text_layers: LayoutBox[];    // Never null, minimum []
    
    // Legacy support
    layoutTemplate?: string;
    isSpreadLayout?: boolean;
}
```

---

## 2. RENDERING ENGINE STANDARDIZATION

### Component Hierarchy (MUST BE IDENTICAL IN ALL MODES)

```
AlbumPage (Universal)
├── PageContainer (position: relative, fixed dimensions)
│   ├── BackgroundLayer (z-index: 0)
│   ├── LayoutFrame[] (z-index: 10, from layout_config)
│   │   └── MediaRenderer (handles image/video with transform)
│   ├── TextLayer[] (z-index: 50, from text_layers)
│   └── InteractionOverlay (z-index: 100, Studio only)
```

### LayoutFrame Component (Universal)

**CRITICAL:** This component MUST be used identically in Studio, Preview, and View.

```typescript
interface LayoutFrameProps {
    box: LayoutBox;
    pageWidth: number;
    pageHeight: number;
    isEditable: boolean;  // true in Studio, false in Preview/View
}
```

**CSS Rules (NON-NEGOTIABLE):**
```css
.layout-frame {
    position: absolute;
    overflow: hidden;
    /* Position calculated from box.left, box.top, box.width, box.height */
}

.layout-frame img,
.layout-frame video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: calc(content.x%) calc(content.y%);
    transform: scale(content.zoom) rotate(content.rotation deg);
    transform-origin: center;
}
```

---

## 3. ABSOLUTE POSITIONING & Z-INDEX HIERARCHY

### Strict Z-Index Layers

| Layer | Z-Index | Purpose |
|-------|---------|---------|
| Page Background | 0 | backgroundColor, backgroundImage |
| Image Layouts | 10-19 | Photos/videos in layout slots |
| Text Layers | 50-59 | All text elements |
| Interaction Overlays | 100+ | Resize handles, selection boxes (Studio only) |

### Position Rules

1. **Page Container**: `position: relative`, fixed pixel dimensions
2. **All Children**: `position: absolute` with percentage-based positioning
3. **No Flexbox/Grid**: Prevents layout shifts between modes
4. **Transform Origin**: Always `center` for consistent scaling

---

## 4. SUPABASE SYNCHRONIZATION PROTOCOL

### Deep Merge Strategy

```typescript
async function saveAlbumPage(pageId: string, updates: Partial<AlbumPageData>) {
    // 1. Fetch current state
    const current = await fetchCurrentPage(pageId);
    
    // 2. Deep merge (preserve nested structures)
    const merged = {
        ...current,
        ...updates,
        layout_config: updates.layout_config || current.layout_config || [],
        text_layers: updates.text_layers || current.text_layers || [],
        page_styles: {
            ...current.page_styles,
            ...updates.page_styles
        }
    };
    
    // 3. Validate schema
    validatePageData(merged);
    
    // 4. Save to Supabase
    await supabase.from('album_pages').upsert(merged);
    
    // 5. Return merged data for local state update
    return merged;
}
```

### Loading Protocol

```typescript
// CRITICAL: Wait for data before rendering
const [isLoading, setIsLoading] = useState(true);
const [pageData, setPageData] = useState<AlbumPageData | null>(null);

useEffect(() => {
    async function loadPage() {
        setIsLoading(true);
        const data = await fetchAlbumPage(pageId);
        
        // Ensure mandatory fields exist
        const normalized = {
            ...data,
            layout_config: data.layout_config || [],
            text_layers: data.text_layers || [],
            page_styles: data.page_styles || DEFAULT_PAGE_STYLES
        };
        
        setPageData(normalized);
        setIsLoading(false);
    }
    loadPage();
}, [pageId]);

if (isLoading) return <LoadingSpinner />;
if (!pageData) return <ErrorState />;

return <AlbumPage data={pageData} />;
```

---

## 5. VIDEO & MEDIA HANDLING

### Video Constraints

```typescript
// Video in layout frame
<video
    src={content.url}
    style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',  // NEVER 'cover' for videos
        objectPosition: `${content.x}% ${content.y}%`,
        transform: `scale(${content.zoom}) rotate(${content.rotation}deg)`
    }}
    playsInline
    controls
    muted
/>
```

**Rules:**
1. Videos use `object-fit: contain` to prevent aspect ratio distortion
2. Images use `object-fit: cover` for full frame filling
3. Both use same transform/position logic

---

## 6. VERIFICATION PROTOCOL

### Test Checklist (MUST PASS ALL)

- [ ] Move text box 5px left in Studio → Verify in View mode (hard refresh)
- [ ] Crop image to 150% zoom in Studio → Verify exact zoom in View mode
- [ ] Rotate image 45° in Studio → Verify rotation in View mode
- [ ] Change background color in Studio → Verify in View mode
- [ ] Add video to layout → Verify aspect ratio maintained in View mode
- [ ] Create multi-page album → Verify all pages render identically in View mode
- [ ] Save and reload → Verify no data loss or position shifts

### Pixel-Perfect Verification

```typescript
// Studio saves this:
const studioData = {
    left: 25.5,
    top: 30.2,
    width: 40.0,
    height: 50.0,
    content: {
        zoom: 1.5,
        x: 45,
        y: 55,
        rotation: 15
    }
};

// View mode MUST render with EXACT same values
// No rounding, no approximation, no CSS differences
```

---

## IMPLEMENTATION ORDER

1. ✅ Create unified LayoutBox and AlbumPageData interfaces
2. ✅ Create universal LayoutFrame component
3. ✅ Refactor AlbumPage to use unified schema
4. ✅ Update saveAlbumPage with deep merge
5. ✅ Update fetchAlbum with normalization
6. ✅ Add loading states to View mode
7. ✅ Implement strict Z-index hierarchy
8. ✅ Test pixel-perfect rendering
9. ✅ Update UserUpdates.md

---

## SUCCESS CRITERIA

**DEFINITION OF DONE:**
A change made in Studio appears pixel-perfectly identical in View mode after browser refresh, with zero visual discrepancies in position, size, zoom, rotation, or styling.
