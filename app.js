require("dotenv").config();
const express = require("express");
const readLastLines = require("read-last-lines");

const Sensor = require("./Sensor");
const SensorManager = require("./SensorManager");

const sm = new SensorManager(
  new Sensor("mtiv09e1", "MTIV-09-E UNIC", "http://147.91.209.167")
);

sm.start();

const app = express();

app.get("/", (req, res) => {
  const lineCount = Math.max(
    Math.min(parseInt(req.query.lines) || 200, 1000),
    1
  );
  const errorLogsOnly = req.query.errors === "1";

  readLastLines
    .read(
      errorLogsOnly ? "./logs/ErrorLogs.log" : "./logs/CombinedLogs.log",
      lineCount
    )
    .then((lines) =>
      res.send(`<a href="?errors=1">Errors only</a><pre>${lines}</pre>`)
    )
    .catch((err) => res.send(err));
});

app.listen(process.env.PORT);
