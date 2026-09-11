const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { createClient } = require('@libsql/client');

if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch(e) {}
}

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

if (!tursoUrl || !tursoToken) {
  console.error('Error: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing in .env');
  process.exit(1);
}

const localDbPath = path.join(__dirname, '..', 'matchspace.db');
if (!fs.existsSync(localDbPath)) {
  console.error('Error: local database file not found at:', localDbPath);
  process.exit(1);
}

const localDb = new DatabaseSync(localDbPath);
const turso = createClient({
  url: tursoUrl,
  authToken: tursoToken
});

const TABLES_TO_MIGRATE = [
  'users',
  'user_photos',
  'reports',
  'matches',
  'chats',
  'chat_messages',
  'user_blocks',
  'student_otp_verifications',
  'push_subscriptions',
  'activities',
  'activity_members',
  'user_badges',
  'login_logs',
  'audit_logs'
];

async function migrate() {
  console.log('=============================================');
  console.log('🚀 Starting SQLite to Turso Cloud Migration');
  console.log('Local DB:', localDbPath);
  console.log('Turso DB URL:', tursoUrl);
  console.log('=============================================\n');

  // Step 1: Ensure Turso tables exist by invoking initDatabase
  console.log('📦 Step 1: Initializing database tables on Turso Cloud...');
  const { initDatabase } = require('../src/config/db');
  await initDatabase();
  console.log('✅ Turso Cloud tables initialized.\n');

  // Step 2: Migrate data table by table
  console.log('🚚 Step 2: Transferring records from local SQLite to Turso Cloud...');

  for (const table of TABLES_TO_MIGRATE) {
    try {
      // Check if table exists in local DB
      const tableCheck = localDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
      if (!tableCheck) {
        console.log(`- Table [${table}]: Skipped (does not exist locally)`);
        continue;
      }

      const rows = localDb.prepare(`SELECT * FROM ${table}`).all();
      if (!rows || rows.length === 0) {
        console.log(`- Table [${table}]: 0 rows (empty)`);
        continue;
      }

      console.log(`- Migrating [${table}]: ${rows.length} rows...`);

      // Batch insert into Turso
      let successCount = 0;
      for (const row of rows) {
        const columns = Object.keys(row);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(row);

        const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        try {
          await turso.execute({ sql, args: values });
          successCount++;
        } catch (insertErr) {
          console.error(`  ⚠️ Error inserting into ${table} (id: ${row.id || 'N/A'}):`, insertErr.message);
        }
      }

      console.log(`  ✅ [${table}]: Successfully migrated ${successCount}/${rows.length} rows`);
    } catch (err) {
      console.error(`❌ Error migrating table ${table}:`, err.message);
    }
  }

  console.log('\n=============================================');
  console.log('🎉 Migration Completed Successfully!');
  console.log('=============================================');
}

migrate().catch(err => {
  console.error('Fatal Migration Error:', err);
  process.exit(1);
});
