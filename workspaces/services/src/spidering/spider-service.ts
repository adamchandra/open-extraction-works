
import fs, { } from 'fs-extra';
import { readUrlFetchChainsFromScrapyLogs } from '~/extract/urls/url-fetch-chains';

import {
  streamPump,
  readAlphaRecStream,
  AlphaRecord,
} from "commons";

export async function pruneCrawledFromCSV(scrapyLogs: string, csvFile: string): Promise<void> {
  const urlGraph = await readUrlFetchChainsFromScrapyLogs(scrapyLogs);
  console.log('created Url Graph');

  const inputStream = readAlphaRecStream(csvFile);

  const stats = {
    crawled: 0,
    uncrawled: 0,
    no_url: 0
  }

  let i = 0;

  const fd = fs.openSync(`${csvFile}.pruned.csv`, fs.constants.O_CREAT | fs.constants.O_WRONLY);

  const pumpBuilder = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .tap((inputRec) => {
      if (i % 100 === 0) {
        console.log(`processed ${i} records`);
      }
      i += 1;

      const { url } = inputRec;
      const isCrawled = urlGraph.isUrlCrawled(url);
      if (isCrawled) {
        stats.crawled += 1;
      } else {

        if (url !== 'no_url') {
          stats.uncrawled += 1;
          const outrec = `,,,${url}\n`;
          fs.appendFileSync(fd, outrec);
        } else {
          stats.no_url += 1;
        }
      }
    }).throughF(d => d);

  await pumpBuilder.toPromise().then(() => {
    fs.closeSync(fd);
  });

}
