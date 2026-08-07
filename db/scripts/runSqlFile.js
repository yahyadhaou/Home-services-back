/**
 * Executes a whole .sql file against the configured database in one go —
 * used for both `db:schema` (schema.sql) and `db:seed` (seed.sql). mysql2's
 * `multipleStatements` option is what makes running a whole file possible
 * in a single call; it's turned on only for this one-off connection, never
 * for the app's regular pool (see config/database.js), since allowing
 * multi-statement queries on a connection that ever touches user input
 * would be a SQL-injection amplifier.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
  const relativeFilePath = process.argv[2];
  if (!relativeFilePath) {
    throw new Error('Usage: node db/scripts/runSqlFile.js <path-to-sql-file>');
  }

  const filePath = path.resolve(process.cwd(), relativeFilePath);
  const sql = fs.readFileSync(filePath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_MIGRATE_USER || process.env.DB_USER,
    password: process.env.DB_MIGRATE_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await connection.query(sql);
  // eslint-disable-next-line no-console
  console.log(`✅ Executed ${relativeFilePath} against database "${process.env.DB_NAME}".`);
  await connection.end();
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to execute SQL file:', err.message);
  process.exit(1);
});
