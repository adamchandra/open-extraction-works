import _ from 'lodash';
import path from 'path';

import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

import fs from 'fs-extra';
import { runFileCmd } from '~/utils/run-cmd-file';
import { makeCssTreeNormalForm } from './html-to-css-normal';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';
import { ExtractionEnv, ExtractionFunction, NormalForm, extractionSuccess, fatalFailure, nonFatalFailure } from './extraction-process';
import { readCorpusTextFileAsync, resolveCorpusFile, writeCorpusTextFile, readCorpusTextFile  } from 'commons';
import { readMetadata } from '../logging/logging';
import { addFieldInstance, Field } from './extraction-records';

export const filterUrl: (urlTest: RegExp) => ExtractionFunction =
  (urlTest: RegExp) => (env: ExtractionEnv) => {
    const responseUrl = env.metaProps?.responseUrl;
    if (!responseUrl) {
      const msg = `${env.entryPath}: no metaProps available`;
      env.log.error(msg);
      return TE.left(msg);
    }
    if (urlTest.test(responseUrl)) {
      env.evidence.push(`url~=/${urlTest.source}/`)
      env.evidence.push('score:+1');
      return TE.right(env);
    }
    return TE.left(`url [${responseUrl}] failed test /${urlTest.source}/`)
  };

export const verifyHttpResponseCode: ExtractionFunction =
  (env: ExtractionEnv) => {
    const status = env.metaProps?.status;

    if (!status) {
      const msg = `verifyHttpResponseCode: ${env.entryPath}: no status available`;
      env.log.error(msg);
      return TE.left(msg);
    }


    if (status === '200') {
      return extractionSuccess(env);
    }
    return fatalFailure(`response code: ${status}`)
  };


export const verifyFileExists: (filename: string) => ExtractionFunction =
  (filename: string) => (env: ExtractionEnv) => {
    const { entryPath } = env;
    const file = path.resolve(entryPath, filename);
    const fileExists = fs.existsSync(file);
    return fileExists ? extractionSuccess(env) : nonFatalFailure(`file doesn't exist: ${filename}`);
  };

export const verifyFileNotExists: (filename: string) => ExtractionFunction =
  (filename: string) => (env: ExtractionEnv) => {
    return pipe(
      verifyFileExists(filename)(env),
      TE.swap,
      TE.map(() => env),
      TE.mapLeft(() => `file exists: ${filename}`),
    );
  };

export const runFileVerification: (urlTest: RegExp) => ExtractionFunction =
  (typeTest: RegExp) => (env: ExtractionEnv) => {
    const { entryPath, inputFile } = env;

    const file = path.resolve(entryPath, inputFile);

    const fileTypeTask: TE.TaskEither<string, string> =
      TE.rightTask(() => runFileCmd(file));

    return pipe(
      fileTypeTask,
      TE.chain((fileType: string) => {
        env.responseMimeType = fileType;
        return typeTest.test(fileType) ?
          TE.right(env) :
          fatalFailure(`Unexpected filetype: ${fileType}; wanted ${typeTest.source}`)
      })
    );
  };


export const runLoadResponseBody: ExtractionFunction =
  (env: ExtractionEnv) => {
    const { fileContentMap, entryPath, inputFile } = env;

    const normType = 'original';

    if (normType in fileContentMap) {
      return TE.right(env);
    }

    const fileContent = readCorpusTextFile(entryPath, '.', inputFile)
    if (!fileContent) {
      return TE.left(`Could not read file ${inputFile}`);
    }
    fileContentMap[normType] = {
      content: fileContent,
      lines: []
    };
    return TE.right(env);
  }

export const runCssNormalize: ExtractionFunction =
  (env: ExtractionEnv) => {
    const { fileContentMap, entryPath, inputFile, responseMimeType } = env;
    const normType = 'css-norm';

    if (!responseMimeType) {
      const msg = `${env.entryPath}: no responseMimeType available`;
      env.log.error(msg);
      return TE.left(msg);
    }

    if (normType in fileContentMap) {
      return TE.right(env);
    }
    const htmlTidied = fileContentMap['tidy-norm'];
    if (!htmlTidied) {
      return TE.left('runCssNormalize: no html-tidy output; run after html-tidy;');
    }

    const { content } = htmlTidied;

    const useXmlProcessing = /xml/i.test(responseMimeType);
    const cssNormalFormLines = makeCssTreeNormalForm(content, /* useXmlMode= */ useXmlProcessing)
    const cssNormalForm = cssNormalFormLines.join('\n');

    writeCachedNormalFile(entryPath, inputFile, normType, cssNormalForm);

    fileContentMap['css-norm'] = {
      lines: cssNormalFormLines,
      content: cssNormalForm
    };
    return TE.right(env);
  };

export function resolveCachedNormalFile(entryPath: string, inputFile: string, cacheKey: NormalForm): string {
  return resolveCorpusFile(entryPath, 'cache', `${inputFile}.${cacheKey}`);
}

function writeCachedNormalFile(entryPath: string, inputFile: string, cacheKey: NormalForm, content: string) {
  writeCorpusTextFile(entryPath, 'cache', `${inputFile}.${cacheKey}`, content);
}

export const readCachedNormalFile: (cacheKey: NormalForm) => ExtractionFunction =
  (cacheKey: NormalForm) => (env: ExtractionEnv) => {
    const { fileContentMap, entryPath, inputFile } = env;

    const maybeContent = () =>
      readCorpusTextFileAsync(entryPath, 'cache', `${inputFile}.${cacheKey}`)
        .then((content) => content ? E.right(content) : E.left(`cache miss ${cacheKey}`));

    return pipe(
      maybeContent,
      TE.chain(fileContent => {
        const lines = fileContent.split('\n');
        fileContentMap[cacheKey] = {
          content: fileContent,
          lines
        };
        return extractionSuccess(env);
      }),
      TE.alt(() => extractionSuccess(env))
    );
  };


export const runHtmlTidy: ExtractionFunction =
  (env: ExtractionEnv) => {
    const { fileContentMap, entryPath, inputFile } = env;
    const normType = 'tidy-norm';

    if (normType in fileContentMap) {
      return TE.right(env);
    }

    const file = path.resolve(entryPath, 'response-body');

    const tidyOutput = runTidyCmdBuffered('./conf/tidy.cfg', file)
      .then(([stderr, stdout, exitCode]) => {
        // Tidy  exit codes = 0: ok, 1: warnings, 2: errors
        // prettyPrint({ msg: 'runHtmlTidy', file, exitCode, stderr })
        const hasStdout = _.some(stdout, line => line.trim().length > 0);
        // if (exitCode > 0) {
        if (hasStdout) {
          const tidiedContent = stdout.join('\n');
          writeCachedNormalFile(entryPath, inputFile, normType, tidiedContent);
          return E.right<string, string[]>(stdout);
        }
        const errString = _.filter(stderr, l => l.trim().length > 0)[0];
        return E.left<string, string[]>(errString);
      });

    const tidyOutputTask: TE.TaskEither<string, string[]> = () => tidyOutput;

    return pipe(
      tidyOutputTask,
      TE.chain((tidiedFile: string[]) => {
        fileContentMap[normType] = {
          lines: tidiedFile,
          content: tidiedFile.join('\n')
        };
        return extractionSuccess(env);
      })
    );

  };

export const readMetaProps: ExtractionFunction =
  (env: ExtractionEnv) => {
    const { log, entryPath } = env;
    const file = path.resolve(entryPath, 'metadata.json');
    const metaProps = readMetadata(file)
    if (!metaProps) {
      const msg = `metadata.json file not found in ${entryPath}`;
      log.debug(msg);
      return TE.left(msg);
    }
    env.metaProps = metaProps;
    return TE.right(env);
  };


export const traceLog: (lef: Record<string, ExtractionFunction>) => ExtractionFunction =
  (lef: Record<string, ExtractionFunction>) => (env: ExtractionEnv) => {
    const { log, entryPath, inputFile } = env;
    const fns = _.toPairs(lef);
    if (fns.length !== 1) {
      throw new Error('traceLog function must be called with a single extraction function');
    }
    const [fname, fn] = fns[0];
    const result = fn(env);
    return pipe(
      result,
      TE.mapLeft(err => {
        log.debug(`${fname} [error]> ${err} at ${entryPath}/${inputFile}`);
        return err;
      }),
      TE.map(succ => {
        log.debug(`${fname} [ok]> ${entryPath}/${inputFile} `);
        return succ;
      })
    );
  };

export const findInGlobalDocumentMetadata: ExtractionFunction =
  env => {
    const { fileContentMap } = env;
    const fileContent = fileContentMap['tidy-norm'];
    if (!fileContent) {
      return TE.left('findInMetaTE');
    }
    const fileContentLines = fileContent.lines;

    const metadataLine = _.filter(
      fileContentLines,
      metadataLine => /global.document.metadata/.test(metadataLine)
    )[0];

    if (!metadataLine) {
      return TE.left('findInGlobalDocumentMetadata: metadata line not found');
    }

    const jsonStart = metadataLine.indexOf('{');
    const jsonEnd = metadataLine.lastIndexOf('}');
    const lineJson = metadataLine.slice(jsonStart, jsonEnd + 1);
    try {
      const field: Field = {
        name: 'abstract',
        evidence: ['use-input:html-tidy', 'global.document.metadata:[\'abstract\']'],
      };
      const metadataObj = JSON.parse(lineJson);
      const abst = metadataObj['abstract'];
      field.value = abst;
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    } catch (e) {
      return TE.left(e.toString());
    }
  };
