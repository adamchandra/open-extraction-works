// import path from "path";

import fs from "fs-extra";
import path from 'path';
import hash from "object-hash";
import { ScrapingContext } from './data-formats';

export interface HashEncodedPath {
  source: string;
  hashedSource: string;
  depth: number;
  leadingSegments: string[];
  toPath(): string;
}

export function makeHashEncodedPath(source: string, depth: number): HashEncodedPath {
  const hashedSource = hash(source, { algorithm: "sha1", encoding: "hex" });
  const leadingSegments = hashedSource
    .slice(0, depth)
    .split("");

  return {
    source,
    hashedSource,
    depth,
    leadingSegments,
    toPath() {
      const leaf = `${hashedSource}.d`
      return path.join(...leadingSegments, leaf);
    },
  }
}

export function getResolvedTempRoot(ctx: ScrapingContext): string {
  return path.resolve(
    ctx.workingDirectory,
    'temp.d',
  );
}

export function getResolvedDownloadRoot(ctx: ScrapingContext): string {
  return path.resolve(
    ctx.workingDirectory,
    'downloads.d',
  );
}

export function getResolvedEntryDownloadPath(ctx: ScrapingContext): string {
  return path.resolve(
    getResolvedDownloadRoot(ctx),
    ctx.entryEncPath.toPath()
  );
}
export function getResolvedEntryTempPath(ctx: ScrapingContext): string {
  return path.resolve(
    getResolvedTempRoot(ctx),
    ctx.entryEncPath.toPath()
  );
}

export function writeBuffer(filepath: string, filename: string, buffer: Buffer): void {
  const fullpath = path.resolve(filepath, filename);
  const exists = fs.existsSync(fullpath)
  const isFile = exists && fs.statSync(fullpath).isFile();
  if (isFile && exists) {
    fs.removeSync(fullpath)
  }
  fs.writeFileSync(fullpath, buffer);
}


export function writeEntryFile(ctx: ScrapingContext, filePath: string, buffer: Buffer): boolean {
  ctx.entryEncPath.toPath();
  const exists = fs.existsSync(filePath)
  const isFile = exists && fs.statSync(filePath).isFile();
  if (isFile && exists) {
    fs.removeSync(filePath)
  }
  fs.writeFileSync(filePath, buffer);
  return true;
}


export function createTmpDownloadPath(
  ctx: ScrapingContext,
): string {
  const resolvedEntryPath = getResolvedEntryTempPath(ctx)
  const exists = fs.existsSync(resolvedEntryPath)
  const isDir = exists && fs.statSync(resolvedEntryPath).isDirectory();
  if (isDir) {
    fs.emptyDirSync(resolvedEntryPath);
  } else {
    fs.mkdirpSync(resolvedEntryPath);
  }

  return resolvedEntryPath;
}
