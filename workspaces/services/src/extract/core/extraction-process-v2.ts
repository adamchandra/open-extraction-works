import _ from 'lodash';

import { flow, pipe } from 'fp-ts/function'
import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { isLeft } from 'fp-ts/Either'

import { Metadata } from '~/spidering/data-formats';
import { ArtifactSubdir, expandDir, prettyPrint, putStrLn, readCorpusJsonFile, readCorpusTextFile, writeCorpusTextFile } from 'commons';
import { getBasicConsoleLogger } from '~/utils/basic-logging';
import {
  bind,
  bindFA,
  bindTEva,
  ExtractionArrow,
  ExtractionEnv,
  fanin,
  fanout,
  filterOn,
  firstOf,
  fromNullish,
  NormalForm,
  withEnv,
  success,
  success_,
  failure,
  forEachDo,
  bindArrow,
  attempt,
  attemptAll,
  FilterArrow,
  voidResult,
  bind_,
  through,
} from './extraction-prelude';

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

export const urlFilter: (urlTest: RegExp) => FilterArrow<void> =
  (regex) => flow(
    loadMetadata,
    readRequestUrl,
    bind_(filterOn(url => regex.test(url))),
    voidResult(),
  );


// export const readTextArtifactFile: (artifactDir: ArtifactSubdir, file: string) => ExtractionArrow<void, void, CacheFileKey> =
//   (dir, filename) => bindFA('readTextArtifactFile', (_a, env) => {
//     const { entryPath, fileContentCache } = env;
//     const fileContent = readCorpusTextFile(entryPath, dir, filename);
//     const filePath = path.join(dir, filename);
//     const cacheKey = filePathToCacheKey(filePath);
//     if (fileContent !== undefined) {
//       fileContentCache[cacheKey] = fileContent;
//       return cacheKey;
//     }
//     return undefined;
//   });

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

// export const loadResponseBody: ExtractionArrow<void, void, CacheFileKey> =
//   readTextArtifactFile('.', 'response-body')

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

export const listTidiedHtmls: ExtractionArrow<void, void, CacheFileKey[]> =
  bindFA('listTidiedHtmls', (_z, env) => {
    const { fileContentCache } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKeys = _.map(
      _.toPairs(fileContentCache), ([k]) => k
    );
    return _.filter(cacheKeys, k => k.endsWith(normType));
  });

export const runHtmlTidy: ExtractionArrow<void, string, string> =
  bindTEva('runHtmlTidy', (artifactPath: string, env) => {
    const { fileContentCache, entryPath } = env;
    const normType: NormalForm = 'tidy-norm';
    const cacheKey = `${artifactPath}.${normType}`;
    if (cacheKey in fileContentCache) {
      return success(cacheKey);
    }
    const maybeCachedContent = readCorpusTextFile(entryPath, 'cache', cacheKey);
    if (maybeCachedContent) {
      fileContentCache[cacheKey] = maybeCachedContent;
      return success(cacheKey);
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

// const verifyIsHtmlOrXml = runFileVerification(/(html|xml)/i);
export const verifyFileType: (urlTest: RegExp) => ExtractionArrow<void, string, string> =
  (typeTest: RegExp) => bindTEva('verifyFileType', (filename, env) => {
    const { entryPath } = env;

    const file = path.resolve(entryPath, filename);

    const fileTypeTask: TE.TaskEither<void, string> =
      TE.rightTask(() => runFileCmd(file));

    // fatalFailure(`Unexpected filetype: ${fileType}; wanted ${typeTest.source}`)
    return pipe(
      fileTypeTask,
      TE.chain((fileType: string) => {
        return typeTest.test(fileType) ? success(filename) : failure();
      })
    );
  });

export const verifyHttpResponseCode: ExtractionArrow<void, Metadata, void> =
  bindTEva('verifyHttpResponseCode', (metadata, env) => {
    const { status } = metadata;

    if (!status) {
      const msg = `verifyHttpResponseCode: ${env.entryPath}: no status available`;
      env.log.error(msg);
      return failure();
    }
    if (status === '200') {
      return success_();
    }
    return failure();
  });

export const selectOne: (queryString: string) => ExtractionArrow<void, CacheFileKey, Elem> =
  (queryString) => bindTEva('selectOne', (cacheKey: CacheFileKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    if (content === undefined) return TE.left(undefined);

    return () => queryOne(content, queryString)
      .then(sel => pipe(sel, E.mapLeft(() => undefined)));

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

export const selectElemAttr: (queryString: string, contentAttr: string) => ExtractionArrow<void, CacheFileKey, string> =
  (queryString, contentAttr) => bindTEva('selectElemAttr', (cacheKey: CacheFileKey, env) => {
    const { fileContentCache } = env;
    const content = fileContentCache[cacheKey];
    if (content === undefined) return TE.left(undefined);

    return () => selectElementAttr(content, queryString, contentAttr)
      .then(attr => {
        if (E.isRight(attr)) {
          return E.right(attr.right);
        }
        return E.left(undefined);
      });

  });

export const saveFieldAs: (fieldName: string) => ExtractionArrow<void, string, 'okay'> =
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
    putStrLn(`${fieldName}: ${fieldValue}`);
    return 'okay';
  });


export const selectElemAttrAs: (fieldName: string, queryString: string, contentAttr: string) => ExtractionArrow<void, CacheFileKey, string> =
  (fieldName, queryString, contentAttr) => bindArrow(
    'selectElemAttrAs',
    flow(
      selectElemAttr(queryString, contentAttr),
      saveFieldAs(fieldName)
    ));

export const gatherArray: <A>() => ExtractionArrow<void, A[], void> =
  () => bindFA('gatherArray', () => undefined);


export const filterResponses = flow(
  loadMetadata,
  verifyHttpResponseCode,
  listResponseBodies,
  fanout(
    flow(
      verifyFileType(/html|xml/i),
      runHtmlTidy,
    )
  ),
  fanin(gatherArray())
);

export const FieldExtractionPipeline = flow(
  filterResponses,
  firstOf(
    flow(
      urlFilter(/content.iospress.com/),
      listTidiedHtmls,
      forEachDo(
        attemptAll(
          selectElemAttrAs('title', 'meta[name=citation_title]', 'content'),
          selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
          selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
          selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
        )
      ),
      fanin(gatherArray())
    ),
    flow(
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
      fanin(gatherArray())
    ),





    flow(
      urlFilter(/content.isopress.com/),
      listTidiedHtmls,
      forEachDo(
        attemptAll(
          selectElemAttrAs('title', 'meta[name=citation_title]', 'content'),
          selectElemAttrAs('author', 'meta[name=citation_author]', 'content'),
          selectElemAttrAs('pdf-link', 'meta[name=citation_pdf_url]', 'content'),
          selectElemAttrAs('abstract', 'h1[data-abstract]', 'data-abstract'),
        )
      ),
      fanin(gatherArray())
    ),

    // attempt(
    //   loadMetadata,
    //   readRequestUrl,
    //   urlFilter(/http/),
    //   listResponseBodies,
    //   fanout(
    //     flow(
    //       runHtmlTidy,
    //       selectElemAttr('meta[name=citation_title]', 'content'),
    //       saveFieldAs('title')
    //     )
    //   ),
    //   fanin(gatherArray())
    // ),
  )
);

export async function runFieldExtractorsOnFile(
  entryPath: string
): Promise<void> {
  const extractionPipeline = FieldExtractionPipeline;

  const log = getBasicConsoleLogger();

  log.debug(`runFieldFindersOnFile ${entryPath} `);

  const env: ExtractionEnv = {
    log,
    entryPath,
    extractionRecords: [],
    fileContentCache: {}
  };
  const res = await extractionPipeline(TE.right([undefined, env]))();

  if (isLeft(res)) {
    const [r, env] = res.left;
    putStrLn('result isLeft')

  } else {
    const [r, env] = res.right;
    putStrLn('result isRight')
  }

}
