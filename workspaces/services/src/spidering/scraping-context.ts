import { getAppSharedDir, getCorpusRootDir } from '~/prelude/config';
import { HashEncodedPath, makeHashEncodedPath } from '~/utils/hash-encoded-paths';
import { getSpiderLoggers, SpiderLoggers } from './spider-logging';
import path from 'path';

export interface ScrapingContext extends SpiderLoggers {
  sharedDataDir: string;
  corpusRoot: string;
  initialUrl: string;
  entryEncPath: HashEncodedPath;
  entryPath(): string;
}

export function createScrapingContext(
  initialUrl: string,
): ScrapingContext {
  const sharedDataDir = getAppSharedDir();
  const corpusRoot = getCorpusRootDir();

  const entryEncPath = makeHashEncodedPath(initialUrl, 3);
  const spiderLoggers = getSpiderLoggers(entryEncPath);
  return {
    sharedDataDir,
    corpusRoot,
    entryEncPath,
    initialUrl,
    entryPath(): string {
      const entryPath = path.resolve(
        this.corpusRoot,
        this.entryEncPath.toPath()
      );
      return entryPath;
    },
    ...spiderLoggers
  }
}
