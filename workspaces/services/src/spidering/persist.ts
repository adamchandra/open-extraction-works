import path from 'path';
import hash from "object-hash";
import { ScrapingContext } from './scraping-context';

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
