-- Additive migration for an existing dev database (no schema.sql / db:reset
-- needed — that would wipe seeded data). Run with:
--   node db/scripts/runSqlFile.js db/migrations/2026_add_push_tokens.sql
-- Safe to re-run: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS push_tokens (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       BIGINT UNSIGNED NOT NULL,
  token         VARCHAR(255) NOT NULL COMMENT 'Expo push token (ExponentPushToken[...]) for one installed app on one device.',
  platform      ENUM('ios', 'android') NULL,
  created_at    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  UNIQUE KEY uq_push_tokens_user_token (user_id, token),
  INDEX idx_push_tokens_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  COMMENT='One row per (user, device) push token — a user can be signed in on several devices at once.';
