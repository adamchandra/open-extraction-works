
import { ScrapingContext } from './data-formats';
import { makeHashEncodedPath } from './persist';
import { getSpiderLoggers } from './spider-logging';

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
