
import _ from "lodash";
import pumpify from "pumpify";
import { Stream } from "stream";
import fs, { } from 'fs-extra';
import { AlphaRecord } from '~/extract/core/extraction-records';
import { readUrlFetchChainsFromScrapyLogs } from '~/extract/urls/url-fetch-chains';

import {
  throughFunc,
  prettyPrint,
  createConsoleLogger,
  csvStream,
} from "commons";

import { openDatabase, Database } from './database';
import { Order, Url, NoteId, VenueUrl, OrderEntry } from './database-tables';
import { streamPump } from 'commons';

export function readOrderCsv(csvfile: string): Stream {
  const inputStream = csvStream(csvfile);

  return pumpify.obj(
    inputStream,
    throughFunc((csvRec: string[]) => {
      const [noteId, dblpConfId, title, url, authorId] = csvRec;
      return {
        noteId, dblpConfId, url, title, authorId
      };
    }),
  );
}

export interface COptions {
  csvFile: string;
}

const addOrderEntry: (db: Database, order: Order) => (r: AlphaRecord) => Promise<OrderEntry> =
  (db, order) => async (rec) => {
    const { noteId, url, dblpConfId } = rec;

    return db.run(async () => {
      const urlP = Url.findCreateFind({
        where: { url },
        defaults: { url },
      });

      const noteP = NoteId.findCreateFind({
        where: { noteId },
        defaults: { noteId },
      });

      const venueP = VenueUrl.findCreateFind({
        where: { url: dblpConfId },
        defaults: { url: dblpConfId },
      });

      return Promise
        .all([urlP, noteP, venueP])
        .then(([urlA, noteA, venueA]) => {
          const [urlEntry] = urlA;
          const [noteEntry] = noteA;
          const [venueEntry] = venueA;

          return OrderEntry.create({
            order: order.id,
            note: noteEntry.id,
            url: urlEntry.id,
            venue: venueEntry.id,
          });
        });
    })
  };

export async function createOrder(opts: COptions): Promise<OrderEntry[]> {
  const logger = createConsoleLogger();
  logger.info({ event: "initializing order", config: opts });
  const inputStream = readOrderCsv(opts.csvFile);

  const db = await openDatabase();

  const newOrder = await db.run(async () => {
    return Order.create()
      .catch(error => {
        prettyPrint({ error });
      });
  });

  if (!newOrder) return [];

  const addEntry = addOrderEntry(db, newOrder);

  let i = 0;
  const pumpBuilder = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .throughF(addEntry)
    .tap(() => {
      if (i % 100 === 0) {
        console.log(`processed ${i} records`);
      }
      i += 1;
    })
    .gather()
    .onEnd(async () => {
      logger.info({ event: "done" });
      await db.sql.close();
      logger.info({ event: "db closed" });
    });

  return pumpBuilder.toPromise()
    .then((recs) => recs || []);
}


export async function pruneCrawledFromCSV(scrapyLogs: string, csvFile: string): Promise<void> {
  const urlGraph = await readUrlFetchChainsFromScrapyLogs(scrapyLogs);
  console.log('created Url Graph');

  const inputStream = readOrderCsv(csvFile);

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


  prettyPrint({ stats });
}
