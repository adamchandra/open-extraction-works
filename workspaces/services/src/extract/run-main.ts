import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
  readCorpusJsonFile,
  writeCorpusJsonFile,
  hasCorpusFile,
  setLogLabel,
  expandDir,
  putStrLn,
  AlphaRecord,
  prettyPrint,
} from 'commons';

import parseUrl from 'url-parse';

import path from 'path';
import { Logger } from 'winston';

import {
  Arrow,
  PerhapsW,
  ExtractionEnv
} from './app/extraction-prelude';


import fs from 'fs-extra';
import { ExtractContext, initExtractionEnv } from './app/extraction-process';
import { Metadata } from '~/spidering/data-formats';

import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { radix } from 'commons';
import Async from 'async';
import { AbstractFieldAttempts } from './app/extraction-rules';
import { makeHashEncodedPath } from '~/utils/hash-encoded-paths';
import { Field } from './core/extraction-records';

const extractionRecordFileName = 'extraction-records.json';

export async function runMainInitFilters(
  corpusRoot: string,
): Promise<[radix.Radix<Set<string>>, radix.Radix<number>]> {
  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);

  const radCounts = radix.createRadix<number>();
  const radAccum = radix.createRadix<Set<string>>();

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .throughF((entryPath) => {
      const metadata = readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json')

      if (metadata === undefined) {
        return;
      }

      const { responseUrl } = metadata;
      const parsedUrl = parseUrl(responseUrl);
      const { host } = parsedUrl;
      const paths = parsedUrl.pathname.split('/');
      const [, path1] = paths.slice(0, paths.length - 1);
      const hostAndPath = `${host}/${path1}`;
      const lookup = {
        host: {
          okay: host,
          path: {
            okay: hostAndPath
          }
        },

      }
      radix.radUpsert(radCounts, [host], (count) => count === undefined ? 1 : count + 1)
      if (path1 !== undefined) {
        radix.radUpsert(radCounts, [host, path1], (count) => count === undefined ? 1 : count + 1)
      }

      const hasExtractionRecord = hasCorpusFile(entryPath, 'extracted-fields', extractionRecordFileName);

      if (!hasExtractionRecord) {
        return;
      }

      const extractedFieldsDir = path.join(entryPath, 'extracted-fields');
      if (!fs.existsSync(extractedFieldsDir)) {
        return;
      }
      const exdir = expandDir(extractedFieldsDir);
      const gtFiles = _.filter(exdir.files, f => f.endsWith('.gt'));

      _.each(gtFiles, f => {
        const nameParts = path.basename(f).split(/\./);
        const gtNamePart = nameParts[nameParts.length - 2];
        putStrLn(`gtNamePart = ${gtNamePart}`);

        const dotted = gtNamePart.replace(/_/g, '.');
        const v = _.get(lookup, dotted);

        radix.radUpsert(
          radAccum, dotted,
          (strs?: Set<string>) => strs === undefined ? (new Set<string>().add(v)) : strs.add(v)
        );
      });

    });

  return pumpBuilder.toPromise()
    .then(() => {
      putStrLn('URL Host / Path counts');
      const pathCounts: [number, string][] = [];
      radix.radTraverseValues(radCounts, (path, count) => {
        const jpath = _.join(path, '/');
        pathCounts.push([count, jpath]);
      });

      const sorted = _.sortBy(pathCounts, ([c]) => -c);
      _.each(sorted, ([count, path]) => {
        putStrLn(`    ${count} : ${path}`);
      })

      putStrLn('Ground Truth labels');
      radix.radTraverseValues(radAccum, (path, strs) => {
        putStrLn(`    ${_.join(path, ' _ ')} =>`);
        strs.forEach(s => {
          putStrLn(`      ${s}`);
        })
      })
      return [radAccum, radCounts];
    });
}


export async function runFieldExtractor(
  ctx: ExtractContext,
  metadata: Metadata,
  extractionPipeline: Arrow<unknown, unknown>
): Promise<PerhapsW<unknown>> {
  const { entryPath } = ctx;

  const env = await initExtractionEnv(entryPath, ctx, metadata);
  const res = await extractionPipeline(TE.right([metadata, env]))();

  const browserPages = _.map(_.toPairs(env.browserPageCache), ([, p]) => p);

  await Async.each(browserPages, async page => page.close());

  await env.browser.close();

  return res;
}

export async function runMainExtractFields(
  corpusRoot: string,
  logpath: string,
  logLevel: string,
  _dropN: number,
  _takeN: number,
  pathFilter: string,
  urlFilter: string,
): Promise<void> {


  const logFilename = 'test-extractor-log.json';
  const logfilePath = path.join(logpath, logFilename);
  const log = getConsoleAndFileLogger(logfilePath, logLevel);

  const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);

  // const [radAccum, radCount] = await runMainInitFilters(corpusRoot);

  const pumpBuilder = streamPump.createPump()
    .viaStream<string>(dirEntryStream)
    .filter((entryPath) => entryPath !== undefined)
    .initEnv<ExtractContext>((entryPath) => {
      const entry = entryPath || '';
      setLogLabel(log, entry);

      return {
        entryPath: entry,
        log,
      };
    })
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
        writeExtractionRecords(env, ['Extraction Success']);
      } else {
        const [ci, env] = res.left;
        ctx.log.error(`error extracting records: ${ci}`);
        writeExtractionRecords(env, ['Extraction Failure', `${ci}`]);
      }
    });

  return pumpBuilder.toPromise()
    .then(() => undefined);
}

export async function extractFieldsForEntry(
  entryPath: string,
  log: Logger,
): Promise<void> {
  // const logFilename = 'test-extractor-log.json';
  // const logfilePath = path.join(logpath, logFilename);
  // const log = getConsoleAndFileLogger(logfilePath, logLevel);

  log.info(`extracting field in ${entryPath}`);

  const metadata = readCorpusJsonFile<Metadata>(entryPath, '.', 'metadata.json')
  if (metadata === undefined) {
    log.info(`no metadata found for ${entryPath}`);
    return;
  }
  // setLogLabel(log, entryPath);

  const ctx: ExtractContext = {
    entryPath,
    log,
  };

  ensureArtifactDirectories(entryPath);

  const res = await runFieldExtractor(ctx, metadata, AbstractFieldAttempts);

  if (E.isRight(res)) {
    ctx.log.info('writing extraction records');
    const [, env] = res.right;
    writeExtractionRecords(env, ['Extraction Success']);
  } else {
    const [ci, env] = res.left;
    ctx.log.error(`error extracting records: ${ci}`);
    writeExtractionRecords(env, ['Extraction Failure', `${ci}`]);
  }
}


function writeExtractionRecords(env: ExtractionEnv, messages: string[]) {
  const { entryPath, fieldRecs, metadata } = env;
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
    messages,
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

  writeCorpusJsonFile(
    entryPath,
    'extracted-fields',
    extractionRecordFileName,
    finalOutput,
    /* overwrite= */true
  );

  const canonical = _.flatMap(_.toPairs(fieldRecs), ([fieldName, fieldInstances]) => {
    if (fieldName === 'author') {
      const nameValueRecs = _.flatMap(fieldInstances, fi => {
        const { name, value } = fi;
        if (value === undefined) return [];
        return [ { name, value } ];
      });
      return nameValueRecs;
    }
    const { name, value } = fieldInstances[0];
    if (value === undefined) return [];
    return [ { name, value } ];
  });

  writeCorpusJsonFile(
    entryPath,
    'extracted-fields',
    'canonical-fields.json',
    finalOutput,
    /* overwrite= */true
  );

}

export function getExtractedField(
  corpusRoot: string,
  alphaRec: AlphaRecord
): any {

  console.log('getExtractedField', corpusRoot)
  const { url, noteId } = alphaRec;

  const entryEncPath = makeHashEncodedPath(url, 3);
  const entryPath = entryEncPath.toPath();
  const entryFullpath = path.resolve(corpusRoot, entryPath);

  console.log('getExtractedField: fullPath', entryFullpath)

  const extractionRec = readCorpusJsonFile(entryFullpath, 'extracted-fields', extractionRecordFileName);

  if (extractionRec) {
    prettyPrint({ msg: 'getExtractedField', entryPath, extractionRec });

    const titleField: Field | undefined = _.get(extractionRec, 'fields.title.instances[0]');
    const abstractField: Field | undefined = _.get(extractionRec, 'fields.abstract.instances[0]');
    const pdfLinkField: Field | undefined = _.get(extractionRec, 'fields.pdf-link.instances[0]');
    const authorFields: Field[] | undefined = _.get(extractionRec, 'fields.author.instances');


    if (abstractInstance0 && abstractInstance0.value) {
      const { name, value } = abstractInstance0;
      return ({
        url,
        noteId,
        fields: [
          { name, value }
        ]
      });
    }
  }
}

// export async function runMainGatherAbstracts(
//   corpusRoot: string,
//   alphaRecordCsv: string,
// ): Promise<void> {
//   const inputStream = readAlphaRecStream(alphaRecordCsv);

//   const urlStream = streamPump.createPump()
//     .viaStream<AlphaRecord>(inputStream)
//     .throughF((inputRec: AlphaRecord) => {
//       const { url, noteId } = inputRec;

//       const entryEncPath = makeHashEncodedPath(url, 3);
//       const entryPath = entryEncPath.toPath();
//       const entryFullpath = path.resolve(corpusRoot, entryPath);
//       const extractionRec = readExtractionRecord(entryFullpath);

//       if (extractionRec) {
//         const abstractInstance0: Field | undefined = _.get(extractionRec, 'fields.abstract.instances[0]');
//         if (abstractInstance0 && abstractInstance0.value) {
//           prettyPrint({ entryPath, abstractInstance0 });
//           const { name, value } = abstractInstance0;
//           return ({
//             url,
//             noteId,
//             fields: [
//               { name, value }
//             ]
//           });
//         }
//       }
//       return ({
//         url,
//         id: noteId,
//         fields: undefined
//       });
//     }).gather()
//     ;

//   const result = await urlStream.toPromise();

//   if (!result) {
//     putStrLn(`no records found using ${alphaRecordCsv} in ${corpusRoot}`);
//     return;
//   }
//   fs.writeJsonSync('gather-abstracts.json', result);
// }

// const groundTruthFilename = 'ground-truth-labels.json';

// export async function runMainUpdateGroundTruths(
//   corpusRoot: string,
// ): Promise<void> {
//   const dirEntryStream = walkScrapyCacheCorpus(corpusRoot);
//   const logpath = corpusRoot;
//   const log = getBasicLogger(logpath, 'ground-truth-update-log.json');

//   const pumpBuilder = streamPump.createPump()
//     .viaStream<string>(dirEntryStream)
//     .initEnv<ExtractionAppContext>(() => ({
//       log,
//     }))
//     .tap((entryPath: string, ctx) => {
//       const extractionRecord = readExtractionRecord(entryPath);
//       const existingGroundTruths = readCorpusJsonFile(entryPath, 'ground-truth', groundTruthFilename);
//       if (extractionRecord) {
//         if (existingGroundTruths) {
//           ctx.log.warn('TODO Make sure ground truth data does not conflict with extraction record ');
//           return;
//         }
//         const initGroundTruth = initGroundTruthAssertions(extractionRecord);
//         ctx.log.warn(`initializing ground-truth for ${entryPath}`);
//         writeCorpusJsonFile(entryPath, 'ground-truth', groundTruthFilename, initGroundTruth);
//       }
//     });

//   return pumpBuilder.toPromise()
//     .then(() => undefined);
// }
