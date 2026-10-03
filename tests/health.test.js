const request = require('supertest');
const { app } = require('./helpers/auth');

describe('GET /health', () => {
  it('responds ok with no auth required', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
  });
});
