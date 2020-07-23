import _ from 'lodash';
import { arglib, prettyPrint } from 'commons';
const { opt, config, registerCmd } = arglib;

import puppeteer, {
  Response,
  Request,
  ResourceType,
  Page,
} from 'puppeteer';

import { logPageEvents } from './page-event';
import { formatRequestChain, ScrapingContext } from './data-formats';
import {  makeHashEncodedPath, createTmpDownloadPath, writeBuffer } from './persist';
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
  // const { entryLogger, rootLogger } = scrapingContext;

  scrapingContext.rootLogger.info(scrapingContext)

  const tmpDownloadPath = createTmpDownloadPath(scrapingContext);

  const browser = await puppeteer.launch();
  const page: Page = await browser.newPage();

  logPageEvents(scrapingContext, page);

  const response: Response | null = await page.goto(url);

  if (!response) return;

  const respHeaders = response.headers();
  console.log('get headers');
  const respBuffer = await response.buffer();
  console.log('write content');

  writeBuffer(tmpDownloadPath, 'response-body', respBuffer);
  const status = response.status();
  const statusText = response.statusText();
  const responseUrl = response.url();
  const request: Request = response.request();
  const reqHeaders = request.headers();
  const reqMethod = request.method();

  // const reqChain = formatRequestChain(request);
  const reqResourceType: ResourceType = request.resourceType();
  prettyPrint({ url, reqHeaders, reqMethod, responseUrl, respHeaders, status, statusText, reqResourceType })

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
