const {
  initializeApp,
  cert,
  getApps,
} = require("firebase-admin/app");

const {
  getMessaging,
} = require("firebase-admin/messaging");

const hasCredentials = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
);

let messaging = null;

if (!hasCredentials) {
  // Push notifications are optional. Without credentials the server still has
  // to boot — the chat and the consultations must keep working, only the
  // pushes are skipped.
  console.warn(
    "[firebase] credentials are missing — push notifications are disabled",
  );
} else {
  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
    }
    messaging = getMessaging();
  } catch (error) {
    // A broken service account must not take the whole server down.
    console.error(
      "[firebase] messaging could not start:",
      error?.message || error,
    );
    messaging = null;
  }
}

module.exports = {
  messaging,
};
