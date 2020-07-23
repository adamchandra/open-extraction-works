import _ from 'lodash';
import { writeCorpusJsonFile, writeCorpusTextFile } from 'commons';

import puppeteer, {
  Response,
  Page,
  Browser,
} from 'puppeteer';

import { logPageEvents } from './page-event';
import { createMetadata } from './data-formats';
import { getResolvedEntryDownloadPath } from './persist';
import { createScrapingContext } from './scraping-context';


interface Scraper {
  browser: Browser;
  workingDirectory: string;
  scrapeUrl(url: string): Promise<void>;
  quit(): Promise<void>;
}

export async function initScraper(
  workingDirectory: string,
): Promise<Scraper> {
  const browser: Browser = await puppeteer.launch();
  return {
    workingDirectory,
    browser,
    async scrapeUrl(url: string) {
      return scrapeUrl(browser, workingDirectory, url);
    },
    async quit() {
      await browser.close();
    }
  };
}

async function scrapeUrl(
  browser: Browser,
  workingDirectory: string,
  url: string
): Promise<void> {

  const scrapingContext = createScrapingContext(workingDirectory, url);
  const { rootLogger } = scrapingContext;

  rootLogger.info({ msg: "begin scraping", url });

  const entryRootPath = getResolvedEntryDownloadPath(scrapingContext);

  rootLogger.info({ msg: "launching browser" });
  const page: Page = await browser.newPage();

  logPageEvents(scrapingContext, page);

  rootLogger.info({ msg: "navigating to", url });
  const response: Response | null = await page.goto(url);

  if (!response) {
    rootLogger.warn({ msg: "no response", url });
    await browser.close();
    return;
  }

  rootLogger.info({ msg: "writing response" });
  const request = response.request();
  const requestHeaders = request.headers();
  writeCorpusJsonFile(entryRootPath, '.', 'request-headers.json', requestHeaders);

  const respHeaders = response.headers();
  writeCorpusJsonFile(entryRootPath, '.', 'response-headers.json', respHeaders);

  const respBuffer = await response.buffer();
  writeCorpusTextFile(entryRootPath, '.', 'response-body', respBuffer.toString())

  const metadata = createMetadata(response);
  writeCorpusJsonFile(entryRootPath, '.', 'metadata.json', metadata);
}

export async function scrapeUrlAndQuit(
  workingDirectory: string,
  url: string
): Promise<void> {
  const browser: Browser = await puppeteer.launch();
  await scrapeUrl(browser, workingDirectory, url);
  await browser.close();
}
