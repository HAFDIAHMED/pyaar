// Run the schema against the configured Oracle DB. Safe to re-run: it ignores
// ORA-00955 (name already used by an existing object).
//   node server/src/db/migrate.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initDb, query, closeDb } from './pool.js';

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(here, 'schema.sql'), 'utf8');
  const statements = sql
    .split(/\n;\s*\n|\n;\s*$/)        // statements separated by a ';' on its own line
    .map(s => s.replace(/;\s*$/, '').trim())
    .filter(s => s && !s.startsWith('--'));

  await initDb();
  let ok = 0, skipped = 0;
  for (const stmt of statements) {
    try {
      await query(stmt);
      ok++;
      console.log('  ✓', stmt.split('\n')[0].slice(0, 60));
    } catch (e) {
      // 955 = object already exists, 1408 = column already indexed,
      // 2275 = constraint already exists, 1430 = column already exists,
      // 1442 = column already nullable. All safe to skip on re-run.
      if (e.errorNum === 955 || e.errorNum === 1408 || e.errorNum === 2275 || e.errorNum === 1430 || e.errorNum === 1442) {
        skipped++;
        console.log('  • exists, skipped:', stmt.split('\n')[0].slice(0, 60));
      } else {
        console.error('  ✗', stmt.split('\n')[0].slice(0, 60), '\n   ', e.message);
        throw e;
      }
    }
  }
  console.log(`\nMigration done — ${ok} applied, ${skipped} already present.`);
  await closeDb();
}

main().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });
