import winston, {
  createLogger,
  transports,
  format,
  Logger,
} from "winston";

import path from 'path';

import { HashEncodedPath } from './persist';

const cli = winston.config.cli;

// const _logger = createLogger({
//   level: 'silly',
//   levels: cli.levels,
//   transports: [
//     new transports.Console({
//       format: format.combine(
//         format.colorize(),
//         format.simple(),
//       ),
//     }),
//     new transports.File({
//       filename: "spidering-log.json",
//       format: format.combine(
//         format.timestamp(),
//         format.json()
//       ),
//       dirname: "./logs",
//       tailable: true,
//     })
//   ],
// });


export interface SpiderLoggers {
  rootLogger: Logger;
  entryLogger: Logger;
}

export function getSpiderLoggers(
  workingDirectory: string,
  entryEncPath: HashEncodedPath
): SpiderLoggers {
  const rootLoggingPath = path.resolve(workingDirectory);
  const entryLoggingPath = path.resolve(workingDirectory, entryEncPath.toPath());

  const rootLogger = createLogger({
      level: 'silly',
      levels: cli.levels,
      transports: [
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple(),
          ),
        }),
        new transports.File({
          filename: "spidering-log.json",
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
    level: 'silly',
    levels: cli.levels,
    transports: [
      new transports.Console({
        format: format.combine(
          format.colorize(),
          format.simple(),
        ),
      }),
      new transports.File({
        filename: "entry-log.json",
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
