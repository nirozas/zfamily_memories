# Album System Issues - Diagnostic Report
## Date: 2026-01-23 21:34 PM

### 🔍 IDENTIFIED PROBLEMS

#### 1. **Layout Application Logic Mismatch**
**Location:** `LayoutSelector.tsx` (lines 79-112)
**Problem:** When applying a layout:
- Sets `layoutConfig` with raw slot structure from database
- Assigns `slotId` to assets but doesn't nest them in `layoutConfig.content`
- AlbumPage expects `layoutConfig[index].content` to contain the asset data

**Current Flow:**
```
Layout Applied → layoutConfig = [{ left: 10, top: 10, width: 40, height: 50 }]
                 assets = [{ id: 'x', slotId: 0, url: 'image.jpg' }]
```

**Expected Flow:**
```
Layout Applied → layoutConfig = [{
                   left: 10, top: 10, width: 40, height: 50,
                   content: { url: 'image.jpg', type: 'image', config: {...} }
                 }]
```

#### 2. **AlbumPage Rendering Logic**
**Location:** `AlbumPage.tsx` (lines 66-119)
**Problem:**
- Tries to read `item.content.url` from layoutConfig
- If content is missing, returns `null` (nothing renders)
- Assets with `slotId` are orphaned - they exist but aren't displayed

#### 3. **Save/Load Cycle Broken**
**Location:** `AlbumContext.tsx` (lines 993-1054)
**Problem:**
- Load function unpacks nested content correctly
- But there's no save function that re-packs assets into nested structure
- When saving, assets with `slotId` are saved separately, not nested in layout_json

#### 4. **Missing Content Mapping**
**Root Cause:** No function exists to:
1. Take assets with `slotId`
2. Find corresponding slot in `layoutConfig`
3. Nest asset data inside `slot.content`

### 🎯 SOLUTION STRATEGY

#### Fix 1: Update Layout Application
Modify `LayoutSelector.tsx` to properly nest content when applying layouts

#### Fix 2: Add Content Mapping Utility
Create function to sync assets with slotId into layoutConfig.content

#### Fix 3: Update AlbumPage Fallback
Add fallback rendering for assets with slotId but missing from layoutConfig

#### Fix 4: Fix Save Function
Ensure saveAlbum properly structures nested content for database

### 📋 FILES TO MODIFY
1. `src/components/editor/LayoutSelector.tsx` - Fix layout application
2. `src/components/viewer/AlbumPage.tsx` - Add fallback rendering
3. `src/contexts/AlbumContext.tsx` - Fix save/load cycle
4. `src/lib/layoutUtils.ts` (NEW) - Content mapping utilities

### ⚠️ CRITICAL ISSUES
- Images disappear after applying layout
- Layout config doesn't persist properly
- Viewer shows empty slots instead of images
- Editor and Viewer are out of sync
