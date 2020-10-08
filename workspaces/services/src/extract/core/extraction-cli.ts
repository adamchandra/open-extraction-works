import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
  readCorpusJsonFile,
  writeCorpusJsonFile,
} from 'commons';

import path from 'path';

import {
  Arrow,
} from './extraction-prelude';


import { ExtractContext,  initExtractionEnv } from './extraction-process-v2';
import { Metadata } from '~/spidering/data-formats';

import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { AbstractFieldAttempts, FieldExtractionPipeline } from './extraction-rules';



export async function runFieldExtractors(
  entryPath: string,
  ctx: ExtractContext,
  extractionPipeline: Arrow<unknown, unknown>
): Promise<void> {
  // const extractionPipeline = FieldExtractionPipeline;
  const { log } = ctx;

  const metadata = readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json');

  if (metadata === undefined) {
    log.warn('no metadata.json file found, skipping...');
    return;
  }

  const env = await initExtractionEnv(entryPath, ctx, metadata);

  const res = await extractionPipeline(TE.right([metadata, env]))();


  if (E.isRight(res)) {
    const [, env] = res.right;
    const { fieldRecs } = env;

    const reshaped = _.mapValues(fieldRecs, (value) => {
      return {
        count: value.length,
        instances: value
      };
    });
    const output = {
      fields: reshaped
    };

    const extractionRecordFileName = 'extraction-records.json';
    writeCorpusJsonFile(entryPath, 'extracted-fields', extractionRecordFileName, output);
  }

  await env.browser.close();

  log.info('finished extractors');
}


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
    .tap((entryPath, ctx) => runFieldExtractors(entryPath, ctx, FieldExtractionPipeline))
  ;

  return pumpBuilder.toPromise()
    .then(() => undefined);
}




export async function testFieldExtractor(
  entryPath: string,
  ctx: ExtractContext,
  extractionPipeline: Arrow<unknown, unknown>
): Promise<void> {
  const { log } = ctx;

  const metadata = readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json');

  if (metadata === undefined) {
    log.warn('no metadata.json file found, skipping...');
    return;
  }

  const env = await initExtractionEnv(entryPath, ctx, metadata);
  const res = await extractionPipeline(TE.right([metadata, env]))();

  if (E.isRight(res)) {
    const [, env] = res.right;
    const { fieldRecs } = env;
  }

  await env.browser.close();

  log.info('finished extractors');
}

export async function runMainTestExtractFields(
  corpusRoot: string,
  logpath: string,
  logLevel: string
): Promise<void> {

  const logFilename = 'test-extractor-log.json';
  const logfilePath = path.join(logpath, logFilename);
  const log = getConsoleAndFileLogger(logfilePath, logLevel);

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .initEnv<ExtractContext>(() => ({
      log,
    }))
    .tap(ensureArtifactDirectories)
    .tap((entryPath, ctx) => testFieldExtractor(entryPath, ctx, AbstractFieldAttempts))
  ;

  return pumpBuilder.toPromise()
    .then(() => undefined);
}
