/**
 * Shared login helper for tests — every seeded account uses the same
 * password (see db/seed.sql's header comment).
 */
const request = require('supertest');
const app = require('../../src/app');

const SEED_PASSWORD = 'Passw0rd!';

const SEEDED = {
  client: 'anna.schmidt@example.com',
  manager: 'klaus.weber@ruettenscheider-sanitaer.de',
  worker: 'michael.braun@ruettenscheider-sanitaer.de',
  independent: 'max@musterfirma.de',
};

/** Returns { token, user } for a seeded role, or any email/password pair. */
const loginAs = async (emailOrRole, password = SEED_PASSWORD) => {
  const email = SEEDED[emailOrRole] || emailOrRole;
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`loginAs(${emailOrRole}) failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.data.accessToken, user: res.body.data.user };
};

const authed = (token) => (method, path) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

// "Just fetch the latest notification" is flaky under repeated test runs —
// MySQL DATETIME is second-precision, and it's easy for two notifications
// (from this test and some other test file) to land in the same second,
// making "latest" ambiguous. Searching a wider page for the one that
// actually matches this test's booking is deterministic regardless of
// what else has run before it.
const findNotification = async (token, { relatedBookingId, type }) => {
  const res = await authed(token)('get', '/api/v1/notifications?limit=50');
  return res.body.data.find((n) => n.relatedBookingId === relatedBookingId && (!type || n.type === type));
};

module.exports = {
  app, SEED_PASSWORD, SEEDED, loginAs, authed, findNotification,
};
