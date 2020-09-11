
import winston, {
  createLogger,
  transports,
  format,
  Logger,
} from 'winston';

import path from 'path';
const cli = winston.config.cli;

export function getBasicConsoleLogger(level: string = 'info'): Logger {
  const console = new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    level
  });

  const logger = createLogger({
    levels: cli.levels,
    transports: [console],
  });
  return logger;
}

export function getBasicLogger(
  workingDirectory: string,
  logfileName: string
): Logger {
  const rootLoggingPath = path.resolve(workingDirectory);

  const console = new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    level: 'info'
  });

  const logger = createLogger({
    levels: cli.levels,
    transports: [
      console,
      new transports.File({
        filename: logfileName,
        level: 'silly',
        format: format.combine(
          format.timestamp(),
          format.json()
        ),
        dirname: rootLoggingPath,
        tailable: true,
      })
    ],
  });
  return logger;
}
