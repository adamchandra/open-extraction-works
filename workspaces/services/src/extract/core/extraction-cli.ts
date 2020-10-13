import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
  readCorpusJsonFile,
  writeCorpusJsonFile,
  hasCorpusFile,
} from 'commons';
import fs from 'fs-extra';

import path from 'path';

import {
  Arrow,
  // ExtractionEnv,
  PerhapsW,
  ExtractionEnv
} from './extraction-prelude';


import { ExtractContext, initExtractionEnv } from './extraction-process-v2';
import { Metadata } from '~/spidering/data-formats';

import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
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
  takeN: number,
  pathFilter: string,
  urlFilter: string,
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
    .filter((entryPath) => {
      const pathRE = new RegExp(pathFilter);
      return pathRE.test(entryPath);
    })
    .throughF((entryPath) => readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json'))
    .filter((metadata) => {
      if (metadata === undefined) return false;
      const url = metadata.responseUrl;
      const re = new RegExp(urlFilter);
      return re.test(url);
    })
    .tap(async (metadata, ctx) => {
      if (metadata === undefined) return;
      const { entryPath } = ctx;

      ensureArtifactDirectories(entryPath);

      const res = await runFieldExtractor(ctx, metadata, AbstractFieldAttempts);

      if (E.isRight(res)) {
        ctx.log.info('writing extraction records');
        const [, env] = res.right;
        writeExtractionRecords(env);
      } else {
        const [ci, env] = res.left;
        ctx.log.error(`error extracting records: ${ci}`);
        writeExtractionRecords(env);
      }
    });

  return pumpBuilder.toPromise()
    .then(() => undefined);
}

function writeExtractionRecords(env: ExtractionEnv) {
  const { entryPath, fieldRecs } = env;
  const reshaped = _.mapValues(fieldRecs, (value) => {
    return {
      count: value.length,
      instances: value
    };
  });
  const output = {
    fields: reshaped
  };

  const empty = {
    fields: {
      'title': { count: 0 },
      'abstract': { count: 0 },
      'abstract-clipped': { count: 0 },
      'author': { count: 0 },
      'pdf-link': { count: 0 },
      'pdf-path': { count: 0 },
    }
  }

  const finalOutput = _.merge({}, empty, output);

  const extractionRecordFileName = 'extraction-records.json';

  writeCorpusJsonFile(
    entryPath,
    'extracted-fields',
    extractionRecordFileName,
    finalOutput,
    /* overwrite= */true
  );

}
