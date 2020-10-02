import _ from 'lodash';

import { flow, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either'

import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, prettyPrint, readCorpusJsonFile, readCorpusTextFile, setLogLabel, writeCorpusJsonFile, writeCorpusTextFile } from 'commons';
import { Logger } from 'winston';

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
  tapLeft,
  ClientFunc,
  ClientResult,
  attemptSeries,
} from './extraction-prelude';

import { ExtractionEvidence, Field } from './extraction-records';

import path from 'path';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';
import { Elem, getTextContent, queryOne, selectElementAttr } from './html-queries';
import { runFileCmd } from '~/utils/run-cmd-file';
import { logInfo } from './function-types';

export type CacheFileKey = string;

export function filePathToCacheKey(filePath: string): CacheFileKey {
  return filePath;
}

export function cacheKeyToPath(k: CacheFileKey): string {
  return k;
}

function addEvidence(env: ExtractionEnv, evidence: string, weight: number) {
  const e: ExtractionEvidence = {
    kind: 'evidence',
    evidence,
    weight
  };

  env.evidence.push(e)
}

function removeEvidence(env: ExtractionEnv, regex: RegExp) {
  const filtered = _.filter(env.evidence, (er) => !regex.test(er.evidence));
  // prettyPrint({ msg: 'removeEvidence', starting: env.evidence, filtered });
  env.evidence.splice(0, env.evidence.length, ...filtered);
}


function getCurrentEvidenceStrings(env: ExtractionEnv): string[] {
  return _.map(env.evidence, ef => {
    const { evidence, weight } = ef;
    return `${evidence}::weight=${weight}`;
  })
}

function saveFieldRecs(env: ExtractionEnv): void {
  const grouped = _.groupBy(env.fields, (f) => f.name);

  _.each(
    _.toPairs(grouped),
    ([name, fields]) => {
      _.update(
        env.fieldRecs, name,
        (fieldRecs: Field[]) => {
          if (fieldRecs === undefined) {
            return [...fields];
          }
          return _.concat(fieldRecs, fields);
        }
      );
    }
  );
  env.fields.splice(0, env.fields.length);
}

export const listArtifactFiles: (artifactDir: ArtifactSubdir, regex: RegExp) => ExtractionArrow<unknown, CacheFileKey[]> =
  (dir, regex) => through((_a, env) => {
    const { entryPath } = env;
    const artifactRoot = path.join(entryPath, dir);
    const exDir = expandDir(artifactRoot);
    const matching = _.filter(exDir.files, f => regex.test(f));
    const keys: CacheFileKey[] = _.map(matching, f => path.join(dir, f));
    return keys;
  }, 'listArtifacts');

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


export const listTidiedHtmls: ExtractionArrow<unknown, CacheFileKey[]> =
  through((_z, env) => {
    const { fileContentCache } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKeys = _.map(
      _.toPairs(fileContentCache), ([k]) => k
    );
    return _.filter(cacheKeys, k => k.endsWith(normType));
  });


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

    const test = runFileCmd(file).then(a => typeTest.test(a));
    return test;
  }, `/${typeTest.source}/`);

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


export const saveFieldAs: (fieldName: string) => ExtractionArrow<string, void> =
  (fieldName) => through((fieldValue: string, env) => {
    const field: Field = {
      name: fieldName,
      evidence: getCurrentEvidenceStrings(env),
      value: fieldValue
    };
    env.fields.push(field);
  }, `saveField:${fieldName}`);


export const selectElemAttrAs: (fieldName: string, queryString: string, contentAttr: string) => ExtractionArrow<CacheFileKey, void> =
  (fieldName, queryString, contentAttr) => flow(
    tap((_a, env) => addEvidence(env, `select:$(${queryString}).attr(${contentAttr})`, 1)),
    selectElemAttr(queryString, contentAttr),
    saveFieldAs(fieldName),
    tap((_a, env) => removeEvidence(env, /^select:/)),
    tapLeft((_a, env) => removeEvidence(env, /^select:/)),
  );

export const urlFilter: (urlTest: RegExp) => ExtractionArrow<unknown, string[]> =
  (regex) => flow(
    through((_a, env) => env.metadata.responseUrl),
    filter((a) => regex.test(a), `/${regex.source}/`),
    through((_a, env) => env.metadata.status),
    filter((a) => a === '200', 'status=200'),
    listResponseBodies,
    forEachDo(
      flow(
        verifyFileType(/html|xml/i),
        runHtmlTidy,
      )
    ),
  );

export const forEachResponseBody: (arrow: ExtractionArrow<string, unknown>) => ExtractionArrow<any, any> =
  (arrow) => flow(
    listTidiedHtmls,
    forEachDo(
      flow(
        logInfo(a => a),
        tap((a, env) => addEvidence(env, `input:${a}`, 1)),
        arrow,
        tap((_a, env) => saveFieldRecs(env), 'collect-fields'),
        tap((_a, env) => removeEvidence(env, /^input:/)),
        tapLeft((_a, env) => removeEvidence(env, /^input:/)),
      )
    )
  );

export const FieldExtractionPipeline = attemptSeries(
  flow(
    urlFilter(/arxiv.org/),
    // maybe select particular response body/frame, rather that processing all of them
    // through((responseBodies) => _.filter(responseBodies, rb => rb === 'response-frame-0') )
    forEachResponseBody(
      applyAll(
        selectElemAttrAs('title', 'meta[name=citation_title]', 'content'),
        selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
        selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
        selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
      )
    ),
    // group the fields together, with evidence
  ),

  flow(
    urlFilter(/content.iospress.com/),
    forEachResponseBody(
      applyAll(
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
    fields: [],
    fieldRecs: {},
    evidence: [],
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
    const [controlInstruction, env] = res.left;
    const { fields, evidence } = env;
    log.warn('result isLeft')
    prettyPrint({ msg: 'isLeft', controlInstruction, fields, evidence });

  } else {
    const [, env] = res.right;
    const { fields, evidence, fieldRecs } = env;
    prettyPrint({ msg: 'isRight', fields, evidence, fieldRecs });

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

  log.info('finished extractors');
}
