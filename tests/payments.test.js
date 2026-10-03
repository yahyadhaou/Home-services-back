const { loginAs, authed } = require('./helpers/auth');

describe('Payments — simulated processor, real for cash', () => {
  let client;
  let companyId;

  const createTestBooking = async () => {
    const res = await authed(client.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner', serviceLabel: 'Payment test', providerType: 'company', companyId,
      clientPhone: '+49 201 2222222', addressStreet: 'x', addressPostalCode: '12345', addressCity: 'x',
      scheduledDate: '2027-01-25', scheduledTime: '10:00', priceGross: 90,
    });
    return res.body.data.booking.id;
  };

  beforeAll(async () => {
    client = await loginAs('client');
    const manager = await loginAs('manager');
    const companyRes = await authed(manager.token)('get', '/api/v1/companies/me/profile');
    companyId = companyRes.body.data.company.id;
  });

  it('a card/apple_pay/google_pay charge simulates immediate success', async () => {
    const bookingId = await createTestBooking();
    const res = await authed(client.token)('post', '/api/v1/payments').send({ bookingId, method: 'google_pay' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ status: 'succeeded', method: 'google_pay', amountGross: 90 });
    expect(res.body.data.payment.processedAt).toBeTruthy();
  });

  it('cash is recorded as pending, not simulated as paid', async () => {
    const bookingId = await createTestBooking();
    const res = await authed(client.token)('post', '/api/v1/payments').send({ bookingId, method: 'cash' });
    expect(res.status).toBe(201);
    expect(res.body.data.payment).toMatchObject({ status: 'pending', method: 'cash' });
    expect(res.body.data.payment.processedAt).toBeNull();
  });

  it('rejects a payment with neither a saved method nor a one-off method', async () => {
    const bookingId = await createTestBooking();
    const res = await authed(client.token)('post', '/api/v1/payments').send({ bookingId });
    expect(res.status).toBe(400);
  });

  it('a booking cannot be paid twice once succeeded', async () => {
    const bookingId = await createTestBooking();
    const first = await authed(client.token)('post', '/api/v1/payments').send({ bookingId, method: 'card' });
    expect(first.status).toBe(201);
    const second = await authed(client.token)('post', '/api/v1/payments').send({ bookingId, method: 'card' });
    expect(second.status).toBe(409);
  });

  it('only the paying client can create a payment, not the provider', async () => {
    const bookingId = await createTestBooking();
    const manager = await loginAs('manager');
    const res = await authed(manager.token)('post', '/api/v1/payments').send({ bookingId, method: 'card' });
    expect(res.status).toBe(403);
  });
});
