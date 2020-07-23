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

import { putStrLn } from 'commons';

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


export function streamPageEvents(page: Page) {

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
}
