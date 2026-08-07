-- =============================================================================
-- HomeService Platform — MySQL 8.0+ Schema
-- =============================================================================
-- One database serves both client apps (home-services-app, the customer-
-- facing marketplace) and home-services-company-app (companies, their
-- workers, and independent solo providers). See docs/DATABASE.md for the
-- full narrative — this file is the executable source of truth; that doc
-- is the "why" behind it.
--
-- Conventions used throughout this file (see docs/DATABASE.md §Conventions
-- for the full rationale on each):
--   • Every table has a BIGINT UNSIGNED AUTO_INCREMENT surrogate PK (`id`)
--     for fast joins/indexing, PLUS a CHAR(36) `uuid` for anything exposed
--     in a public API URL — sequential IDs in a URL let an attacker
--     enumerate every booking/user/company by incrementing a number.
--   • `created_at` / `updated_at` on every table; `deleted_at` (soft delete)
--     on anything a user can meaningfully "remove" — history and referential
--     integrity matter more than reclaiming a few rows of disk.
--   • Money is always DECIMAL(10,2), never FLOAT/DOUBLE (binary floating
--     point cannot represent currency exactly — 0.1 + 0.2 != 0.3 is not a
--     joke you want in a payments table).
--   • Small, rarely-changing enumerations that plausibly grow (statuses,
--     legal forms, document types…) are lookup tables, not SQL ENUMs —
--     adding "disputed" as a new booking status should be an INSERT, not a
--     schema migration. Truly fixed, binary distinctions (company vs.
--     independent) use a real ENUM.
--   • utf8mb4 everywhere (German umlauts, Turkish İ/ı, emoji in chat) —
--     never utf8 (MySQL's "utf8" is a 3-byte alias that silently mangles
--     anything outside the BMP).
--   • VARCHAR(190) rather than VARCHAR(255) on indexed/unique text columns —
--     190 chars × 4 bytes (utf8mb4) = 760 bytes, safely under the 767-byte
--     max key-part length on older InnoDB configs without large-prefix
--     support. Costs nothing on modern MySQL 8, saves a real migration
--     headache on anything less than pristine.
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Self-contained on purpose: this block is what lets you open this file
-- directly in MySQL Workbench and just hit "Execute" with no prior setup
-- (npm run db:create does the same CREATE DATABASE for the CLI/API path —
-- IF NOT EXISTS makes running both against the same server harmless).
CREATE DATABASE IF NOT EXISTS homeservice CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE homeservice;

-- Safe to re-run: dropping every table before recreating it means this
-- script can be executed again from scratch in Workbench (e.g. after
-- editing a table definition) without first having to manually clear the
-- schema. Order doesn't matter here since FOREIGN_KEY_CHECKS is off.
DROP TABLE IF EXISTS
  payments,
  notifications,
  messages,
  conversations,
  reviews,
  booking_report_photos,
  booking_reports,
  booking_status_history,
  bookings,
  provider_categories,
  workers,
  independent_provider_documents,
  independent_providers,
  company_documents,
  companies,
  payment_methods,
  client_profiles,
  addresses,
  audit_logs,
  password_reset_tokens,
  refresh_tokens,
  users,
  notification_types,
  document_types,
  application_statuses,
  booking_statuses,
  legal_forms,
  categories,
  roles;

-- =============================================================================
-- SECTION 1 — LOOKUP / REFERENCE TABLES
-- =============================================================================
-- Seeded once from db/seed.sql and rarely touched again. The app's
-- src/config/constants.js `code` values are the single source of truth for
-- what belongs in each of these — seed.sql inserts exactly those values.

CREATE TABLE roles (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)  NOT NULL,
  name          VARCHAR(64)  NOT NULL,
  description   VARCHAR(255) NULL,
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Fixed account types: client, company_manager, company_worker, independent_provider, admin.';

CREATE TABLE categories (
  id            SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)  NOT NULL,
  name_de       VARCHAR(64)  NOT NULL,
  name_en       VARCHAR(64)  NOT NULL,
  icon          VARCHAR(64)  NULL COMMENT 'Ionicons name used by both apps',
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_categories_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Service categories (Klempner, Elektriker, Umzug, ...) shared by the marketplace and the provider job model.';

CREATE TABLE legal_forms (
  id                              TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code                            VARCHAR(24)  NOT NULL COMMENT 'e.g. "einzelunternehmen" — wider than the other lookup tables'' codes on purpose, some German legal form names are long.',
  name_de                         VARCHAR(64)  NOT NULL,
  name_en                         VARCHAR(64)  NOT NULL,
  requires_commercial_register    BOOLEAN NOT NULL DEFAULT FALSE
    COMMENT 'GmbH/UG/AG/OHG/KG/e.K. require a Handelsregister entry; GbR/Einzelunternehmen/Sonstige do not.',
  UNIQUE KEY uq_legal_forms_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='German legal forms a company or independent provider can register under.';

CREATE TABLE booking_statuses (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20)  NOT NULL,
  name_de       VARCHAR(64)  NOT NULL,
  name_en       VARCHAR(64)  NOT NULL,
  sort_order    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_booking_statuses_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='pending -> upcoming -> in_progress -> completed, with cancelled reachable from pending/upcoming.';

CREATE TABLE application_statuses (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(20)  NOT NULL,
  name_de       VARCHAR(64)  NOT NULL,
  name_en       VARCHAR(64)  NOT NULL,
  UNIQUE KEY uq_application_statuses_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Onboarding status for a company or independent provider: draft, pending, approved, rejected.';

CREATE TABLE document_types (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)  NOT NULL,
  name_de       VARCHAR(128) NOT NULL,
  name_en       VARCHAR(128) NOT NULL,
  UNIQUE KEY uq_document_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='gewerbeanmeldung, handelsregisterauszug, ausweis (or Aufenthaltstitel for an independent).';

CREATE TABLE notification_types (
  id            TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)  NOT NULL,
  description   VARCHAR(255) NULL,
  UNIQUE KEY uq_notification_types_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='job_assigned, report_reminder, payout, report_submitted, new_job, worker_unavailable, booking_cancelled, review_received, ...';

-- =============================================================================
-- SECTION 2 — IDENTITY & ACCESS
-- =============================================================================

CREATE TABLE users (
  id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                CHAR(36)     NOT NULL,
  role_id             TINYINT UNSIGNED NOT NULL,
  email               VARCHAR(190) NOT NULL,
  password_hash       VARCHAR(255) NOT NULL COMMENT 'argon2id hash — see src/utils/password.js. Never store or log plaintext.',
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  phone               VARCHAR(32)  NULL,
  locale              CHAR(2)      NOT NULL DEFAULT 'de' COMMENT 'ISO 639-1 — de or en today, matches both apps'' i18n.',
  is_active           BOOLEAN      NOT NULL DEFAULT TRUE COMMENT 'Deactivating a user (e.g. suspected fraud) revokes access without deleting history.',
  email_verified_at   DATETIME     NULL,
  last_login_at       DATETIME     NULL,
  created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at          DATETIME     NULL,
  UNIQUE KEY uq_users_uuid (uuid),
  UNIQUE KEY uq_users_email (email),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Every human who can log in — clients, company managers, company workers, independents, admins — one table, distinguished by role_id.';

CREATE TABLE refresh_tokens (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64)  NOT NULL COMMENT 'SHA-256 hex digest of the raw refresh token. The raw token itself is never persisted.',
  expires_at    DATETIME  NOT NULL,
  revoked_at    DATETIME  NULL COMMENT 'Set on logout, password change, or suspected compromise — revocation is a write, not a delete, for audit purposes.',
  ip_address    VARCHAR(45) NULL,
  user_agent    VARCHAR(255) NULL,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user (user_id),
  INDEX idx_refresh_tokens_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='One row per issued refresh token (i.e. per logged-in device/session) — enables per-device logout and revocation.';

CREATE TABLE password_reset_tokens (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  token_hash    CHAR(64) NOT NULL,
  expires_at    DATETIME NOT NULL,
  used_at       DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_prt_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='"Forgot password?" flow — short-lived, single-use tokens, hashed at rest just like refresh tokens.';

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NULL COMMENT 'NULL for system-initiated actions (e.g. a scheduled job).',
  action        VARCHAR(100) NOT NULL COMMENT 'e.g. worker.removed, booking.cancelled, payout_details.updated',
  entity_type   VARCHAR(64)  NULL,
  entity_id     BIGINT UNSIGNED NULL,
  metadata      JSON NULL COMMENT 'Free-form context: what changed, before/after values for sensitive fields, etc.',
  ip_address    VARCHAR(45)  NULL,
  user_agent    VARCHAR(255) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_audit_logs_user (user_id),
  INDEX idx_audit_logs_action (action),
  INDEX idx_audit_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Append-only security/compliance trail for sensitive actions. Never updated or deleted by the app.';

-- =============================================================================
-- SECTION 3 — CLIENT DOMAIN
-- =============================================================================

CREATE TABLE addresses (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          CHAR(36)     NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  label         VARCHAR(64)  NOT NULL DEFAULT 'Zuhause' COMMENT 'e.g. Zuhause, Arbeit, Bei den Eltern — free text label the client chose.',
  street        VARCHAR(190) NOT NULL,
  postal_code   VARCHAR(10)  NOT NULL,
  city          VARCHAR(100) NOT NULL,
  country       CHAR(2)      NOT NULL DEFAULT 'DE',
  phone         VARCHAR(32)  NULL,
  is_default    BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL,
  UNIQUE KEY uq_addresses_uuid (uuid),
  CONSTRAINT fk_addresses_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_addresses_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='A client''s saved addresses. Bookings snapshot the address text at creation time rather than pointing here live — see bookings table comment.';

CREATE TABLE client_profiles (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id               BIGINT UNSIGNED NOT NULL,
  default_address_id    BIGINT UNSIGNED NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_client_profiles_user (user_id),
  CONSTRAINT fk_client_profiles_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_client_profiles_address FOREIGN KEY (default_address_id) REFERENCES addresses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='1:1 extension of users for role=client. Deliberately thin today — kept as its own table (rather than columns bolted onto users) so client-only fields never leak into the shape every other role shares.';

CREATE TABLE payment_methods (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                    CHAR(36)     NOT NULL,
  user_id                 BIGINT UNSIGNED NOT NULL,
  type                    ENUM('card','apple_pay') NOT NULL,
  psp_customer_id         VARCHAR(255) NULL COMMENT 'e.g. Stripe Customer ID — the PSP, never this app, holds the real payment instrument.',
  psp_payment_method_id   VARCHAR(255) NULL COMMENT 'e.g. Stripe PaymentMethod ID (tokenized). Raw card numbers are NEVER stored here or anywhere in this schema.',
  brand                   VARCHAR(32)  NULL COMMENT 'visa, mastercard, ... — display only.',
  last4                   CHAR(4)      NULL,
  exp_month                TINYINT UNSIGNED NULL,
  exp_year                 SMALLINT UNSIGNED NULL,
  is_default              BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at              DATETIME     NULL,
  UNIQUE KEY uq_payment_methods_uuid (uuid),
  CONSTRAINT fk_payment_methods_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  INDEX idx_payment_methods_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Tokenized references to a payment instrument held by the PSP (Stripe/Adyen-style). PCI scope stays with the PSP, not this database.';

-- =============================================================================
-- SECTION 4 — PROVIDER DOMAIN: COMPANIES
-- =============================================================================

CREATE TABLE companies (
  id                          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                        CHAR(36)     NOT NULL,
  owner_user_id               BIGINT UNSIGNED NOT NULL COMMENT 'The manager (role=company_manager) who registered and represents this company.',
  legal_name                  VARCHAR(255) NOT NULL COMMENT 'Firmenname lt. Handelsregister',
  legal_form_id               TINYINT UNSIGNED NOT NULL,
  commercial_register_number  VARCHAR(64)  NULL COMMENT 'e.g. HRB 123456 — required only when legal_forms.requires_commercial_register is true.',
  register_court              VARCHAR(190) NULL COMMENT 'e.g. Amtsgericht Essen',
  street                      VARCHAR(190) NOT NULL,
  postal_code                 VARCHAR(10)  NOT NULL,
  city                        VARCHAR(100) NOT NULL,
  latitude                    DECIMAL(10,7) NULL COMMENT 'Geocoded from street/postal_code/city at onboarding time — powers "distance from me" sorting on the public listing.',
  longitude                   DECIMAL(10,7) NULL,
  hourly_rate_from            DECIMAL(8,2) UNSIGNED NULL COMMENT '"Starting from" rate the company advertises publicly — informational only. The actual charge for a given job is bookings.price_gross, agreed per booking, never derived from this column.',
  representative_name         VARCHAR(190) NOT NULL,
  representative_email        VARCHAR(190) NOT NULL,
  representative_phone        VARCHAR(32)  NULL,
  tax_number                  VARCHAR(32)  NULL COMMENT 'Steuernummer — required on every invoice per §14(4) UStG.',
  vat_id                      VARCHAR(20)  NULL COMMENT 'USt-IdNr., format DE + 9 digits — optional, only for cross-border EU invoicing.',
  account_holder              VARCHAR(190) NULL,
  iban_encrypted              VARCHAR(255) NULL COMMENT 'AES-256-GCM ciphertext, see src/utils/encryption.js. Never SELECT this column into a log or API response — decrypt server-side only when actually needed.',
  bic                         VARCHAR(20)  NULL,
  bank_name                   VARCHAR(190) NULL,
  payout_consent_at           DATETIME     NULL COMMENT 'When the representative confirmed authorization to provide these bank details.',
  application_status_id       TINYINT UNSIGNED NOT NULL,
  submitted_at                DATETIME     NULL,
  approved_at                 DATETIME     NULL,
  rejected_reason             VARCHAR(255) NULL,
  created_at                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at                  DATETIME     NULL,
  UNIQUE KEY uq_companies_uuid (uuid),
  UNIQUE KEY uq_companies_owner (owner_user_id),
  CONSTRAINT fk_companies_owner FOREIGN KEY (owner_user_id) REFERENCES users (id),
  CONSTRAINT fk_companies_legal_form FOREIGN KEY (legal_form_id) REFERENCES legal_forms (id),
  CONSTRAINT fk_companies_app_status FOREIGN KEY (application_status_id) REFERENCES application_statuses (id),
  INDEX idx_companies_app_status (application_status_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='A registered company partner — legal, tax, and payout details live here once, referenced by every worker and every booking it fulfills.';

CREATE TABLE company_documents (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id            BIGINT UNSIGNED NOT NULL,
  document_type_id      TINYINT UNSIGNED NOT NULL,
  file_url              VARCHAR(500) NOT NULL COMMENT 'Object storage URL (e.g. S3) — the file itself never lives in MySQL.',
  uploaded_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at           DATETIME NULL,
  verified_by_user_id   BIGINT UNSIGNED NULL COMMENT 'Admin who reviewed it during onboarding.',
  UNIQUE KEY uq_company_documents (company_id, document_type_id) COMMENT 'One current file per document type — re-upload replaces, see docs/DATABASE.md if versioning is ever needed.',
  CONSTRAINT fk_company_documents_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE,
  CONSTRAINT fk_company_documents_type FOREIGN KEY (document_type_id) REFERENCES document_types (id),
  CONSTRAINT fk_company_documents_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Onboarding verification documents (Gewerbeanmeldung, Handelsregisterauszug, Ausweis).';

-- =============================================================================
-- SECTION 5 — PROVIDER DOMAIN: INDEPENDENT PROVIDERS
-- =============================================================================
-- Mirrors `companies` closely on purpose — an independent is legally and
-- financially the same *kind* of entity as a company (needs tax/payout
-- details, gets verified the same way), just without the corporate-entity
-- fields (no Handelsregister, no separate "representative" — the person IS
-- the business). Kept as a separate table rather than nullable columns
-- bolted onto `companies` so NOT NULL constraints stay meaningful for both.

CREATE TABLE independent_providers (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                    CHAR(36)     NOT NULL,
  user_id                 BIGINT UNSIGNED NOT NULL,
  business_name           VARCHAR(255) NOT NULL COMMENT 'Geschäftsbezeichnung lt. Gewerbeanmeldung',
  legal_form_id           TINYINT UNSIGNED NOT NULL COMMENT 'Restricted at the application layer to einzel/gbr/other — see src/modules/independents.',
  street                  VARCHAR(190) NOT NULL,
  postal_code             VARCHAR(10)  NOT NULL,
  city                    VARCHAR(100) NOT NULL,
  latitude                DECIMAL(10,7) NULL COMMENT 'Geocoded from street/postal_code/city at onboarding time — powers "distance from me" sorting on the public listing.',
  longitude               DECIMAL(10,7) NULL,
  hourly_rate_from        DECIMAL(8,2) UNSIGNED NULL COMMENT '"Starting from" rate the provider advertises publicly — informational only. The actual charge for a given job is bookings.price_gross, agreed per booking, never derived from this column.',
  tax_number              VARCHAR(32)  NULL,
  vat_id                  VARCHAR(20)  NULL,
  account_holder          VARCHAR(190) NULL,
  iban_encrypted          VARCHAR(255) NULL,
  bic                     VARCHAR(20)  NULL,
  bank_name               VARCHAR(190) NULL,
  payout_consent_at       DATETIME     NULL,
  primary_category_id     SMALLINT UNSIGNED NULL COMMENT 'Main trade (also present in provider_categories — this is a display convenience for "top" category).',
  application_status_id   TINYINT UNSIGNED NOT NULL,
  submitted_at            DATETIME     NULL,
  approved_at             DATETIME     NULL,
  rejected_reason         VARCHAR(255) NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at              DATETIME     NULL,
  UNIQUE KEY uq_independent_providers_uuid (uuid),
  UNIQUE KEY uq_independent_providers_user (user_id),
  CONSTRAINT fk_independent_providers_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_independent_providers_legal_form FOREIGN KEY (legal_form_id) REFERENCES legal_forms (id),
  CONSTRAINT fk_independent_providers_category FOREIGN KEY (primary_category_id) REFERENCES categories (id),
  CONSTRAINT fk_independent_providers_app_status FOREIGN KEY (application_status_id) REFERENCES application_statuses (id),
  INDEX idx_independent_providers_app_status (application_status_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='A solo, self-employed provider — one person, one business, no team.';

CREATE TABLE independent_provider_documents (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  independent_provider_id   BIGINT UNSIGNED NOT NULL,
  document_type_id          TINYINT UNSIGNED NOT NULL,
  file_url                  VARCHAR(500) NOT NULL,
  uploaded_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verified_at               DATETIME NULL,
  verified_by_user_id       BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_independent_provider_documents (independent_provider_id, document_type_id),
  CONSTRAINT fk_ipd_provider FOREIGN KEY (independent_provider_id) REFERENCES independent_providers (id) ON DELETE CASCADE,
  CONSTRAINT fk_ipd_type FOREIGN KEY (document_type_id) REFERENCES document_types (id),
  CONSTRAINT fk_ipd_verifier FOREIGN KEY (verified_by_user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Same purpose as company_documents, for independents (typically just Gewerbeanmeldung + Ausweis/Aufenthaltstitel — no Handelsregister).';

-- =============================================================================
-- SECTION 6 — SHARED PROVIDER CONCEPTS
-- =============================================================================

CREATE TABLE workers (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                    CHAR(36)     NOT NULL,
  user_id                 BIGINT UNSIGNED NOT NULL,
  company_id              BIGINT UNSIGNED NOT NULL,
  specialty_category_id   SMALLINT UNSIGNED NOT NULL,
  is_available            BOOLEAN      NOT NULL DEFAULT TRUE COMMENT 'Toggleable by the worker themself or by their manager.',
  joined_date             DATE         NOT NULL,
  created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at              DATETIME     NULL COMMENT '"Removed from team" — soft delete only. bookings.assigned_worker_id keeps pointing here so historical jobs still resolve a name; "assign to" pickers just filter deleted_at IS NULL.',
  UNIQUE KEY uq_workers_uuid (uuid),
  UNIQUE KEY uq_workers_user (user_id),
  CONSTRAINT fk_workers_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_workers_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_workers_category FOREIGN KEY (specialty_category_id) REFERENCES categories (id),
  INDEX idx_workers_company (company_id),
  INDEX idx_workers_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='1:1 extension of users for role=company_worker — an employee of exactly one company.';

CREATE TABLE provider_categories (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_type             ENUM('company','independent') NOT NULL,
  company_id                BIGINT UNSIGNED NULL,
  independent_provider_id   BIGINT UNSIGNED NULL,
  category_id               SMALLINT UNSIGNED NOT NULL,
  -- MySQL treats every NULL as distinct for uniqueness purposes, so a plain
  -- UNIQUE(company_id, independent_provider_id, category_id) would NOT stop
  -- duplicate rows (two rows with the same company_id both have
  -- independent_provider_id = NULL, and NULL <> NULL). This generated,
  -- stored column collapses "whichever FK is actually set" into one value
  -- so the unique index below works as intended for either provider type.
  provider_key              VARCHAR(48) GENERATED ALWAYS AS
                              (CONCAT(provider_type, ':', COALESCE(company_id, independent_provider_id))) STORED,
  -- ON DELETE RESTRICT, not CASCADE: MySQL forbids a CASCADE/SET NULL/SET
  -- DEFAULT referential action on a column that's also used in a CHECK
  -- constraint (chk_provider_categories_type, below) — see the identical
  -- reasoning on bookings.assignedWorkerId in this same file. Companies and
  -- independent_providers are soft-deleted in this app anyway, so a real
  -- DB-level DELETE was never going to be the cleanup path in practice.
  CONSTRAINT fk_provider_categories_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
  CONSTRAINT fk_provider_categories_independent FOREIGN KEY (independent_provider_id) REFERENCES independent_providers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_provider_categories_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT chk_provider_categories_type CHECK (
    (provider_type = 'company'     AND company_id IS NOT NULL AND independent_provider_id IS NULL) OR
    (provider_type = 'independent' AND independent_provider_id IS NOT NULL AND company_id IS NULL)
  ),
  UNIQUE KEY uq_provider_categories (provider_key, category_id),
  INDEX idx_provider_categories_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Which service categories a company or independent offers — a plumbing company with a heating specialist on staff serves both Klempner and Heizung.';

-- =============================================================================
-- SECTION 7 — BOOKINGS / JOBS (the core of the whole schema)
-- =============================================================================
-- A client's "booking" (home-services-app) and a provider's "job"
-- (home-services-company-app) are the same real-world event viewed from two
-- sides of one marketplace transaction. Modeling them as two separate
-- tables would mean every state change (accepted, rescheduled, completed)
-- has to be synced between two records that can drift — this schema
-- deliberately unifies them into one `bookings` table instead.

CREATE TABLE bookings (
  id                         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                       CHAR(36)     NOT NULL,
  booking_number             VARCHAR(20)  NOT NULL COMMENT 'Human-readable reference shown in both apps, e.g. JOB-100234.',

  client_id                  BIGINT UNSIGNED NOT NULL,
  category_id                SMALLINT UNSIGNED NOT NULL,
  service_label              VARCHAR(190) NOT NULL COMMENT 'The specific service within the category, e.g. "Rohrverstopfung".',

  provider_type              ENUM('company','independent') NOT NULL,
  company_id                 BIGINT UNSIGNED NULL,
  independent_provider_id    BIGINT UNSIGNED NULL,
  assigned_worker_id         BIGINT UNSIGNED NULL COMMENT 'NULL = created but not yet dispatched to anyone ("assign later"). Always NULL when provider_type = independent (they are their own worker). FK is ON DELETE RESTRICT, not SET NULL — see fk_bookings_worker below.',

  -- Snapshot, not a live reference: a client's saved address or phone
  -- number can change after a booking is made; the job record should keep
  -- showing what was true when the work was scheduled, the way a real
  -- invoice would, not silently update if the profile changes later.
  client_name                VARCHAR(190) NOT NULL,
  client_phone               VARCHAR(32)  NOT NULL,
  address_street             VARCHAR(190) NOT NULL,
  address_postal_code        VARCHAR(10)  NOT NULL,
  address_city               VARCHAR(100) NOT NULL,

  scheduled_date             DATE NOT NULL,
  scheduled_time             TIME NOT NULL,

  status_id                  TINYINT UNSIGNED NOT NULL,

  price_gross                 DECIMAL(10,2) UNSIGNED NOT NULL COMMENT 'What the client is charged, incl. 19% MwSt. per PAngV.',
  platform_fee_rate           DECIMAL(5,4) UNSIGNED NOT NULL COMMENT 'Snapshotted at booking time — a later change to the platform-wide rate must never alter historical bookings.',
  provider_earning_net         DECIMAL(10,2) UNSIGNED NOT NULL COMMENT 'price_gross * (1 - platform_fee_rate). Computed once at write time and stored — never recalculated on read, so it can never silently change.',

  is_recurring                BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_frequency         ENUM('weekly','biweekly','monthly') NULL,
  is_emergency                 BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'SOS/Notdienst booking — surfaced with priority in both apps.',

  cancelled_at                DATETIME NULL,
  cancelled_reason             VARCHAR(255) NULL,
  cancelled_by_user_id         BIGINT UNSIGNED NULL,

  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at                  DATETIME NULL,

  UNIQUE KEY uq_bookings_uuid (uuid),
  UNIQUE KEY uq_bookings_number (booking_number),
  CONSTRAINT fk_bookings_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_bookings_category FOREIGN KEY (category_id) REFERENCES categories (id),
  CONSTRAINT fk_bookings_company FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_independent FOREIGN KEY (independent_provider_id) REFERENCES independent_providers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_worker FOREIGN KEY (assigned_worker_id) REFERENCES workers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_status FOREIGN KEY (status_id) REFERENCES booking_statuses (id),
  CONSTRAINT fk_bookings_cancelled_by FOREIGN KEY (cancelled_by_user_id) REFERENCES users (id),

  CONSTRAINT chk_bookings_provider CHECK (
    (provider_type = 'company'     AND company_id IS NOT NULL AND independent_provider_id IS NULL) OR
    (provider_type = 'independent' AND independent_provider_id IS NOT NULL AND company_id IS NULL)
  ),
  CONSTRAINT chk_bookings_worker_scope CHECK (
    assigned_worker_id IS NULL OR provider_type = 'company'
  ),
  CONSTRAINT chk_bookings_fee_rate CHECK (platform_fee_rate >= 0 AND platform_fee_rate < 1),

  INDEX idx_bookings_client (client_id),
  INDEX idx_bookings_company (company_id),
  INDEX idx_bookings_independent (independent_provider_id),
  INDEX idx_bookings_worker (assigned_worker_id),
  INDEX idx_bookings_status (status_id),
  INDEX idx_bookings_scheduled_date (scheduled_date),
  INDEX idx_bookings_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='The single source of truth for a service job. A client''s booking and a provider''s job are the same row.';

CREATE TABLE booking_status_history (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id             BIGINT UNSIGNED NOT NULL,
  from_status_id         TINYINT UNSIGNED NULL COMMENT 'NULL for the very first row (booking creation).',
  to_status_id           TINYINT UNSIGNED NOT NULL,
  changed_by_user_id     BIGINT UNSIGNED NULL,
  note                   VARCHAR(255) NULL,
  changed_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bsh_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_bsh_from_status FOREIGN KEY (from_status_id) REFERENCES booking_statuses (id),
  CONSTRAINT fk_bsh_to_status FOREIGN KEY (to_status_id) REFERENCES booking_statuses (id),
  CONSTRAINT fk_bsh_changed_by FOREIGN KEY (changed_by_user_id) REFERENCES users (id),
  INDEX idx_bsh_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Full audit trail of every status transition — bookings.status_id is never just overwritten without a row appended here.';

CREATE TABLE booking_reports (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id         BIGINT UNSIGNED NOT NULL,
  materials_used     JSON NULL COMMENT 'Array of {"name": string, "qty": number, "unit": string} — see docs/DATABASE.md for the exact shape.',
  remarks            TEXT NULL,
  additional_info     TEXT NULL,
  submitted_at        DATETIME NOT NULL,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Bumped whenever the worker edits the report after submission.',
  UNIQUE KEY uq_booking_reports_booking (booking_id) COMMENT 'One report per booking — editing replaces its fields in place, see booking_status_history for the audit trail of when.',
  CONSTRAINT fk_booking_reports_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='The completion report a worker/independent files once a job is done — materials used, remarks, anything else worth noting.';

CREATE TABLE booking_report_photos (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_report_id      BIGINT UNSIGNED NOT NULL,
  photo_url               VARCHAR(500) NOT NULL COMMENT 'Object storage URL — never a base64 blob in this table.',
  caption                 VARCHAR(190) NULL,
  uploaded_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_brp_report FOREIGN KEY (booking_report_id) REFERENCES booking_reports (id) ON DELETE CASCADE,
  INDEX idx_brp_report (booking_report_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Normalized child table rather than a JSON array on booking_reports — photos are the one part of a report likely to need their own metadata later (moderation status, EXIF, storage tier).';

CREATE TABLE reviews (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                       CHAR(36) NOT NULL,
  booking_id                 BIGINT UNSIGNED NOT NULL,
  client_id                  BIGINT UNSIGNED NOT NULL,
  provider_type               ENUM('company','independent') NOT NULL,
  company_id                  BIGINT UNSIGNED NULL,
  independent_provider_id     BIGINT UNSIGNED NULL,
  rating                      TINYINT UNSIGNED NOT NULL,
  comment                     TEXT NULL,
  provider_response            TEXT NULL,
  provider_responded_at        DATETIME NULL,
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reviews_uuid (uuid),
  UNIQUE KEY uq_reviews_booking (booking_id) COMMENT 'One review per booking.',
  CONSTRAINT fk_reviews_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_reviews_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_reviews_independent FOREIGN KEY (independent_provider_id) REFERENCES independent_providers (id),
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT chk_reviews_provider CHECK (
    (provider_type = 'company'     AND company_id IS NOT NULL AND independent_provider_id IS NULL) OR
    (provider_type = 'independent' AND independent_provider_id IS NOT NULL AND company_id IS NULL)
  ),
  INDEX idx_reviews_company (company_id),
  INDEX idx_reviews_independent (independent_provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='A client''s rating + comment on a completed booking, with an optional public reply from the provider.';

-- =============================================================================
-- SECTION 8 — COMMUNICATION
-- =============================================================================

CREATE TABLE conversations (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                       CHAR(36) NOT NULL,
  client_id                  BIGINT UNSIGNED NOT NULL,
  provider_type               ENUM('company','independent') NOT NULL,
  company_id                  BIGINT UNSIGNED NULL,
  independent_provider_id     BIGINT UNSIGNED NULL,
  booking_id                  BIGINT UNSIGNED NULL COMMENT 'NULL for a pre-booking inquiry chat; set once a booking exists.',
  last_message_at              DATETIME NULL,
  created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conversations_uuid (uuid),
  CONSTRAINT fk_conversations_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_conversations_company FOREIGN KEY (company_id) REFERENCES companies (id),
  CONSTRAINT fk_conversations_independent FOREIGN KEY (independent_provider_id) REFERENCES independent_providers (id),
  CONSTRAINT fk_conversations_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE SET NULL,
  CONSTRAINT chk_conversations_provider CHECK (
    (provider_type = 'company'     AND company_id IS NOT NULL AND independent_provider_id IS NULL) OR
    (provider_type = 'independent' AND independent_provider_id IS NOT NULL AND company_id IS NULL)
  ),
  INDEX idx_conversations_client (client_id),
  INDEX idx_conversations_company (company_id),
  INDEX idx_conversations_independent (independent_provider_id),
  INDEX idx_conversations_last_message (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='A chat thread between a client and a provider. REST today (send/poll); see docs/ARCHITECTURE.md for the recommended path to real-time (Socket.IO + Redis pub/sub) if that becomes a priority.';

CREATE TABLE messages (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id     BIGINT UNSIGNED NOT NULL,
  sender_user_id       BIGINT UNSIGNED NOT NULL,
  body                 TEXT NOT NULL,
  sent_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at              DATETIME NULL,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users (id),
  INDEX idx_messages_conversation (conversation_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Individual chat messages within a conversation.';

CREATE TABLE notifications (
  id                    BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                   CHAR(36) NOT NULL,
  user_id                 BIGINT UNSIGNED NOT NULL COMMENT 'The recipient. "Notify the manager" is resolved to companies.owner_user_id at write time — see docs/ARCHITECTURE.md if multi-manager companies are ever supported.',
  notification_type_id     TINYINT UNSIGNED NOT NULL,
  related_booking_id       BIGINT UNSIGNED NULL,
  title                   VARCHAR(190) NOT NULL,
  message                 TEXT NOT NULL,
  is_read                 BOOLEAN NOT NULL DEFAULT FALSE,
  read_at                 DATETIME NULL,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_notifications_uuid (uuid),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_type FOREIGN KEY (notification_type_id) REFERENCES notification_types (id),
  CONSTRAINT fk_notifications_booking FOREIGN KEY (related_booking_id) REFERENCES bookings (id) ON DELETE SET NULL,
  INDEX idx_notifications_user_unread (user_id, is_read),
  INDEX idx_notifications_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='Per-user activity feed entries (job assigned, report reminder, payout sent, ...).';

-- =============================================================================
-- SECTION 9 — PAYMENTS
-- =============================================================================
-- This platform never holds client funds directly — a PSP (Stripe Connect /
-- Adyen-style) sits between the client's card and the provider's payout
-- account, automatically deducting the platform fee. That architecture
-- decision (made to avoid needing a BaFin ZAG payment-institution license)
-- is why `payments` stores PSP references, not raw settlement logic.

CREATE TABLE payments (
  id                        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid                       CHAR(36) NOT NULL,
  booking_id                  BIGINT UNSIGNED NOT NULL,
  payment_method_id            BIGINT UNSIGNED NULL,
  amount_gross                 DECIMAL(10,2) UNSIGNED NOT NULL,
  currency                     CHAR(3) NOT NULL DEFAULT 'EUR',
  status                       ENUM('pending','succeeded','failed','refunded') NOT NULL DEFAULT 'pending',
  psp                          VARCHAR(32) NOT NULL DEFAULT 'stripe',
  psp_payment_intent_id         VARCHAR(255) NULL,
  psp_charge_id                 VARCHAR(255) NULL,
  failure_reason                VARCHAR(255) NULL,
  processed_at                 DATETIME NULL,
  created_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_uuid (uuid),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings (id),
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods (id),
  INDEX idx_payments_booking (booking_id),
  INDEX idx_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='One row per payment attempt against a booking. The PSP is the system of record for the money movement itself; this table just tracks state for the app.';

SET FOREIGN_KEY_CHECKS = 1;
