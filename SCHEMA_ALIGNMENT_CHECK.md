# Schema Alignment Check Report
**Date:** 2026-01-25  
**Purpose:** Validate actual Supabase schema before Week 1 implementation  
**Status:** ⚠️ CRITICAL MISMATCHES FOUND

---

## 🔍 SCHEMA ANALYSIS

### ✅ CONFIRMED TABLES & COLUMNS

#### 1. `albums` table
```typescript
✅ id: string (UUID)
✅ creator_id: string | null  // EXISTS (not in old audit assumptions)
✅ family_id: string
✅ event_id: string | null
✅ title: string
✅ description: string | null
✅ category: string | null
✅ cover_image_url: string | null
✅ config: Json
✅ location: string | null
✅ country: string | null
✅ geotag: Json | null
✅ is_published: boolean
✅ hashtags: string[] | null
✅ created_at: string
✅ updated_at: string

❌ total_pages: NOT IN TYPESCRIPT TYPES (but RPC handles it gracefully)
❌ layout_metadata: NOT IN TYPESCRIPT TYPES (but RPC handles it gracefully)
```

#### 2. `album_pages` table (UNIFIED SCHEMA)
```sql
✅ album_id: UUID (FK to albums.id, CASCADE DELETE)
✅ page_number: INTEGER
✅ layout_json: JSONB (renamed from 'elements' in V4.2)
✅ background_config: JSONB
✅ layout_template: TEXT
✅ updated_at: TIMESTAMP
✅ PRIMARY KEY: (album_id, page_number) -- COMPOSITE KEY

❌ NOT IN TYPESCRIPT TYPES FILE
❌ created_at: Missing from schema (only updated_at exists)
```

#### 3. `pages` table (LEGACY SCHEMA - Still exists)
```typescript
✅ id: string (UUID)
✅ album_id: string
✅ page_number: number
✅ template_id: string
✅ background_color: string
✅ background_image: string | null
✅ created_at: string
✅ updated_at: string

❌ background_opacity: NOT IN TYPES (but used in code)
```

#### 4. `assets` table (LEGACY SCHEMA - Still exists)
```typescript
✅ id: string
✅ page_id: string (FK to pages.id)
✅ url: string
✅ asset_type: 'image' | 'video' | 'ribbon' | 'frame' | 'text'
✅ config: Json
✅ z_index: number
✅ slot_id: number | null
✅ created_at: string
✅ updated_at: string
```

#### 5. `events` table
```typescript
✅ id: string
✅ family_id: string
✅ title: string
✅ description: string | null
✅ event_date: string
✅ location: string | null
✅ geotag: Json | null
✅ category: string | null
✅ content: Json  // Rich media support
✅ hashtags: string[] | null
✅ participants: string[] | null
✅ created_by: string | null  // EXISTS (was causing 400 errors before)
✅ created_at: string
✅ updated_at: string
```

---

## 🚨 CRITICAL FINDINGS

### Issue 1: Missing TypeScript Definitions for `album_pages`
**Impact:** HIGH  
**Problem:** The unified `album_pages` table exists in database but has NO TypeScript types

**Evidence:**
- SQL migration exists: `SUPABASE_SCHEMA_UPGRADE.sql`
- V4.2 renamed `elements` → `layout_json`
- But `src/types/supabase.ts` doesn't include this table

**Risk:** Type errors, autocomplete failures, runtime bugs

---

### Issue 2: Column Name Mismatch
**Impact:** CRITICAL  
**Problem:** Code uses `elements` but database has `layout_json`

**Migration History:**
```sql
-- SUPABASE_SCHEMA_UPGRADE.sql (Original)
CREATE TABLE album_pages (
    elements JSONB DEFAULT '[]',  // OLD NAME
    ...
)

-- SUPABASE_SCHEMA_UPGRADE_V4_2.sql (Rename)
ALTER TABLE album_pages RENAME COLUMN elements TO layout_json;
```

**Current Code:**
```typescript
// AlbumView.tsx line 40
const { data: albumPagesData } = await supabase
    .from('album_pages')
    .select('*')  // Returns 'layout_json' not 'elements'
```

---

### Issue 3: Dual Schema Coexistence
**Impact:** HIGH  
**Problem:** Both `pages`/`assets` (legacy) AND `album_pages` (unified) exist

**Current State:**
- ✅ `duplicate_album_v2` RPC handles BOTH schemas
- ✅ AlbumView.tsx has fallback logic
- ❌ AlbumContext doesn't know about dual schema
- ❌ Save logic might write to wrong table

**Risk:** Data fragmentation, sync issues

---

### Issue 4: Optional Columns Not in Types
**Impact:** MEDIUM  
**Problem:** RPC detects optional columns dynamically, but TypeScript doesn't know

**Columns:**
- `albums.total_pages` - Not in types
- `albums.layout_metadata` - Not in types  
- `pages.background_opacity` - Not in types

**Why This Matters:**
```typescript
// This will cause TS error even though DB supports it
await supabase.from('albums').insert({
    title: 'Test',
    total_pages: 5  // ❌ TS Error: Property doesn't exist
})
```

---

## 📋 REQUIRED FIXES BEFORE WEEK 1

### Fix 1: Add `album_pages` TypeScript Definitions
**Priority:** CRITICAL  
**File:** `src/types/supabase.ts`

```typescript
album_pages: {
    Row: {
        album_id: string;
        page_number: number;
        layout_json: Json;  // NOT 'elements'
        background_config: Json;
        layout_template: string | null;
        updated_at: string;
    }
    Insert: {
        album_id: string;
        page_number: number;
        layout_json?: Json;
        background_config?: Json;
        layout_template?: string | null;
        updated_at?: string;
    }
    Update: {
        album_id?: string;
        page_number?: number;
        layout_json?: Json;
        background_config?: Json;
        layout_template?: string | null;
        updated_at?: string;
    }
}
```

### Fix 2: Add Optional Columns to Types
**Priority:** MEDIUM  
**File:** `src/types/supabase.ts`

```typescript
albums: {
    Row: {
        // ... existing fields ...
        total_pages?: number;  // Optional
        layout_metadata?: Json;  // Optional
    }
    // ... Insert/Update same pattern ...
}

pages: {
    Row: {
        // ... existing fields ...
        background_opacity?: number;  // Optional
    }
}
```

### Fix 3: Create Unified Data Service
**Priority:** CRITICAL  
**File:** `src/services/albumDataService.ts` (NEW)

**Requirements:**
- ✅ Single source of truth for fetch/save
- ✅ Handles BOTH legacy and unified schemas
- ✅ Uses `layout_json` not `elements`
- ✅ Calls `duplicate_album_v2` RPC for duplication
- ✅ Normalizes data to AlbumContext format
- ✅ Validates schema before writes

### Fix 4: Update AlbumView to Use AlbumContext
**Priority:** CRITICAL  
**File:** `src/pages/AlbumView.tsx`

**Changes:**
- ❌ Remove duplicate fetch logic
- ✅ Use AlbumContext.loadAlbum()
- ✅ Share state with editor
- ✅ Real-time sync via context

---

## 🎯 IMPLEMENTATION STRATEGY

### Phase 1A: Type Definitions (30 min)
1. Add `album_pages` table types
2. Add optional columns to existing types
3. Run TypeScript check: `npm run type-check`

### Phase 1B: Unified Data Service (2 hours)
1. Create `albumDataService.ts`
2. Implement `fetchAlbum(id)` - handles both schemas
3. Implement `saveAlbum(album)` - writes to unified schema
4. Implement `duplicateAlbum(id, title)` - calls RPC
5. Add schema detection utility

### Phase 1C: Refactor AlbumView (1 hour)
1. Remove local fetch logic
2. Integrate AlbumContext
3. Test editor → viewer sync

### Phase 1D: Refactor AlbumContext (2 hours)
1. Replace direct Supabase calls with albumDataService
2. Ensure save writes to `layout_json` not `elements`
3. Add migration helper for legacy data

---

## ✅ VALIDATION CHECKLIST

Before proceeding with Week 1 implementation:

- [ ] TypeScript types match actual database schema
- [ ] `layout_json` column name used everywhere (not `elements`)
- [ ] `duplicate_album_v2` RPC exists and is callable
- [ ] Both legacy and unified schemas supported
- [ ] No hardcoded column names that might not exist
- [ ] All optional columns marked as optional in types

---

## 🔬 SCHEMA DETECTION UTILITY

To prevent future 400 errors, I'll create a runtime schema validator:

```typescript
// src/lib/schemaValidator.ts
export async function validateAlbumSchema() {
    const checks = {
        hasAlbumPages: false,
        hasLayoutJson: false,
        hasTotalPages: false,
        hasLegacyPages: false
    };

    try {
        // Test album_pages table
        const { error: apError } = await supabase
            .from('album_pages')
            .select('layout_json')
            .limit(1);
        
        checks.hasAlbumPages = !apError;
        checks.hasLayoutJson = !apError;

        // Test legacy pages table
        const { error: pError } = await supabase
            .from('pages')
            .select('id')
            .limit(1);
        
        checks.hasLegacyPages = !pError;

        // Test optional columns
        const { error: tpError } = await supabase
            .from('albums')
            .select('total_pages')
            .limit(1);
        
        checks.hasTotalPages = !tpError;

    } catch (e) {
        console.error('Schema validation failed:', e);
    }

    return checks;
}
```

---

## 📊 SCHEMA VERSION MATRIX

| Feature | Legacy Schema | Unified Schema | Status |
|---------|--------------|----------------|--------|
| Album metadata | `albums` table | `albums` table | ✅ Same |
| Page storage | `pages` table | `album_pages` table | ⚠️ Dual |
| Asset storage | `assets` table | `layout_json` JSONB | ⚠️ Dual |
| Composite key | No (UUID) | Yes (album_id, page_number) | ⚠️ Different |
| Column name | N/A | `layout_json` (was `elements`) | ⚠️ Renamed |
| Duplication | Manual loop | `duplicate_album_v2` RPC | ✅ RPC ready |

---

## 🚀 READY TO PROCEED?

**Status:** ⚠️ NOT YET  
**Blockers:**
1. Must add `album_pages` TypeScript types first
2. Must create `albumDataService.ts` with schema detection
3. Must update all code to use `layout_json` not `elements`

**Estimated Time to Clear Blockers:** 3-4 hours

**Once cleared, Week 1 implementation can proceed safely.**

---

**END OF SCHEMA ALIGNMENT CHECK**
