import _ from 'lodash';
import path from 'path';

import winston, {
  createLogger,
  format,
  config,
  transports,
  Logger,
} from 'winston';

// const cli = winston.config.cli;

const { combine, timestamp, prettyPrint } = format;

export function createConsoleLogger(): Logger {
  return createLogger({
    level: 'info',
    format: combine(timestamp(), prettyPrint()),
    transports: [
      new transports.Console(),
    ],
  });
}

export function setLogLabel(log: Logger, label: string) {
  log.format = format.combine(
    format.label({ label, message: true })
  );
}

export type TransportType = 'file' | 'console';

export function setLogLevel(log: Logger, transportType: TransportType, level: string) {
  _.each(
    log.transports, t => {
      const setLevel = ((transportType === 'file') && (t instanceof transports.File))
        || ((transportType === 'console') && (t instanceof transports.Console))
      ;

      if (setLevel) {
        t.level = level;
      }
    }
  )
}

export function getConsoleAndFileLogger(
  logfilePath: string,
  consoleLogLevel: string = 'info',
): Logger {
  const rootLoggingPath = path.dirname(logfilePath);
  const logfile = path.basename(logfilePath);

  const consoleTransport = new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    level: consoleLogLevel
  });

  const fileTransport = new transports.File({
    filename: logfile,
    level: 'silly',
    format: format.combine(
      format.timestamp(),
      format.json()
    ),
    dirname: rootLoggingPath,
    tailable: true,
  })


  const logger = createLogger({
    levels: config.cli.levels,
    transports: [
      consoleTransport,
      fileTransport
    ],
  });
  return logger;
}
