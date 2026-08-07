/**
 * HTTP access logging via morgan, piped into winston so every log line
 * (access logs and application logs alike) goes through the same
 * transport/format and ends up in the same place in production.
 */
const morgan = require('morgan');
const logger = require('../utils/logger');

const stream = {
  write: (message) => logger.http(message.trim()),
};

const requestLogger = morgan('combined', { stream });

module.exports = { requestLogger };
