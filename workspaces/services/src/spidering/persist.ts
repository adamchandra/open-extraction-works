import path from 'path';
import { ScrapingContext } from './scraping-context';

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
