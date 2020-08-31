import path from 'path';
import { Readable } from 'stream';

import { initScraper, Scraper } from './scraper';
import { CrawlScheduler, initCrawlScheduler } from './scheduler';
import isUrl from 'is-url-superb';

import {
  streamPump, readAlphaRecStream, AlphaRecord, putStrLn, delay,
} from "commons";
import { Metadata } from './data-formats';


export interface SpiderService {
  crawlScheduler: CrawlScheduler;
  scraper: Scraper;
  run(alphaRecordStream: Readable): Promise<Readable>; // Readable<Metadata|undefined>
  scrape(url: string): Promise<Metadata|undefined>;
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
    async scrape(url: string): Promise<Metadata|undefined> {
      return this.scraper.scrapeUrl(url)
    },
    async run(alphaRecordStream: Readable): Promise<Readable> {
      const urlCount = await this.crawlScheduler.addUrls(alphaRecordStream);
      const seedUrlStream = this.crawlScheduler.getUrlStream();
      let i = 0;
      return streamPump.createPump()
        .viaStream<string>(seedUrlStream)
        .throughF(async (urlString) => {
          putStrLn(`url ${i} of ${urlCount}`);
          i = i + 1;
          return this.scraper.scrapeUrl(urlString)
            .then((didScrape) => {
              if (didScrape) {
                return delay(1000);
              }
              return;
            })
            .catch((error) => putStrLn(`Error`, error))
          ;
        })
        .toReadableStream();
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
      if (!isUrl(url)) {
        putStrLn(`Warn: filtering non-valid url ${url}`)
      }
      return url;
    })
    .filter((url) => isUrl(url))
    .toReadableStream();
  await spiderService.run(urlStream)
}
