const CronJob = require("cron").CronJob;
const { admin, db } = require("../firebase");
const {
  getCurrentDate,
  calculateAverage,
  getCurrentDateUnixTime,
  getDateFromUnixTime,
} = require("../util");
const {
  warningCooldownInMilliseconds,
  timespanToKeepInMilliseconds,
} = require("../util/constants");
const Mailer = require("../util/Mailer");
const log = require("../util/Logger");

class SensorManager {
  /**
   * @param {import('./Sensor')} sensor
   */
  constructor(sensor) {
    this.sensor = sensor;
  }

  async start() {
    this.initializeData();
    await this.initializeSensorInFirestore();
    await this.initializeDayInFirestore();
    await this.initializeMovingAverage();

    this.startNewDayJob();
    this.startSensorUpdateJob();
    this.startDataInsertJob();
    this.startWarningJob();
  }

  startNewDayJob() {
    if (this.newDayJob) {
      this.newDayJob.stop();
    }

    this.newDayJob = new CronJob("0 0 0 * * *", async () => {
      this.initializeData();
      await this.initializeDayInFirestore();
      await this.deleteOldDataInFirestore();
    });

    this.newDayJob.start();
  }

  startSensorUpdateJob() {
    if (this.sensorUpdateJob) {
      this.sensorUpdateJob.stop();
    }

    this.sensorUpdateJob = new CronJob("30 * * * * *", async () => {
      try {
        await this.sensor.sync();
        const dataChanged = this.updateData();
        if (dataChanged) {
          this.persistSensorData();
        }
      } catch (err) {
        log.error(err);
      }
    });

    this.sensorUpdateJob.start();
  }

  startDataInsertJob() {
    if (this.dataInsertJob) {
      this.dataInsertJob.stop();
    }

    this.dataInsertJob = new CronJob("32 3-59/4 * * * *", async () => {
      try {
        await this.sensor.sync();
        await this.insertSensorData();
      } catch (err) {
        log.error(err);
      }
    });

    this.dataInsertJob.start();
  }

  startWarningJob() {
    if (this.warningJob) {
      this.warningJob.stop();
    }

    this.warningJob = new CronJob("34 * * * * *", async () => {
      try {
        await this.sensor.sync();
        this.checkLimitsAndSendWarningEmails();
      } catch (err) {
        log.error(err);
      }
    });

    this.warningJob.start();
  }

  async checkLimitsAndSendWarningEmails() {
    const eligibleUsers = {};
    const minLastAlertTime = Date.now() - warningCooldownInMilliseconds;

    try {
      await db
        .collection("users")
        .where("temperature", "<=", this.sensor.temperature)
        .where("sendAlerts", "==", true)
        .get()
        .then((docs) => {
          docs.forEach((doc) => {
            if (doc.data().lastAlertTime <= minLastAlertTime) {
              eligibleUsers[doc.id] = doc.data();
            }
          });
        });

      await db
        .collection("users")
        .where("humidity", "<=", this.sensor.humidity)
        .where("sendAlerts", "==", true)
        .get()
        .then((docs) => {
          docs.forEach((doc) => {
            if (doc.data().lastAlertTime <= minLastAlertTime) {
              eligibleUsers[doc.id] = doc.data();
            }
          });
        });
    } catch (err) {
      log.error("Error getting users eligible for warnings");
      log.error(err);
      return;
    }

    const eligibleCount = Object.keys(eligibleUsers).length;
    if (eligibleCount > 0) {
      log.info(`${eligibleCount} eligible user(s) for alerts`);
    }

    for (const email in eligibleUsers) {
      try {
        await Mailer.sendEmail({
          to: email,
          subject: `UPOZORENJE: Senzor ${this.sensor.name}`,
          text: `Senzor ${this.sensor.name} je pročitao vrednost koja prelazi dozvoljenu granicu.\n\nTrenutno stanje senzora:\nTemperatura: ${this.sensor.temperature}°C\nVlažnost: ${this.sensor.humidity}%`,
        });
        log.info(`Sent warning to ${email}`);
      } catch (err) {
        log.error(`Error while sending email to ${email}`);
        log.error(err);
      }

      try {
        await db
          .doc(`users/${email}`)
          .set({ lastAlertTime: Date.now() }, { merge: true });
      } catch (err) {
        log.error("Error while updating lastAlertTime");
        log.error(err);
      }
    }
  }

  /**
   * Saves current sensor data and calculated daily averages to the sensor
   * document in the Firestore.
   */
  async persistSensorData() {
    const ref = db.doc(`sensor/${this.sensor.id}`);

    return await ref
      .set(
        {
          temperature: this.data.temperature,
          humidity: this.data.humidity,
          averageTemperature: this.data.averageTemperature,
          averageHumidity: this.data.averageHumidity,
          maxTemperature: this.data.maxTemperature,
          minTemperature: this.data.minTemperature,
          maxHumidity: this.data.maxHumidity,
          minHumidity: this.data.minHumidity,
          lastUpdateTime: Date.now(),
        },
        { merge: true }
      )
      .then(() => log.info(`Sensor data updated`))
      .catch((err) => {
        log.error("Failed to update sensor data");
        log.error(err);
      });
  }

  /**
   * Save current sensor data to Firestore. Data is inserted into an array
   * of the document with the path sensor/<sensor_id>/data/<current_date>.
   * Also sets the current day's average temperature and humidity.
   */
  async insertSensorData() {
    const ref = db.doc(`sensor/${this.sensor.id}/data/${this.data.date}`);

    const data = {
      t: this.sensor.temperature,
      h: this.sensor.humidity,
      ts: Date.now(),
    };

    if (
      this.data &&
      this.data.movingAverageArray &&
      this.data.movingAverageArray.length > 0
    ) {
      data.at =
        this.data.movingAverageArray
          .map((p) => p.temperature)
          .reduce((a, b) => a + b, 0) / this.data.movingAverageArray.length;

      data.ah =
        this.data.movingAverageArray
          .map((p) => p.humidity)
          .reduce((a, b) => a + b, 0) / this.data.movingAverageArray.length;
    }

    return await ref
      .set(
        {
          data: admin.firestore.FieldValue.arrayUnion(data),
          averageTemperature: this.data.averageTemperature,
          averageHumidity: this.data.averageHumidity,
          maxTemperature: this.data.maxTemperature,
          minTemperature: this.data.minTemperature,
          maxHumidity: this.data.maxHumidity,
          minHumidity: this.data.minHumidity,
          timestamp: getCurrentDateUnixTime(),
        },
        { merge: true }
      )
      .then(() => log.info(`New point added`))
      .catch((err) => {
        log.error("Failed to add new point");
        log.error(err);
      });
  }

  /**
   * Initialize current day for sensor in Firestore. If the day already exists,
   * load averages and number of points.
   * @returns Whether the day was created.
   */
  async initializeDayInFirestore() {
    const ref = db.doc(`sensor/${this.sensor.id}/data/${this.data.date}`);

    const doc = await ref.get();

    if (doc.exists) {
      const data = doc.data();
      this.data.averageTemperature = data.averageTemperature || 0;
      this.data.averageHumidity = data.averageHumidity || 0;
      this.data.maxTemperature = data.maxTemperature || 0;
      this.data.minTemperature = data.minTemperature || 999;
      this.data.maxHumidity = data.maxHumidity || 0;
      this.data.minHumidity = data.minHumidity || 100;
      this.data.count = data.data.length;

      log.info("Current day exists in Firestore");

      return false;
    }

    try {
      await this.sensor.sync();
    } catch (err) {
      log.error("Failed to sync sensor");
      log.error(err);
    }

    this.data.averageTemperature = this.sensor.temperature;
    this.data.averageHumidity = this.sensor.humidity;
    this.data.maxTemperature = this.sensor.temperature;
    this.data.minTemperature = this.sensor.temperature;
    this.data.maxHumidity = this.sensor.humidity;
    this.data.minHumidity = this.sensor.humidity;
    this.data.count = 0;

    await ref
      .create({
        data: [],
        averageTemperature: this.sensor.temperature,
        averageHumidity: this.sensor.humidity,
        maxTemperature: this.sensor.temperature,
        minTemperature: this.sensor.temperature,
        maxHumidity: this.sensor.humidity,
        minHumidity: this.sensor.humidity,
        timestamp: getCurrentDateUnixTime(),
      })
      .then(() => log.info(`Created new day ${getCurrentDate()}`))
      .catch((err) => {
        log.error(`Failed to create new day ${getCurrentDate()}`);
        log.error(err);
      });

    return true;
  }

  /**
   * Creates the sensor in Firestore, if it doesn't exist already.
   * @returns Whether the sensor was created.
   */
  async initializeSensorInFirestore() {
    const ref = db.doc(`sensor/${this.sensor.id}`);

    const doc = await ref.get();

    if (doc.exists) {
      log.info("Sensor exists");
      return false;
    }

    try {
      await this.sensor.sync();
    } catch (err) {
      log.error("Failed to sync sensor");
      log.error(err);
    }

    await ref
      .create({
        name: this.sensor.name,
        temperature: this.sensor.temperature,
        humidity: this.sensor.humidity,
        averageTemperature: this.sensor.temperature,
        averageHumidity: this.sensor.humidity,
        maxTemperature: this.sensor.temperature,
        minTemperature: this.sensor.temperature,
        maxHumidity: this.sensor.humidity,
        minHumidity: this.sensor.humidity,
        firstDayTimestamp: getCurrentDateUnixTime(),
        lastUpdateTime: Date.now(),
      })
      .then(() => log.info("Created sensor in Firestore"))
      .catch((err) => {
        log.error("Failed to create sensor in Firestore");
        log.error(err);
      });

    return true;
  }

  /**
   * Initializes moving average calculation. Makes no changes to Firebase.
   */
  async initializeMovingAverage() {
    const ref = db.doc(`sensor/${this.sensor.id}/data/${this.data.date}`);

    await ref
      .get()
      .then((doc) => {
        if (doc.exists) {
          this.data.movingAverageArray = doc
            .data()
            .data.filter((p) => p.ts > Date.now() - 1000 * 60 * 60)
            .map((p) => ({ temperature: p.t, humidity: p.h, timestamp: p.ts }));

          log.info("Initialized moving average calculation");
        }
      })
      .catch((err) => {
        log.error("Error while initializing moving average calculation");
        log.error(err);
      });

    if (
      !this.data.movingAverageArray ||
      this.data.movingAverageArray.length === 0
    ) {
      let success = false;
      let tries = 0;

      while (!success && tries < 3) {
        try {
          tries++;

          await this.sensor.sync();

          this.data.movingAverageArray = [
            {
              temperature: this.sensor.temperature,
              humidity: this.sensor.humidity,
              timestamp: Date.now(),
            },
          ];

          success = true;

          log.info("Initialized moving average calculation manually");
        } catch (err) {
          log.error(
            `Error while initializing moving average calculation manually | Try: ${tries}`
          );
          log.error(err);
        }
      }

      if (!success) {
        this.data.movingAverageArray = [
          {
            temperature: 20,
            humidity: 40,
            timestamp: Date.now(),
          },
        ];
      }
    }
  }

  async deleteOldDataInFirestore() {
    const lastDayToKeepTimestamp =
      getCurrentDateUnixTime() - timespanToKeepInMilliseconds;

    await db
      .collection(`sensor/${this.sensor.id}/data`)
      .where("timestamp", "<", lastDayToKeepTimestamp)
      .get()
      .then(async (docs) => {
        for (let i = 0; i < docs.docs.length; ++i) {
          await docs.docs[i].ref
            .delete()
            .then(() => log.info(`Deleted day ${docs.docs[i].id}`))
            .catch((err) => {
              log.error(`Error while deleting day ${docs.docs[i].id}`);
              log.error(err);
            });
        }
      })
      .catch((err) => {
        log.error("Error while deleting old data");
        log.error(err);
      })
      .finally(() =>
        db
          .collection(`sensor/${this.sensor.id}/data`)
          .orderBy("timestamp", "asc")
          .limit(1)
          .get()
          .then((docs) => {
            if (!docs.empty) {
              db.doc(`sensor/${this.sensor.id}`)
                .set(
                  { firstDayTimestamp: docs.docs[0].data().timestamp },
                  { merge: true }
                )
                .then(() =>
                  log.info(
                    `Set first day as ${getDateFromUnixTime(
                      docs.docs[0].data().timestamp
                    )}`
                  )
                )
                .catch((err) => {
                  log.error("Error while setting new firstDayTimestamp");
                  log.error(err);
                });
            }
          })
      );
  }

  initializeData() {
    let lastMovingAverageArray;
    if (this.data) {
      lastMovingAverageArray = this.data.movingAverageArray;
    }

    this.data = {
      count: 0,
      date: getCurrentDate(),
      movingAverageArray: lastMovingAverageArray || [],
    };
  }

  /**
   * Updates manager data with current sensor data.
   * @returns Whether any data has changed since the last update.
   */
  updateData() {
    let dataChanged = false;

    this.data.movingAverageArray.push({
      temperature: this.sensor.temperature,
      humidity: this.sensor.humidity,
      timestamp: Date.now(),
    });

    this.data.movingAverageArray = this.data.movingAverageArray.filter(
      (p) => p.timestamp > Date.now() - 1000 * 60 * 60
    );

    const newAverageTemperature = calculateAverage(
      this.data.averageTemperature,
      this.data.count,
      this.sensor.temperature
    );
    const newAverageHumidity = calculateAverage(
      this.data.averageHumidity,
      this.data.count,
      this.sensor.humidity
    );
    const newMaxTemperature = Math.max(
      this.data.maxTemperature,
      this.sensor.temperature
    );
    const newMinTemperature = Math.min(
      this.data.minTemperature,
      this.sensor.temperature
    );
    const newMaxHumidity = Math.max(
      this.data.maxHumidity,
      this.sensor.humidity
    );
    const newMinHumidity = Math.min(
      this.data.minHumidity,
      this.sensor.humidity
    );

    if (
      this.data.temperature != this.sensor.temperature ||
      this.data.humidity != this.sensor.humidity ||
      this.data.averageTemperature.toFixed(1) !=
        newAverageTemperature.toFixed(1) ||
      this.data.averageHumidity.toFixed(1) != newAverageHumidity.toFixed(1) ||
      this.data.maxTemperature != newMaxTemperature ||
      this.data.minTemperature != newMinTemperature ||
      this.data.maxHumidity != newMaxHumidity ||
      this.data.minHumidity != newMinHumidity
    ) {
      dataChanged = true;
    }

    if (!isNaN(this.sensor.temperature))
      this.data.temperature = this.sensor.temperature;
    if (!isNaN(this.sensor.humidity)) this.data.humidity = this.sensor.humidity;
    if (!isNaN(newAverageTemperature))
      this.data.averageTemperature = newAverageTemperature;
    if (!isNaN(newAverageHumidity))
      this.data.averageHumidity = newAverageHumidity;
    if (!isNaN(newMaxTemperature)) this.data.maxTemperature = newMaxTemperature;
    if (!isNaN(newMinTemperature)) this.data.minTemperature = newMinTemperature;
    if (!isNaN(newMaxHumidity)) this.data.maxHumidity = newMaxHumidity;
    if (!isNaN(newMinHumidity)) this.data.minHumidity = newMinHumidity;
    this.data.count++;

    return dataChanged;
  }
}

module.exports = SensorManager;
