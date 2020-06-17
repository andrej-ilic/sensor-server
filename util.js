const moment = require("moment");

const getCurrentDateUnixTime = () =>
  Math.floor(Date.now() / (1000 * 60 * 60 * 24)) * 24 * 60 * 60 * 1000;

const getCurrentDate = () => moment().format("YYYYMMDD");

const getDateFromUnixTime = (time) => moment(time).format("YYYYMMDD");

const calculateAverage = (oldAvg, oldCount, newPoint) => {
  if (!oldAvg && oldAvg !== 0) {
    return newPoint;
  }
  return (oldAvg * oldCount + newPoint) / (oldCount + 1);
};

module.exports = {
  getCurrentDateUnixTime,
  getCurrentDate,
  getDateFromUnixTime,
  calculateAverage,
};
