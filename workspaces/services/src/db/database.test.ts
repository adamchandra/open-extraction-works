import _ from "lodash";

import 'chai/register-should';
import { prettyPrint, AlphaRecord, putStrLn } from 'commons';
import { Url } from './database-tables';
import { useEmptyDatabase } from './db-test-utils';
import { createAlphaRequest, createAlphaUpload } from './db-api';
import * as Task from 'fp-ts/lib/Task';
import * as Arr from 'fp-ts/lib/Array';
const sequenceArrOfTask = Arr.array.sequence(Task.task);


describe('Database Basics', () => {
  it('smokescreen', async (done) => {
    await useEmptyDatabase(async db => {

      await db.runTransaction(async (_db, transaction) => {
        const newEntry = await Url.create({
          url: 'blah:/blah/blah'
        }, { transaction });
        const theUrl = newEntry.url;

        prettyPrint({ theUrl });
      });


      await db.run(async () => {
        return Url.findAll()
          .then((urls) => {
            const plainUrls = urls.map(a => a.get({ plain: true }));
            prettyPrint({ plainUrls });
          });
      });
    });

    done();
  });

  it('should create Urls', async (done) => {
    const urls: string[] = _.map(_.range(30), (n) => {
      const n0 = n % 2 === 0 ? 10 : 20;
      return `url-${n0}`;
    });
    await useEmptyDatabase(async db => {
      await db.runTransaction(async (_sql, transaction) => {
        const inits = _.map(urls, url => () => Url.findOrCreate({
          where: { url },
          defaults: { url },
          transaction
        }));

        return await sequenceArrOfTask(inits)();
      });


      await db.run(async () => {
        return Url.findAll()
          .then((urls) => {
            const plainUrls = urls.map(a => a.get({ plain: true }));
            prettyPrint({ plainUrls });
          });
      });
    });

    done();
  });

  it.only('create an alpha upload entry from initial alpha records', async (done) => {
    const inputRecs: AlphaRecord[] = _.map(_.range(3), (n) => {
      const n0 = n % 2 === 0 ? 10 : 20;
      return ({
        noteId: `note-${n0}`,
        dblpConfId: `dblp-${n0}`,
        title: `titl-${n0}`,
        authorId: `auth-${n0}`,
        url: `url-${n0}`,
      })
    });
    await useEmptyDatabase(async db => {
      await db.runTransaction(async (_sql, transaction) => {
        const newUpload = await createAlphaUpload(transaction, inputRecs);
        if (!newUpload) {
          putStrLn('upload not successful')
          return;
        }

        const plainRecs = newUpload.get({ plain: true });
        prettyPrint({ plainRecs });
      });
    });

    done();

  });
  it('create an alpha request from initial alpha records', async (done) => {

    const inputRecs: AlphaRecord[] = _.map(_.range(5000), (n) => {
      const n0 = n % 2 === 0 ? 10 : 20;
      return ({
        noteId: `note-${n0}`,
        dblpConfId: `dblp-${n0}`,
        title: `titl-${n0}`,
        authorId: `auth-${n0}`,
        url: `url-${n0}`,
      })
    });


    await useEmptyDatabase(async db => {
      console.time("adding recs");
      await db.runTransaction(async (_sql, transaction) => {
        const newRecs = await createAlphaRequest(transaction, inputRecs);
        const plainRecs = newRecs.map(a => a.get({ plain: true }));
        const recCount = plainRecs.length;
        prettyPrint({ recCount });
        // const plainRecs = newRecs.map(a => a.get({ plain: true }));
        // prettyPrint({ plainRecs });
      });
      console.timeEnd("adding recs");
    });

    done();
  });

  // it('track whether an order is complete', async (done) => {});

});
