import _ from 'lodash';

import { flow, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either'


import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, putStrLn, readCorpusJsonFile, readCorpusTextFile, writeCorpusTextFile } from 'commons';
import { getBasicConsoleLogger } from '~/utils/basic-logging';
import { bind, bindFA, bindTEva, ExtractionArrow, ExtractionEnv, fanout, filterOn, fromNullish, NormalForm, succeed, withEnv } from './extraction-prelude';
import path from 'path';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';

export type CacheFileKey = string;

export function filePathToCacheKey(filePath: string): CacheFileKey {
  return filePath;
}
export function cacheKeyToPath(k: CacheFileKey): string {
  return k;
}

export const urlFilter: (urlTest: RegExp) => ExtractionArrow<void, string, void> =
  (regex) => bind('urlFilter', filterOn(url => regex.test(url)));


export const readTextArtifactFile: (artifactDir: ArtifactSubdir, file: string) => ExtractionArrow<void, void, CacheFileKey> =
  (dir, filename) => bindFA('readTextArtifactFile', (_a, env) => {
    const { entryPath, fileContentCache } = env;
    const fileContent = readCorpusTextFile(entryPath, dir, filename);
    const filePath = path.join(dir, filename);
    const cacheKey = filePathToCacheKey(filePath);
    if (fileContent !== undefined) {
      fileContentCache[cacheKey] = fileContent;
      return cacheKey;
    }
    return undefined;
  });

export const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => ExtractionArrow<void, void, CacheFileKey[]> =
  (dir, regex) => bindFA('listArtifactFiles', (_a, env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath, dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys: CacheFileKey[] = _.map(matching, f => path.join(dir, f));
    return keys;
  });


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

export const tidyHtmlTask: (filename: string) => TE.TaskEither<string, string[]> =
  (filepath: string) => {
    const tidyOutputTask = () => runTidyCmdBuffered('./conf/tidy.cfg', filepath)
      .then(([stderr, stdout, _exitCode]) => {
        // Tidy  exit codes = 0: ok, 1: warnings, 2: errors
        const hasStdout = _.some(stdout, line => line.trim().length > 0);
        if (hasStdout) {
          return E.right<string, string[]>(stdout);
        }
        const errString = _.filter(stderr, l => l.trim().length > 0)[0];
        return E.left<string, string[]>(errString);
      });
    return tidyOutputTask;
  };

export const runHtmlTidy: ExtractionArrow<void, string, string> =
  bindTEva('runHtmlTidy', (artifactPath: string, env) => {
    const { fileContentCache, entryPath } = env;
    const normType: NormalForm = 'tidy-norm' ;
    const cacheKey = `${artifactPath}.${normType}`;
    if (cacheKey in fileContentCache) {
      return succeed(cacheKey);
    }
    const maybeCachedContent = readCorpusTextFile(entryPath, 'cache', cacheKey);
    if (maybeCachedContent) {
      fileContentCache[cacheKey] = maybeCachedContent;
      return succeed(cacheKey);
    }
    const fullPath = path.resolve(entryPath, artifactPath);
    return pipe(
      tidyHtmlTask(fullPath),
      TE.map((lines: string[]) => {
        const tidiedContent = lines.join('\n');
        writeCorpusTextFile(entryPath, 'cache', cacheKey, tidiedContent);
        fileContentCache[cacheKey] = tidiedContent;

        return cacheKey;
      }),
      TE.mapLeft(() => undefined)
    );
  });


import cheerio from 'cheerio';
export const queryTagGetAttr: (queryString: string, contentAttr: string) => ExtractionArrow<void, CacheFileKey, string> =
  (queryString, contentAttr) => bindFA('queryTagGetAttr', (cacheKey: CacheFileKey, env) => {
    const { fileContentCache } = env;
    putStrLn('queryTag> start');
    const content = fileContentCache[cacheKey];
    if (content === undefined) return;


    const $ = cheerio.load(content, {
      _useHtmlParser2: true,
      recognizeSelfClosing: true,
      normalizeWhitespace: false,
      xmlMode: true,
      decodeEntities: false
    });
    const queryRes = $(queryString);
    const tagContent = queryRes.attr(contentAttr);

    return tagContent;
  });

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
    fanout(
      flow(
        runHtmlTidy,
        queryTagGetAttr('meta[name=citation_title]', 'content')
      )
    )
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
