import _ from 'lodash';

import {
  // Response,
  Request,
  // ResourceType,
  // Page,
} from 'puppeteer';

import { prettyPrint } from 'commons';
import { getSpiderLogger } from './spider-logging';

const log = getSpiderLogger();

export function formatRequestChain(request: Request) {
  const reqRedirectChain = request.redirectChain();
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
 //
}

// Files to write:
// metadata.json
// request-headers.json
// request-body
// response-headers.json
// response-body
// fetchlog.json

export interface Metadata {
  url: string;
  responseUrl: string;
  status: number;
  fetchChain: string[];
  method: string;
  timestamp: string;
}
export function formatMetaFile() {
  //
}


// {'url': 'https://knowledge.amia.org/67852-amia-1.4259402/t006-1.4263223/t006-1.4263224/2974121-1.4263582/2976633-1.4263579?qr=1',
// 'method': 'GET', 'status': 200,
// 'response_url': 'https://knowledge.amia.org/67852-amia-1.4259402/t006-1.4263223/t006-1.4263224/2974121-1.4263582/2976633-1.4263579?qr=1',
// 'timestamp': 1591284248.5032194}%

