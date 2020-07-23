import _ from 'lodash';
import { arglib, writeCorpusJsonFile, writeCorpusTextFile } from 'commons';
const { opt, config, registerCmd } = arglib;

import puppeteer, {
  Response,
  Page,
} from 'puppeteer';

import { logPageEvents } from './page-event';
import { ScrapingContext, createMetadata } from './data-formats';
import { makeHashEncodedPath, createTmpDownloadPath } from './persist';
import { getSpiderLoggers } from './spider-logging';


export function createScrapingContext(
  workingDirectory: string,
  initialUrl: string,
): ScrapingContext {

  const entryEncPath = makeHashEncodedPath(initialUrl, 3);
  const spiderLoggers = getSpiderLoggers(workingDirectory, entryEncPath);
  return {
    workingDirectory,
    entryEncPath,
    initialUrl,
    ...spiderLoggers
  }
}

async function scrapeUrl(
  workingDirectory: string,
  url: string
): Promise<void> {

  const scrapingContext = createScrapingContext(workingDirectory, url);
  const { rootLogger } = scrapingContext;

  rootLogger.info({ msg: "begin scraping", url });

  const tmpDownloadPath = createTmpDownloadPath(scrapingContext);

  rootLogger.info({ msg: "launching browser" });
  const browser = await puppeteer.launch();
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
  writeCorpusJsonFile(tmpDownloadPath, '.', 'request-headers.json', requestHeaders);

  const respHeaders = response.headers();
  writeCorpusJsonFile(tmpDownloadPath, '.', 'response-headers.json', respHeaders);

  const respBuffer = await response.buffer();
  writeCorpusTextFile(tmpDownloadPath, '.', 'response-body', respBuffer.toString())

  const metadata = createMetadata(response);
  writeCorpusJsonFile(tmpDownloadPath, '.', 'metadata.json', metadata);

  await browser.close();

}

registerCmd(
  arglib.YArgs,
  "scrape-url",
  "spider via puppeteer testing...",
  config(
    opt.cwd,
    opt.existingDir("working-directory: root directory for logging/tmpfile/downloading"),
    opt.ion("url", {
      required: true
    })
  )
)((args: any) => {
  const { workingDirectory, url } = args;

  scrapeUrl(workingDirectory, url)
    .then(() => undefined)

});

/*


    page.$(selector)
    page.$$(selector)
    page.$$eval(selector, pageFunction[, ...args])
    page.$eval(selector, pageFunction[, ...args])
    page.$x(expression)
    page.accessibility
    page.addScriptTag(options)
    page.addStyleTag(options)
    page.authenticate(credentials)
    page.bringToFront()
    page.browser()
    page.browserContext()
    page.click(selector[, options])
    page.close([options])
    page.content()
    page.cookies([...urls])
    page.coverage
    page.deleteCookie(...cookies)
    page.emulate(options)
    page.emulateMediaFeatures(features)
    page.emulateMediaType(type)
    page.emulateTimezone(timezoneId)
    page.emulateVisionDeficiency(type)
    page.evaluate(pageFunction[, ...args])
    page.evaluateHandle(pageFunction[, ...args])
    page.evaluateOnNewDocument(pageFunction[, ...args])
    page.exposeFunction(name, puppeteerFunction)
    page.focus(selector)
    page.frames()
    page.goBack([options])
    page.goForward([options])
    page.goto(url[, options])
    page.hover(selector)
    page.isClosed()
    page.isJavaScriptEnabled()
    page.keyboard
    page.mainFrame()
    page.metrics()
    page.mouse
    page.pdf([options])
    page.queryObjects(prototypeHandle)
    page.reload([options])
    page.screenshot([options])
    page.select(selector, ...values)
    page.setBypassCSP(enabled)
    page.setCacheEnabled([enabled])
    page.setContent(html[, options])
    page.setCookie(...cookies)
    page.setDefaultNavigationTimeout(timeout)
    page.setDefaultTimeout(timeout)
    page.setExtraHTTPHeaders(headers)
    page.setGeolocation(options)
    page.setJavaScriptEnabled(enabled)
    page.setOfflineMode(enabled)
    page.setRequestInterception(value)
    page.setUserAgent(userAgent)
    page.setViewport(viewport)
    page.tap(selector)
    page.target()
    page.title()
    page.touchscreen
    page.tracing
    page.type(selector, text[, options])
    page.url()
    page.viewport()
    page.waitFor(selectorOrFunctionOrTimeout[, options[, ...args]])
    page.waitForFileChooser([options])
    page.waitForFunction(pageFunction[, options[, ...args]])
    page.waitForNavigation([options])
    page.waitForRequest(urlOrPredicate[, options])
    page.waitForResponse(urlOrPredicate[, options])
    page.waitForSelector(selector[, options])
    page.waitForXPath(xpath[, options])
    page.workers()
    GeolocationOptions
    WaitTimeoutOptions

  */
