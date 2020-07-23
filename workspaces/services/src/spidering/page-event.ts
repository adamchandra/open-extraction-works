import _ from 'lodash';

import {
  Response,
  Request,
  PageEventObj,
  Page,
  ConsoleMessage,
  // Frame,
  Metrics,
  Worker,
  Dialog
} from 'puppeteer';

import { ScrapingContext } from './data-formats';

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

export function logPageEvents(ctx: ScrapingContext, page: Page) {
  const { entryLogger } = ctx;

  const log = entryLogger;

  _.each(pageEvents, e => {
    page.on(e, (_data: any) => {
      switch (e) {
        case 'domcontentloaded':
        case 'load':
        case 'close': {
          log.info({ pageEvent: e });
          break;
        }
        case 'console': {
          const data: ConsoleMessage = _data;
          const text = data.text()
          log.info({ pageEvent: e, text });
          break;
        }
        case 'dialog': {
          const data: Dialog = _data;
          const message = data.message();
          log.info({ pageEvent: e, message });
          break;
        }
        case 'pageerror':
        case 'error': {
          const data: Error = _data;
          const message = data.message;
          const name = data.name;
          log.info({ pageEvent: e, name, message });
          break;
        }
        case 'frameattached':
        case 'framedetached':
        case 'framenavigated': {
          // const data: Frame = _data;
          log.info({ pageEvent: e });
          break;
        }
        case 'metrics': {
          const data: { title: string, metrics: Metrics } = _data;
          log.info({ pageEvent: e, data });
          break;
        }
        case 'popup': {
          // const data: Page = _data;
          log.info({ pageEvent: e });
          break;
        }
        case 'request':
        case 'requestfailed':
        case 'requestfinished': {
          const data: Request = _data;
          const url = data.url();
          log.info({ pageEvent: e, url });
          break;
        }
        case 'response': {
          const data: Response = _data;
          const url = data.url();
          log.info({ pageEvent: e, url });
          break;
        }
        case 'workercreated':
        case 'workerdestroyed': {
          const data: Worker = _data;
          const url = data.url();
          log.info({ pageEvent: e, url });
          break;
        }
      }
    });
  })
}
