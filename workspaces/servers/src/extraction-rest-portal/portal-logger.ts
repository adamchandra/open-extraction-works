import {
  createLogger,
  format,
  transports,
  Logger,
} from "winston";

export function createAppLogger(): Logger {
  return createLogger({
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
    transports: [
      new transports.Console(),
      new transports.File({
        filename: "portal-rest-service.log",
        dirname: "./logs",
        tailable: true,
      })
    ],
  });
}


