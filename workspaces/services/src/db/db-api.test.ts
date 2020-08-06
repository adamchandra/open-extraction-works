import 'chai/register-should';

import _ from "lodash";

import { AlphaRecord } from 'commons';
import { useEmptyDatabase } from './db-test-utils';
import { insertAlphaRecords, upsertUrlChains } from './db-api';
import Async from 'async';

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
    return useEmptyDatabase(async () => undefined);
  });

  it('smokescreen', async (done) => {
    await insertAlphaRecords(inputRecs);
    await upsertUrlChains();

    done();
  });

  it('should use locking to pass resources through processing chains', async (done) => {
    // TODO yieldData = createLock(serviceNodeName, dbTableName, 'step~yield', datum);
    // TODO getYielded = select * from T where .='Spider' and .='step~init' limit 1;
    // TODO yield/init may be expressed as a Marshall/Unmarshall type
    // TODO ServiceHub transfer yielded = ..
    //        transferLock(satellite1, satellite2, 'step~yield', 'step~init')
    //        clearLock(satellite1, 'step~init')

    // RestPortal: inserts some AlphaRecords
    Async.map(inputRecs, async (rec) => {
      const alphaRecs = await insertAlphaRecords([rec]);
      // const alphaRecId = ...
      // if (validate(alphaRec)) insertAlphaRecords() && yieldData<string>('AlphaRecord', alphaRecId);
      // else parkData(alphaRec, 'invalid input record')
    });
    //   Run await collectParkedResults(timeout=10.seconds, inputRecs);
    //     corpusEntry? = getCorpusEntryForUrl(url)
    //     if (corpusEntry) response.body = readJson(corpusEntry, 'fields.json')
    //     else             response.body = { 'msg': 'no available fields'}

    // ServiceHub: transfer yielded

    // UploadIngestor marks all invalid new URLs
    //   newUrl = getYielded<string>();
    //   if (isValidUrl(newUrl))  yieldData<string>('UrlQueue', newUrl);
    //   else parkData(url, 'invalid url')

    // ServiceHub: transfer yielded

    // Spider: process next unspidered Url
    //   nextUrl = getYielded<string>();
    //   ... run spider ...
    //   if (status==200)  yieldData<string>('CorpusEntry', corpusHashId (=urlChainId));
    //   else              parkData(nextUrl, 'url fetch status was ...')

    // ServiceHub: transfer yielded

    // FieldExtractor: run on file-system
    //   corpusHashId = getYielded<string>();
    //     ... run ... write extracted fields to json file on filesystem
    //   yieldData<string>('CorpusEntry', corpusHashId);

    // ServiceHub: transfer yielded

    // FieldBundler: package fields/errors for delivery
    //   corpusHashId = getYielded<string>();
    //   for each field in fields.json: 
    //     insert into 'ExtractedField' ('abstract', '...');
    //     parkData<string>('FieldBundler', extractedFieldId);

    // ServiceHub: transfer yielded

    // ExtractionEndpoint: signal the completion of extraction workflow
    //   corpusHashId = getYielded<string>();
    //   parkData<string>(corpusHashId);

    done();
  });

  // TODO workflow for gather fields in response to a Rest Request
  // TODO workflow for submitting observed errors in extracted fields
  // TODO workflow for purging/re-running parts of the extraction workflow
  // TODO workflow for Q/A review?

});
