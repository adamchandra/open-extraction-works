//
import 'chai';
import _ from 'lodash';
import path from 'path';
import fs from 'fs-extra';

import {
  createLogger,
  transports,
  format,
  Logger,
} from 'winston';

import * as winston from 'winston';

const cli = winston.config.cli;

import { prettyPrint } from './pretty-print';
import { getConsoleAndFileLogger, setLogLabel, setLogLevel } from './logging';
import { Transports, Console, File } from 'winston/lib/winston/transports';

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

describe('Logging', () => {
  const tmpdir = './test.tmp.d';
  const logname = 'test.log';
  const logpath = path.resolve(tmpdir, logname);
  // const logfile = path.resolve(tmpdir, `${logpath}.pretty.txt`);


  beforeEach(() => {
    if (fs.existsSync(tmpdir)) {
      fs.emptyDirSync(tmpdir);
      fs.rmdirSync(tmpdir);
    }
    fs.mkdirpSync(tmpdir);
  });

  it('should create console/file loggers with common namespace prefixes', () => {
    const log = getConsoleAndFileLogger(logpath);

    setLogLabel(log, '/foo/bar')

    log.info('hello, world!');
    setLogLevel(log, 'console', 'debug')
    log.debug('debug, world!');
    setLogLevel(log, 'console', 'silly')
    log.silly('silly, world!');
    setLogLevel(log, 'console', 'debug')
    log.silly('silly, world 2!');

    setLogLevel(log, 'file', 'info')
    setLogLabel(log, '/baz/crux')

    log.info('goodbye, planet!');
    log.debug('debug, world!');
    log.silly('silly, world!');
  });

});
