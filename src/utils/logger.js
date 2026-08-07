/**
 * Structured logging via winston.
 *
 * Plain `console.log` doesn't give you log levels, timestamps, or a JSON
 * shape a log aggregator (Datadog, CloudWatch, ELK…) can parse. This gives
 * us all three for a small amount of setup, and it's the same logger every
 * module imports — one place to change the format or add a transport
 * (e.g. ship to a log service) later.
 */
const winston = require('winston');
const env = require('../config/env');

const {
  combine, timestamp, printf, colorize, errors, json,
} = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({
    level, message, timestamp: ts, stack, ...meta
  }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${stack || message}${metaStr}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: env.isProduction ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

module.exports = logger;
