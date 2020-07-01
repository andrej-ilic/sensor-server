require("dotenv").config();
const express = require("express");

const Sensor = require("./sensor/Sensor");
const SensorManager = require("./sensor/SensorManager");

new SensorManager(
  new Sensor("mtiv09e1", "MTIV-09-E UNIC", "http://147.91.209.167")
).start();

const app = express();

app.use("/", require("./server/routes/index"));

app.listen(process.env.PORT);
