import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
  readCorpusJsonFile,
  // writeCorpusJsonFile,
} from 'commons';

import path from 'path';

import {
  Arrow,
  // ExtractionEnv,
  PerhapsW
} from './extraction-prelude';


import { ExtractContext, initExtractionEnv } from './extraction-process-v2';
import { Metadata } from '~/spidering/data-formats';

import * as TE from 'fp-ts/TaskEither';
import { AbstractFieldAttempts } from './extraction-rules';


export async function runFieldExtractor(
  ctx: ExtractContext,
  metadata: Metadata,
  extractionPipeline: Arrow<unknown, unknown>
): Promise<PerhapsW<unknown>> {
  const { entryPath } = ctx;

  const env = await initExtractionEnv(entryPath, ctx, metadata);
  const res = await extractionPipeline(TE.right([metadata, env]))();

  await env.browser.close();

  return res;
}

export async function runMainExtractFields(
  corpusRoot: string,
  logpath: string,
  logLevel: string,
  dropN: number,
  takeN: number
): Promise<void> {

  const logFilename = 'test-extractor-log.json';
  const logfilePath = path.join(logpath, logFilename);
  const log = getConsoleAndFileLogger(logfilePath, logLevel);

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);

  let entryNum = 0;

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .tap(() => entryNum += 1)
    .filter(() => dropN <= entryNum && entryNum <= dropN + takeN)
    .tap(() => log.info(`Processing Entry#${entryNum}`))
    .filter((entryPath) => entryPath !== undefined)
    .initEnv<ExtractContext>((entryPath) => ({
      entryPath: entryPath || '',
      log,
    }))
    .filter((entryPath) => entryPath !== '')
    .throughF((entryPath) => readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json'))
    .tap(async (metadata, ctx) => {
      if (metadata === undefined) return;

      ensureArtifactDirectories(ctx.entryPath);
      const res = await runFieldExtractor(ctx, metadata, AbstractFieldAttempts);
      // if (E.isRight(res)) {
      //   const [, env] = res.right;
      //   const { fieldRecs } = env;

      //   const reshaped = _.mapValues(fieldRecs, (value) => {
      //     return {
      //       count: value.length,
      //       instances: value
      //     };
      //   });
      //   const output = {
      //     fields: reshaped
      //   };

      //   const extractionRecordFileName = 'extraction-records.json';
      //   writeCorpusJsonFile(entryPath, 'extracted-fields', extractionRecordFileName, output);
      // }
    });

  return pumpBuilder.toPromise()
    .then(() => undefined);
}
