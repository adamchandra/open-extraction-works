//
import { Database } from './database';
import { Order, Url, NoteId, VenueUrl, OrderEntry } from './database-tables';
import { AlphaRecord } from 'commons';

export const addOrderEntry: (db: Database, order: Order) => (r: AlphaRecord) => Promise<OrderEntry> =
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

// export async function createOrder(opts: COptions): Promise<OrderEntry[]> {
//   const logger = createConsoleLogger();
//   logger.info({ event: "initializing order", config: opts });
//   const inputStream = readAlphaRecStream(opts.csvFile);

//   const db = await openDatabase();

//   const newOrder = await db.run(async () => {
//     return Order.create()
//       .catch(error => {
//         prettyPrint({ error });
//       });
//   });

//   if (!newOrder) return [];

//   const addEntry = addOrderEntry(db, newOrder);

//   let i = 0;
//   const pumpBuilder = streamPump.createPump()
//     .viaStream<AlphaRecord>(inputStream)
//     .throughF(addEntry)
//     .tap(() => {
//       if (i % 100 === 0) {
//         console.log(`processed ${i} records`);
//       }
//       i += 1;
//     })
//     .gather()
//     .onEnd(async () => {
//       logger.info({ event: "done" });
//       await db.sql.close();
//       logger.info({ event: "db closed" });
//     });

//   return pumpBuilder.toPromise()
//     .then((recs) => recs || []);
// }
