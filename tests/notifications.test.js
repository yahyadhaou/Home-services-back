const { loginAs, authed, findNotification } = require('./helpers/auth');

describe('Notifications — list, unread count, mark read', () => {
  let client;
  let manager;
  let companyId;

  beforeAll(async () => {
    client = await loginAs('client');
    manager = await loginAs('manager');
    const companyRes = await authed(manager.token)('get', '/api/v1/companies/me/profile');
    companyId = companyRes.body.data.company.id;
  });

  it('creating a booking generates exactly one new unread notification for the manager', async () => {
    const before = await authed(manager.token)('get', '/api/v1/notifications/unread-count');
    const beforeCount = before.body.data.count;

    await authed(client.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner', serviceLabel: 'Notification test', providerType: 'company', companyId,
      clientPhone: '+49 201 3333333', addressStreet: 'x', addressPostalCode: '12345', addressCity: 'x',
      scheduledDate: '2027-01-28', scheduledTime: '10:00', priceGross: 70,
    });

    const after = await authed(manager.token)('get', '/api/v1/notifications/unread-count');
    expect(after.body.data.count).toBe(beforeCount + 1);
  });

  it('marking a single notification read decreases the unread count by one', async () => {
    // Deterministic setup, not "whatever happens to be latest" — a second
    // test run (or another test file interleaving within the same
    // DATETIME-precision second) makes "latest" ambiguous.
    const bookingRes = await authed(client.token)('post', '/api/v1/bookings').send({
      categoryCode: 'klempner', serviceLabel: 'Mark-read test', providerType: 'company', companyId,
      clientPhone: '+49 201 4444444', addressStreet: 'x', addressPostalCode: '12345', addressCity: 'x',
      scheduledDate: '2027-01-29', scheduledTime: '10:00', priceGross: 55,
    });
    const bookingId = bookingRes.body.data.booking.id;
    const notif = await findNotification(manager.token, { relatedBookingId: bookingId, type: 'new_job' });
    expect(notif.isRead).toBe(false);

    const before = await authed(manager.token)('get', '/api/v1/notifications/unread-count');
    const markRes = await authed(manager.token)('patch', `/api/v1/notifications/${notif.id}/read`);
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.notification.isRead).toBe(true);

    const after = await authed(manager.token)('get', '/api/v1/notifications/unread-count');
    expect(after.body.data.count).toBe(before.body.data.count - 1);
  });

  it('mark-all-read zeroes the unread count', async () => {
    const res = await authed(manager.token)('patch', '/api/v1/notifications/read-all');
    expect(res.status).toBe(204);

    const after = await authed(manager.token)('get', '/api/v1/notifications/unread-count');
    expect(after.body.data.count).toBe(0);
  });

  it('a manager cannot read another company/manager\'s notification by uuid', async () => {
    const clientNotifRes = await authed(client.token)('get', '/api/v1/notifications?limit=1');
    if (clientNotifRes.body.data.length === 0) return; // nothing to assert against on a fresh account
    const clientNotifId = clientNotifRes.body.data[0].id;
    const res = await authed(manager.token)('patch', `/api/v1/notifications/${clientNotifId}/read`);
    expect(res.status).toBe(404);
  });
});
