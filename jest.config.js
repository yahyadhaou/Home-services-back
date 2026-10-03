module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // argon2id hashing is deliberately expensive (see src/utils/password.js)
  // and every test hits a real MySQL database — the 5s Jest default is too
  // tight for that, not a sign something's hanging.
  testTimeout: 20000,
  // Closes the Sequelize pool after every test file — each file gets its
  // own module registry (and so its own pool); without this Jest hangs on
  // exit waiting for open DB connections.
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jestSetup.js'],
  // expo-server-sdk ships ESM Jest can't parse without a Babel pipeline —
  // see tests/mocks/expoServerSdk.js for why a stub is the right fix here.
  moduleNameMapper: {
    '^expo-server-sdk$': '<rootDir>/tests/mocks/expoServerSdk.js',
  },
};
