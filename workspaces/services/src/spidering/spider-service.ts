import { Readable } from 'stream';

import { initScraper, Scraper } from './scraper';
import { CrawlScheduler, initCrawlScheduler } from './scheduler';
import isUrl from 'is-url-superb';

import {
  streamPump, putStrLn, delay,
} from 'commons';
import { Metadata } from './data-formats';
import { AlphaRecord, readAlphaRecStream } from '~/prelude/types';


export interface SpiderService {
  crawlScheduler: CrawlScheduler;
  scraper: Scraper;
  run(alphaRecordStream: Readable): Promise<Readable>; // Readable<Metadata|undefined>
  scrape(url: string): Promise<Metadata|undefined>;
  quit(): Promise<void>;
}

export async function createSpiderService(): Promise<SpiderService> {

  const scraper = await initScraper();
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
            .catch((error) => putStrLn('Error', error))
          ;
        })
        .toReadableStream();
    },
    quit() {
      return this.scraper.quit();
    }
  };

  return service;
}

export async function runLocalSpider(
  alphaRecordCsv: string,
): Promise<void> {
  const spiderService = await createSpiderService();
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
