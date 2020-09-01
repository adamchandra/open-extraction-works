import { Logger } from "winston";
import path from 'path';
import { getBasicLogger } from '~/utils/basic-logging';
import { HashEncodedPath } from '~/utils/hash-encoded-paths';


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
  const rootLogger = getBasicLogger(rootLoggingPath, 'spidering-log.json');
  const entryLogger = getBasicLogger(entryLoggingPath, 'entry-log.json');

  return {
    rootLogger,
    entryLogger
  };
}
