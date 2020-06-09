const axios = require("axios");
const parser = require("fast-xml-parser");
const moment = require("moment");

class Sensor {
  constructor() {
    /** @type import('axios').AxiosInstance */
    this.axios = axios.create({
      baseURL: "http://147.91.209.167",
    });
  }

  sync() {
    return this.axios.get("status.xml").then((res) => {
      const data = parser.parse(res.data).response;
      this.setData(data);
      return this.getData();
    });
  }

  getData() {
    return {
      temperature: this.temperature,
      humidity: this.humidity,
      time: this.unixTime,
    };
  }

  setData(data) {
    this.temperature = data.tmpr1;
    this.humidity = data.hum1;
    this.time = moment();
    this.unixTime = this.time.valueOf();
  }
}

module.exports = new Sensor();
