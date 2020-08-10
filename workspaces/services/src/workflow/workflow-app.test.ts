import "chai/register-should";

import _ from "lodash";
import { useEmptyDatabase } from '~/db/db-test-utils';
import { AlphaRecord } from 'commons';

describe("End-to-end Extraction workflows", () => {

  const sampleRecs: AlphaRecord[] = _.map(_.range(4), (n) => {
    return ({
      noteId: `note-${n}`,
      dblpConfId: `dblp.org/conf/c-${n}/199${n}`,
      title: `title-${n}`,
      authorId: `auth-${n}`,
      url: `http://foo.bar/${n}`,
    })
  });

  it.only("should create end-to-end extraction workflow", async (done) => {

    await useEmptyDatabase(async () => undefined);

    // REST api input: AlphaRecord[]
    // map alphaRecs  r => Left('unavailable') | Right('field list | extraction/spidering/etc errors')
    // respond to REST w/results/errors
    // Extraction workflow:;
    //   const unavailableRecs = lefts[]
    //   enqueue(unavailableRecs)

    // RestPortal: inserts some AlphaRecords
    // Async.map(inputRecs, async (rec) => {
    //   const alphaRecs = await insertAlphaRecords([rec]);
    //   // const alphaRecId = ...
    //   // if (validate(alphaRec)) insertAlphaRecords() && yieldData<string>('AlphaRecord', alphaRecId);
    //   // else parkData(alphaRec, 'invalid input record')
    // });
    //   Run await collectParkedResults(timeout=10.seconds, inputRecs);
    //     corpusEntry? = getCorpusEntryForUrl(url)
    //     if (corpusEntry) response.body = readJson(corpusEntry, 'fields.json')
    //     else             response.body = { 'msg': 'no available fields'}

    // UploadIngestor marks all invalid new URLs
    //   newUrl = getYielded<string>();
    //   if (isValidUrl(newUrl))  yieldData<string>('UrlQueue', newUrl);
    //   else parkData(url, 'invalid url')


    // Spider: process next unspidered Url
    //   nextUrl = getYielded<string>();
    //   ... run spider ...
    //   if (status==200)  yieldData<string>('CorpusEntry', corpusHashId (=urlChainId));
    //   else              parkData(nextUrl, 'url fetch status was ...')

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
});
