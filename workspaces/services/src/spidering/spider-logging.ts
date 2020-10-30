import { Logger } from 'winston';
import path from 'path';
import { getBasicLogger } from '~/utils/basic-logging';
import { HashEncodedPath } from '~/utils/hash-encoded-paths';
import { getAppSharedDir, getCorpusRootDir } from '~/prelude/config';


export interface SpiderLoggers {
  rootLogger: Logger;
  entryLogger: Logger;
}

export function getSpiderLoggers(
  entryEncPath: HashEncodedPath
): SpiderLoggers {
  const appShareDir = getAppSharedDir();
  const corpusRoot = getCorpusRootDir();
  const entryLoggingPath = path.resolve(corpusRoot, entryEncPath.toPath());
  const rootLogger = getBasicLogger(appShareDir, 'spidering-log.json');
  const entryLogger = getBasicLogger(entryLoggingPath, 'entry-log.json');

  return {
    rootLogger,
    entryLogger
  };
}
