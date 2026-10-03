const request = require('supertest');
const { app, loginAs, authed } = require('./helpers/auth');

describe('POST /conversations — booking ownership check', () => {
  let clientA;
  let clientB;
  let companyId;
  let clientBBookingId;

  beforeAll(async () => {
    clientA = await loginAs('client'); // anna.schmidt@example.com
    // A second, disposable client so there's a real booking that does NOT
    // belong to clientA to attempt to attach.
    const email = `test.clientb.${Date.now()}@example.com`;
    const registerRes = await request(app).post('/api/v1/auth/register').send({
      role: 'client', email, password: 'Passw0rd!', firstName: 'Client', lastName: 'B',
    });
    clientB = { token: registerRes.body.data.accessToken };

    const manager = await loginAs('manager');
    const companyRes = await authed(manager.token)('get', '/api/v1/companies/me/profile');
    companyId = companyRes.body.data.company.id;

    const bookingRes = await authed(clientB.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner', serviceLabel: 'Client B booking', providerType: 'company', companyId,
      clientPhone: '+49 201 1111111', addressStreet: 'x', addressPostalCode: '12345', addressCity: 'x',
      scheduledDate: '2027-01-20', scheduledTime: '10:00', priceGross: 60,
    });
    clientBBookingId = bookingRes.body.data.booking.id;
  });

  it('rejects attaching a booking that belongs to a different client (regression test)', async () => {
    const res = await authed(clientA.token)('post', '/api/v1/conversations').send({
      providerType: 'company', companyId, bookingId: clientBBookingId,
    });
    expect(res.status).toBe(404);
  });

  it('allows attaching a booking the caller actually owns', async () => {
    const res = await authed(clientB.token)('post', '/api/v1/conversations').send({
      providerType: 'company', companyId, bookingId: clientBBookingId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.conversation.bookingId).toBe(clientBBookingId);
  });
});
