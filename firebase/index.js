const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: process.env.STORAGE_BUCKET,
});

const db = admin.firestore();

module.exports = { admin, db };
