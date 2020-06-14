const CronJob = require("cron").CronJob;
const { admin, db } = require("./firebase");
const { getCurrentDate, calculateAverage } = require("./util");

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
      await this.sensor.sync();
      const dataChanged = this.updateData();
      if (dataChanged) {
        this.persistSensorData();
      }
    });

    this.sensorUpdateJob.start();
  }

  startDataInsertJob() {
    if (this.dataInsertJob) {
      this.dataInsertJob.stop();
    }

    this.dataInsertJob = new CronJob("40 3-59/4 * * * *", async () => {
      await this.sensor.sync();
      this.insertSensorData();
    });

    this.dataInsertJob.start();
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
      this.data.averageTemperature = data.averageTemperature;
      this.data.averageHumidity = data.averageHumidity;
      this.data.count = data.data.length;
      return false;
    }

    await this.sensor.sync();

    await ref
      .create({
        data: [],
        averageTemperature: this.sensor.temperature,
        averageHumidity: this.sensor.humidity,
      })
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

    await this.sensor.sync();

    await ref
      .create({
        name: this.sensor.name,
        temperature: this.sensor.temperature,
        humidity: this.sensor.humidity,
        averageTemperature: this.sensor.temperature,
        averageHumidity: this.sensor.humidity,
        lastUpdateTime: Date.now(),
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

    const averageTemperature = calculateAverage(
      this.data.averageTemperature,
      this.data.count,
      this.sensor.temperature
    );
    const averageHumidity = calculateAverage(
      this.data.averageHumidity,
      this.data.count,
      this.sensor.humidity
    );

    if (
      this.data.temperature != this.sensor.temperature ||
      this.data.humidity != this.sensor.humidity ||
      this.data.averageTemperature.toFixed(1) !=
        averageTemperature.toFixed(1) ||
      this.data.averageHumidity.toFixed(1) != averageHumidity.toFixed(1)
    ) {
      dataChanged = true;
    }

    this.data.temperature = this.sensor.temperature;
    this.data.humidity = this.sensor.humidity;
    this.data.averageTemperature = averageTemperature;
    this.data.averageHumidity = averageHumidity;
    this.data.count++;

    return dataChanged;
  }
}

module.exports = SensorManager;
