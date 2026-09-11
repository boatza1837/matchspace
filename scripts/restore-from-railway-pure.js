const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const TURSO_URL = 'libsql://matchspace-boatza1837.aws-ap-northeast-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODkxMTk5MDcsImlkIjoiMDFhMDA3M2MtZWUwMS03NDcxLTkyMzktMDVkYzgzMzJjNmYzIiwia2lkIjoiUHR0ZlBzcU5vWXBvbWg4R2k3MzNQNm5ybWVtcGxtYjNsb1lfV2pIVE1jcyIsInJpZCI6ImIxYTI3NjRiLTkzY2QtNGZhMi05NmJmLTQ1YzllNTZkMzdjYyJ9.ru4ZJ8bWcYn5jaGql9uqEO4zjHCsL3alqD2TlSJ2VCxCOK9_PfB0e2sBpRfocNVzBOFza9r7CER5e_nhO01VBQ';

const dumpPath = path.join(__dirname, '..', 'railway_dump.json');
const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));

const client = createClient({
  url: TURSO_URL,
  authToken: TURSO_TOKEN
});

async function main() {
  console.log('--- Starting Pure Railway Data Restoration to Turso Cloud ---');

  // 1. Ensure columns exist on activities
  try {
    await client.execute('ALTER TABLE activities ADD COLUMN event_date TEXT');
    console.log('Added event_date to activities');
  } catch (e) {}
  try {
    await client.execute('ALTER TABLE activities ADD COLUMN event_time TEXT');
    console.log('Added event_time to activities');
  } catch (e) {}

  // 2. Clear tables in reverse dependency order
  const tablesToClear = [
    'chat_messages',
    'chats',
    'activity_members',
    'activities',
    'user_photos',
    'matches',
    'reports',
    'user_blocks',
    'user_badges',
    'student_otp_verifications',
    'push_subscriptions',
    'login_logs',
    'audit_logs',
    'user_sessions',
    'users'
  ];

  console.log('Purging test/polluted records from Turso Cloud...');
  for (const t of tablesToClear) {
    try {
      await client.execute(`DELETE FROM ${t}`);
      console.log(`Cleared table: ${t}`);
    } catch (e) {
      console.warn(`Could not clear ${t}: ${e.message}`);
    }
  }

  // 3. Insert genuine data in proper dependency order
  const tablesToInsert = [
    'users',
    'activities',
    'activity_members',
    'user_photos',
    'matches',
    'chats',
    'chat_messages',
    'reports',
    'user_blocks',
    'user_badges',
    'student_otp_verifications',
    'push_subscriptions',
    'login_logs',
    'audit_logs',
    'user_sessions'
  ];

  for (const table of tablesToInsert) {
    const rows = dump.data[table];
    if (!rows || rows.length === 0) {
      console.log(`Table ${table} has 0 rows in dump. Skipping.`);
      continue;
    }

    console.log(`Restoring ${table} (${rows.length} rows)...`);
    let inserted = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const placeholders = cols.map(() => '?').join(', ');
      const vals = Object.values(row).map(v => v === undefined ? null : v);
      const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
      try {
        await client.execute({ sql, args: vals });
        inserted++;
      } catch (err) {
        console.error(`Error inserting into ${table} (row id: ${row.id}):`, err.message);
      }
    }
    console.log(`Successfully restored ${inserted}/${rows.length} rows into ${table}`);
  }

  // 4. Verify activities
  console.log('\n--- Verification of Restored Activities ---');
  const actRes = await client.execute('SELECT * FROM activities');
  console.table(actRes.rows);

  console.log('\n--- Verification of Restored Users ---');
  const usrRes = await client.execute('SELECT id, name, email, role, is_admin, profile_image FROM users');
  console.table(usrRes.rows);

  console.log('\n--- Pure Railway Database Restoration Complete! ---');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
