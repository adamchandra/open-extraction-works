import _ from 'lodash';

import 'chai/register-should';
import { prettyPrint } from 'commons';
import * as T from './db-tables';
import { useEmptyDatabase } from './db-test-utils';
import { AlphaRecord } from '~/prelude/types';
import Async from 'async';

describe('Database Tables Basics', () => {

  it('UrlChain', async (done) => {

    const request_url = 'http://blah.blah/?q=1';
    const response_url = 'http://blah.blah/?q=1';
    const status_code = 'http:200';

    await useEmptyDatabase(async db => {

      await db.runTransaction(async (_sql, transaction) => {
        const newEntry = await T.UrlChain.create({
          request_url, response_url, status_code
        }, { transaction });
        const theUrl = newEntry.get({ plain: true });

        prettyPrint({ theUrl });
      });

      await db.run(async () => {
        return T.UrlChain.findAll()
          .then((urls) => {
            const plainUrls = urls.map(a => a.get({ plain: true }));
            prettyPrint({ plainUrls });
          });
      });
    });

    done();
  });

  it('AlphaRecord', async (done) => {

    const inputRecs: AlphaRecord[] = _.map(_.range(3), (n) => {
      const n0 = n % 2 === 0 ? 10 : 20;
      return ({
        noteId: `note-${n0}`,
        dblpConfId: `dblp/conf/conf-${n0}`, // TODO rename to dblpKey
        title: `titl-${n0}`,
        authorId: `auth-${n0}`,
        url: `url-${n0}`,
      });
    });

    await useEmptyDatabase(async db => {
      // const alphaRec0 = inputRecs[0];

      await db.runTransaction(async (_sql, transaction) => {

        await Async.eachSeries(inputRecs, async alphaRec => {
          const [newEntry, isNew] = await T.AlphaRecord.findOrCreate({
            where: {
              note_id: alphaRec.noteId,
              url: alphaRec.url,
            },
            defaults: {
              note_id: alphaRec.noteId,
              url: alphaRec.url,
              dblp_key: alphaRec.dblpConfId,
              author_id: alphaRec.authorId,
              title: alphaRec.title,
            },
            transaction,
          });

          const plainNewEntry = newEntry.get({ plain: true });
          prettyPrint({ isNew, plainNewEntry });
        });
      });

      await db.run(async () => {
        return T.AlphaRecord.findAll()
          .then((alphaRecs) => {
            const plainRecs = alphaRecs.map(a => a.get({ plain: true }));
            prettyPrint({ plainRecs });
          });
      });
    });

    done();
  });

});
