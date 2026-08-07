/**
 * Process entry point. Verifies the database is actually reachable before
 * accepting traffic — failing fast here means a misconfigured DB_HOST
 * shows up as a boot crash with a clear log line, not as every request
 * timing out once real users hit it.
 */
const app = require('./app');
const env = require('./config/env');
const { sequelize } = require('./models');
const logger = require('./utils/logger');

let server;

const start = async () => {
  await sequelize.authenticate();
  logger.info('Database connection established.');

  server = app.listen(env.PORT, () => {
    logger.info(`HomeService API listening on port ${env.PORT} (${env.NODE_ENV})`);
  });
};

const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully.`);
  if (!server) process.exit(0);
  server.close(async () => {
    await sequelize.close();
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start().catch((err) => {
  logger.error('Failed to start server', { message: err.message, stack: err.stack });
  process.exit(1);
});
