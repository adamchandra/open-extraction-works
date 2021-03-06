import { Readable } from 'stream';

import {
  initScraper,
  Scraper,
  Metadata,
  CrawlScheduler,
  initCrawlScheduler
} from 'spider';

import isUrl from 'is-url-superb';

import {
  streamPump, putStrLn, delay,
  AlphaRecord, readAlphaRecStream
} from 'commons';

import { DatabaseContext, insertAlphaRecords } from '~/db/db-api';

export interface SpiderService {
  crawlScheduler: CrawlScheduler;
  scraper: Scraper;
  run(alphaRecordStream: Readable): Promise<Readable>; // Readable<Metadata|undefined>
  scrape(url: string): Promise<Metadata | undefined>;
  quit(): Promise<void>;
}

export async function createSpiderService(): Promise<SpiderService> {

  const scraper = await initScraper();
  const crawlScheduler = initCrawlScheduler();

  const service: SpiderService = {
    scraper,
    crawlScheduler,
    async scrape(url: string): Promise<Metadata | undefined> {
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

export async function insertNewAlphaRecords(
  dbCtx: DatabaseContext,
  alphaRecordCsv: string,
): Promise<void> {
  const inputStream = readAlphaRecStream(alphaRecordCsv);

  putStrLn('Reading CSV Records...');
  const alphaRecords = await streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .gather()
    .toPromise();
  if (alphaRecords === undefined) {
    putStrLn(`No records found in CSV ${alphaRecordCsv}`);
    return
  }

  putStrLn(`Inserting ${alphaRecords.length} Records`);
  const newRecs = await insertAlphaRecords(dbCtx, alphaRecords)
  const len = newRecs.length;
  putStrLn(`Inserted ${len} new records`);
}
