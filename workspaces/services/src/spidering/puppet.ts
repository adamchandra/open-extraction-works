import _ from 'lodash';
import { arglib, prettyPrint, putStrLn } from 'commons';
const { opt, config, registerCmd } = arglib;

import puppeteer, { PageEventObj, Response, Request, ResourceType, Page, ConsoleMessage, Frame, Metrics, Worker, Dialog } from 'puppeteer';
import path from "path";
import fs from "fs-extra";

const pageEvents: Array<keyof PageEventObj> = [
  'close',
  'console',
  'dialog',
  'domcontentloaded',
  'error',
  'frameattached',
  'framedetached',
  'framenavigated',
  'load',
  'metrics',
  'pageerror',
  'popup',
  'request',
  'requestfailed',
  'requestfinished',
  'response',
  'workercreated',
  'workerdestroyed',
];


export function writeFile(filePath: string, buffer: Buffer): boolean {
  const exists = fs.existsSync(filePath)
  const isFile = exists && fs.statSync(filePath).isFile();
  if (isFile && exists) {
    fs.removeSync(filePath)
  }
  fs.writeFileSync(filePath, buffer);
  return true;
}
async function scrapeUrl(url: string): Promise<void> {

  console.log('scraping', url);

  const browser = await puppeteer.launch();
  const page: Page = await browser.newPage();

  _.each(pageEvents, e => {
    page.on(e, (_data: any) => {
      switch (e) {
        case 'domcontentloaded':
        case 'load':
        case 'close': {
          putStrLn('Event', e);
          break;
        }
        case 'console': {
          const data: ConsoleMessage = _data;
          const text = data.text()
          putStrLn('Event', e, { text });
          break;
        }
        case 'dialog': {
          const data: Dialog = _data;
          const message = data.message();
          putStrLn('Event', e, { message });
          break;
        }
        case 'pageerror':
        case 'error': {
          const data: Error = _data;

          const message = data.message;
          const name = data.name;
          putStrLn('Event', e, { name, message });
          break;
        }
        case 'frameattached':
        case 'framedetached':
        case 'framenavigated': {
          // const data: Frame = _data;
          putStrLn('Event', e);
          break;
        }
        case 'metrics': {
          const data: { title: string, metrics: Metrics } = _data;
          putStrLn('Event', e, data);
          break;
        }
        case 'popup': {
          // const data: Page = _data;
          putStrLn('Event', e);
          break;
        }
        case 'request':
        case 'requestfailed':
        case 'requestfinished': {
          const data: Request = _data;
          const url = data.url();

          putStrLn('Event', e, { url });
          break;
        }
        case 'response': {
          const data: Response = _data;
          const url = data.url();
          putStrLn('Event', e, { url });
          break;
        }
        case 'workercreated':
        case 'workerdestroyed': {
          const data: Worker = _data;
          const url = data.url();
          putStrLn('Event', e, { url });
          break;
        }
      }
    });
  })

  console.log('pre-goto page');
  const response: Response | null = await page.goto(url);

  console.log('got response');

  if (!response) return;

  const respHeaders = response.headers();
  console.log('get headers');
  const respBuffer = await response.buffer();
  console.log('write content');
  writeFile('scrape-response', respBuffer);
  const status = response.status();
  const statusText = response.statusText();
  const responseUrl = response.url();
  const request: Request = response.request();
  const reqHeaders = request.headers();
  const reqMethod = request.method();
  const reqRedirectChain = request.redirectChain();
  const reqResourceType: ResourceType = request.resourceType();
  prettyPrint({ url, reqHeaders, reqMethod, responseUrl, respHeaders, status, statusText, reqResourceType })

  _.each(reqRedirectChain, creq => {
    const reqHeaders = creq.headers();
    const reqMethod = creq.method();
    const cresp = creq.response();
    if (!cresp) return;
    const cstatus = cresp.status();
    const cstatusText = cresp.statusText();
    const cresponseUrl = cresp.url();
    prettyPrint({ msg: 'Request Chain', reqHeaders, reqMethod, cstatus, cstatusText, cresponseUrl });
  })
  // request.url();

  // await page.screenshot({path: 'example.png'});

  await browser.close();

}

registerCmd(
  arglib.YArgs,
  "scrape-url",
  "spider via puppeteer testing...",
  config(
    opt.ion("url", {
      required: true
    })
  )
)((args: any) => {
  const { url } = args;

  scrapeUrl(url)
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
