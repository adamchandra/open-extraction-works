import path from 'path';
import { makeHashEncodedPath } from '~/util/hash-encoded-paths';


export const Env = {
  AppSharePath: 'APP_SHARE_PATH',
}

export function getEnv(key: string): string | undefined {
  return process.env[key];
}

export function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

// Root directory for storing application data
export function getAppSharedDir(): string {
  const appSharePath = getEnv(Env.AppSharePath);
  const workingDir = appSharePath ? appSharePath : 'app-share.d';
  return workingDir;
}

// The root directory in which the spider will download files
export function getCorpusRootDir(): string {
  const shareDir = getAppSharedDir();
  const corpusRoot = path.join(shareDir, 'corpus-root.d');
  return path.resolve(corpusRoot);
}

export function getCorpusEntryDirForUrl(url: string): string {
  const corpusRoot = getCorpusRootDir();
  const entryEncPath = makeHashEncodedPath(url, 3);
  const entryPath = path.resolve(corpusRoot, entryEncPath.toPath());
  return entryPath;
}
