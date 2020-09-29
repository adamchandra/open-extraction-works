import _ from 'lodash';

import { flow, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either'

import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, putStrLn, readCorpusJsonFile, readCorpusTextFile, setLogLabel, writeCorpusTextFile } from 'commons';


import {
  bind,
  // bindFA,
  // bindTEva,
  ExtractionArrow,
  ExtractionEnv,
  // fanout,
  // filterOn,
  NormalForm,
  // success,
  // forEachDo,
  // bindArrow,
  // attempt,
  // attemptAll,
  FilterArrow,
  through,
  filter,
  tap,
  ClientFunc,
  // attemptSeries,
} from './extraction-prelude';

import * as ep from './extraction-prelude';
import { ExtractedField } from './extraction-records';

import path from 'path';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';
import { Elem, getTextContent, queryOne, selectElementAttr } from './html-queries';
import { runFileCmd } from '~/utils/run-cmd-file';

export type CacheFileKey = string;

export function filePathToCacheKey(filePath: string): CacheFileKey {
  return filePath;
}

export function cacheKeyToPath(k: CacheFileKey): string {
  return k;
}

export const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => ExtractionArrow<unknown, CacheFileKey[]> =
  (dir, regex) => through((_a, env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath, dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys: CacheFileKey[] = _.map(matching, f => path.join(dir, f));
    return keys;
  });

export const listResponseBodies = listArtifactFiles('.', /response-body|response-frame/);

export const echoArrow: ExtractionArrow<string, void> =
  ep.ExtractionArrow.lift((s: string) => putStrLn(`echo> ${s}`))


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


// TODO named(...)
export const listTidiedHtmls: ExtractionArrow<void, CacheFileKey[]> =
  ep.ExtractionArrow.lift((_z, env) => {
      const { fileContentCache } = env;
      const normType: NormalForm = 'tidy-norm';
      const cacheKeys = _.map(
        _.toPairs(fileContentCache), ([k]) => k
      );
      return _.filter(cacheKeys, k => k.endsWith(normType));
    });

export const runHtmlTidy: ExtractionArrow<string, string> =
  ExtractionArrow.liftClientEither((artifactPath, env) => {
    const { fileContentCache, entryPath } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKey = `${artifactPath}.${normType}`;
    if (cacheKey in fileContentCache) {
      return ClientFunc.success(cacheKey);
    }
    const maybeCachedContent = readCorpusTextFile(entryPath, 'cache', cacheKey);
    if (maybeCachedContent) {
      fileContentCache[cacheKey] = maybeCachedContent;
      return ClientFunc.success(cacheKey);
    }
    const fullPath = path.resolve(entryPath, artifactPath);
    const sdf = pipe(
      tidyHtmlTask(fullPath),
      TE.map((lines: string[]) => {
        const tidiedContent = lines.join('\n');
        writeCorpusTextFile(entryPath, 'cache', cacheKey, tidiedContent);
        fileContentCache[cacheKey] = tidiedContent;

        return cacheKey;
      }),
      TE.mapLeft((message) => ClientFunc.halt( message))
    );
  });

export const verifyFileType: (urlTest: RegExp) => FilterArrow<string> =
  (typeTest: RegExp) => filter(async (filename, env) => {
    const file = path.resolve(env.entryPath, filename);
    env.log.info(`verifyFileType: ${filename}`);

    return runFileCmd(file)
      .then(fileType => typeTest.test(fileType));
  });

export const selectOne: (queryString: string) => ExtractionArrow<CacheFileKey, Elem> =
  (queryString) => ExtractionArrow.liftClientEither((cacheKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    if (content === undefined) return ClientFunc.halt(`cache key miss ${cacheKey}`);

    return () => queryOne(content, queryString)
      .then(sel => pipe(sel, E.mapLeft(() => ['halt', `query miss ${queryString}`])));

  });

export const matchesText: (regex: RegExp) => FilterArrow<Elem> =
  (regex) => bind('matchesText', filterOn(async (elem: Elem) => {
    const textContent = await elem.evaluate(e => e.textContent);
    if (textContent === null) return false;
    return regex.test(textContent);
  }));

export const matchesSelector: (query: string) => FilterArrow<Elem> =
  (query) => bind('matchesSelector', filterOn(async (elem: Elem) => {
    const result = await elem.$$(query);
    return result.length > 0;
  }));


export const selectElemAttr: (queryString: string, contentAttr: string) => ExtractionArrow<CacheFileKey, string> =
  (queryString, contentAttr) => bindTEva('selectElemAttr', (cacheKey: CacheFileKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    // if (content === undefined) return TE.left(undefined);
    if (content === undefined) return TE.left(['halt', 'cache has no record for key ${cacheKey}']);

    return () => selectElementAttr(content, queryString, contentAttr)
      .then(attr => {
        if (E.isRight(attr)) {
          return E.right(attr.right);
        }
        return E.left('continue');
      });

  });

// log [saveFieldAs/:abstract]
export const saveFieldAs: (fieldName: string) => ExtractionArrow<string, 'okay'> =
  (fieldName) => bindFA('saveFieldAs', (fieldValue: string, env) => {
    const { extractionRecords } = env;
    const extractedField: ExtractedField = {
      kind: 'field',
      field: {
        name: fieldName,
        evidence: [],
        value: fieldValue
      }
    };
    extractionRecords.push(extractedField);
    env.log.info(`${fieldName}: ${fieldValue}`);
    return 'okay';
  });


export const selectElemAttrAs: (fieldName: string, queryString: string, contentAttr: string) => ExtractionArrow<CacheFileKey, string> =
  (fieldName, queryString, contentAttr) => bindArrow(
    'selectElemAttrAs',
    flow(
      selectElemAttr(queryString, contentAttr),
      saveFieldAs(fieldName)
    ));

export const urlFilter: (urlTest: RegExp) => FilterArrow<any> =
  (regex) => flow(
    bindArrow('urlFilter', flow(
      through((_0, env) => env.metadata.responseUrl),
      filter(url => regex.test(url)),
      tap((a, env) => env.log.info(`matched URL ${a} to /${regex.source}/`)),
    )),
    flow(
      filter((_0, env) => env.metadata.status === '200'),
      listResponseBodies,
      fanout(
        flow(
          verifyFileType(/html|xml/i),
          runHtmlTidy,
        )
      ),
    )
  )


export const FieldExtractionPipeline = attemptSeries(
  flow(
    urlFilter(/arxiv.org/),
    listTidiedHtmls,
    forEachDo(
      flow(
        // attempt(selectElemAttrAs('title', 'meta[name=citation_title]', 'content')),
        // attempt(selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
        attempt(selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content')),
        attempt(selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract')),
      )
    ),
  ),

  flow(
    urlFilter(/content.iospress.com/),
    listTidiedHtmls,
    forEachDo(
      flow(
        // attempt(selectElemAttrAs('title', 'meta[name=citation_title]', 'content')),
        // attempt(selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
        attempt(selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content')),
        attempt(selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract')),
      )
    ),
  ),

  attempt(flow(
    urlFilter(/bmva.org/),
    listTidiedHtmls,
    forEachDo(
      attemptAll(
        flow(
          selectOne('p'),
          attempt(
            flow(
              matchesText(/Abstract/i),
              matchesSelector('h2'),
            )
          ),
          through(getTextContent),
          saveFieldAs('abstract')
        )
      )
    ),
  )),
);

// async (entryPath: string, ctx: ExtractionAppContext): Promise<void> => {

import { Logger } from 'winston';

export interface ExtractContext {
  log: Logger;
}

export async function runFieldExtractors(
  entryPath: string,
  ctx: ExtractContext,
): Promise<void> {
  const extractionPipeline = FieldExtractionPipeline;
  const { log } = ctx;

  const pathPrefix = path.basename(entryPath).slice(0, 6);
  const logPrefix = [pathPrefix];

  setLogLabel(log, _.join(logPrefix, '/'));
  log.info('starting field extractors');

  const metadata = readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json');

  if (metadata === undefined) {
    log.warn('no metadata.json file found, skipping...');
    return;
  }

  const env: ExtractionEnv = {
    log,
    logPrefix,
    entryPath,
    metadata,
    extractionRecords: [],
    fileContentCache: {}
  };
  const res = await extractionPipeline(TE.right([metadata, env]))();

  if (isLeft(res)) {
    // const [r, env] = res.left;
    log.info('result isLeft')

  } else {
    // const [r, env] = res.right;
    log.info('result isRight')
  }

  log.info('finished extractors');
}
