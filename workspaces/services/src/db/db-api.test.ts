
import _ from "lodash";

import 'chai/register-should';
import { prettyPrint, AlphaRecord, putStrLn } from 'commons';
import { createEmptyDB, useEmptyDatabase } from './db-test-utils';
import { Database } from './database';
import { insertAlphaRecords, upsertUrlChains } from './db-api';

describe('High-level Database API', () => {

  it('smokescreen', async (done) => {
    await useEmptyDatabase(async (_sql) => {
      //
    });
    const inputRecs: AlphaRecord[] = _.map(_.range(40), (n) => {
      const n0 = n % 5 === 0 ? 42 : n;
      return ({
        noteId: `note-${n}`,
        dblpConfId: `dblp/conf/conf-${n}`, // TODO rename to dblpKey
        title: `titl-${n}`,
        authorId: `auth-${n}`,
        url: `http://foo${n0}.bar/${n0}`,
      });
    });
    await insertAlphaRecords(inputRecs);
    await upsertUrlChains();

    done();
  });
});
