const { loginAs, authed, findNotification } = require('./helpers/auth');

describe('Booking lifecycle: client books → manager notified/assigns → worker completes → client notified', () => {
  let client;
  let manager;
  let worker;
  let companyId;
  let workerId;
  let bookingId;

  beforeAll(async () => {
    client = await loginAs('client');
    manager = await loginAs('manager');
    worker = await loginAs('worker');

    const companyRes = await authed(manager.token)('get', '/api/v1/companies/me/profile');
    expect(companyRes.status).toBe(200);
    companyId = companyRes.body.data.company.id;

    const workerRes = await authed(worker.token)('get', '/api/v1/workers/me');
    expect(workerRes.status).toBe(200);
    workerId = workerRes.body.data.worker.id;
  });

  it('client creates a booking against a real company', async () => {
    const res = await authed(client.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner',
      serviceLabel: 'Integration test booking',
      providerType: 'company',
      companyId,
      clientPhone: '+49 201 0000000',
      addressStreet: 'Teststraße 1',
      addressPostalCode: '45131',
      addressCity: 'Essen',
      scheduledDate: '2027-01-15',
      scheduledTime: '10:00',
      priceGross: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.booking.status).toBe('pending');
    expect(res.body.data.booking.pricing.priceGross).toBe(100);
    // Server computes the fee/net split — never trusts a client-supplied value.
    expect(res.body.data.booking.pricing.providerEarningNet).toBeCloseTo(88, 1);
    bookingId = res.body.data.booking.id;
  });

  it('rejects a client trying to create a booking without a valid provider reference', async () => {
    const res = await authed(client.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner', serviceLabel: 'x', providerType: 'company',
      addressStreet: 'x', addressPostalCode: '12345', addressCity: 'x',
      scheduledDate: '2027-01-15', scheduledTime: '10:00', priceGross: 50,
    });
    expect(res.status).toBe(400);
  });

  it('the manager sees the new booking in their list, and gets a notification', async () => {
    const listRes = await authed(manager.token)('get', '/api/v1/bookings');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((b) => b.id === bookingId)).toBe(true);

    const notif = await findNotification(manager.token, { relatedBookingId: bookingId, type: 'new_job' });
    expect(notif).toBeTruthy();
  });

  it('a worker cannot see a booking that is not theirs yet', async () => {
    const res = await authed(worker.token)('get', `/api/v1/bookings/${bookingId}`);
    // 404, not 403 — see docs/SECURITY.md's "don't leak existence" rule.
    expect(res.status).toBe(404);
  });

  it('the manager assigns the worker, who is then notified', async () => {
    const res = await authed(manager.token)('patch', `/api/v1/bookings/${bookingId}/assign`).send({ workerId });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.assignedWorker.id).toBe(workerId);

    const notif = await findNotification(worker.token, { relatedBookingId: bookingId, type: 'job_assigned' });
    expect(notif).toBeTruthy();
  });

  it('only a manager can assign a worker, not the worker themselves', async () => {
    const res = await authed(worker.token)('patch', `/api/v1/bookings/${bookingId}/assign`).send({ workerId });
    expect(res.status).toBe(403);
  });

  it('the assigned worker can now see the booking', async () => {
    const getRes = await authed(worker.token)('get', `/api/v1/bookings/${bookingId}`);
    expect(getRes.status).toBe(200);
  });

  it('the manager confirms the booking (pending → upcoming) before any work can start', async () => {
    const res = await authed(manager.token)('post', `/api/v1/bookings/${bookingId}/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('upcoming');
  });

  it('the worker starts the job (upcoming → in_progress)', async () => {
    const startRes = await authed(worker.token)('patch', `/api/v1/bookings/${bookingId}/status`).send({ statusCode: 'in_progress' });
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.booking.status).toBe('in_progress');
  });

  it('the worker submits a completion report, which completes the job and notifies both the client and the manager', async () => {
    const res = await authed(worker.token)('post', `/api/v1/bookings/${bookingId}/report`).send({
      materialsUsed: [{ name: 'Dichtungsring', qty: 2, unit: 'Stk.' }],
      remarks: 'Integration test remarks',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.booking.status).toBe('completed');

    const clientNotif = await findNotification(client.token, { relatedBookingId: bookingId, type: 'report_submitted' });
    expect(clientNotif).toBeTruthy();

    const managerNotif = await findNotification(manager.token, { relatedBookingId: bookingId, type: 'report_submitted' });
    expect(managerNotif).toBeTruthy();
  });

  it('a completed booking cannot be cancelled', async () => {
    const res = await authed(client.token)('post', `/api/v1/bookings/${bookingId}/cancel`).send({});
    expect(res.status).toBe(409);
  });
});
