/**
 * Migration Runner - Apply Phase 1 Database Changes
 * 
 * Run this script once to apply the database schema changes for Phase 1
 */

import { supabase } from './lib/supabase';
import { readFileSync } from 'fs';
import { join } from 'path';

async function runMigration() {
    console.log('🚀 Starting Phase 1 Database Migration...\n');

    try {
        // Read the migration SQL file
        const migrationPath = join(
            process.cwd(),
            'supabase',
            'migrations',
            '20260126_phase1_data_layer_unification.sql'
        );

        const migrationSQL = readFileSync(migrationPath, 'utf-8');

        console.log('📄 Migration SQL loaded');
        console.log('🔧 Applying changes to database...\n');

        // Execute the migration
        const { data, error } = await supabase.rpc('exec_sql', {
            sql: migrationSQL,
        });

        if (error) {
            console.error('❌ Migration failed:', error);

            // Try alternative: execute each statement separately
            console.log('\n⚠️  Trying alternative approach: executing statements individually...\n');

            const statements = migrationSQL
                .split('$$')
                .filter(s => s.trim().length > 0);

            for (let i = 0; i < statements.length; i++) {
                const stmt = statements[i].trim();
                if (stmt.startsWith('--') || stmt.length === 0) continue;

                console.log(`Executing statement ${i + 1}...`);
                // Note: This won't work without exec_sql RPC, so we'll need manual execution
            }

            console.log('\n⚠️  Please run the migration manually using Supabase Dashboard:');
            console.log('1. Go to https://supabase.com/dashboard/project/zcvqbxqjfgxdqbcvfmxq/sql');
            console.log('2. Copy the contents of: supabase/migrations/20260126_phase1_data_layer_unification.sql');
            console.log('3. Paste and execute in the SQL editor\n');

            return false;
        }

        console.log('✅ Migration completed successfully!\n');
        console.log('📊 Changes applied:');
        console.log('  - Added total_pages column to albums table');
        console.log('  - Added creator_id column to events table (if missing)');
        console.log('  - Added background_opacity column to pages table');
        console.log('  - Added layout_metadata column to albums table');
        console.log('  - Created trigger to auto-update total_pages');
        console.log('  - Backfilled total_pages for existing albums\n');

        return true;
    } catch (error) {
        console.error('❌ Unexpected error:', error);
        return false;
    }
}

// Run if executed directly
if (require.main === module) {
    runMigration().then((success) => {
        process.exit(success ? 0 : 1);
    });
}

export { runMigration };
