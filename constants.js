module.exports = {
  minimalTriggerTemperature: parseFloat(process.env.TEMPERATURE_WARNING_LIMIT),
  minimalTriggerHumiity: parseFloat(process.env.HUMIDITY_WARNING_LIMIT),
  warningCooldownInMilliseconds: parseInt(
    process.env.WARNING_COOLDOWN_IN_MILLISECONDS
  ),
};
