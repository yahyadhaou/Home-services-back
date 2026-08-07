/**
 * Password hashing via argon2id.
 *
 * Why argon2id over bcrypt: OWASP's current Password Storage Cheat Sheet
 * lists Argon2id as the first-choice algorithm (winner of the 2015 Password
 * Hashing Competition, resistant to both GPU-cracking and side-channel
 * attacks in a way bcrypt isn't). bcrypt is still acceptable, but for a
 * project starting fresh in 2026 there's no reason not to start with the
 * stronger default.
 */
const argon2 = require('argon2');

// argon2's own defaults are already OWASP-aligned (19 MiB memory, 2
// iterations, 1 thread would be too weak — the library actually defaults
// to sane production values as of v0.41). We pin them explicitly anyway so
// a library upgrade can't silently change the security/performance
// trade-off out from under us.
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

const hashPassword = (plainTextPassword) => argon2.hash(plainTextPassword, HASH_OPTIONS);

const verifyPassword = (hash, plainTextPassword) => argon2.verify(hash, plainTextPassword);

module.exports = { hashPassword, verifyPassword };
