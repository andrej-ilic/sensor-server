require("dotenv").config();
const Sensor = require("./Sensor");
const SensorManager = require("./SensorManager");

const sm = new SensorManager(
  new Sensor("mtiv09e1", "MTIV-09-E UNIC", "http://147.91.209.167")
);

sm.start();
