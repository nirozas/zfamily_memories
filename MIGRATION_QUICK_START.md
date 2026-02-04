# 🚀 Quick Start: Apply Phase 1 Database Migration

## Step 1: Open Supabase SQL Editor

Go to: **https://supabase.com/dashboard/project/zcvqbxqjfgxdqbcvfmxq/sql**

---

## Step 2: Copy Migration SQL

Open this file in your editor:
```
supabase/migrations/20260126_phase1_data_layer_unification.sql
```

Copy the **entire contents** of the file.

---

## Step 3: Execute in Supabase

1. Paste the SQL into the Supabase SQL Editor
2. Click **"Run"** button
3. Wait for confirmation message

---

## Step 4: Verify Migration

Run these verification queries in the SQL editor:

```sql
-- 1. Check albums table has new columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'albums' 
AND column_name IN ('total_pages', 'layout_metadata');

-- Expected: 2 rows showing both columns

-- 2. Check events table has creator_id
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'events' 
AND column_name = 'creator_id';

-- Expected: 1 row

-- 3. Check pages table has background_opacity
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'pages' 
AND column_name = 'background_opacity';

-- Expected: 1 row

-- 4. Check trigger was created
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers 
WHERE trigger_name = 'trigger_update_album_total_pages';

-- Expected: 1 row showing INSERT, UPDATE, DELETE triggers

-- 5. Check total_pages was backfilled
SELECT id, title, total_pages 
FROM albums 
LIMIT 5;

-- Expected: All albums should have total_pages > 0 if they have pages
```

---

## Step 5: Confirm Success

If all verification queries return expected results, the migration is complete! ✅

You can now proceed with the code integration (AlbumContext refactor).

---

## ⚠️ Troubleshooting

### Error: "column already exists"
This is OK! It means the column was already added. The migration uses `IF NOT EXISTS` checks.

### Error: "permission denied"
Make sure you're logged in as the project owner or have admin access.

### Error: "syntax error"
Double-check you copied the entire SQL file without truncation.

---

## 🎯 What This Migration Does

1. **Adds `total_pages` to albums** - Cached page count for performance
2. **Adds `creator_id` to events** - Fixes Status 400 errors
3. **Adds `background_opacity` to pages** - Missing field used in code
4. **Adds `layout_metadata` to albums** - Cached layout information
5. **Creates auto-update trigger** - Keeps `total_pages` in sync
6. **Backfills existing data** - Populates `total_pages` for all albums
7. **Adds performance indexes** - Speeds up queries

---

## 📞 Need Help?

If you encounter any issues, check:
- Supabase project is active
- You have admin/owner permissions
- Database connection is stable

Then retry the migration.
