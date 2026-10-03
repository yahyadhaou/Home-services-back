/**
 * Express application wiring. Nothing in here talks to the database or
 * listens on a port — see server.js for that — this file only builds the
 * middleware pipeline and mounts every module's router. Keeping app
 * construction separate from the boot sequence is what lets integration
 * tests `require('./app')` and hit it with supertest without ever opening
 * a real socket.
 */
require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const { requestLogger } = require('./middleware/requestLogger.middleware');
const { apiLimiter } = require('./middleware/rateLimiter.middleware');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler.middleware');

const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const companiesRoutes = require('./modules/companies/companies.routes');
const independentsRoutes = require('./modules/independents/independents.routes');
const workersRoutes = require('./modules/workers/workers.routes');
const bookingsRoutes = require('./modules/bookings/bookings.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');
const reviewsRoutes = require('./modules/reviews/reviews.routes');
const messagesRoutes = require('./modules/messages/messages.routes');
const paymentsRoutes = require('./modules/payments/payments.routes');
const adminRoutes = require('./modules/admin/admin.routes');

const app = express();

// Trust the first hop proxy (load balancer / reverse proxy) in production
// so `req.ip` and the `Secure` cookie flag reflect the real client instead
// of the proxy — see rateLimiter.middleware.js's comment on why this
// matters for IP-keyed rate limiting specifically. It also has to be set
// when running behind an ngrok tunnel in development, for the same reason.
if (env.isProduction || process.env.NGROK === 'true') app.set('trust proxy', 1);

// A free ngrok tunnel gets a fresh random subdomain every time it's
// restarted, which would otherwise mean editing CORS_ORIGINS by hand each
// dev session. Outside of production, any *.ngrok-free.app / *.ngrok.app /
// *.ngrok.io / *.ngrok.dev origin is allowed on top of the explicit
// CORS_ORIGINS list — safe here because it's gated behind NODE_ENV, and a
// tunnel URL is only ever reachable by whoever the developer shared it
// with anyway. See docs/NGROK.md.
const NGROK_ORIGIN_PATTERNS = env.isProduction
  ? []
  : [
    /^https:\/\/[a-z0-9-]+\.ngrok-free\.app$/,
    /^https:\/\/[a-z0-9-]+\.ngrok\.app$/,
    /^https:\/\/[a-z0-9-]+\.ngrok\.io$/,
    /^https:\/\/[a-z0-9-]+\.ngrok\.dev$/,
  ];

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Native mobile fetch (iOS/Android), curl, and Postman typically send
      // no Origin header at all — CORS is a browser-enforced concept, so
      // there's nothing to check for these; only a browser context sends
      // an Origin the way a webview or Expo's web preview would.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      if (NGROK_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin))) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true, // the refresh-token cookie requires this
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(requestLogger);
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.status(200).json({ success: true, data: { status: 'ok' } }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/companies', companiesRoutes);
app.use('/api/v1/independents', independentsRoutes);
app.use('/api/v1/workers', workersRoutes);
app.use('/api/v1/bookings', bookingsRoutes);
app.use('/api/v1/notifications', notificationsRoutes);
app.use('/api/v1/reviews', reviewsRoutes);
app.use('/api/v1/conversations', messagesRoutes);
app.use('/api/v1/payments', paymentsRoutes);
app.use('/api/v1/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
