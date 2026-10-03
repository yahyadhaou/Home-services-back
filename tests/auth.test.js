const request = require('supertest');
const { app, loginAs, SEED_PASSWORD } = require('./helpers/auth');

const uniqueEmail = () => `test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;

describe('POST /auth/register', () => {
  it('registers a new client and returns usable tokens', async () => {
    const email = uniqueEmail();
    const res = await request(app).post('/api/v1/auth/register').send({
      role: 'client', email, password: 'Passw0rd!', firstName: 'Test', lastName: 'User',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(email.toLowerCase());
    // passwordHash must never round-trip to the client (User model's defaultScope).
    expect(res.body.data.user.passwordHash).toBeUndefined();

    // The returned access token must actually work.
    const meRes = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.email).toBe(email.toLowerCase());
  });

  it('rejects a password that fails the complexity rule', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      role: 'client', email: uniqueEmail(), password: 'alllowercase1', firstName: 'Test', lastName: 'User',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate email with 409', async () => {
    const email = uniqueEmail();
    const payload = {
      role: 'client', email, password: 'Passw0rd!', firstName: 'Test', lastName: 'User',
    };
    const first = await request(app).post('/api/v1/auth/register').send(payload);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/auth/register').send(payload);
    expect(second.status).toBe(409);
  });
});

describe('POST /auth/login', () => {
  it('logs in a seeded client with the correct password', async () => {
    const { token, user } = await loginAs('client');
    expect(token).toBeTruthy();
    expect(user.role).toBe('client');
  });

  it('rejects a wrong password with a generic message (no account-existence leak)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'anna.schmidt@example.com', password: 'WrongPassword1' });
    expect(res.status).toBe(401);
    const wrongPasswordMessage = res.body.error.message;

    const res2 = await request(app).post('/api/v1/auth/login').send({ email: 'no-such-account@example.com', password: SEED_PASSWORD });
    expect(res2.status).toBe(401);
    // Per docs/SECURITY.md: "no such account" and "wrong password" must be indistinguishable.
    expect(res2.body.error.message).toBe(wrongPasswordMessage);
  });
});

describe('GET /auth/me', () => {
  it('requires authentication', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});
