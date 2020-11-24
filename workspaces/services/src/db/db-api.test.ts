import 'chai/register-should';

import _ from 'lodash';

import { prettyPrint } from 'commons';
import { useEmptyDatabase } from './db-test-utils';
import { commitMetadata, getNextUrlForSpidering, insertAlphaRecords, insertNewUrlChains } from './db-api';
import { mockAlphaRecord, mockMetadata } from 'spider';
import { AlphaRecord } from 'commons';


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

  const uniqRecs = _.uniqBy(inputRecs, r => r.url);

  beforeEach(async () => {
    return await useEmptyDatabase(async () => undefined);
  });

  it('should create new alpha records and insert new url chains', async (done) => {

    const newAlphaRecs = await insertAlphaRecords(inputRecs);
    // _.each(newAlphaRecs, r => {
    //   const rplain = r.get({ plain: true });
    //   prettyPrint({ rplain });
    // });
    const updateCount = await insertNewUrlChains();

    expect(updateCount).toEqual(uniqRecs.length);

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
    prettyPrint({ requestUrl });

    done();
  });

});
