const axios = require("axios");
const parser = require("fast-xml-parser");

class Sensor {
  constructor(id, name, baseURL) {
    this.id = id;
    this.name = name;
    /** @type import('axios').AxiosInstance */
    this.axios = axios.create({ baseURL });
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
    };
  }

  setData(data) {
    this.temperature = data.tmpr1;
    this.humidity = data.hum1;
  }
}

module.exports = Sensor;
