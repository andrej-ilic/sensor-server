const CronJob = require("cron").CronJob;
const { admin, db } = require("./firebase");
const {
  getCurrentDate,
  calculateAverage,
  getCurrentDateUnixTime,
} = require("./util");
const {
  minimalTriggerHumiity,
  minimalTriggerTemperature,
  warningCooldownInMilliseconds,
} = require("./constants");
const Mailer = require("./Mailer");
const Mail = require("nodemailer/lib/mailer");

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
        console.error(err);
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
        this.insertSensorData();
      } catch (err) {
        console.error(err);
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
        console.error(err);
      }
    });

    this.warningJob.start();
  }

  async checkLimitsAndSendWarningEmails() {
    if (
      this.sensor.temperature > minimalTriggerTemperature ||
      this.sensor.humidity > minimalTriggerHumiity
    ) {
      console.log("Temperature or humidity higher than limit");

      const warningsRef = db.doc(`sensor/${this.sensor.id}/data/warnings`);

      warningsRef
        .get()
        .then((doc) => {
          const { emails, lastSendTime } = doc.data();

          if (Date.now() - warningCooldownInMilliseconds > lastSendTime) {
            console.log("Sending emails");

            warningsRef
              .set({ lastSendTime: Date.now() }, { merge: true })
              .then(async () => {
                for (let i = 0; i < emails.length; ++i) {
                  await Mailer.sendEmail({
                    to: emails[i],
                    subject: `UPOZORENJE: Senzor ${this.sensor.name}`,
                    text: `Senzor ${this.sensor.name} je pročitao vrednost koja prelazi dozvoljenu granicu.\n\nTrenutno stanje senzora:\nTemperatura: ${this.sensor.temperature}°C\nVlažnost: ${this.sensor.humidity}%`,
                  });
                }
              });
          }
        })
        .catch((err) => console.error(err));
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
      .then(() => console.log(`${new Date()} sensor updated`))
      .catch((err) => console.error(err));
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

    return await ref
      .update({
        data: admin.firestore.FieldValue.arrayUnion(data),
        averageTemperature: this.data.averageTemperature,
        averageHumidity: this.data.averageHumidity,
        maxTemperature: this.data.maxTemperature,
        minTemperature: this.data.minTemperature,
        maxHumidity: this.data.maxHumidity,
        minHumidity: this.data.minHumidity,
      })
      .then(() => console.log(`${new Date()} new point added`))
      .catch((err) => console.error(err));
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
      return false;
    }

    try {
      await this.sensor.sync();
    } catch {
      console.error("Failed to sync, initializing day with old data");
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
      .then(() => console.log(`Initialized new day ${getCurrentDate()}`))
      .catch((err) => console.error(err));

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
      return false;
    }

    try {
      await this.sensor.sync();
    } catch {
      console.error("Failed to sync, initializing sensor without data");
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
      .catch((err) => console.error(err));

    const warningsRef = db.doc(`sensor/${this.senor.id}/data/warnings`);

    await warningsRef
      .create({
        emails: [],
        lastSendTime: -1,
      })
      .catch((err) => console.error(err));

    return true;
  }

  initializeData() {
    this.data = {
      count: 0,
      date: getCurrentDate(),
    };
  }

  /**
   * Updates manager data with current sensor data.
   * @returns Whether any data has changed since the last update.
   */
  updateData() {
    let dataChanged = false;

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
