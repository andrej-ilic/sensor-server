const moment = require("moment");

const getCurrentDate = () => moment().format("YYYYMMDD");

const getDateFromUnixTime = (time) => moment(time).format("YYYYMMDD");

const calculateAverage = (oldAvg, oldCount, newPoint) => {
  if (!oldAvg && oldAvg !== 0) {
    return newPoint;
  }
  return (oldAvg * oldCount + newPoint) / (oldCount + 1);
};

/**
 * Cuts off the time and returns the milliseconds of the current date.
 * @returns {Number} Milliseconds of todays date adjusted to the local timezone
 */
const getCurrentDateUnixTime = () =>
  Math.floor(getUnixTimeInLocalTimezone(new Date()) / (1000 * 60 * 60 * 24)) *
  24 *
  60 *
  60 *
  1000;

/**
 * Cuts off the time and returns the milliseconds of the date.
 * Eg. 1.1.2020. 11:31:20 => 1.1.2020. 00:00:00
 * @param {Date} date
 * @returns {Number} Passed date in milliseconds adjusted to the local timezone
 */
const getDateUnixTime = (date) =>
  Math.floor(getUnixTimeInLocalTimezone(date) / (1000 * 60 * 60 * 24)) *
  24 *
  60 *
  60 *
  1000;

/**
 * @param {Date} d
 * @returns {Number}  Passed date and time in milliseconds adjusted to the local timezone
 */
const getUnixTimeInLocalTimezone = (d) =>
  d.getTime() + d.getTimezoneOffset() * -60000;

module.exports = {
  getCurrentDateUnixTime,
  getCurrentDate,
  getDateFromUnixTime,
  calculateAverage,
  getUnixTimeInLocalTimezone,
  getDateUnixTime,
};
