const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://test-project-77dd2.firebaseio.com",
});

const db = admin.firestore();

module.exports = { admin, db };
