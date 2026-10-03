/**
 * Rebuilds the dedicated `homeservice_test` database from scratch (drops it
 * first — see dropTestDatabase.js): schema.sql → seed.sql, all under NODE_ENV=test so it never
 * touches the real dev database.
 *
 * schema.sql is intentionally self-contained for MySQL Workbench use (see
 * its own header comment) — it hardcodes `CREATE DATABASE IF NOT EXISTS
 * homeservice` / `USE homeservice`, by design, not a bug. Running it as-is
 * here would silently rebuild the REAL dev database instead of the test
 * one (a `USE` statement mid-script overrides the connection's own
 * database), so this script works from a copy with `homeservice` swapped
 * for `homeservice_test`, rather than editing schema.sql itself.
 *
 * schema.sql already includes everything the two db/migrations/*.sql files
 * add (those exist only to bring an older, already-running dev database up
 * to date) — running them again here would fail on a fresh schema, so
 * they're deliberately not run.
 *
 * Run with: npm run db:test:setup
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const env = { ...process.env, NODE_ENV: 'test' };
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root, env });

const schemaSql = fs.readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
const testSchemaSql = schemaSql.replace(/\bhomeservice\b/g, 'homeservice_test');
const tmpSchemaPath = path.join(os.tmpdir(), `homeservice_test_schema_${Date.now()}.sql`);
fs.writeFileSync(tmpSchemaPath, testSchemaSql);

try {
  run('node db/scripts/dropTestDatabase.js');
  run('node db/scripts/createDatabase.js');
  run(`node db/scripts/runSqlFile.js "${tmpSchemaPath}"`);
  run('node db/scripts/runSqlFile.js db/seed.sql');
} finally {
  fs.unlinkSync(tmpSchemaPath);
}

// eslint-disable-next-line no-console
console.log('✅ homeservice_test is ready.');
