/**
 * Test stub for expo-server-sdk — the real package ships ESM syntax Jest's
 * default (Babel-less) transform can't parse, and tests shouldn't attempt
 * real push sends anyway (no push tokens exist in the test database, and
 * there's no real EAS/push setup to send through — see
 * notifications.service.js's sendPushNotification, which this replaces).
 */
class Expo {
  // eslint-disable-next-line class-methods-use-this
  static isExpoPushToken() {
    return false;
  }

  // eslint-disable-next-line class-methods-use-this
  chunkPushNotifications(messages) {
    return [messages];
  }

  // eslint-disable-next-line class-methods-use-this
  async sendPushNotificationsAsync() {
    return [];
  }
}

module.exports = { Expo };
