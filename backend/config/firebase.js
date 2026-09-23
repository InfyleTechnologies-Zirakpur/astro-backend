const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const path = require("path");

let messaging = null;
let firebaseApp = null;

try {
  const serviceAccount = require(
    path.join(__dirname, "firebase-service-account.json"),
  );

  firebaseApp = initializeApp({
    credential: cert(serviceAccount),
  });

  messaging = getMessaging(firebaseApp);
} catch (error) {
  console.error("Firebase Admin SDK failed to initialize:", error.message);
}

module.exports = {
  firebaseApp,
  messaging,
};
