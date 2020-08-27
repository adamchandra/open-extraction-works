import 'chai/register-should';

import _ from "lodash";

import { AlphaRecord, prettyPrint } from 'commons';
import { useEmptyDatabase } from './db-test-utils';
import { commitMetadata, getNextUrlForSpidering, insertAlphaRecords, insertNewUrlChains } from './db-api';
import { Metadata } from '~/spidering/data-formats';
import { UrlChainLink } from '~/extract/urls/url-fetch-chains';


function mockUrl(n: number): string {
  return `http://doi.org/${n}`;
}

function mockAlphaRecord(n: number): AlphaRecord {
  return ({
    noteId: `note-id-${n}`,
    dblpConfId: `dblp/conf/conf-${n}`, // TODO rename to dblpKey
    title: `The Title Paper #${n}`,
    authorId: `auth-${n}`,
    url: mockUrl(n)
  });
}

function mockMetadata(n: number): Metadata {
  const fetchChain: UrlChainLink[] = _.map(_.range(n), (n) => {
    const link: UrlChainLink = {
      requestUrl: mockUrl(n),
      responseUrl: mockUrl(n+1),
      status: `303`,
      timestamp: '',
    };
    return link;
  });

  const metadata: Metadata = {
    requestUrl: mockUrl(0),
    responseUrl: mockUrl(n),
    status: '200',
    fetchChain,
    timestamp: ''
  };

  return metadata;
}

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


  it.only('should commit spidering metadata to db', async (done) => {
    const metadata = mockMetadata(3);
    const alphaRecord =  mockAlphaRecord(0);
    prettyPrint({ metadata, alphaRecord });

    await insertAlphaRecords([alphaRecord]);
    await insertNewUrlChains();
    const nextUrl = await getNextUrlForSpidering();
    prettyPrint({ nextUrl });
    await commitMetadata(metadata);

    done();
  });

  // TODO workflow for gather fields in response to a Rest Request
  // TODO workflow for submitting observed errors in extracted fields
  // TODO workflow for purging/re-running parts of the extraction workflow
  // TODO workflow for Q/A review?

});
