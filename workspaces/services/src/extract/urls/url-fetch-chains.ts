import _ from "lodash";

import {
  createReadLineStream,
  streamPump,
  isDefined,
  makeTreeFromPairs,
  Edges,
} from "commons";

export interface UrlChainLink {
  requestUrl: string;
  responseUrl?: string;
  status: string;
  timestamp: string;
}
import * as Tree from 'fp-ts/lib/Tree';

export type UrlChain = UrlChainLink[];
export type UrlChains = UrlChain[];

export interface UrlChainGraph {
  isUrlCrawled(url: string): boolean;
  getUrlFetchChain(url: string): UrlChain;
}

function trimGetClause(str: string): string {
  const li = str.lastIndexOf('>');
  return str.substring(5, li);
}

const getUrlRE = new RegExp('<GET ([^>]*)>([ ]|$)', 'g');

// These are the log entries we care about from scrapy
// cat crawler.log | egrep -v '\[protego\]' | egrep -v '\[scrapy\.(down|ext|core|utils|crawler|spidermiddle)'
export function parseLogLine(logline: string): UrlChainLink | string | undefined {
  const httpCodeRE = /DEBUG: (\w+) [(](\d{3})[)]/;
  const httpForbiddenByRobotsRE = /DEBUG: Forbidden by robots.txt/;
  const timestampRE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;


  const timestampMatch = logline.match(timestampRE);
  // All lines we care about start with a timestamp, parse and validate:
  if (timestampMatch == null) return;
  const dateAsString = timestampMatch[0];
  const dateAsNum = Date.parse(dateAsString);
  if (isNaN(dateAsNum)) return;


  const httpCodeMatches = logline.match(httpCodeRE);
  const isForbiddenByRobotsTxt = httpForbiddenByRobotsRE.test(logline);

  const urlMatches = logline.match(getUrlRE);
  let [firstUrl, secondUrl] = urlMatches ? urlMatches : [undefined, undefined];
  firstUrl = firstUrl ? trimGetClause(firstUrl) : undefined;
  secondUrl = secondUrl ? trimGetClause(secondUrl) : undefined;

  if (isForbiddenByRobotsTxt) {
    if (!firstUrl) return 'Error: could not parse single url in ${logline}';
    const chainLink: UrlChainLink = {
      requestUrl: firstUrl,
      status: "Forbidden",
      timestamp: dateAsString
    };
    return chainLink;
  }

  const [, httpAction, httpStatus] = httpCodeMatches ? httpCodeMatches : [undefined, undefined, undefined];

  if (httpAction === 'Redirecting') {
    if (!firstUrl || !secondUrl) return 'Error: could not parse two urls in ${logline}';
    if (!httpStatus) return 'Error: could not parse status in ${logline}';
    const chainLink: UrlChainLink = {
      requestUrl: secondUrl,
      responseUrl: firstUrl,
      status: httpStatus,
      timestamp: dateAsString
    };
    return chainLink;
  }

  if (httpAction === 'Crawled') {
    if (!firstUrl) return 'Error: could not parse single url in ${logline}';
    if (!httpStatus) return 'Error: could not parse status in ${logline}';
    const chainLink: UrlChainLink = {
      requestUrl: firstUrl,
      status: httpStatus,
      timestamp: dateAsString
    };
    return chainLink;
  }

  return;
}


import StaticDisjointSet from 'mnemonist/static-disjoint-set'

export function getUniqRequestUrls(allLinks: UrlChain): string[] {
  return _.uniq(_.map(allLinks, l => l.requestUrl));
}

export function buildFetchChainDisjointSets(allLinks: UrlChain): UrlChains {
  // Build a map from Urls -> indexes at which it appears as a request
  const reqLinkNums = new Map<string, number[]>();

  _.each(allLinks, (link, linkNum) => {
    const { requestUrl } = link;
    const prevs0 = reqLinkNums.get(requestUrl) || [];
    prevs0.push(linkNum);
    reqLinkNums.set(requestUrl, prevs0);
  });

  // const disjointChains = new StaticDisjointSet(reqLinkNums.size);
  const disjointChains = new StaticDisjointSet(allLinks.length);
  _.each(allLinks, (link, linkNum) => {
    const { responseUrl } = link;
    if (!responseUrl) return;

    const maybeNextLinks = reqLinkNums.get(responseUrl) || [];

    const downstreamLinkNums = _.filter(maybeNextLinks, n => n > linkNum);
    _.each(downstreamLinkNums, dsLinkNum => {
      disjointChains.union(linkNum, dsLinkNum);
    });
  });
  const setsAsIndexes = disjointChains.compile();
  const setsAsChainLinks = _.map(setsAsIndexes, (linkNums) => {
    return _.map(linkNums, l => allLinks[l]);
  });

  const uniqChains = _.map(setsAsChainLinks, chains => {
    const uniqChain = _.uniqBy(chains, link => {
      const { requestUrl, responseUrl, status } = link;
      return `${requestUrl}_${status}_${responseUrl ? responseUrl : '.'}`;
    });
    return uniqChain;
  });

  console.log('Finished buildFetchChainDisjointSets');
  return uniqChains;
}

export function buildFetchChainTree(_allLinks: UrlChain): void {
  const allLinks = _.uniqBy(_allLinks, link => {
    const { requestUrl, responseUrl, status } = link;
    return `${requestUrl}_${status}_${responseUrl ? responseUrl : '.'}`;
  });

  const reqLinkNums = new Map<string, number[]>();

  _.each(allLinks, (link, linkNum) => {
    const { requestUrl } = link;
    const prevs0 = reqLinkNums.get(requestUrl) || [];
    prevs0.push(linkNum);
    reqLinkNums.set(requestUrl, prevs0);
  });

  const allParentChildPairs: Edges<number> = _.flatMap(allLinks, (link, linkNum) => {
    const { responseUrl } = link;
    if (!responseUrl) return [];
    const maybeNextLinks = reqLinkNums.get(responseUrl) || [];

    const downstreamLinkNums = _.filter(maybeNextLinks, n => n > linkNum);
    const downstreamParentChildPairs = _.map(downstreamLinkNums, n => [linkNum, n] as [number, number]);
    return downstreamParentChildPairs;
  });

  const chainTrees = makeTreeFromPairs(allParentChildPairs);

  _.each(chainTrees, (chainTree) => {
    const chainTreeStr = Tree.map((n: number) => {
      const linkN = allLinks[n];
      const { requestUrl, responseUrl, status, timestamp } = linkN;
      return `${requestUrl} -(${status})-> ${responseUrl ? responseUrl : '.'}  ${timestamp}`;
    })(chainTree);
    const asString = Tree.drawTree(chainTreeStr);
    console.log('=========\n\n');
    console.log(asString);
    console.log('\n');
  });

}

export async function readUrlFetchChainsFromScrapyLogs(logfile: string): Promise<UrlChainGraph> {
  const inputStream = createReadLineStream(logfile)

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(inputStream)
    .throughF((line: string) => {
      const parsed = parseLogLine(line);
      if (_.isString(parsed)) {
        console.log('error parsing logfile line', parsed);
        return;
      }
      return parsed;
    })
    .guard(isDefined)
    .gather();

  return pumpBuilder.toPromise()
    .then((allLinks) => {
      if (!allLinks) {
        const emptyGraph: UrlChainGraph = {
          isUrlCrawled(): boolean {
            return false;
          },
          getUrlFetchChain(): UrlChain {
            return [];
          }
        };
        return emptyGraph;
      }

      const fetchChainSets = buildFetchChainDisjointSets(allLinks);

      const urlToChain = new Map<string, UrlChain>();
      _.each(fetchChainSets, chainLinks => {
        const reqUrls = _.uniq(_.map(chainLinks, link => link.requestUrl));
        _.each(reqUrls, url => urlToChain.set(url, chainLinks));
      });



      const urlGraph: UrlChainGraph = {
        isUrlCrawled(url: string, _verbose?: boolean): boolean {
          return urlToChain.has(url);
        },
        getUrlFetchChain(url: string): UrlChain {
          return urlToChain.get(url) || [];
        }
      };
      return urlGraph;
    });
}
