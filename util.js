const moment = require("moment");

const getCurrentDate = () => moment().format("YYYYMMDD");

const getDateFromUnixTime = (time) => moment(time).format("YYYYMMDD");

const calculateAverage = (oldAvg, oldCount, newPoint) => {
  if (!oldAvg) oldAvg = 0;
  return (oldAvg * oldCount + newPoint) / (oldCount + 1);
};

module.exports = {
  getCurrentDate,
  getDateFromUnixTime,
  calculateAverage,
};
