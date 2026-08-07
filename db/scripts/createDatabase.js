/**
 * Creates the application database if it doesn't already exist. Run once,
 * before `npm run db:schema`. Deliberately connects with no default
 * database selected (you can't `CREATE DATABASE` from inside the database
 * you're creating) and with the migration user if one is configured — see
 * .env.example's note on why the runtime app user shouldn't hold DDL
 * rights in production.
 */
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const run = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_MIGRATE_USER || process.env.DB_USER,
    password: process.env.DB_MIGRATE_PASSWORD || process.env.DB_PASSWORD,
  });

  const dbName = process.env.DB_NAME;
  if (!dbName) throw new Error('DB_NAME is not set — check your .env file');

  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  // eslint-disable-next-line no-console
  console.log(`✅ Database "${dbName}" is ready.`);
  await connection.end();
};

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to create database:', err.message);
  process.exit(1);
});
