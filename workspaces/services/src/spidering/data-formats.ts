import _ from 'lodash';

import {
  Request, Response,
} from 'puppeteer';

import { UrlChain, UrlChainLink } from '~/extract/urls/url-fetch-chains';

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
    const status = resp.status().toString();


    const { location, date } = responseChainHeaders;

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

  const responseUrl = response.url();
  const status = response.status();
  const method = request.method();
  const { date } = response.headers();

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

