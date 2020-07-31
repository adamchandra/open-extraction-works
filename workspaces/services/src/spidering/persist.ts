import path from 'path';
import { ScrapingContext } from './scraping-context';
import { shaEncodeAsHex } from 'commons';

export interface HashEncodedPath {
  source: string;
  hashedSource: string;
  depth: number;
  leadingSegments: string[];
  toPath(): string;
}

export function makeHashEncodedPath(source: string, depth: number): HashEncodedPath {
  const hashedSource = shaEncodeAsHex(source);
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
