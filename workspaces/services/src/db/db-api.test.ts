import 'chai/register-should';

import _ from 'lodash';

import { prettyPrint } from 'commons';
import { useEmptyDatabase } from './db-test-utils';
import { commitMetadata, getNextUrlForSpidering, insertAlphaRecords, insertCorpusEntry, insertNewUrlChains } from './db-api';
import { mockAlphaRecord, mockMetadata } from '~/spidering/data-formats';
import { AlphaRecord } from '~/prelude/types';


describe('High-level Database API', () => {
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

  beforeEach(async () => {
    return await useEmptyDatabase(async () => undefined);
  });

  it('should create new alpha records and insert new url chains', async (done) => {

    await insertAlphaRecords(inputRecs);
    await insertNewUrlChains();

    done();
  });

  it('should select next url for spidering', async (done) => {

    await insertAlphaRecords(inputRecs);
    await insertNewUrlChains();
    const nextUrl = await getNextUrlForSpidering();
    prettyPrint({ nextUrl });

    done();
  });


  it('should commit spidering metadata to db', async (done) => {
    const metadata = mockMetadata(3);
    const alphaRecord =  mockAlphaRecord(0);
    // prettyPrint({ metadata, alphaRecord });

    await insertAlphaRecords([alphaRecord]);
    await insertNewUrlChains();
    const nextUrl = await getNextUrlForSpidering();
    prettyPrint({ nextUrl });
    const commitedMeta = await commitMetadata(metadata);
    prettyPrint({ commitedMeta });
    const { requestUrl } = metadata;
    const entryStatus = await insertCorpusEntry(requestUrl);
    prettyPrint({ entryStatus });

    const entryStatus2 = await insertCorpusEntry(requestUrl);
    prettyPrint({ entryStatus2 });

    done();
  });

  // TODO workflow for gather fields in response to a Rest Request
  // TODO workflow for submitting observed errors in extracted fields
  // TODO workflow for purging/re-running parts of the extraction workflow
  // TODO workflow for Q/A review?

});
