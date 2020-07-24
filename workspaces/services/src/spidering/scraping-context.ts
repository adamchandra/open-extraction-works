import { makeHashEncodedPath, HashEncodedPath } from './persist';
import { getSpiderLoggers, SpiderLoggers } from './spider-logging';

export interface ScrapingContext extends SpiderLoggers {
  workingDirectory: string;
  initialUrl: string;
  entryEncPath: HashEncodedPath;
}

export function createScrapingContext(
  workingDirectory: string,
  initialUrl: string,
): ScrapingContext {

  const entryEncPath = makeHashEncodedPath(initialUrl, 3);
  const spiderLoggers = getSpiderLoggers(workingDirectory, entryEncPath);
  return {
    workingDirectory,
    entryEncPath,
    initialUrl,
    ...spiderLoggers
  }
}
