-- =============================================================================
-- HomeService Platform — Seed Data
-- =============================================================================
-- Converts the mock data hand-built into both React Native apps
-- (home-services-app's src/services/providerService.js MOCK_PROVIDERS,
-- home-services-company-app's src/data/mockWorkers.js, mockJobs.js and
-- mockNotifications.js) into real, referentially-correct rows — this is
-- the same data that has been on screen throughout development, now
-- living in MySQL instead of a JS array.
--
-- Run after schema.sql:
--   npm run db:reset   (creates the schema, then loads this file)
--
-- Login for every seeded user (client, managers, workers, independents,
-- admin alike): password "Passw0rd!" — every row below shares one
-- pre-computed argon2id hash purely to make the seed data usable for
-- manual testing. Never do this in a real environment; a production
-- signup always hashes a password the user actually chose.
--
-- Covers all 29 tables except three that are deliberately left empty:
--   * refresh_tokens / password_reset_tokens / audit_logs — runtime-only
--     tables written by the app as it's used; there is nothing meaningful
--     to pre-populate before a single request has ever been made.
--
-- Also deliberately NOT seeded:
--   * iban_encrypted / bic / bank_name on companies & independent_providers
--     — encryption requires the running app's FIELD_ENCRYPTION_KEY; add
--     real payout details after seeding via PATCH /companies/me/profile
--     or /independents/me/profile, never by hand-writing ciphertext here.
--   * Umzug-specific fields from the mock (vehicle, maxVolume, crew,
--     insured, longHaulCapable) — these describe a moving company's
--     fleet, a concern this schema doesn't yet model (see DATABASE.md's
--     "future extensions" section for the `provider_vehicles` proposal).
--
-- Scope: 24 marketplace providers (12 companies, 12 independents) across
-- 10 categories, ~15 workers, 47 bookings spanning every status, their
-- completion reports/photos, verification documents for every approved
-- provider, ~10 reviews, a few chat threads, and simulated payments for
-- every completed booking.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Every seeded user's password is "Passw0rd!" — see header comment.
SET @seed_password_hash = '$argon2id$v=19$m=19456,t=2,p=1$bG6uMh3g/D+lRYKoHrPJHQ$hNIT2KdpkojE8XbEmzxED08ruTGCALBh48MTIqbkzhY';

-- =============================================================================
-- SECTION 1 — LOOKUP TABLES
-- =============================================================================
-- These `code` values are the single source of truth mirrored in
-- src/config/constants.js — keep the two in sync by hand if either changes.

INSERT INTO roles (code, name, description) VALUES
  ('client',                'Client',                'A customer who books services on the marketplace.'),
  ('company_manager',       'Company Manager',        'Represents and manages a registered company partner.'),
  ('company_worker',        'Company Worker',          'An employee of a company partner, assigned to jobs.'),
  ('independent_provider',  'Independent Provider',    'A solo, self-employed provider.'),
  ('admin',                 'Admin',                   'Platform staff — onboarding review, support, moderation.');

INSERT INTO categories (code, name_de, name_en, icon, sort_order) VALUES
  ('klempner',          'Klempner',          'Plumber',                    'water-outline',           10),
  ('elektriker',        'Elektriker',        'Electrician',                'flash-outline',           20),
  ('reinigung',         'Reinigung',         'Cleaning',                   'sparkles-outline',        30),
  ('heizung',           'Heizung',           'Heating',                    'thermometer-outline',     40),
  ('maler',             'Maler',             'Painter',                    'color-palette-outline',   50),
  ('schreiner',         'Schreiner',         'Carpenter',                  'hammer-outline',          60),
  ('gaertner',          'Gärtner',           'Gardener',                   'leaf-outline',            70),
  ('handwerker',        'Handwerker',        'Handyman',                   'construct-outline',       80),
  ('internettechniker', 'Internettechniker', 'IT / Network Technician',   'wifi-outline',            90),
  ('umzug',             'Umzug',             'Relocation',                 'car-outline',            100);

INSERT INTO legal_forms (code, name_de, name_en, requires_commercial_register) VALUES
  ('gmbh',              'GmbH',              'Limited liability company',                     TRUE),
  ('ug',                'UG',                'Entrepreneurial company (limited liability)',   TRUE),
  ('ag',                'AG',                'Stock corporation',                             TRUE),
  ('ohg',               'OHG',               'General partnership',                           TRUE),
  ('kg',                'KG',                'Limited partnership',                           TRUE),
  ('ek',                'e.K.',              'Registered merchant',                           TRUE),
  ('gbr',               'GbR',               'Civil law partnership',                         FALSE),
  ('einzelunternehmen', 'Einzelunternehmen', 'Sole proprietorship',                            FALSE),
  ('sonstige',          'Sonstige',          'Other legal form',                              FALSE);

INSERT INTO booking_statuses (code, name_de, name_en, sort_order) VALUES
  ('pending',     'Ausstehend',       'Pending',      10),
  ('upcoming',    'Bevorstehend',     'Upcoming',     20),
  ('in_progress', 'In Bearbeitung',   'In progress',  30),
  ('completed',   'Abgeschlossen',    'Completed',    40),
  ('cancelled',   'Storniert',        'Cancelled',    50);

INSERT INTO application_statuses (code, name_de, name_en) VALUES
  ('draft',    'Entwurf',              'Draft'),
  ('pending',  'In Prüfung',           'Pending review'),
  ('approved', 'Genehmigt',            'Approved'),
  ('rejected', 'Abgelehnt',            'Rejected');

INSERT INTO document_types (code, name_de, name_en) VALUES
  ('gewerbeanmeldung',       'Gewerbeanmeldung',        'Trade registration'),
  ('handelsregisterauszug',  'Handelsregisterauszug',   'Commercial register extract'),
  ('ausweis',                'Ausweis',                 'Photo ID');

INSERT INTO notification_types (code, description) VALUES
  ('job_assigned',           'A job has been assigned to a worker.'),
  ('report_reminder',        'Reminder that a completion report is still due.'),
  ('payout',                 'A payout has been initiated.'),
  ('job_upcoming_reminder',  'Reminder that a job is coming up soon.'),
  ('report_submitted',       'A worker has submitted a completion report.'),
  ('new_job',                'A new job was created.'),
  ('worker_unavailable',     'A worker marked themselves unavailable.'),
  ('booking_cancelled',      'A booking was cancelled.'),
  ('review_received',        'A provider received a new review.');

-- =============================================================================
-- SECTION 2 — USERS
-- =============================================================================
-- Every account that can log in: the platform admin, the demo client
-- (Anna Schmidt — her four bookings are home-services-app's
-- MyBookingsScreen MOCK data), the Rüttenscheider Sanitärtechnik GmbH team
-- (home-services-company-app's mockWorkers.js), every other provider from
-- MOCK_PROVIDERS, and one account per distinct client name appearing in
-- mockJobs.js's job records.

-- --- Platform admin ---
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, 'admin@homeservices-business.de', @seed_password_hash, 'Admin', 'Support', '+49 201 5599000', TRUE, NOW()
FROM roles r WHERE r.code = 'admin';

-- --- Demo client (home-services-app) ---
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, 'anna.schmidt@example.com', @seed_password_hash, 'Anna', 'Schmidt', '+49 201 5501234', TRUE, NOW()
FROM roles r WHERE r.code = 'client';

-- --- Rüttenscheider Sanitärtechnik GmbH team (mockWorkers.js) ---
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at, created_at)
SELECT UUID(), r.id, 'klaus.weber@ruettenscheider-sanitaer.de', @seed_password_hash, 'Klaus', 'Weber', '+49 201 1234567', TRUE, NOW(), '2019-03-01 09:00:00'
FROM roles r WHERE r.code = 'company_manager';

INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at, created_at)
SELECT UUID(), r.id, 'michael.braun@ruettenscheider-sanitaer.de', @seed_password_hash, 'Michael', 'Braun', '+49 201 2345678', TRUE, NOW(), '2021-06-15 09:00:00'
FROM roles r WHERE r.code = 'company_worker';

INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at, created_at)
SELECT UUID(), r.id, 'sercan.yildiz@ruettenscheider-sanitaer.de', @seed_password_hash, 'Sercan', 'Yıldız', '+49 201 3456789', TRUE, NOW(), '2022-02-10 09:00:00'
FROM roles r WHERE r.code = 'company_worker';

INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at, created_at)
SELECT UUID(), r.id, 'tobias.krueger@ruettenscheider-sanitaer.de', @seed_password_hash, 'Tobias', 'Krüger', '+49 201 4567890', TRUE, NOW(), '2023-09-01 09:00:00'
FROM roles r WHERE r.code = 'company_worker';

-- --- Independent provider Max Mustermann (mockWorkers.js) ---
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at, created_at)
SELECT UUID(), r.id, 'max@musterfirma.de', @seed_password_hash, 'Max', 'Mustermann', '+49 201 9998877', TRUE, NOW(), '2024-01-01 09:00:00'
FROM roles r WHERE r.code = 'independent_provider';

-- --- Every other provider from home-services-app's MOCK_PROVIDERS ---
-- Companies: one owner/manager account each.
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, x.email, @seed_password_hash, x.first_name, x.last_name, x.phone, TRUE, NOW()
FROM roles r,
(
  SELECT 'peter.krause@elektromeister-krause.de'  AS email, 'Peter'    AS first_name, 'Krause'    AS last_name, '+49 201 6001001' AS phone UNION ALL
  SELECT 'andreas.blank@blitzblank-reinigung.de',            'Andreas',            'Blank',                '+49 201 6001002' UNION ALL
  SELECT 'frank.ruhrmann@waermetechnik-ruhr.de',              'Frank',              'Ruhrmann',             '+49 201 6001003' UNION ALL
  SELECT 'stefan.farber@farbwerk-malerbetrieb.de',            'Stefan',             'Farber',               '+49 201 6001004' UNION ALL
  SELECT 'werner.holzmann@holz-handwerk-schreinerei.de',      'Werner',             'Holzmann',             '+49 201 6001005' UNION ALL
  SELECT 'juergen.gruen@gruenpuls-gartenservice.de',          'Jürgen',             'Grün',                 '+49 201 6001006' UNION ALL
  SELECT 'dieter.ruhrmann@ruhrpott-umzuege.de',                'Dieter',             'Ruhrmann',             '+49 201 6001007' UNION ALL
  SELECT 'sonja.rhein@rhein-ruhr-umzugsprofis.de',            'Sonja',              'Rhein',                '+49 201 6001008' UNION ALL
  SELECT 'kevin.west@westside-umzugsservice.de',              'Kevin',              'West',                 '+49 201 6001009' UNION ALL
  SELECT 'thomas.rundum@rundum-handwerksservice.de',          'Thomas',             'Rundum',               '+49 201 6001010' UNION ALL
  SELECT 'martina.netz@netzwerk-ruhr.de',                     'Martina',            'Netz',                 '+49 201 6001011'
) AS x
WHERE r.code = 'company_manager';

-- Independents: one self account each.
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, x.email, @seed_password_hash, x.first_name, x.last_name, x.phone, TRUE, NOW()
FROM roles r,
(
  SELECT 'jonas.vogt@web.de'      AS email, 'Jonas'    AS first_name, 'Vogt'      AS last_name, '+49 201 6002001' AS phone UNION ALL
  SELECT 'sabine.hoffmann@web.de',           'Sabine',              'Hoffmann',              '+49 201 6002002' UNION ALL
  SELECT 'aylin.yildiz@web.de',              'Aylin',               'Yildiz',                '+49 201 6002003' UNION ALL
  SELECT 'markus.bauer@web.de',              'Markus',              'Bauer',                 '+49 201 6002004' UNION ALL
  SELECT 'nadine.krueger@web.de',            'Nadine',              'Krüger',                '+49 201 6002005' UNION ALL
  SELECT 'tarek.aydin@web.de',               'Tarek',               'Aydin',                 '+49 201 6002006' UNION ALL
  SELECT 'lukas.fischer@web.de',             'Lukas',               'Fischer',               '+49 201 6002007' UNION ALL
  SELECT 'deniz.aksoy@web.de',               'Deniz',               'Aksoy',                 '+49 201 6002008' UNION ALL
  SELECT 'robin.schmitz@web.de',             'Robin',               'Schmitz',               '+49 201 6002009' UNION ALL
  SELECT 'ozan.celik@web.de',                'Ozan',                'Celik',                 '+49 201 6002010' UNION ALL
  SELECT 'fabian.nowak@web.de',              'Fabian',              'Nowak',                 '+49 201 6002011'
) AS x
WHERE r.code = 'independent_provider';

-- --- One client account per distinct client name in mockJobs.js ---
-- The honorific/collective prefix ("Herr" / "Frau" / "Familie") is stored
-- as first_name so first_name + ' ' + last_name reproduces the exact
-- client_name string snapshotted on each booking below.
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, x.email, @seed_password_hash, x.first_name, x.last_name, x.phone, TRUE, NOW()
FROM roles r,
(
  SELECT 'familie.weber@example.com'      AS email, 'Familie' AS first_name, 'Weber'   AS last_name, '+49 201 5551234' AS phone UNION ALL
  SELECT 'herr.kaya@example.com',                    'Herr',               'Kaya',                '+49 201 5552234' UNION ALL
  SELECT 'frau.nowak@example.com',                   'Frau',               'Nowak',               '+49 201 5553234' UNION ALL
  SELECT 'herr.yilmaz@example.com',                  'Herr',               'Yilmaz',              '+49 201 5554234' UNION ALL
  SELECT 'familie.schulz@example.com',               'Familie',            'Schulz',              '+49 201 5555234' UNION ALL
  SELECT 'herr.aydin@example.com',                   'Herr',               'Aydin',               '+49 201 5556234' UNION ALL
  SELECT 'frau.krueger.client@example.com',          'Frau',               'Krüger',              '+49 201 5557234' UNION ALL
  SELECT 'herr.celik.client@example.com',            'Herr',               'Celik',               '+49 201 5558234' UNION ALL
  SELECT 'familie.bauer@example.com',                'Familie',            'Bauer',               '+49 201 5559234' UNION ALL
  SELECT 'frau.hoffmann.client@example.com',         'Frau',               'Hoffmann',            '+49 201 5560234' UNION ALL
  SELECT 'herr.fischer.client@example.com',          'Herr',               'Fischer',             '+49 201 5561234' UNION ALL
  SELECT 'familie.schmitz.client@example.com',       'Familie',            'Schmitz',             '+49 201 5562234' UNION ALL
  SELECT 'herr.aksoy.client@example.com',            'Herr',               'Aksoy',               '+49 201 5563234' UNION ALL
  SELECT 'frau.klein@example.com',                   'Frau',               'Klein',               '+49 201 5571234' UNION ALL
  SELECT 'herr.demir@example.com',                   'Herr',               'Demir',               '+49 201 5572234' UNION ALL
  SELECT 'familie.roth@example.com',                 'Familie',            'Roth',                '+49 201 5573234' UNION ALL
  SELECT 'herr.vogel@example.com',                   'Herr',               'Vogel',               '+49 201 5574234' UNION ALL
  SELECT 'frau.lange@example.com',                   'Frau',               'Lange',               '+49 201 5575234'
) AS x
WHERE r.code = 'client';

-- --- Additional workers, spread across other companies (richer team/job data) ---
INSERT INTO users (uuid, role_id, email, password_hash, first_name, last_name, phone, is_active, email_verified_at)
SELECT UUID(), r.id, x.email, @seed_password_hash, x.first_name, x.last_name, x.phone, TRUE, NOW()
FROM roles r,
(
  SELECT 'sabine.roth@elektromeister-krause.de'         AS email, 'Sabine'    AS first_name, 'Roth'      AS last_name, '+49 201 6003001' AS phone UNION ALL
  SELECT 'uwe.fink@elektromeister-krause.de',                      'Uwe',                 'Fink',                 '+49 201 6003002' UNION ALL
  SELECT 'elif.aydemir@blitzblank-reinigung.de',                    'Elif',                'Aydemir',              '+49 201 6003003' UNION ALL
  SELECT 'boris.wagner@blitzblank-reinigung.de',                    'Boris',               'Wagner',               '+49 201 6003004' UNION ALL
  SELECT 'matthias.vogt@waermetechnik-ruhr.de',                     'Matthias',            'Vogt',                 '+49 201 6003005' UNION ALL
  SELECT 'katrin.berg@farbwerk-malerbetrieb.de',                    'Katrin',              'Berg',                 '+49 201 6003006' UNION ALL
  SELECT 'simon.brandt@holz-handwerk-schreinerei.de',               'Simon',               'Brandt',               '+49 201 6003007' UNION ALL
  SELECT 'kevin.haas@ruhrpott-umzuege.de',                          'Kevin',               'Haas',                 '+49 201 6003008' UNION ALL
  SELECT 'daniel.krause@ruhrpott-umzuege.de',                       'Daniel',              'Krause',               '+49 201 6003009' UNION ALL
  SELECT 'nils.schroeder@rundum-handwerksservice.de',               'Nils',                'Schröder',             '+49 201 6003010' UNION ALL
  SELECT 'timo.lang@rundum-handwerksservice.de',                    'Timo',                'Lang',                 '+49 201 6003011' UNION ALL
  SELECT 'julia.peters@netzwerk-ruhr.de',                           'Julia',               'Peters',               '+49 201 6003012'
) AS x
WHERE r.code = 'company_worker';

-- =============================================================================
-- SECTION 3 — CLIENT PROFILES (addresses, saved cards)
-- =============================================================================

INSERT INTO addresses (uuid, user_id, label, street, postal_code, city, country, phone, is_default)
SELECT UUID(), u.id, 'Zuhause', 'Rüttenscheider Straße 142', '45131', 'Essen', 'DE', u.phone, TRUE
FROM users u WHERE u.email = 'anna.schmidt@example.com';

-- A few more clients get a saved address too, so addresses/client_profiles
-- aren't a single-row table.
INSERT INTO addresses (uuid, user_id, label, street, postal_code, city, country, phone, is_default)
SELECT UUID(), u.id, 'Zuhause', x.street, x.postal_code, 'Essen', 'DE', u.phone, TRUE
FROM (
  SELECT 'familie.weber@example.com' AS email, 'Girardetstraße 12'  AS street, '45131' AS postal_code UNION ALL
  SELECT 'herr.kaya@example.com',                'Alfredstraße 40',              '45130' UNION ALL
  SELECT 'frau.klein@example.com',                'Witteringstraße 22',           '45130' UNION ALL
  SELECT 'herr.vogel@example.com',                'Kastanienallee 17',            '45138'
) AS x
JOIN users u ON u.email = x.email;

INSERT INTO client_profiles (user_id, default_address_id)
SELECT u.id, a.id
FROM users u JOIN addresses a ON a.user_id = u.id AND a.is_default = TRUE
WHERE u.email IN (
  'anna.schmidt@example.com', 'familie.weber@example.com', 'herr.kaya@example.com', 'frau.klein@example.com', 'herr.vogel@example.com'
);

-- Placeholder cards — tokenized references only, see models/PaymentMethod.js.
INSERT INTO payment_methods (uuid, user_id, type, psp_payment_method_id, brand, last4, exp_month, exp_year, is_default)
SELECT UUID(), u.id, 'card', 'sim_pm_anna_visa', 'visa', '4242', 11, 2028, TRUE
FROM users u WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO payment_methods (uuid, user_id, type, psp_payment_method_id, brand, last4, exp_month, exp_year, is_default)
SELECT UUID(), u.id, x.type, x.psp_id, x.brand, x.last4, x.exp_month, x.exp_year, TRUE
FROM (
  SELECT 'familie.weber@example.com' AS email, 'card'      AS type, 'sim_pm_weber_mc'  AS psp_id, 'mastercard' AS brand, '5544' AS last4, 3    AS exp_month, 2027 AS exp_year UNION ALL
  SELECT 'herr.kaya@example.com',                'card',              'sim_pm_kaya_visa',           'visa',                 '1881',            7,               2029             UNION ALL
  SELECT 'frau.klein@example.com',                'apple_pay',         'sim_pm_klein_ap',            NULL,                   NULL,              NULL,            NULL             UNION ALL
  SELECT 'herr.vogel@example.com',                'card',              'sim_pm_vogel_visa',          'visa',                 '2077',            9,               2026
) AS x
JOIN users u ON u.email = x.email;

-- =============================================================================
-- SECTION 4 — COMPANIES
-- =============================================================================

-- latitude/longitude are approximate Essen district centers (not
-- pinpoint-geocoded addresses) — good enough to power a real "distance
-- from me" sort/display without depending on an external geocoding
-- service for seed data. hourly_rate_from reuses the exact figures from
-- home-services-app's original MOCK_PROVIDERS so the numbers a tester
-- already knows keep meaning the same thing.
INSERT INTO companies (uuid, owner_user_id, legal_name, legal_form_id, street, postal_code, city, latitude, longitude, hourly_rate_from, representative_name, representative_email, representative_phone, tax_number, vat_id, application_status_id, submitted_at, approved_at)
SELECT UUID(), u.id, 'Rüttenscheider Sanitärtechnik GmbH', lf.id, 'Rüttenscheider Straße 88', '45131', 'Essen', 51.4372000, 7.0138000, 68.00, 'Klaus Weber', u.email, u.phone, '5123/5987/6001', 'DE123456789', ast.id, '2019-02-15 09:00:00', '2019-03-01 09:00:00'
FROM users u, legal_forms lf, application_statuses ast
WHERE u.email = 'klaus.weber@ruettenscheider-sanitaer.de' AND lf.code = 'gmbh' AND ast.code = 'approved';

INSERT INTO companies (uuid, owner_user_id, legal_name, legal_form_id, street, postal_code, city, latitude, longitude, hourly_rate_from, representative_name, representative_email, representative_phone, tax_number, vat_id, application_status_id, submitted_at, approved_at)
SELECT UUID(), u.id, x.legal_name, lf.id, x.street, x.postal_code, 'Essen', x.latitude, x.longitude, x.hourly_rate_from, CONCAT(u.first_name, ' ', u.last_name), u.email, u.phone, x.tax_number, x.vat_id, ast.id, '2023-01-10 09:00:00', '2023-01-20 09:00:00'
FROM legal_forms lf, application_statuses ast,
(
  SELECT 'peter.krause@elektromeister-krause.de' AS owner_email, 'ElektroMeister Krause GmbH' AS legal_name, 'Holsterhauser Straße 55' AS street, '45147' AS postal_code, 51.4453000 AS latitude, 6.9917000 AS longitude, 72.00 AS hourly_rate_from, '5124/6001/7002' AS tax_number, 'DE123456790' AS vat_id UNION ALL
  SELECT 'andreas.blank@blitzblank-reinigung.de',      'Blitzblank Gebäudereinigung GmbH', 'Frohnhauser Straße 130',   '45145', 51.4536000, 6.9718000, 35.00, '5125/6002/7003', 'DE123456791' UNION ALL
  SELECT 'frank.ruhrmann@waermetechnik-ruhr.de',       'Wärmetechnik Ruhr GmbH',           'Steeler Straße 210',       '45276', 51.4395000, 7.0868000, 75.00, '5126/6003/7004', 'DE123456792' UNION ALL
  SELECT 'stefan.farber@farbwerk-malerbetrieb.de',     'Farbwerk Malerbetrieb GmbH',       'Altendorfer Straße 76',    '45127', 51.4556000, 7.0116000, 39.00, '5127/6004/7005', 'DE123456793' UNION ALL
  SELECT 'werner.holzmann@holz-handwerk-schreinerei.de','Holz & Handwerk Schreinerei GmbH','Rüttenscheider Straße 220','45131', 51.4355000, 7.0210000, 58.00, '5128/6005/7006', 'DE123456794' UNION ALL
  SELECT 'juergen.gruen@gruenpuls-gartenservice.de',   'GrünPuls Gartenservice GmbH',      'Holsterhauser Straße 5',   '45147', 51.4440000, 6.9900000, 32.00, '5129/6006/7007', 'DE123456795' UNION ALL
  SELECT 'dieter.ruhrmann@ruhrpott-umzuege.de',        'Ruhrpott Umzüge GmbH',             'Steeler Straße 5',         '45276', 51.4380000, 7.0890000, 89.00, '5130/6007/7008', 'DE123456796' UNION ALL
  SELECT 'sonja.rhein@rhein-ruhr-umzugsprofis.de',     'Rhein-Ruhr Umzugsprofis GmbH',     'Rüttenscheider Straße 300','45131', 51.4340000, 7.0175000, 95.00, '5131/6008/7009', 'DE123456797' UNION ALL
  SELECT 'kevin.west@westside-umzugsservice.de',       'Westside Umzugsservice GmbH',      'Borbecker Straße 140',     '45355', 51.4675000, 6.9503000, 82.00, '5132/6009/7010', 'DE123456798' UNION ALL
  SELECT 'thomas.rundum@rundum-handwerksservice.de',   'Rundum Handwerksservice GmbH',     'Altendorfer Straße 40',    '45127', 51.4570000, 7.0130000, 44.00, '5133/6010/7011', 'DE123456799' UNION ALL
  SELECT 'martina.netz@netzwerk-ruhr.de',              'NetzWerk Ruhr GmbH',               'Rüttenscheider Straße 55', '45130', 51.4380000, 7.0140000, 62.00, '5134/6011/7012', 'DE123456800'
) AS x
JOIN users u ON u.email = x.owner_email
WHERE lf.code = 'gmbh' AND ast.code = 'approved';

-- Every approved company has verification documents on file — a company
-- with legal_forms.requires_commercial_register = TRUE (all seeded ones are
-- GmbH) needs both a Gewerbeanmeldung and a Handelsregisterauszug.
INSERT INTO company_documents (company_id, document_type_id, file_url, uploaded_at, verified_at, verified_by_user_id)
SELECT c.id, dt.id, CONCAT('https://storage.example.com/docs/', LOWER(REPLACE(REPLACE(c.legal_name, ' ', '-'), '&', 'und')), '-gewerbeanmeldung.pdf'), c.submitted_at, c.approved_at, admin.id
FROM companies c
JOIN document_types dt ON dt.code = 'gewerbeanmeldung'
JOIN users admin ON admin.email = 'admin@homeservices-business.de';

INSERT INTO company_documents (company_id, document_type_id, file_url, uploaded_at, verified_at, verified_by_user_id)
SELECT c.id, dt.id, CONCAT('https://storage.example.com/docs/', LOWER(REPLACE(REPLACE(c.legal_name, ' ', '-'), '&', 'und')), '-handelsregisterauszug.pdf'), c.submitted_at, c.approved_at, admin.id
FROM companies c
JOIN document_types dt ON dt.code = 'handelsregisterauszug'
JOIN users admin ON admin.email = 'admin@homeservices-business.de';

-- =============================================================================
-- SECTION 5 — INDEPENDENT PROVIDERS
-- =============================================================================

INSERT INTO independent_providers (uuid, user_id, business_name, legal_form_id, street, postal_code, city, latitude, longitude, hourly_rate_from, tax_number, application_status_id, submitted_at, approved_at, primary_category_id)
SELECT UUID(), u.id, CONCAT(u.first_name, ' ', u.last_name), lf.id, 'Rüttenscheider Straße 21', '45130', 'Essen', 51.4365000, 7.0100000, 40.00, '5150/1001/2001', ast.id, '2023-12-01 09:00:00', '2024-01-01 09:00:00', cat.id
FROM users u, legal_forms lf, application_statuses ast, categories cat
WHERE u.email = 'max@musterfirma.de' AND lf.code = 'einzelunternehmen' AND ast.code = 'approved' AND cat.code = 'klempner';

INSERT INTO independent_providers (uuid, user_id, business_name, legal_form_id, street, postal_code, city, latitude, longitude, hourly_rate_from, tax_number, application_status_id, submitted_at, approved_at, primary_category_id)
SELECT UUID(), u.id, CONCAT(u.first_name, ' ', u.last_name), lf.id, x.street, x.postal_code, 'Essen', x.latitude, x.longitude, x.hourly_rate_from, x.tax_number, ast.id, '2023-06-01 09:00:00', '2023-06-15 09:00:00', cat.id
FROM legal_forms lf, application_statuses ast,
(
  SELECT 'jonas.vogt@web.de'      AS owner_email, 'Alfredstraße 21'          AS street, '45130' AS postal_code, 51.4390000 AS latitude, 7.0155000 AS longitude, 42.00 AS hourly_rate_from, '5160/1002/2002' AS tax_number, 'klempner'          AS category_code UNION ALL
  SELECT 'sabine.hoffmann@web.de',                 'Lenbachstraße 14',                  '45147',              51.4470000,             6.9930000,              45.00,                    '5161/1003/2003',              'elektriker'         UNION ALL
  SELECT 'aylin.yildiz@web.de',                    'Frohnhauser Straße 47',             '45145',              51.4550000,             6.9700000,              24.00,                    '5162/1004/2004',              'reinigung'          UNION ALL
  SELECT 'markus.bauer@web.de',                    'Steeler Straße 64',                 '45276',              51.4410000,             7.0850000,              48.00,                    '5163/1005/2005',              'heizung'            UNION ALL
  SELECT 'nadine.krueger@web.de',                  'Altendorfer Straße 12',             '45127',              51.4540000,             7.0100000,              28.00,                    '5164/1006/2006',              'maler'              UNION ALL
  SELECT 'tarek.aydin@web.de',                     'Frohnhauser Straße 210',            '45145',              51.4520000,             6.9740000,              35.00,                    '5165/1007/2007',              'umzug'              UNION ALL
  SELECT 'lukas.fischer@web.de',                   'Holsterhauser Straße 90',           '45147',              51.4460000,             6.9950000,              30.00,                    '5166/1008/2008',              'umzug'              UNION ALL
  SELECT 'deniz.aksoy@web.de',                     'Alfredstraße 60',                   '45130',              51.4400000,             7.0120000,              38.00,                    '5167/1009/2009',              'umzug'              UNION ALL
  SELECT 'robin.schmitz@web.de',                   'Steeler Straße 30',                 '45276',              51.4420000,             7.0830000,              27.00,                    '5168/1010/2010',              'umzug'              UNION ALL
  SELECT 'ozan.celik@web.de',                      'Steeler Straße 88',                 '45276',              51.4400000,             7.0900000,              26.00,                    '5169/1011/2011',              'handwerker'         UNION ALL
  SELECT 'fabian.nowak@web.de',                    'Frohnhauser Straße 88',             '45145',              51.4545000,             6.9730000,              34.00,                    '5170/1012/2012',              'internettechniker'
) AS x
JOIN users u ON u.email = x.owner_email
JOIN categories cat ON cat.code = x.category_code
WHERE lf.code = 'einzelunternehmen' AND ast.code = 'approved';

-- Every approved independent has a Gewerbeanmeldung + Ausweis on file —
-- no Handelsregisterauszug, since an Einzelunternehmen doesn't have one.
INSERT INTO independent_provider_documents (independent_provider_id, document_type_id, file_url, uploaded_at, verified_at, verified_by_user_id)
SELECT ip.id, dt.id, CONCAT('https://storage.example.com/docs/', LOWER(REPLACE(ip.business_name, ' ', '-')), '-gewerbeanmeldung.pdf'), ip.submitted_at, ip.approved_at, admin.id
FROM independent_providers ip
JOIN document_types dt ON dt.code = 'gewerbeanmeldung'
JOIN users admin ON admin.email = 'admin@homeservices-business.de';

INSERT INTO independent_provider_documents (independent_provider_id, document_type_id, file_url, uploaded_at, verified_at, verified_by_user_id)
SELECT ip.id, dt.id, CONCAT('https://storage.example.com/docs/', LOWER(REPLACE(ip.business_name, ' ', '-')), '-ausweis.pdf'), ip.submitted_at, ip.approved_at, admin.id
FROM independent_providers ip
JOIN document_types dt ON dt.code = 'ausweis'
JOIN users admin ON admin.email = 'admin@homeservices-business.de';

-- =============================================================================
-- SECTION 6 — PROVIDER CATEGORIES
-- =============================================================================
-- Every seeded provider serves exactly the one category from its mock
-- listing — none of the mock data models a multi-trade provider.

INSERT INTO provider_categories (provider_type, company_id, category_id)
SELECT 'company', c.id, cat.id
FROM companies c
JOIN categories cat ON (
  (c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH' AND cat.code = 'klempner') OR
  (c.legal_name = 'ElektroMeister Krause GmbH' AND cat.code = 'elektriker') OR
  (c.legal_name = 'Blitzblank Gebäudereinigung GmbH' AND cat.code = 'reinigung') OR
  (c.legal_name = 'Wärmetechnik Ruhr GmbH' AND cat.code = 'heizung') OR
  (c.legal_name = 'Farbwerk Malerbetrieb GmbH' AND cat.code = 'maler') OR
  (c.legal_name = 'Holz & Handwerk Schreinerei GmbH' AND cat.code = 'schreiner') OR
  (c.legal_name = 'GrünPuls Gartenservice GmbH' AND cat.code = 'gaertner') OR
  (c.legal_name = 'Ruhrpott Umzüge GmbH' AND cat.code = 'umzug') OR
  (c.legal_name = 'Rhein-Ruhr Umzugsprofis GmbH' AND cat.code = 'umzug') OR
  (c.legal_name = 'Westside Umzugsservice GmbH' AND cat.code = 'umzug') OR
  (c.legal_name = 'Rundum Handwerksservice GmbH' AND cat.code = 'handwerker') OR
  (c.legal_name = 'NetzWerk Ruhr GmbH' AND cat.code = 'internettechniker')
);

INSERT INTO provider_categories (provider_type, independent_provider_id, category_id)
SELECT 'independent', ip.id, ip.primary_category_id
FROM independent_providers ip;

-- =============================================================================
-- SECTION 7 — WORKERS (Rüttenscheider Sanitärtechnik GmbH's team)
-- =============================================================================

INSERT INTO workers (uuid, user_id, company_id, specialty_category_id, is_available, joined_date)
SELECT UUID(), u.id, c.id, cat.id, TRUE, '2021-06-15'
FROM users u, companies c, categories cat
WHERE u.email = 'michael.braun@ruettenscheider-sanitaer.de' AND c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH' AND cat.code = 'klempner';

INSERT INTO workers (uuid, user_id, company_id, specialty_category_id, is_available, joined_date)
SELECT UUID(), u.id, c.id, cat.id, FALSE, '2022-02-10'
FROM users u, companies c, categories cat
WHERE u.email = 'sercan.yildiz@ruettenscheider-sanitaer.de' AND c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH' AND cat.code = 'klempner';

INSERT INTO workers (uuid, user_id, company_id, specialty_category_id, is_available, joined_date)
SELECT UUID(), u.id, c.id, cat.id, TRUE, '2023-09-01'
FROM users u, companies c, categories cat
WHERE u.email = 'tobias.krueger@ruettenscheider-sanitaer.de' AND c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH' AND cat.code = 'heizung';

-- --- Additional workers on other companies (not every job has to run through Rüttenscheider) ---
INSERT INTO workers (uuid, user_id, company_id, specialty_category_id, is_available, joined_date)
SELECT UUID(), u.id, c.id, cat.id, x.is_available, x.joined_date
FROM (
  SELECT 'sabine.roth@elektromeister-krause.de'       AS email, 'ElektroMeister Krause GmbH'         AS company_name, 'elektriker'         AS category_code, TRUE  AS is_available, '2022-04-01' AS joined_date UNION ALL
  SELECT 'uwe.fink@elektromeister-krause.de',                     'ElektroMeister Krause GmbH',                    'elektriker',                     TRUE,             '2023-01-15' UNION ALL
  SELECT 'elif.aydemir@blitzblank-reinigung.de',                   'Blitzblank Gebäudereinigung GmbH',              'reinigung',                      TRUE,             '2021-08-01' UNION ALL
  SELECT 'boris.wagner@blitzblank-reinigung.de',                   'Blitzblank Gebäudereinigung GmbH',              'reinigung',                      FALSE,            '2022-11-01' UNION ALL
  SELECT 'matthias.vogt@waermetechnik-ruhr.de',                    'Wärmetechnik Ruhr GmbH',                        'heizung',                        TRUE,             '2020-05-01' UNION ALL
  SELECT 'katrin.berg@farbwerk-malerbetrieb.de',                   'Farbwerk Malerbetrieb GmbH',                    'maler',                          TRUE,             '2023-03-01' UNION ALL
  SELECT 'simon.brandt@holz-handwerk-schreinerei.de',              'Holz & Handwerk Schreinerei GmbH',              'schreiner',                      TRUE,             '2021-02-01' UNION ALL
  SELECT 'kevin.haas@ruhrpott-umzuege.de',                         'Ruhrpott Umzüge GmbH',                          'umzug',                          TRUE,             '2019-09-01' UNION ALL
  SELECT 'daniel.krause@ruhrpott-umzuege.de',                      'Ruhrpott Umzüge GmbH',                          'umzug',                          TRUE,             '2020-06-01' UNION ALL
  SELECT 'nils.schroeder@rundum-handwerksservice.de',              'Rundum Handwerksservice GmbH',                  'handwerker',                     TRUE,             '2022-07-01' UNION ALL
  SELECT 'timo.lang@rundum-handwerksservice.de',                   'Rundum Handwerksservice GmbH',                  'handwerker',                     FALSE,            '2023-05-01' UNION ALL
  SELECT 'julia.peters@netzwerk-ruhr.de',                          'NetzWerk Ruhr GmbH',                            'internettechniker',              TRUE,             '2022-01-10'
) AS x
JOIN users u ON u.email = x.email
JOIN companies c ON c.legal_name = x.company_name
JOIN categories cat ON cat.code = x.category_code;

-- =============================================================================
-- SECTION 8 — BOOKINGS (home-services-company-app's mockJobs.js)
-- =============================================================================
-- price_gross is exactly the mock's `price`; provider_earning_net is
-- price_gross * (1 - 0.12) to 2 decimal places — the same formula
-- bookings.service.js uses for a real booking, computed here by hand so
-- the seed stays consistent with what the running app would produce.

-- Michael Braun (Klempner)
INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1001', cl.id, cat.id, 'Rohrverstopfung', 'company', c.id, w.id, 'Familie Weber', '+49 201 5551234', 'Girardetstraße 12', '45131', 'Essen', '2026-07-15', '09:00:00', bs.id, 68.00, 0.12, 59.84, '2026-07-10 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'michael.braun@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'familie.weber@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1002', cl.id, cat.id, 'Wasserhahn-Reparatur', 'company', c.id, w.id, 'Herr Kaya', '+49 201 5552234', 'Alfredstraße 40', '45130', 'Essen', '2026-07-20', '14:00:00', bs.id, 45.00, 0.12, 39.60, '2026-07-16 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'michael.braun@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'herr.kaya@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1003', cl.id, cat.id, 'Heizkörper entlüften', 'company', c.id, w.id, 'Frau Nowak', '+49 201 5553234', 'Rüttenscheider Straße 200', '45131', 'Essen', '2026-07-29', '11:00:00', bs.id, 52.00, 0.12, 45.76, '2026-07-24 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'michael.braun@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'in_progress'
WHERE cl.email = 'frau.nowak@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1004', cl.id, cat.id, 'Toilettenspülung defekt', 'company', c.id, w.id, 'Herr Yilmaz', '+49 201 5554234', 'Frohnhauser Straße 90', '45145', 'Essen', '2026-07-30', '10:00:00', bs.id, 58.00, 0.12, 51.04, '2026-07-25 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'michael.braun@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE cl.email = 'herr.yilmaz@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1005', cl.id, cat.id, 'Neuinstallation Waschbecken', 'company', c.id, w.id, 'Familie Schulz', '+49 201 5555234', 'Steeler Straße 55', '45276', 'Essen', '2026-08-02', '09:30:00', bs.id, 120.00, 0.12, 105.60, '2026-07-27 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'michael.braun@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE cl.email = 'familie.schulz@example.com';

-- Sercan Yıldız (Klempner)
INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, is_emergency, created_at)
SELECT UUID(), 'JOB-1006', cl.id, cat.id, 'Rohrbruch Notdienst', 'company', c.id, w.id, 'Herr Aydin', '+49 201 5556234', 'Holsterhauser Straße 15', '45147', 'Essen', '2026-07-12', '19:00:00', bs.id, 145.00, 0.12, 127.60, TRUE, '2026-07-12 18:30:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'herr.aydin@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1007', cl.id, cat.id, 'Spülkasten austauschen', 'company', c.id, w.id, 'Frau Krüger', '+49 201 5557234', 'Altendorfer Straße 30', '45127', 'Essen', '2026-07-24', '13:00:00', bs.id, 89.00, 0.12, 78.32, '2026-07-19 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'frau.krueger.client@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1008', cl.id, cat.id, 'Waschmaschinenanschluss', 'company', c.id, w.id, 'Herr Celik', '+49 201 5558234', 'Rüttenscheider Straße 88', '45131', 'Essen', '2026-07-29', '15:30:00', bs.id, 76.00, 0.12, 66.88, '2026-07-24 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'in_progress'
WHERE cl.email = 'herr.celik.client@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1009', cl.id, cat.id, 'Badezimmer-Sanierung Beratung', 'company', c.id, w.id, 'Familie Bauer', '+49 201 5559234', 'Bergstraße 4', '45130', 'Essen', '2026-08-01', '10:00:00', bs.id, 40.00, 0.12, 35.20, '2026-07-27 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE cl.email = 'familie.bauer@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1010', cl.id, cat.id, 'Küchenspüle undicht', 'company', c.id, w.id, 'Frau Hoffmann', '+49 201 5560234', 'Lenbachstraße 22', '45147', 'Essen', '2026-08-03', '08:30:00', bs.id, 65.00, 0.12, 57.20, '2026-07-28 10:15:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'pending'
WHERE cl.email = 'frau.hoffmann.client@example.com';

-- Tobias Krüger (Heizung)
INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1011', cl.id, cat.id, 'Heizungswartung', 'company', c.id, w.id, 'Herr Fischer', '+49 201 5561234', 'Steeler Straße 210', '45276', 'Essen', '2026-07-18', '09:00:00', bs.id, 95.00, 0.12, 83.60, '2026-07-13 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'heizung'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'tobias.krueger@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'herr.fischer.client@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-1012', cl.id, cat.id, 'Thermostat-Einbau', 'company', c.id, w.id, 'Familie Schmitz', '+49 201 5562234', 'Borbecker Straße 140', '45355', 'Essen', '2026-07-31', '11:30:00', bs.id, 84.00, 0.12, 73.92, '2026-07-26 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'heizung'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'tobias.krueger@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE cl.email = 'familie.schmitz.client@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, assigned_worker_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, is_emergency, created_at)
SELECT UUID(), 'JOB-1013', cl.id, cat.id, 'Heizung fällt aus (Notdienst)', 'company', c.id, w.id, 'Herr Aksoy', '+49 201 5563234', 'Alfredstraße 60', '45130', 'Essen', '2026-08-04', '07:00:00', bs.id, 110.00, 0.12, 96.80, TRUE, '2026-07-29 07:00:00'
FROM users cl JOIN categories cat ON cat.code = 'heizung'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN workers w ON w.company_id = c.id JOIN users wu ON w.user_id = wu.id AND wu.email = 'tobias.krueger@ruettenscheider-sanitaer.de'
JOIN booking_statuses bs ON bs.code = 'pending'
WHERE cl.email = 'herr.aksoy.client@example.com';

-- Max Mustermann (independent, Klempner) — provider_type = 'independent', so
-- assigned_worker_id stays NULL (see chk_bookings_worker_scope in schema.sql).
INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, independent_provider_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-2001', cl.id, cat.id, 'Rohrbruch behoben', 'independent', ip.id, 'Frau Klein', '+49 201 5571234', 'Witteringstraße 22', '45130', 'Essen', '2026-07-22', '08:30:00', bs.id, 132.00, 0.12, 116.16, '2026-07-17 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN independent_providers ip ON ip.user_id = (SELECT id FROM users WHERE email = 'max@musterfirma.de')
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'frau.klein@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, independent_provider_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-2002', cl.id, cat.id, 'Armatur austauschen', 'independent', ip.id, 'Herr Demir', '+49 201 5572234', 'Kettwiger Straße 45', '45219', 'Essen', '2026-07-27', '13:00:00', bs.id, 74.00, 0.12, 65.12, '2026-07-22 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN independent_providers ip ON ip.user_id = (SELECT id FROM users WHERE email = 'max@musterfirma.de')
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE cl.email = 'herr.demir@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, independent_provider_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-2003', cl.id, cat.id, 'Verstopfter Abfluss', 'independent', ip.id, 'Familie Roth', '+49 201 5573234', 'Bredeneyer Straße 8', '45133', 'Essen', '2026-07-29', '16:00:00', bs.id, 58.00, 0.12, 51.04, '2026-07-24 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN independent_providers ip ON ip.user_id = (SELECT id FROM users WHERE email = 'max@musterfirma.de')
JOIN booking_statuses bs ON bs.code = 'in_progress'
WHERE cl.email = 'familie.roth@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, independent_provider_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-2004', cl.id, cat.id, 'Neuinstallation Gäste-WC', 'independent', ip.id, 'Herr Vogel', '+49 201 5574234', 'Kastanienallee 17', '45138', 'Essen', '2026-08-01', '09:00:00', bs.id, 210.00, 0.12, 184.80, '2026-07-27 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN independent_providers ip ON ip.user_id = (SELECT id FROM users WHERE email = 'max@musterfirma.de')
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE cl.email = 'herr.vogel@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, independent_provider_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-2005', cl.id, cat.id, 'Wasserschaden-Begutachtung', 'independent', ip.id, 'Frau Lange', '+49 201 5575234', 'Huyssenallee 33', '45128', 'Essen', '2026-08-05', '11:00:00', bs.id, 60.00, 0.12, 52.80, '2026-07-31 09:00:00'
FROM users cl JOIN categories cat ON cat.code = 'klempner'
JOIN independent_providers ip ON ip.user_id = (SELECT id FROM users WHERE email = 'max@musterfirma.de')
JOIN booking_statuses bs ON bs.code = 'pending'
WHERE cl.email = 'frau.lange@example.com';

-- --- home-services-app's MyBookingsScreen MOCK — Anna Schmidt's own history ---
-- m2/m3 had no explicit price in the source mock; the figures below are
-- derived from each provider's known hourly rate in MOCK_PROVIDERS
-- (Blitzblank €35/h, ElektroMeister Krause €72/h) for a plausible ~2h job.
INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-3001', u.id, cat.id, 'Klempnerservice', 'company', c.id, CONCAT(u.first_name, ' ', u.last_name), u.phone, a.street, a.postal_code, a.city, '2026-05-15', '14:00:00', bs.id, 76.00, 0.12, 66.88, '2026-05-08 09:00:00'
FROM users u
JOIN addresses a ON a.user_id = u.id AND a.is_default = TRUE
JOIN categories cat ON cat.code = 'klempner'
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN booking_statuses bs ON bs.code = 'upcoming'
WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, is_recurring, recurrence_frequency, created_at)
SELECT UUID(), 'JOB-3002', u.id, cat.id, 'Reinigungsservice', 'company', c.id, CONCAT(u.first_name, ' ', u.last_name), u.phone, a.street, a.postal_code, a.city, '2026-05-10', '10:00:00', bs.id, 70.00, 0.12, 61.60, TRUE, 'weekly', '2026-05-01 09:00:00'
FROM users u
JOIN addresses a ON a.user_id = u.id AND a.is_default = TRUE
JOIN categories cat ON cat.code = 'reinigung'
JOIN companies c ON c.legal_name = 'Blitzblank Gebäudereinigung GmbH'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-3003', u.id, cat.id, 'Elektrikerservice', 'company', c.id, CONCAT(u.first_name, ' ', u.last_name), u.phone, a.street, a.postal_code, a.city, '2026-05-05', '16:00:00', bs.id, 144.00, 0.12, 126.72, '2026-04-28 09:00:00'
FROM users u
JOIN addresses a ON a.user_id = u.id AND a.is_default = TRUE
JOIN categories cat ON cat.code = 'elektriker'
JOIN companies c ON c.legal_name = 'ElektroMeister Krause GmbH'
JOIN booking_statuses bs ON bs.code = 'completed'
WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO bookings (uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id, price_gross, platform_fee_rate, provider_earning_net, created_at)
SELECT UUID(), 'JOB-3004', u.id, cat.id, 'Malerservice', 'company', c.id, CONCAT(u.first_name, ' ', u.last_name), u.phone, a.street, a.postal_code, a.city, '2026-05-20', '09:00:00', bs.id, 78.00, 0.12, 68.64, '2026-05-14 09:00:00'
FROM users u
JOIN addresses a ON a.user_id = u.id AND a.is_default = TRUE
JOIN categories cat ON cat.code = 'maler'
JOIN companies c ON c.legal_name = 'Farbwerk Malerbetrieb GmbH'
JOIN booking_statuses bs ON bs.code = 'pending'
WHERE u.email = 'anna.schmidt@example.com';

-- --- Additional bookings spread across every other provider ---
-- The original mock data only ever exercised Rüttenscheider Sanitärtechnik
-- GmbH and Max Mustermann; every other one of the 24 seeded providers had
-- zero bookings, which meant reviews/payments/conversations downstream of
-- them were empty too. These give the other 11 companies and 11
-- independents real job history across every status.
INSERT INTO bookings (
  uuid, booking_number, client_id, category_id, service_label, provider_type, company_id, independent_provider_id, assigned_worker_id,
  client_name, client_phone, address_street, address_postal_code, address_city, scheduled_date, scheduled_time, status_id,
  price_gross, platform_fee_rate, provider_earning_net, is_recurring, recurrence_frequency, created_at
)
SELECT
  UUID(), x.booking_number, cl.id, cat.id, x.service_label, x.provider_type, comp.id, indep.id, w.id,
  CONCAT(cl.first_name, ' ', cl.last_name), cl.phone, x.address_street, x.address_postal_code, 'Essen', x.scheduled_date, x.scheduled_time, bs.id,
  x.price_gross, 0.12, ROUND(x.price_gross * 0.88, 2), x.is_recurring, x.recurrence_frequency, x.created_at
FROM (
  SELECT 'JOB-4001' AS booking_number, 'familie.weber@example.com' AS client_email, 'elektriker' AS category_code, 'Sicherungskasten erneuern' AS service_label,
         'company' AS provider_type, 'ElektroMeister Krause GmbH' AS company_name, NULL AS independent_name, 'sabine.roth@elektromeister-krause.de' AS worker_email,
         'Girardetstraße 12' AS address_street, '45131' AS address_postal_code, '2026-08-20' AS scheduled_date, '10:00:00' AS scheduled_time,
         'completed' AS status_code, 180.00 AS price_gross, FALSE AS is_recurring, NULL AS recurrence_frequency, '2026-08-14 09:00:00' AS created_at
  UNION ALL
  SELECT 'JOB-4002', 'herr.kaya@example.com', 'elektriker', 'Steckdosen nachrüsten',
         'company', 'ElektroMeister Krause GmbH', NULL, 'uwe.fink@elektromeister-krause.de',
         'Alfredstraße 40', '45130', '2026-09-05', '13:00:00',
         'upcoming', 95.00, FALSE, NULL, '2026-08-28 09:00:00'
  UNION ALL
  SELECT 'JOB-4003', 'frau.nowak@example.com', 'elektriker', 'Beleuchtung Garten',
         'company', 'ElektroMeister Krause GmbH', NULL, NULL,
         'Rüttenscheider Straße 200', '45131', '2026-09-10', '15:00:00',
         'pending', 120.00, FALSE, NULL, '2026-09-01 09:00:00'
  UNION ALL
  SELECT 'JOB-4004', 'herr.yilmaz@example.com', 'reinigung', 'Büroreinigung',
         'company', 'Blitzblank Gebäudereinigung GmbH', NULL, 'elif.aydemir@blitzblank-reinigung.de',
         'Frohnhauser Straße 90', '45145', '2026-08-18', '07:00:00',
         'completed', 85.00, TRUE, 'weekly', '2026-08-10 09:00:00'
  UNION ALL
  SELECT 'JOB-4005', 'familie.schulz@example.com', 'reinigung', 'Fensterreinigung',
         'company', 'Blitzblank Gebäudereinigung GmbH', NULL, 'boris.wagner@blitzblank-reinigung.de',
         'Steeler Straße 55', '45276', '2026-09-08', '09:00:00',
         'upcoming', 60.00, FALSE, NULL, '2026-08-30 09:00:00'
  UNION ALL
  SELECT 'JOB-4006', 'herr.aydin@example.com', 'heizung', 'Gastherme Austausch',
         'company', 'Wärmetechnik Ruhr GmbH', NULL, 'matthias.vogt@waermetechnik-ruhr.de',
         'Holsterhauser Straße 15', '45147', '2026-08-22', '08:00:00',
         'completed', 2400.00, FALSE, NULL, '2026-08-01 09:00:00'
  UNION ALL
  SELECT 'JOB-4007', 'frau.krueger.client@example.com', 'heizung', 'Heizungscheck',
         'company', 'Wärmetechnik Ruhr GmbH', NULL, NULL,
         'Altendorfer Straße 30', '45127', '2026-09-12', '11:00:00',
         'pending', 75.00, FALSE, NULL, '2026-09-02 09:00:00'
  UNION ALL
  SELECT 'JOB-4008', 'herr.celik.client@example.com', 'maler', 'Wohnzimmer streichen',
         'company', 'Farbwerk Malerbetrieb GmbH', NULL, 'katrin.berg@farbwerk-malerbetrieb.de',
         'Rüttenscheider Straße 88', '45131', '2026-08-19', '09:00:00',
         'completed', 340.00, FALSE, NULL, '2026-08-05 09:00:00'
  UNION ALL
  SELECT 'JOB-4009', 'familie.bauer@example.com', 'maler', 'Fassadenanstrich',
         'company', 'Farbwerk Malerbetrieb GmbH', NULL, NULL,
         'Bergstraße 4', '45130', '2026-09-20', '08:00:00',
         'upcoming', 1200.00, FALSE, NULL, '2026-09-01 09:00:00'
  UNION ALL
  SELECT 'JOB-4010', 'frau.hoffmann.client@example.com', 'schreiner', 'Einbauschrank',
         'company', 'Holz & Handwerk Schreinerei GmbH', NULL, 'simon.brandt@holz-handwerk-schreinerei.de',
         'Lenbachstraße 22', '45147', '2026-08-27', '09:00:00',
         'in_progress', 890.00, FALSE, NULL, '2026-08-20 09:00:00'
  UNION ALL
  SELECT 'JOB-4011', 'herr.fischer.client@example.com', 'gaertner', 'Rasenpflege',
         'company', 'GrünPuls Gartenservice GmbH', NULL, NULL,
         'Steeler Straße 210', '45276', '2026-08-16', '08:30:00',
         'completed', 65.00, FALSE, NULL, '2026-08-09 09:00:00'
  UNION ALL
  SELECT 'JOB-4012', 'familie.schmitz.client@example.com', 'gaertner', 'Heckenschnitt',
         'company', 'GrünPuls Gartenservice GmbH', NULL, NULL,
         'Borbecker Straße 140', '45355', '2026-09-14', '08:30:00',
         'upcoming', 110.00, FALSE, NULL, '2026-09-03 09:00:00'
  UNION ALL
  SELECT 'JOB-4013', 'herr.aksoy.client@example.com', 'umzug', 'Umzug 3-Zimmer-Wohnung',
         'company', 'Ruhrpott Umzüge GmbH', NULL, 'kevin.haas@ruhrpott-umzuege.de',
         'Alfredstraße 60', '45130', '2026-08-24', '08:00:00',
         'completed', 890.00, FALSE, NULL, '2026-08-05 09:00:00'
  UNION ALL
  SELECT 'JOB-4014', 'frau.klein@example.com', 'umzug', 'Umzug Studio',
         'company', 'Ruhrpott Umzüge GmbH', NULL, 'daniel.krause@ruhrpott-umzuege.de',
         'Witteringstraße 22', '45130', '2026-09-18', '09:00:00',
         'upcoming', 450.00, FALSE, NULL, '2026-09-04 09:00:00'
  UNION ALL
  SELECT 'JOB-4015', 'herr.demir@example.com', 'handwerker', 'Möbelmontage',
         'company', 'Rundum Handwerksservice GmbH', NULL, 'nils.schroeder@rundum-handwerksservice.de',
         'Kettwiger Straße 45', '45219', '2026-08-17', '10:00:00',
         'completed', 95.00, FALSE, NULL, '2026-08-10 09:00:00'
  UNION ALL
  SELECT 'JOB-4016', 'familie.roth@example.com', 'handwerker', 'Kleinreparaturen',
         'company', 'Rundum Handwerksservice GmbH', NULL, NULL,
         'Bredeneyer Straße 8', '45133', '2026-09-16', '13:00:00',
         'pending', 130.00, FALSE, NULL, '2026-09-05 09:00:00'
  UNION ALL
  SELECT 'JOB-4017', 'herr.vogel@example.com', 'internettechniker', 'WLAN-Ausleuchtung',
         'company', 'NetzWerk Ruhr GmbH', NULL, 'julia.peters@netzwerk-ruhr.de',
         'Kastanienallee 17', '45138', '2026-08-21', '14:00:00',
         'completed', 150.00, FALSE, NULL, '2026-08-12 09:00:00'
  UNION ALL
  SELECT 'JOB-4018', 'frau.lange@example.com', 'internettechniker', 'Netzwerkinstallation Büro',
         'company', 'NetzWerk Ruhr GmbH', NULL, NULL,
         'Huyssenallee 33', '45128', '2026-09-22', '10:00:00',
         'upcoming', 480.00, FALSE, NULL, '2026-09-06 09:00:00'
  UNION ALL
  SELECT 'JOB-4019', 'anna.schmidt@example.com', 'klempner', 'Sanitäranlagen Check',
         'independent', NULL, 'Jonas Vogt', NULL,
         'Rüttenscheider Straße 142', '45131', '2026-08-15', '10:00:00',
         'completed', 55.00, FALSE, NULL, '2026-08-08 09:00:00'
  UNION ALL
  SELECT 'JOB-4020', 'familie.weber@example.com', 'elektriker', 'Lampen montieren',
         'independent', NULL, 'Sabine Hoffmann', NULL,
         'Girardetstraße 12', '45131', '2026-09-09', '11:00:00',
         'upcoming', 70.00, FALSE, NULL, '2026-08-31 09:00:00'
  UNION ALL
  SELECT 'JOB-4021', 'herr.kaya@example.com', 'reinigung', 'Grundreinigung',
         'independent', NULL, 'Aylin Yildiz', NULL,
         'Alfredstraße 40', '45130', '2026-08-23', '09:00:00',
         'completed', 90.00, FALSE, NULL, '2026-08-16 09:00:00'
  UNION ALL
  SELECT 'JOB-4022', 'frau.nowak@example.com', 'heizung', 'Heizkörper Austausch',
         'independent', NULL, 'Markus Bauer', NULL,
         'Rüttenscheider Straße 200', '45131', '2026-09-19', '10:30:00',
         'pending', 260.00, FALSE, NULL, '2026-09-06 09:00:00'
  UNION ALL
  SELECT 'JOB-4023', 'herr.yilmaz@example.com', 'maler', 'Kinderzimmer streichen',
         'independent', NULL, 'Nadine Krüger', NULL,
         'Frohnhauser Straße 90', '45145', '2026-08-26', '09:00:00',
         'completed', 180.00, FALSE, NULL, '2026-08-19 09:00:00'
  UNION ALL
  SELECT 'JOB-4024', 'familie.schulz@example.com', 'handwerker', 'Regal aufbauen',
         'independent', NULL, 'Ozan Celik', NULL,
         'Steeler Straße 55', '45276', '2026-09-13', '15:00:00',
         'upcoming', 45.00, FALSE, NULL, '2026-09-04 09:00:00'
  UNION ALL
  SELECT 'JOB-4025', 'herr.aydin@example.com', 'internettechniker', 'Router einrichten',
         'independent', NULL, 'Fabian Nowak', NULL,
         'Holsterhauser Straße 15', '45147', '2026-08-25', '16:00:00',
         'completed', 60.00, FALSE, NULL, '2026-08-18 09:00:00'
) AS x
JOIN users cl ON cl.email = x.client_email
JOIN categories cat ON cat.code = x.category_code
LEFT JOIN companies comp ON comp.legal_name = x.company_name
LEFT JOIN independent_providers indep ON indep.business_name = x.independent_name
LEFT JOIN users wu ON wu.email = x.worker_email
LEFT JOIN workers w ON w.user_id = wu.id
JOIN booking_statuses bs ON bs.code = x.status_code;

-- =============================================================================
-- SECTION 9 — BOOKING STATUS HISTORY
-- =============================================================================
-- One row per booking: its creation, landing directly on the status it
-- carries above. Seed data is a snapshot of an already-running system, not
-- a full replay of every intermediate transition — see seed.sql's header.

INSERT INTO booking_status_history (booking_id, from_status_id, to_status_id, note, changed_at)
SELECT b.id, NULL, b.status_id, 'Seed data — initial state', b.created_at
FROM bookings b;

-- =============================================================================
-- SECTION 10 — BOOKING REPORTS + PHOTOS
-- =============================================================================
-- Only the seven mockJobs.js jobs that shipped with report content get a
-- report row — MyBookingsScreen's two completed entries (JOB-3002,
-- JOB-3003) never had report detail in the source mock, so none is
-- invented here; a completed booking with no report is a legitimate state
-- for data that predates this app's report-on-completion workflow.

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Rohrreiniger-Set","qty":1,"unit":"Stk."}]', 'Verstopfung durch Fettablagerung, Rohr gespült und getestet.', 'Kunde über regelmäßige Wartung informiert.', '2026-07-15 11:20:00'
FROM bookings b WHERE b.booking_number = 'JOB-1001';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Dichtungsset","qty":2,"unit":"Stk."},{"name":"Kartusche","qty":1,"unit":"Stk."}]', 'Kartusche komplett ersetzt, kein Tropfen mehr.', NULL, '2026-07-20 15:10:00'
FROM bookings b WHERE b.booking_number = 'JOB-1002';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Kupferrohr 15mm","qty":2,"unit":"m"},{"name":"Lötset","qty":1,"unit":"Stk."}]', 'Notdiensteinsatz, Rohrbruch unter Spüle behoben, Bereich getrocknet.', 'Wasserschaden an Unterschrank — Kunde für Versicherung informiert.', '2026-07-12 21:40:00'
FROM bookings b WHERE b.booking_number = 'JOB-1006';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Spülkasten komplett","qty":1,"unit":"Stk."}]', 'Alten Spülkasten entsorgt, neuen montiert und auf Dichtigkeit geprüft.', NULL, '2026-07-24 14:35:00'
FROM bookings b WHERE b.booking_number = 'JOB-1007';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Wartungsset Gastherme","qty":1,"unit":"Stk."}]', 'Jährliche Wartung durchgeführt, Abgaswerte im Normbereich.', 'Nächste Wartung in 12 Monaten empfohlen.', '2026-07-18 10:45:00'
FROM bookings b WHERE b.booking_number = 'JOB-1011';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Kupferrohr 15mm","qty":1,"unit":"m"},{"name":"Lötset","qty":1,"unit":"Stk."}]', 'Rohrbruch im Keller behoben, Bereich getrocknet und auf Dichtigkeit geprüft.', NULL, '2026-07-22 10:15:00'
FROM bookings b WHERE b.booking_number = 'JOB-2001';

INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, '[{"name":"Waschtischarmatur","qty":1,"unit":"Stk."}]', 'Alte Armatur entfernt, neue montiert und getestet.', NULL, '2026-07-27 14:20:00'
FROM bookings b WHERE b.booking_number = 'JOB-2002';

-- Photos — object storage URLs are placeholders (no real files exist for
-- mock data); see schema.sql's comment on booking_report_photos.
INSERT INTO booking_report_photos (booking_report_id, photo_url, caption)
SELECT br.id, 'https://storage.example.com/booking-reports/job-1001-before.jpg', 'Vorher' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1001'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1001-after.jpg', 'Nachher' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1001'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1002-after.jpg', 'Nachher' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1002'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1006-damage.jpg', 'Schaden' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1006'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1006-repair.jpg', 'Reparatur' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1006'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1007-after.jpg', 'Nachher' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1007'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-1011-protocol.jpg', 'Prüfprotokoll' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-1011'
UNION ALL
SELECT br.id, 'https://storage.example.com/booking-reports/job-2001-repair.jpg', 'Reparatur' FROM booking_reports br JOIN bookings b ON b.id = br.booking_id WHERE b.booking_number = 'JOB-2001';

-- --- Reports for the new completed bookings above (JOB-4001 .. JOB-4025) ---
INSERT INTO booking_reports (booking_id, materials_used, remarks, additional_info, submitted_at)
SELECT b.id, x.materials_used, x.remarks, x.additional_info, x.submitted_at
FROM (
  SELECT 'JOB-4001' AS booking_number, '[{"name":"Sicherungskasten","qty":1,"unit":"Stk."},{"name":"Sicherungsautomaten","qty":6,"unit":"Stk."}]' AS materials_used,
         'Alten Sicherungskasten komplett ersetzt, neue FI-Schutzschalter eingebaut.' AS remarks, 'Elektroinstallation entspricht jetzt VDE-Norm.' AS additional_info, '2026-08-20 12:30:00' AS submitted_at
  UNION ALL
  SELECT 'JOB-4004', '[{"name":"Reinigungsmittel","qty":1,"unit":"Set"}]',
         'Wöchentliche Büroreinigung durchgeführt, alle Räume gereinigt.', NULL, '2026-08-18 09:30:00'
  UNION ALL
  SELECT 'JOB-4006', '[{"name":"Gastherme (Brennwerttechnik)","qty":1,"unit":"Stk."},{"name":"Anschlussset","qty":1,"unit":"Set"}]',
         'Alte Therme demontiert, neue Brennwerttherme installiert und in Betrieb genommen.', 'Förderfähige Modernisierung — Bescheinigung ausgestellt.', '2026-08-22 15:00:00'
  UNION ALL
  SELECT 'JOB-4008', '[{"name":"Wandfarbe weiß","qty":10,"unit":"L"},{"name":"Abklebeband","qty":3,"unit":"Rolle"}]',
         'Wände grundiert und zweifach gestrichen.', NULL, '2026-08-19 16:00:00'
  UNION ALL
  SELECT 'JOB-4011', NULL,
         'Rasen gemäht und Kanten geschnitten.', NULL, '2026-08-16 10:00:00'
  UNION ALL
  SELECT 'JOB-4013', '[{"name":"Umzugskartons","qty":40,"unit":"Stk."},{"name":"Möbeldecken","qty":10,"unit":"Stk."}]',
         'Umzug reibungslos durchgeführt, Möbel und Kartons transportiert und aufgebaut.', NULL, '2026-08-24 17:00:00'
  UNION ALL
  SELECT 'JOB-4015', '[{"name":"Montagematerial","qty":1,"unit":"Set"}]',
         'Schrank und Regal montiert.', NULL, '2026-08-17 12:00:00'
  UNION ALL
  SELECT 'JOB-4017', '[{"name":"WLAN Access Point","qty":2,"unit":"Stk."}]',
         'Zwei zusätzliche Access Points installiert, volle Abdeckung erreicht.', NULL, '2026-08-21 16:30:00'
  UNION ALL
  SELECT 'JOB-4019', NULL,
         'Alle Anschlüsse geprüft, keine Mängel festgestellt.', NULL, '2026-08-15 11:00:00'
  UNION ALL
  SELECT 'JOB-4021', '[{"name":"Reinigungsmittel","qty":1,"unit":"Set"}]',
         'Grundreinigung der gesamten Wohnung durchgeführt.', NULL, '2026-08-23 13:00:00'
  UNION ALL
  SELECT 'JOB-4023', '[{"name":"Wandfarbe hellblau","qty":4,"unit":"L"}]',
         'Kinderzimmer neu gestrichen.', NULL, '2026-08-26 14:00:00'
  UNION ALL
  SELECT 'JOB-4025', '[{"name":"Router","qty":1,"unit":"Stk."}]',
         'Neuen Router eingerichtet und WLAN konfiguriert.', NULL, '2026-08-25 17:30:00'
) AS x
JOIN bookings b ON b.booking_number = x.booking_number;

INSERT INTO booking_report_photos (booking_report_id, photo_url, caption)
SELECT br.id, x.photo_url, x.caption
FROM (
  SELECT 'JOB-4001' AS booking_number, 'https://storage.example.com/booking-reports/job-4001-nachher.jpg' AS photo_url, 'Nachher' AS caption UNION ALL
  SELECT 'JOB-4006',                    'https://storage.example.com/booking-reports/job-4006-installation.jpg',              'Installation' UNION ALL
  SELECT 'JOB-4008',                    'https://storage.example.com/booking-reports/job-4008-nachher.jpg',                   'Nachher' UNION ALL
  SELECT 'JOB-4013',                    'https://storage.example.com/booking-reports/job-4013-moebelwagen.jpg',               'Beladung' UNION ALL
  SELECT 'JOB-4017',                    'https://storage.example.com/booking-reports/job-4017-access-point.jpg',              'Access Point'
) AS x
JOIN booking_reports br ON br.booking_id = (SELECT id FROM bookings WHERE booking_number = x.booking_number);

-- =============================================================================
-- SECTION 11 — NOTIFICATIONS (home-services-company-app's mockNotifications.js)
-- =============================================================================
-- audience: 'manager' entries all resolved to Klaus Weber, the only
-- manager in the seeded dataset — see models/Notification.js's comment on
-- why this schema targets one recipient per row rather than a broadcast.

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Neuer Auftrag', 'Neuer Auftrag zugewiesen: Neuinstallation Waschbecken am 02.08.2026, 09:30 Uhr.', TRUE, '2026-07-27 09:00:00', '2026-07-27 09:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'job_assigned' JOIN bookings b ON b.booking_number = 'JOB-1005'
WHERE wu.email = 'michael.braun@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Bericht ausstehend', 'Erinnerung: Der Bericht für „Heizkörper entlüften" steht noch aus.', FALSE, NULL, '2026-07-29 12:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'report_reminder' JOIN bookings b ON b.booking_number = 'JOB-1003'
WHERE wu.email = 'michael.braun@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, NULL, 'Auszahlung veranlasst', 'Ihre Auszahlung von €113 für die letzten 7 Tage wurde veranlasst.', TRUE, '2026-07-21 08:00:00', '2026-07-21 08:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'payout'
WHERE wu.email = 'michael.braun@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Neuer Auftrag', 'Neuer Auftrag zugewiesen: Küchenspüle undicht am 03.08.2026, 08:30 Uhr.', FALSE, NULL, '2026-07-28 10:15:00'
FROM users wu JOIN notification_types nt ON nt.code = 'job_assigned' JOIN bookings b ON b.booking_number = 'JOB-1010'
WHERE wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Auftrag heute', 'Erinnerung: „Waschmaschinenanschluss" heute um 15:30 Uhr.', FALSE, NULL, '2026-07-29 08:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'job_upcoming_reminder' JOIN bookings b ON b.booking_number = 'JOB-1008'
WHERE wu.email = 'sercan.yildiz@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Notdienst zugewiesen', 'Neuer Notdienst-Auftrag zugewiesen: Heizung fällt aus, 04.08.2026, 07:00 Uhr.', FALSE, NULL, '2026-07-29 07:30:00'
FROM users wu JOIN notification_types nt ON nt.code = 'job_assigned' JOIN bookings b ON b.booking_number = 'JOB-1013'
WHERE wu.email = 'tobias.krueger@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Bericht eingereicht', 'Sercan Yıldız hat den Bericht für „Spülkasten austauschen" eingereicht.', TRUE, '2026-07-24 14:35:00', '2026-07-24 14:35:00'
FROM users wu JOIN notification_types nt ON nt.code = 'report_submitted' JOIN bookings b ON b.booking_number = 'JOB-1007'
WHERE wu.email = 'klaus.weber@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Bericht eingereicht', 'Tobias Krüger hat den Bericht für „Heizungswartung" eingereicht.', TRUE, '2026-07-18 10:45:00', '2026-07-18 10:45:00'
FROM users wu JOIN notification_types nt ON nt.code = 'report_submitted' JOIN bookings b ON b.booking_number = 'JOB-1011'
WHERE wu.email = 'klaus.weber@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, b.id, 'Neuer Auftrag erstellt', 'Neuer Auftrag erstellt: „Heizung fällt aus" — Tobias Krüger zugewiesen.', FALSE, NULL, '2026-07-29 07:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'new_job' JOIN bookings b ON b.booking_number = 'JOB-1013'
WHERE wu.email = 'klaus.weber@ruettenscheider-sanitaer.de';

INSERT INTO notifications (uuid, user_id, notification_type_id, related_booking_id, title, message, is_read, read_at, created_at)
SELECT UUID(), wu.id, nt.id, NULL, 'Mitarbeiter nicht verfügbar', 'Sercan Yıldız hat sich als nicht verfügbar für neue Aufträge markiert.', TRUE, '2026-07-26 18:00:00', '2026-07-26 18:00:00'
FROM users wu JOIN notification_types nt ON nt.code = 'worker_unavailable'
WHERE wu.email = 'klaus.weber@ruettenscheider-sanitaer.de';

-- =============================================================================
-- SECTION 12 — REVIEWS
-- =============================================================================
-- Not present in the original mock data (neither app had a reviews
-- screen backed by data) — these two rows are illustrative additions,
-- attached to two of Anna Schmidt's own completed bookings from
-- MyBookingsScreen, to demonstrate the table end-to-end rather than
-- leaving it empty.

INSERT INTO reviews (uuid, booking_id, client_id, provider_type, company_id, rating, comment, created_at)
SELECT UUID(), b.id, u.id, 'company', b.company_id, 5, 'Sehr zuverlässig und pünktlich, der wöchentliche Reinigungstermin klappt jedes Mal reibungslos.', '2026-05-10 12:30:00'
FROM bookings b JOIN users u ON u.id = b.client_id
WHERE b.booking_number = 'JOB-3002';

INSERT INTO reviews (uuid, booking_id, client_id, provider_type, company_id, rating, comment, provider_response, provider_responded_at, created_at)
SELECT UUID(), b.id, u.id, 'company', b.company_id, 4, 'Guter Service, kleine Verzögerung beim Termin.', 'Vielen Dank für Ihr Feedback — wir arbeiten an einer besseren Terminplanung.', '2026-05-06 09:00:00', '2026-05-05 18:00:00'
FROM bookings b JOIN users u ON u.id = b.client_id
WHERE b.booking_number = 'JOB-3003';

-- --- More reviews across the newly-booked providers ---
INSERT INTO reviews (uuid, booking_id, client_id, provider_type, company_id, rating, comment, created_at)
SELECT UUID(), b.id, u.id, 'company', b.company_id, x.rating, x.comment, x.created_at
FROM (
  SELECT 'JOB-4001' AS booking_number, 5 AS rating, 'Schnell, sauber gearbeitet und alles genau erklärt.' AS comment, '2026-08-20 14:00:00' AS created_at UNION ALL
  SELECT 'JOB-4006', 5, 'Top Beratung, neue Heizung läuft einwandfrei.', '2026-08-22 18:00:00' UNION ALL
  SELECT 'JOB-4008', 5, 'Sehr ordentliche Malerarbeiten, kann ich nur empfehlen.', '2026-08-19 19:00:00' UNION ALL
  SELECT 'JOB-4013', 4, 'Guter Umzugsservice, ein Möbelstück wurde leicht verkratzt.', '2026-08-24 20:00:00'
) AS x
JOIN bookings b ON b.booking_number = x.booking_number
JOIN users u ON u.id = b.client_id;

INSERT INTO reviews (uuid, booking_id, client_id, provider_type, company_id, rating, comment, provider_response, provider_responded_at, created_at)
SELECT UUID(), b.id, u.id, 'company', b.company_id, 4, 'Zuverlässige Büroreinigung, kleine Stellen wurden übersehen.', 'Danke für den Hinweis, wir schulen unser Team entsprechend nach.', '2026-08-19 08:00:00', '2026-08-18 12:00:00'
FROM bookings b JOIN users u ON u.id = b.client_id
WHERE b.booking_number = 'JOB-4004';

INSERT INTO reviews (uuid, booking_id, client_id, provider_type, company_id, rating, comment, provider_response, provider_responded_at, created_at)
SELECT UUID(), b.id, u.id, 'company', b.company_id, 5, 'Netzwerk läuft jetzt im ganzen Büro stabil, sehr kompetent.', 'Freut uns sehr — bei Fragen jederzeit melden!', '2026-08-22 09:00:00', '2026-08-21 19:00:00'
FROM bookings b JOIN users u ON u.id = b.client_id
WHERE b.booking_number = 'JOB-4017';

INSERT INTO reviews (uuid, booking_id, client_id, provider_type, independent_provider_id, rating, comment, created_at)
SELECT UUID(), b.id, u.id, 'independent', b.independent_provider_id, x.rating, x.comment, x.created_at
FROM (
  SELECT 'JOB-4019' AS booking_number, 5 AS rating, 'Sehr freundlich und gründlich, alles im grünen Bereich.' AS comment, '2026-08-15 13:00:00' AS created_at UNION ALL
  SELECT 'JOB-4023', 4, 'Schönes Ergebnis, kam etwas später als vereinbart.', '2026-08-26 17:00:00'
) AS x
JOIN bookings b ON b.booking_number = x.booking_number
JOIN users u ON u.id = b.client_id;

-- =============================================================================
-- SECTION 13 — CONVERSATIONS + MESSAGES
-- =============================================================================
-- Also not present in the original mock data — one illustrative thread
-- between Anna Schmidt and Rüttenscheider Sanitärtechnik GmbH about her
-- upcoming JOB-3001 booking.

INSERT INTO conversations (uuid, client_id, provider_type, company_id, booking_id, last_message_at, created_at)
SELECT UUID(), u.id, 'company', c.id, b.id, '2026-05-09 17:05:00', '2026-05-09 16:50:00'
FROM users u
JOIN companies c ON c.legal_name = 'Rüttenscheider Sanitärtechnik GmbH'
JOIN bookings b ON b.booking_number = 'JOB-3001'
WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Hallo, kann der Termin am 15.05. auch etwas früher stattfinden, z. B. 13:00 Uhr?', '2026-05-09 16:50:00', '2026-05-09 17:00:00'
FROM conversations conv
JOIN users u ON u.email = 'anna.schmidt@example.com'
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-3001';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Guten Tag Frau Schmidt, 13:00 Uhr passt gut, wir haben es angepasst.', '2026-05-09 17:05:00', NULL
FROM conversations conv
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-3001'
JOIN users u ON u.email = 'klaus.weber@ruettenscheider-sanitaer.de';

-- --- A couple more threads, across other providers ---
INSERT INTO conversations (uuid, client_id, provider_type, company_id, booking_id, last_message_at, created_at)
SELECT UUID(), u.id, 'company', c.id, b.id, '2026-08-14 09:20:00', '2026-08-14 09:10:00'
FROM users u
JOIN companies c ON c.legal_name = 'ElektroMeister Krause GmbH'
JOIN bookings b ON b.booking_number = 'JOB-4001'
WHERE u.email = 'familie.weber@example.com';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Guten Tag, können Sie kurz vorbeischauen bevor Sie anfangen? Der Sicherungskasten ist im Keller.', '2026-08-14 09:10:00', '2026-08-14 09:15:00'
FROM conversations conv
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-4001'
JOIN users u ON u.email = 'familie.weber@example.com';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Kein Problem, wir melden uns kurz vor Ankunft.', '2026-08-14 09:20:00', NULL
FROM conversations conv
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-4001'
JOIN users u ON u.email = 'peter.krause@elektromeister-krause.de';

INSERT INTO conversations (uuid, client_id, provider_type, independent_provider_id, booking_id, last_message_at, created_at)
SELECT UUID(), u.id, 'independent', ip.id, b.id, '2026-08-08 09:15:00', '2026-08-08 09:05:00'
FROM users u
JOIN independent_providers ip ON ip.business_name = 'Jonas Vogt'
JOIN bookings b ON b.booking_number = 'JOB-4019'
WHERE u.email = 'anna.schmidt@example.com';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Hallo Herr Vogt, ist ein Termin diese Woche noch möglich?', '2026-08-08 09:05:00', '2026-08-08 09:10:00'
FROM conversations conv
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-4019'
JOIN users u ON u.email = 'anna.schmidt@example.com';

INSERT INTO messages (conversation_id, sender_user_id, body, sent_at, read_at)
SELECT conv.id, u.id, 'Ja, ich kann am Samstag um 10 Uhr vorbeikommen.', '2026-08-08 09:15:00', NULL
FROM conversations conv
JOIN bookings b ON b.id = conv.booking_id AND b.booking_number = 'JOB-4019'
JOIN users u ON u.email = 'jonas.vogt@web.de';

-- =============================================================================
-- SECTION 14 — PAYMENTS
-- =============================================================================
-- One succeeded, simulated payment per completed booking — see
-- payments.service.js's comment on why this build never touches a real
-- card number or PSP.

INSERT INTO payments (uuid, booking_id, amount_gross, status, psp, psp_payment_intent_id, processed_at)
SELECT UUID(), b.id, b.price_gross, 'succeeded', 'stripe', CONCAT('sim_', LOWER(REPLACE(b.uuid, '-', ''))), b.created_at
FROM bookings b
JOIN booking_statuses bs ON bs.id = b.status_id AND bs.code = 'completed';

SET FOREIGN_KEY_CHECKS = 1;
