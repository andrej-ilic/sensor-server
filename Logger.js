const winston = require("winston");

class Logger {
  static logger = Logger.createLogger([
    { name: "CombinedLogs" },
    { name: "ErrorLogs", level: "error" },
  ]);

  static createLogger(fileTransports, loggerLevel = "info") {
    const errorLogFormat = winston.format.printf(
      ({ timestamp, message, stack, isAxiosError, config }) => {
        if (isAxiosError)
          return `[${timestamp}] ${config.baseURL}${config.url} ${
            config.method
          } ${config.data ? config.data : ""}\n${stack}`;
        if (stack) return `[${timestamp}] ${stack}`;
        return `[${timestamp}] ${message}`;
      }
    );

    const logFormat = winston.format.printf(
      ({ message, timestamp }) => `[${timestamp}] ${message}`
    );

    return winston.createLogger({
      level: loggerLevel,
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" })
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(errorLogFormat),
        }),
        ...fileTransports.map(
          ({ name, level }) =>
            new winston.transports.File({
              format: level === "error" ? errorLogFormat : logFormat,
              filename: `logs/${name}.log`,
              level,
              maxsize: 4000000,
              maxFiles: 2,
              tailable: true,
            })
        ),
      ],
    });
  }
}

module.exports = Logger.logger;
