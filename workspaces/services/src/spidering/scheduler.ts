
import { Readable } from 'stream';
import {
  streamPump,
} from "commons";

type UrlString = string
// type Done = false;
// type Yielded = string;
// export function *getFoo(): Generator<UrlString, Done, Yielded> {
//   const z: string = yield 'http://foo.bar';
//   return false;
// }


export interface CrawlScheduler {
  addUrls(urlStream: Readable): Promise<void>;
  startingUrls: UrlString[];
  getUrlStream(): Readable; //<string>;
}

export function initCrawlScheduler(): CrawlScheduler {
  const crawlScheduler: CrawlScheduler = {
    startingUrls: [],
    async addUrls(urlStream: Readable) {
      const inputUrls = await streamPump.createPump()
        .viaStream<string>(urlStream)
        .filter(() => {
          // check if valid url
          return true;
        })
        .gather()
        .toPromise();

      const newUrls = inputUrls || [];
      this.startingUrls.push(...newUrls);
    },
    getUrlStream(): Readable { //<string>;
      return Readable.from(this.startingUrls);
    },
  };

  return crawlScheduler;
}
