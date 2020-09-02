import _ from "lodash";
import path from 'path';
import fs from "fs-extra";

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  readAlphaRecStream,
  AlphaRecord,
  prettyPrint, putStrLn
} from "commons";

import { extractAbstractTransform, ExtractionAppContext, readExtractionRecord, skipIfAbstractLogExisits } from './extract-abstracts';
import { getBasicLogger } from '~/utils/basic-logging';
import isUrl from 'is-url-superb';
import { makeHashEncodedPath } from '~/utils/hash-encoded-paths';
import { Field } from '../core/extraction-process';

export async function runMainExtractAbstracts(
  cacheRoot: string,
  logpath: string,
): Promise<void> {

  const dirEntryStream = walkScrapyCacheCorpus(cacheRoot);
  const log = getBasicLogger(logpath, 'abstract-finder-log.json');

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .initEnv<ExtractionAppContext>(() => ({
      log,
    }))
    .tap(ensureArtifactDirectories)
    .filter(skipIfAbstractLogExisits)
    .tap(extractAbstractTransform);

  return pumpBuilder.toPromise()
    .then(() => undefined);

}

export async function runMainGatherAbstracts(
  corpusRoot: string,
  alphaRecordCsv: string,
): Promise<void> {
  const inputStream = readAlphaRecStream(alphaRecordCsv);

  const urlStream = streamPump.createPump()
    .viaStream<AlphaRecord>(inputStream)
    .throughF((inputRec: AlphaRecord) => {
      const { url, noteId, authorId } = inputRec;

      const entryEncPath = makeHashEncodedPath(url, 3);
      const entryPath = entryEncPath.toPath();
      const entryFullpath = path.resolve(corpusRoot, entryPath);
      const extractionRec = readExtractionRecord(entryFullpath);
      if (extractionRec) {
        const abstractInstance0: Field|undefined = _.get(extractionRec, 'fields.abstract.instances[0]');
        if (abstractInstance0 && abstractInstance0.value) {
          prettyPrint({ entryPath, abstractInstance0 });
          const { name, value } = abstractInstance0;
          return ({
            url,
            id: noteId,
            fields: [
              { kind: name, value }
            ]
          });
        }
      }
      return ({
        url,
        id: noteId,
        fields: undefined
      });
    }).gather()
  ;

  const result =  await urlStream.toPromise();

  if (!result)  {
    putStrLn(`no records found using ${alphaRecordCsv} in ${corpusRoot}`);
    return;
  }
  fs.writeJsonSync('gather-abstracts.json', result);
}
