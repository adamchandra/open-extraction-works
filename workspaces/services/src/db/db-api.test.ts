import 'chai/register-should';

import _ from "lodash";

import { AlphaRecord  } from 'commons';
import { useEmptyDatabase } from './db-test-utils';
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
