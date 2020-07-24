import path from 'path';
import { Readable } from 'stream';

import { initScraper,  Scraper } from './scraper';
import { CrawlScheduler, initCrawlScheduler } from './scheduler';

import {
  streamPump, readAlphaRecStream, AlphaRecord,
} from "commons";


export interface SpiderService {
  crawlScheduler: CrawlScheduler;
  scraper: Scraper;
  run(alphaRecordStream: Readable): Promise<void>;
  setWorkingDirectory(dir: string): void;
}

export async function createSpiderService(): Promise<SpiderService> {
  const appSharePath = process.env['APP_SHARE_PATH'];
  let workingDir = 'spider-workdir.d';
  if (appSharePath) {
    workingDir = path.join(appSharePath, workingDir);
  }

  const scraper = await initScraper(workingDir);
  const crawlScheduler = initCrawlScheduler();

  const service: SpiderService = {
    scraper,
    crawlScheduler,
    async run(alphaRecordStream: Readable) {
      await this.crawlScheduler.addUrls(alphaRecordStream);
      const seedUrlStream = this.crawlScheduler.getUrlStream();
      await streamPump.createPump()
        .viaStream<string>(seedUrlStream)
        .throughF((urlString) => {
          return this.scraper.scrapeUrl(urlString);
        })
        .toPromise();
    },
    setWorkingDirectory(dir: string) {
      this.scraper.workingDirectory = dir;
    }
  };

  return service;
}

export async function runLocalSpider(
  alphaRecordCsv: string,
  workingDir: string
): Promise<void> {
  const spiderService = await createSpiderService();
  spiderService.setWorkingDirectory(workingDir);
  const inputStream = readAlphaRecStream(alphaRecordCsv);

  const urlStream = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .throughF((inputRec: AlphaRecord) => {
      const { url } = inputRec;
      return url;
    })
    .toReadableStream();
  await spiderService.run(urlStream)
}


