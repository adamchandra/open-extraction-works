import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
} from 'commons';

import path from 'path';

import { ExtractContext, runFieldExtractors } from './extraction-process-v2';

export async function runMainExtractFields(
  corpusRoot: string,
  logpath: string,
  logLevel: string
): Promise<void> {

  const logFilename = 'field-extractor-log.json';
  const logfilePath = path.join(logpath, logFilename);
  const log = getConsoleAndFileLogger(logfilePath, logLevel);

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .initEnv<ExtractContext>(() => ({
      log,
    }))
    .tap(ensureArtifactDirectories)
    .tap(runFieldExtractors)
  ;

  return pumpBuilder.toPromise()
    .then(() => undefined);
}

