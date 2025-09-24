#!/usr/bin/env node
// scripts/migrate-and-cleanup.js - Migration and cleanup utilities

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🔄 Running database migration...');

  const migrationPath = join(__dirname, '..', 'migrations', '001_lynk_sessions_and_limits.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    return false;
  }

  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

  try {
    // Split SQL by statement (crude but works for our migration)
    const statements = migrationSQL
      .split(/;\s*\n/)
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        if (error && !error.message.includes('already exists')) {
          console.warn('⚠️  Migration statement warning:', error.message);
        }
      }
    }

    console.log('✅ Database migration completed');
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}

async function cleanupExpiredSessions() {
  console.log('🧹 Cleaning up expired guest sessions...');

  try {
    const { data, error } = await supabase.rpc('cleanup_expired_guest_sessions');

    if (error) {
      console.error('❌ Cleanup failed:', error);
      return false;
    }

    console.log(`✅ Cleaned up ${data || 0} expired guest sessions`);
    return true;
  } catch (error) {
    console.error('❌ Cleanup error:', error);
    return false;
  }
}

async function initializeDefaultTiers() {
  console.log('👤 Initializing default user tiers...');

  try {
    // Get all users without tiers and set them to FREE_VERIFIED
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('❌ Failed to fetch users:', usersError);
      return false;
    }

    let initialized = 0;

    for (const user of users.users) {
      const { data: existing, error: checkError } = await supabase
        .from('user_tiers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (checkError && checkError.code === 'PGRST116') {
        // User doesn't have a tier, create one
        const { error: insertError } = await supabase
          .from('user_tiers')
          .insert([{
            user_id: user.id,
            tier: user.email_confirmed_at ? 'FREE_VERIFIED' : 'FREE_GUEST'
          }]);

        if (!insertError) {
          initialized++;
        }
      }
    }

    console.log(`✅ Initialized tiers for ${initialized} users`);
    return true;
  } catch (error) {
    console.error('❌ Tier initialization failed:', error);
    return false;
  }
}

async function showStats() {
  console.log('\n📊 Lynk Database Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Count sessions
    const { count: sessionCount } = await supabase
      .from('lynk_sessions')
      .select('*', { count: 'exact', head: true });

    // Count turns
    const { count: turnCount } = await supabase
      .from('lynk_session_turns')
      .select('*', { count: 'exact', head: true });

    // Count snapshots
    const { count: snapshotCount } = await supabase
      .from('lynk_session_snapshots')
      .select('*', { count: 'exact', head: true });

    // Count user tiers
    const { data: tierStats } = await supabase
      .from('user_tiers')
      .select('tier')
      .throwOnError();

    const tierCounts = tierStats?.reduce((acc, { tier }) => {
      acc[tier] = (acc[tier] || 0) + 1;
      return acc;
    }, {}) || {};

    console.log(`Sessions:      ${sessionCount || 0}`);
    console.log(`Turns:         ${turnCount || 0}`);
    console.log(`Snapshots:     ${snapshotCount || 0}`);
    console.log('\nUser Tiers:');
    console.log(`  FREE_GUEST:    ${tierCounts.FREE_GUEST || 0}`);
    console.log(`  FREE_VERIFIED: ${tierCounts.FREE_VERIFIED || 0}`);
    console.log(`  PRO:           ${tierCounts.PRO || 0}`);

  } catch (error) {
    console.error('❌ Failed to fetch stats:', error);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

async function main() {
  const command = process.argv[2];

  console.log('🚀 Lynk Migration & Cleanup Tool');
  console.log('================================\n');

  switch (command) {
    case 'migrate':
      await runMigration();
      break;

    case 'cleanup':
      await cleanupExpiredSessions();
      break;

    case 'init-tiers':
      await initializeDefaultTiers();
      break;

    case 'stats':
      await showStats();
      break;

    case 'all':
      console.log('Running full setup...\n');
      const success = await runMigration();
      if (success) {
        await initializeDefaultTiers();
        await cleanupExpiredSessions();
        await showStats();
      }
      break;

    default:
      console.log('Usage:');
      console.log('  node scripts/migrate-and-cleanup.js migrate     # Run database migration');
      console.log('  node scripts/migrate-and-cleanup.js cleanup     # Clean expired sessions');
      console.log('  node scripts/migrate-and-cleanup.js init-tiers  # Initialize user tiers');
      console.log('  node scripts/migrate-and-cleanup.js stats       # Show database stats');
      console.log('  node scripts/migrate-and-cleanup.js all         # Run all operations');
      console.log('');
      console.log('Make sure to set these environment variables:');
      console.log('  NEXT_PUBLIC_SUPABASE_URL');
      console.log('  SUPABASE_SERVICE_ROLE_KEY');
      break;
  }
}

main().catch(console.error);