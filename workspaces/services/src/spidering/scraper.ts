import _ from 'lodash';
import { writeCorpusJsonFile, writeCorpusTextFile, hasCorpusFile } from 'commons';


import {
  Response,
  Page,
  Browser,
  Frame
} from 'puppeteer';

import puppeteer from 'puppeteer-extra'

// import blockResources from 'puppeteer-extra-plugin-block-resources';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
import AnonPlugin from 'puppeteer-extra-plugin-anonymize-ua';

puppeteer.use(StealthPlugin())
puppeteer.use(AnonPlugin())
// puppeteer.use(blockResources({
//   blockedTypes: new Set(['image', 'stylesheet'])
// });


import { logPageEvents } from './page-event';
import { createMetadata, Metadata } from './data-formats';
import { getResolvedEntryDownloadPath } from './persist';
import { createScrapingContext } from './scraping-context';

export interface Scraper {
  browser: Browser;
  workingDirectory: string;
  scrapeUrl(url: string): Promise<Metadata | undefined>;
  quit(): Promise<void>;
}

export async function initScraper(
  workingDirectory: string,
): Promise<Scraper> {
  const browser: Browser = await puppeteer.launch({});
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
): Promise<Metadata | undefined> {

  const scrapingContext = createScrapingContext(workingDirectory, url);

  const { rootLogger } = scrapingContext;
  const entryRootPath = getResolvedEntryDownloadPath(scrapingContext);
  rootLogger.info(`downloading ${url} to ${scrapingContext.entryEncPath.toPath()}`);

  const hasMetadata = hasCorpusFile(entryRootPath, '.', 'metadata.json');

  if (hasMetadata) {
    rootLogger.warn(`skipping ${url}: metadata file exists`);
    return;
  }

  const page: Page = await browser.newPage();
  try {
    logPageEvents(scrapingContext, page);

    page.setDefaultNavigationTimeout(11000);
    page.setDefaultTimeout(11000);
    page.setJavaScriptEnabled(true);

    let response: Response | null = await page.goto(url, {
    });

    // const response: Response | null = await page.goto(url);

    if (!response) {
      const response2 = await page
        .waitForNavigation({
          // waitUntil: [ ]
        })
        .catch(() => {
          //

        });
      if (response2) {
        response = response2;
      }
    }

    if (!response) {
      rootLogger.warn(`no response ${url}`);
      return;
    }

    const allFrameContent = await Promise.all(
      _.map(page.frames(), (frame: Frame) => frame.content())
    );

    const request = response.request();
    const requestHeaders = request.headers();
    writeCorpusJsonFile(entryRootPath, '.', 'request-headers.json', requestHeaders);

    const respHeaders = response.headers();
    writeCorpusJsonFile(entryRootPath, '.', 'response-headers.json', respHeaders);

    const respBuffer = await response.buffer();
    writeCorpusTextFile(entryRootPath, '.', 'response-body', respBuffer.toString())
    _.each(allFrameContent, (frameContent, i) => {
      writeCorpusTextFile(entryRootPath, '.', `response-frame-${i}`, frameContent);
    });

    const metadata = createMetadata(url, response);
    writeCorpusJsonFile(entryRootPath, '.', 'metadata.json', metadata);
    const status = response.status();
    await page.close();
    rootLogger.info(`Scraped ${url}: status: ${status}`);
    return metadata;

  } catch (error) {
    await page.close();
    rootLogger.error(`For ${url}: error: ${error}`);
  }
  return undefined;
}

export async function scrapeUrlAndQuit(
  workingDirectory: string,
  url: string
): Promise<void> {
  const browser: Browser = await puppeteer.launch({
    // devtools: true,
    // headless: false
  });
  await scrapeUrl(browser, workingDirectory, url);
  await browser.close();
}
