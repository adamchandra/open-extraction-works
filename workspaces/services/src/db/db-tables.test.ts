import _ from "lodash";

import 'chai/register-should';
import { prettyPrint, AlphaRecord, shaEncodeAsHex } from 'commons';
import * as T from './database-tables';
import { useEmptyDatabase } from './db-test-utils';



describe('Database Tables Basics', () => {
  it('UrlChain', async (done) => {

    const url = 'http://blah.blah/?q=1';
    const urlChainId = shaEncodeAsHex(url);

    await useEmptyDatabase(async db => {

      await db.runTransaction(async (_sql, transaction) => {
        const newEntry = await T.UrlChain.create({
          url, urlChainId
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

  it.only('AlphaRecord', async (done) => {

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
      const alphaRec0 = inputRecs[0];

      await db.runTransaction(async (_sql, transaction) => {
        const newEntry = await T.AlphaRecord.create({
          noteId: alphaRec0.noteId,
          url: alphaRec0.url,
          dblpKey: alphaRec0.dblpConfId,
          authorId: alphaRec0.authorId,
          title: alphaRec0.title,

        }, { transaction });
        const plainNewEntry = newEntry.get({ plain: true });

        prettyPrint({ plainNewEntry });
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
