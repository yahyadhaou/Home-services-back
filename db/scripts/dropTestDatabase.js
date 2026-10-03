/**
 * Drops the dedicated test database so `db:test:setup` can rebuild it from
 * a clean slate. schema.sql only creates tables (no DROPs), so without this
 * a second `npm test` fails on "table already exists" — and, worse, test
 * data from earlier runs piles up until list endpoints paginate new rows
 * off the first page.
 *
 * Hard guard: refuses to run unless NODE_ENV=test AND the database name
 * ends in `_test`. This script must never be able to touch the real
 * development database, whatever .env happens to be loaded.
 */
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../..', '.env.test') });

const run = async () => {
  const dbName = process.env.DB_NAME;
  if (process.env.NODE_ENV !== 'test' || !dbName || !dbName.endsWith('_test')) {
    throw new Error(`Refusing to drop "${dbName}": only NODE_ENV=test databases named *_test may be dropped`);
  }

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_MIGRATE_USER || process.env.DB_USER,
    password: process.env.DB_MIGRATE_PASSWORD || process.env.DB_PASSWORD,
  });
  await connection.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await connection.end();
  // eslint-disable-next-line no-console
  console.log(`🧹 Dropped "${dbName}" (if it existed).`);
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to drop test database:', err.message);
  process.exit(1);
});
