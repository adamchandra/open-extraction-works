import _ from 'lodash';

import {
  Request, Response,
} from 'puppeteer';

import { SpiderLoggers } from './spider-logging';
import { HashEncodedPath } from './persist';
import { UrlChain, UrlChainLink } from '~/extract/urls/url-fetch-chains';
// import { prettyPrint } from 'commons';

export function createRequestChain(request: Request): UrlChain {
  const reqRedirectChain = request.redirectChain();
  const urlChain = _.flatMap(reqRedirectChain, req => {
    const requestUrl = req.url();
    // const timestamp = makeTimestamp();
    const resp = req.response();

    if (resp === null) {
      return [];
    }
    const responseChainHeaders = resp.headers();
    // const requestChainHeaders = req.headers();
    // const responseUrl = resp.url();
    const status = resp.status().toString();

    // prettyPrint({ requestUrl, responseUrl, requestChainHeaders, responseChainHeaders });

    const { location, date } = responseChainHeaders;
    // chainLink.responseUrl = responseUrl;
   // chainLink.status = status;

    const chainLink: UrlChainLink = {
      requestUrl,
      responseUrl: location,
      status,
      timestamp: date
    };
    return [chainLink];
  });
  return urlChain;
}

// export function makeTimestamp(): string {
//   const now = new Date().toISOString()
//   return now;
// }

export interface Metadata {
  initialUrl: string;
  responseUrl: string;
  status: number;
  fetchChain: UrlChain;
  method: string;
  timestamp: string;
}


export function createMetadata(response: Response): Metadata {
  const request: Request = response.request();
  const fetchChain = createRequestChain(request);
  // const requestUrl = request.url();
  const responseUrl = response.url();
  const status = response.status();
  const method = request.method();
  const { date } = response.headers();
  // const timestamp = makeTimestamp();
  const metadata: Metadata = {
    initialUrl: responseUrl,
    responseUrl,
    status,
    fetchChain,
    method,
    timestamp: date,
  };
  return metadata;
}

export interface ScrapingContext extends SpiderLoggers {
  workingDirectory: string;
  initialUrl: string;
  entryEncPath: HashEncodedPath;
}
