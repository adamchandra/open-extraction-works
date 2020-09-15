
//
import _ from 'lodash';

import { flow } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import { isLeft } from 'fp-ts/Either'


import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, putStrLn, readCorpusJsonFile, readCorpusTextFile } from 'commons';
import { getBasicConsoleLogger } from '~/utils/basic-logging';
import { bind, bindFA, ExtractionArrow, ExtractionEnv, fanout, filterOn, fromNullish, succeed, withEnv } from './extraction-prelude';
import path from 'path';

export type CacheFileKey = string;

export const urlFilter: (urlTest: RegExp) => ExtractionArrow<void, string, void> =
  (regex) => bind('urlFilter', filterOn(url => regex.test(url)));


export const readTextArtifactFile: (artifactDir: ArtifactSubdir, file: string) => ExtractionArrow<void, void, CacheFileKey> =
  (dir, filename) => bind('readTextArtifactFile', withEnv((env) => {
    const { entryPath, fileContentCache } = env;
    const fileContent = readCorpusTextFile(entryPath, dir, filename);
    const cacheKey = path.join(dir, filename);
    if (fileContent !== undefined) {
      fileContentCache[cacheKey] = fileContent;
      return succeed(cacheKey);
    }
    return fail();
  }));

export const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => ExtractionArrow<void, void, CacheFileKey[]> =
  (dir, regex) => bind('listArtifactFiles', withEnv((env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath, dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys = _.map(matching, f => path.join(dir, f));
    return succeed(keys);
  }));


export const listResponseBodies = listArtifactFiles('.', /response-body|response-frame/);

export const loadMetadata: ExtractionArrow<void, void, Metadata> =
  bind('loadMetadata', withEnv((env) => {
    env.metaProps = env.metaProps ?
      env.metaProps :
      readCorpusJsonFile<Metadata>(env.entryPath, '.', 'metadata.json');
    return fromNullish(env.metaProps);
  }));


export const loadResponseBody: ExtractionArrow<void, void, CacheFileKey> =
  readTextArtifactFile('.', 'response-body')

// export const loadArtifact: ExtractionArrow<void, ExtractionEnv, Metadata> =
// export const runAll: ExtractionArrow<void, ExtractionEnv, Metadata> =
// export const selectMetaContent : ExtractionArrow<void, ExtractionEnv, Metadata> =

export const readRequestUrl: ExtractionArrow<void, Metadata, string> =
  bindFA('readRequestUrl', (metaData) => metaData.responseUrl);

export const echoArrow: ExtractionArrow<void, string, void> =
  bindFA('echoArrow', (s: string) => putStrLn(`echo> ${s}`));

// export const doJquery: (query: string) => ExtractionFunction<void, string, string> =
//   (query) => (s: string, env: ExtractionEnv) => {
//   };
// const PipelineLeadingFunctions = [
//   traceLog({ readMetaProps }),
//   traceLog({ verifyIsHtmlOrXml }),
//   traceLog({ verifyHttpResponseCode }),
//   traceLog({ runLoadResponseBody }),
//   traceLog({ readCachedTidyNorm }),
//   traceLog({ runHtmlTidy }),
//   traceLog({ readCachedCssNorm }),
//   traceLog({ runCssNormalize }),
// ];




export async function exampleExtractionAttempt(entryPath: string) {

  putStrLn(`exampleExtractionAttempt : ${entryPath}`);

  const pipelineFunctions = flow(
    loadMetadata,
    readRequestUrl,
    urlFilter(/http/),
    listResponseBodies,
    fanout(echoArrow)
  );

  const log = getBasicConsoleLogger();
  const mockEnv: ExtractionEnv = {
    log,
    entryPath,
    extractionRecords: [],
    fileContentCache: {}
  };

  const res = await pipelineFunctions(TE.right([undefined, mockEnv]))();

  if (isLeft(res)) {
    const [r, env] = res.left;
    putStrLn('result isLeft')

  } else {
    const [r, env] = res.right;
    putStrLn('result isRight')
  }

  // const metadata = mockMetadata(3);

  // load('meta.json')
  // filter(meta => meta.url ~ /sciencedirect.com.science.article/ )
  //  sel('meta[property=og:description]')    <-- selMetaContentAs(...)
  //    .andThen(elem => attr('content')(elem))
  //    .andThen(text => saveAs('abs-short')(text))



}
