const router = require("express").Router();
const readLastLines = require("read-last-lines");

router.get("/", (req, res) => {
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

module.exports = router;
