/**
 * Field-level encryption for at-rest sensitive data (IBAN, BIC).
 *
 * A database backup, a leaked mysqldump, or a compromised read-replica
 * would otherwise expose every payout account in plain text. AES-256-GCM
 * gives us authenticated encryption (tamper-evident, not just obfuscated) —
 * this is what actually earns the "high security" bar for a system that
 * stores bank account numbers, as opposed to just hashing passwords and
 * calling it done.
 *
 * The encryption key lives in FIELD_ENCRYPTION_KEY (env, never in code or
 * the DB) — rotate it via a re-encryption migration if it's ever suspected
 * compromised. This module intentionally has no fallback "if no key, store
 * plain text" path: better to fail loudly at boot than silently store
 * unencrypted bank details.
 */
const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended IV size for GCM

const getKey = () => {
  const key = Buffer.from(env.FIELD_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).');
  }
  return key;
};

/** Encrypts a plaintext string. Returns `iv:authTag:ciphertext`, all base64. */
const encryptField = (plainText) => {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
};

/** Reverses encryptField. Returns null for null/empty input (never throws on empty). */
const decryptField = (payload) => {
  if (!payload) return null;
  const [ivB64, authTagB64, dataB64] = payload.split(':');
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Malformed encrypted field payload.');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
};

/** Masks an IBAN for display: keeps the country code + last 4 digits. */
const maskIban = (iban) => {
  if (!iban) return null;
  const cleaned = iban.replace(/\s+/g, '');
  if (cleaned.length <= 8) return cleaned;
  return `${cleaned.slice(0, 4)} •••• •••• ${cleaned.slice(-4)}`;
};

module.exports = { encryptField, decryptField, maskIban };
