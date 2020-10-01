import _ from 'lodash';

import { flow, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either'

import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, readCorpusJsonFile, readCorpusTextFile, setLogLabel, writeCorpusTextFile } from 'commons';


import {
  ExtractionArrow,
  ExtractionEnv,
  ControlInstruction,
  NormalForm,
  forEachDo,
  applyAll,
  named,
  FilterArrow,
  through,
  filter,
  tap,
  ClientFunc,
  ClientResult,
  attemptSeries,
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

export const listResponseBodies = named('listResponseBodies', listArtifactFiles('.', /response-body|response-frame/));

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


export const listTidiedHtmls: ExtractionArrow<void, CacheFileKey[]> =
  through((_z, env) => {
    const { fileContentCache } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKeys = _.map(
      _.toPairs(fileContentCache), ([k]) => k
    );
    return _.filter(cacheKeys, k => k.endsWith(normType));
  }, 'listTidiedHtmls');

export const runHtmlTidy: ExtractionArrow<string, string> =
  through((artifactPath, env) => {
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

    const maybeTidy: ClientResult<string> = pipe(
      tidyHtmlTask(fullPath),
      TE.map((lines: string[]) => {
        const tidiedContent = lines.join('\n');
        writeCorpusTextFile(entryPath, 'cache', cacheKey, tidiedContent);
        fileContentCache[cacheKey] = tidiedContent;

        return cacheKey;
      }),
      TE.mapLeft((message) => {
        const ci: ControlInstruction = ['halt', message];
        return ci;
      })
    );

    return maybeTidy;
  }, 'runHtmlTidy');

export const verifyFileType: (urlTest: RegExp) => FilterArrow<string> =
  (typeTest: RegExp) => filter((filename, env) => {
    const file = path.resolve(env.entryPath, filename);

    const fileTypeP = runFileCmd(file)
      .then(fileType => {
        env.log.info(`test /${typeTest.source}/ ~= file(${filename}) == ${fileType}`);
        return typeTest.test(fileType)
      });
    return fileTypeP;
  });

export const selectOne: (queryString: string) => ExtractionArrow<CacheFileKey, Elem> =
  (queryString) => ExtractionArrow.lift((cacheKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    if (content === undefined) return ClientFunc.halt(`cache key miss ${cacheKey}`);

    return () => queryOne(content, queryString)
      .then(sel => pipe(sel, E.mapLeft(() => ['halt', `query miss ${queryString}`])));

  });

// TODO prefix(named('matchesText')), suffix(popName), prefix(logEntry)
export const matchesText: (regex: RegExp) => FilterArrow<Elem> =
  (regex) => filter(async (elem: Elem) => {
    const textContent = await elem.evaluate(e => e.textContent);
    if (textContent === null) return false;
    return regex.test(textContent);
  });

export const matchesSelector: (query: string) => FilterArrow<Elem> =
  (query) => filter(async (elem: Elem) => {
    const result = await elem.$$(query);
    return result.length > 0;
  });


export const selectElemAttr: (queryString: string, contentAttr: string) => ExtractionArrow<CacheFileKey, string> =
  (queryString, contentAttr) => through((cacheKey: CacheFileKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    if (content === undefined) return TE.left(['halt', 'cache has no record for key ${cacheKey}']);

    return () => selectElementAttr(content, queryString, contentAttr)
      .then(attr => {
        if (E.isRight(attr)) {
          return attr;
        }
        return E.left('continue');
      });

  });

// log [saveFieldAs/:abstract]
export const saveFieldAs: (fieldName: string) => ExtractionArrow<string, 'okay'> =
  (fieldName) => through((fieldValue: string, env) => {
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
  (fieldName, queryString, contentAttr) => flow(
    selectElemAttr(queryString, contentAttr),
    saveFieldAs(fieldName)
  );

export const urlFilter: (urlTest: RegExp) => FilterArrow<any> =
  (regex) => flow(
    tap((_a, { log }) => log.info('starting URL filter ')),
    filter((_, env) => regex.test(env.metadata.responseUrl), `match:/${regex.source}/`),
    filter((_, env) => env.metadata.status === '200', 'http-status'),
    listResponseBodies,
    tap((a, { log }) => log.info(`(isopress) listResponseBodies: ${a}`)),
    forEachDo(
      flow(
        verifyFileType(/html|xml/i),
        tap((a, { log }) => log.info(`(isopress) runHtmlTidy: ${a}`)),
        runHtmlTidy,
      )
    ),
    tap((_a, { log }) => log.info('ending URL filter')),
  );

export const FieldExtractionPipeline = attemptSeries(
  flow(
    urlFilter(/arxiv.org/),
    listTidiedHtmls,
    forEachDo(
      applyAll(
        tap((a, { log }) => log.info(`(arxiv) processing ${a}`)),
        selectElemAttrAs('title', 'meta[name=citation_title]', 'content'),
        selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
      )
    ),
  ),

  flow(
    urlFilter(/content.iospress.com/),
    tap((a, { log }) => log.info(`(isopress) filtered htmls: ${a}`)),
    listTidiedHtmls,
    forEachDo(
      applyAll(
        tap((a, { log }) => log.info(`(isopress) processing ${a}`)),
        selectElemAttrAs('title', 'meta[name=citation_title]', 'content'),
        selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
      )
    ),
  ),

  // attempt(flow(
  //   urlFilter(/bmva.org/),
  //   listTidiedHtmls,
  //   tap((a, { log }) => log.info(`(bmva) processing ${a}`)),
  //   forEachDo(
  //     attemptAll(

  //       flow(
  //         selectOne('p'),
  //         attempt(
  //           flow(
  //             matchesText(/Abstract/i),
  //             matchesSelector('h2'),
  //           )
  //         ),
  //         through(getTextContent),
  //         saveFieldAs('abstract')
  //       )
  //     )
  //   ),
  // )),
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
    ns: logPrefix,
    entryPath,
    metadata,
    extractionRecords: [],
    fileContentCache: {},
    enterNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    },
    exitNS(ns: string[]) {
      setLogLabel(log, _.join(ns, '/'));
    }
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
