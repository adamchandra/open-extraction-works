import winston, {
  createLogger,
  transports,
  format,
  Logger,
} from "winston";

import path from 'path';

import { HashEncodedPath } from './persist';

const cli = winston.config.cli;

export interface SpiderLoggers {
  rootLogger: Logger;
  entryLogger: Logger;
}

export function getSpiderLoggers(

  workingDirectory: string,
  entryEncPath: HashEncodedPath
): SpiderLoggers {
  const rootLoggingPath = path.resolve(workingDirectory);

  // TODO un-hardcode download dir name
  const entryLoggingPath = path.resolve(workingDirectory, 'downloads.d', entryEncPath.toPath());
  const console = new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple(),
    ),
    level: 'info'
  });

  const rootLogger = createLogger({
      levels: cli.levels,
      transports: [
        console,
        new transports.File({
          filename: "spidering-log.json",
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
  const entryLogger = createLogger({
    levels: cli.levels,
    transports: [
      console,
      new transports.File({
        filename: "entry-log.json",
        level: 'silly',
        format: format.combine(
          format.timestamp(),
          format.json()
        ),
        dirname: entryLoggingPath,
        tailable: true,
      })
    ],
  });
  return {
    rootLogger,
    entryLogger
  };
}
