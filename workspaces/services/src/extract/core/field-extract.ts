import _ from "lodash";
import path from "path";

import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';

import fs from "fs-extra";
import { runFileCmd } from '~/utils/run-cmd-file';
import { makeCssTreeNormalForm } from './html-to-css-normal';
import { runTidyCmdBuffered } from '~/utils/run-cmd-tidy-html';
import { ExtractionEnv, ExtractionFunction, NormalForm, extractionSuccess, fatalFailure, nonFatalFailure } from './extraction-process';
import { readCorpusTextFileAsync, resolveCorpusFile, writeCorpusTextFile, readCorpusTextFile } from 'commons';
import { readMetadata } from '../logging/logging';


// export const initialEnv: ExtractionEnv = {
//   entryPath: 'empty',
//   metaProps: {
//     url: 'empty',
//     responseUrl: 'empty',
//     status: 0
//   },
//   responseMimeType: '',
//   fileContentMap: {},
//   evidence: [],
//   extractionRecord: { kind: "fields", fields: {} },
//   verbose: false
// };

export const filterUrl: (urlTest: RegExp) => ExtractionFunction =
  (urlTest: RegExp) => (env: ExtractionEnv) => {
    const responseUrl =  env.metaProps?.responseUrl;
    if (!responseUrl) {
      const msg = `${env.entryPath}: no metaProps available`;
      env.log.error(msg);
      return TE.left(msg);
    }
    if (urlTest.test(responseUrl)) {
      env.evidence.push(`url~=/${urlTest.source}/`)
      return TE.right(env);
    }
    return TE.left(`url [${responseUrl}] failed test /${urlTest.source}/`)
  };

export const verifyHttpResponseCode: ExtractionFunction =
  (env: ExtractionEnv) => {
    const status =  env.metaProps?.status;

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
    const { entryPath } = env;

    env.log.debug('runFileVerification');
    const file = path.resolve(entryPath, 'response-body');

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
    const { fileContentMap, entryPath } = env;

    env.log.debug('runLoadResponseBody');
    const normType = 'response-body';

    if (normType in fileContentMap) {
      return TE.right(env);
    }

    const fileContent = readCorpusTextFile(entryPath, '.', 'response-body')
    if (!fileContent) {
      return TE.left(`Could not read file response-body`);
    }
    fileContentMap[normType] = {
      content: fileContent,
      lines: []
    };
    return TE.right(env);
  }

export const runCssNormalize: ExtractionFunction =
  (env: ExtractionEnv) => {
    const { fileContentMap, entryPath, responseMimeType } = env;
    const normType = 'css-normal';

    if (!responseMimeType) {
      const msg = `${env.entryPath}: no responseMimeType available`;
      env.log.error(msg);
      return TE.left(msg);
    }

    if (normType in fileContentMap) {
      return TE.right(env);
    }
    const htmlTidied = fileContentMap['html-tidy'];
    if (!htmlTidied) {
      return TE.left(`runCssNormalize: no html-tidy output; run after html-tidy;`);
    }

    const { content } = htmlTidied;

    const useXmlProcessing = /xml/i.test(responseMimeType);
    const cssNormalFormLines = makeCssTreeNormalForm(content, /* useXmlMode= */ useXmlProcessing)
    const cssNormalForm = cssNormalFormLines.join("\n");

    writeCachedNormalFile(entryPath, normType, cssNormalForm);

    fileContentMap['css-normal'] = {
      lines: cssNormalFormLines,
      content: cssNormalForm
    };
    return TE.right(env);
  };

export function resolveCachedNormalFile(entryPath: string, cacheKey: NormalForm): string {
  return resolveCorpusFile(entryPath, 'cache', `${cacheKey}.norm`);
}

function writeCachedNormalFile(entryPath: string, cacheKey: NormalForm, content: string) {
  writeCorpusTextFile(entryPath, 'cache', `${cacheKey}.norm`, content);
}

export const readCachedNormalFile: (cacheKey: NormalForm) => ExtractionFunction =
  (cacheKey: NormalForm) => (env: ExtractionEnv) => {
    const { fileContentMap, entryPath } = env;
    env.log.debug('readCachedNormalFile', cacheKey);

    const maybeContent = () =>
      readCorpusTextFileAsync(entryPath, 'cache', `${cacheKey}.norm`)
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
    const { fileContentMap, entryPath } = env;
    const normType = 'html-tidy';

    if (normType in fileContentMap) {
      return TE.right(env);
    }

    const file = path.resolve(entryPath, 'response-body');

    const tidyOutput = runTidyCmdBuffered('./conf/tidy.cfg', file)
      .then(([stderr, stdout, exitCode]) => {
        if (exitCode > 0) {
          const tidiedContent = stdout.join('\n');
          writeCachedNormalFile(entryPath, normType, tidiedContent);
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
          content: tidiedFile.join("\n")
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


// TODO trace logging for pipeline functions
// export const traceEntryExit: (ef: ExtractionFunction) => ExtractionFunction =
//   (ef: ExtractionFunction) => (env: ExtractionEnv) => {
//     const { log } = env;
//     pipe(
//       env,
//       ef,
//       TE.mapLeft(xx => {
//         log.debug(jkl);
//       })
//       // TE.chain(r => {}));
//     // const result = ef(env);
//     // const status = TE.isLeft(result)? 'error' : 'ok';
//     // log.debug('')
//     return result;
//   };
