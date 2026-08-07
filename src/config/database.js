/**
 * Single Sequelize instance, shared by every model.
 *
 * Connection pooling is configured explicitly rather than left at Sequelize's
 * defaults — under real traffic, an unbounded pool is how a slow query
 * upstream turns into a MySQL "too many connections" outage. `max` caps how
 * many concurrent connections this process can open; `idle`/`evict` recycle
 * connections that have sat unused so the DB isn't holding sockets open for
 * nothing.
 */
const { Sequelize } = require('sequelize');
const env = require('./env');
const logger = require('../utils/logger');

const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql',
  logging: env.isProduction ? false : (sql) => logger.debug(sql),
  define: {
    underscored: true, // JS camelCase <-> DB snake_case, matches schema.sql column naming
    timestamps: true,
    paranoid: true, // soft deletes (deleted_at) by default — see docs/DATABASE.md
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  timezone: '+00:00', // store everything in UTC; apps localize on display
});

module.exports = sequelize;
