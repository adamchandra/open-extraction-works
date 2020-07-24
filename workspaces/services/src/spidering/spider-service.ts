import path from 'path';
import { Readable } from 'stream';

import { initScraper, Scraper } from './scraper';
import { CrawlScheduler, initCrawlScheduler } from './scheduler';

import {
  streamPump, readAlphaRecStream, AlphaRecord, putStrLn, delay,
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
      const urlCount = await this.crawlScheduler.addUrls(alphaRecordStream);
      const seedUrlStream = this.crawlScheduler.getUrlStream();
      let i = 0;
      await streamPump.createPump()
        .viaStream<string>(seedUrlStream)
        .throughF((urlString) => {
          putStrLn(`url ${i} of ${urlCount}`);
          i = i + 1;
          return this.scraper.scrapeUrl(urlString)
            .then((didScrape) => {
              if (didScrape) {
                return delay(3000);
              }
            })
            .catch((error) => putStrLn(`Error`, error))
          ;
        })
        .toPromise();
    },
    setWorkingDirectory(dir: string) {
      this.scraper.workingDirectory = dir;
    }
  };

  return service;
}

import isUrl from 'is-url-superb';
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
      if (!isUrl(url)) {
        putStrLn(`Warn: filtering non-valid url ${url}`)
      }
      return url;
    })
    .filter((url) => isUrl(url))
    .toReadableStream();
  await spiderService.run(urlStream)
}
