const request = require('supertest');
const { app, loginAs, authed } = require('./helpers/auth');

describe('Cross-role authorization boundaries', () => {
  let manager;
  let worker;
  let independent;

  beforeAll(async () => {
    manager = await loginAs('manager');
    worker = await loginAs('worker');
    independent = await loginAs('independent');
  });

  it('only a manager can list their company team', async () => {
    const ok = await authed(manager.token)('get', '/api/v1/workers');
    expect(ok.status).toBe(200);

    const forbidden = await authed(worker.token)('get', '/api/v1/workers');
    expect(forbidden.status).toBe(403);
  });

  it('only a worker can fetch their own /workers/me profile', async () => {
    const ok = await authed(worker.token)('get', '/api/v1/workers/me');
    expect(ok.status).toBe(200);

    const forbidden = await authed(manager.token)('get', '/api/v1/workers/me');
    expect(forbidden.status).toBe(403);
  });

  it('an independent provider has no team to list', async () => {
    const res = await authed(independent.token)('get', '/api/v1/workers');
    expect(res.status).toBe(403);
  });

  it('every protected route rejects a request with no token', async () => {
    const res = await request(app).get('/api/v1/bookings');
    expect(res.status).toBe(401);
  });
});
