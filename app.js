require("dotenv").config();
const admin = require("firebase-admin");
const CronJob = require("cron").CronJob;
const sensor = require("./sensor");
const { getCurrentDate } = require("./util");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://test-project-77dd2.firebaseio.com",
});

const db = admin.firestore();

const startDataCollection = () => {
  // start = true (no need for job.start())
  // runOnInit = true (runs after job initialized)
  new CronJob(
    "0 */3 * * * *",
    () => {
      sensor.sync().then((sensorData) => {
        db.doc("sensor/mtiv09e1").update(sensorData);

        const ref = db.doc(`sensor/mtiv09e1/data/${getCurrentDate()}`);

        ref
          .get()
          .then((doc) => {
            if (!doc.exists) {
              return ref.create({
                data: [],
              });
            }
          })
          .then(() =>
            ref.update({
              data: admin.firestore.FieldValue.arrayUnion(sensorData),
            })
          )
          .then(() => console.log(`[${sensor.time}] Data inserted`));
      });
    },
    null,
    true,
    null,
    null,
    true
  );
};

db.doc("sensor/mtiv09e1")
  .set({ name: "MTIV-09-E UNIC" }, { merge: true })
  .then(() => startDataCollection());
