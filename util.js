const moment = require("moment");

const getCurrentDate = () => moment().format("YYYYMMDD");

module.exports = {
  getCurrentDate,
};
