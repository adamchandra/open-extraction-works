import _ from 'lodash';

import {
  streamPump,
  walkScrapyCacheCorpus,
  ensureArtifactDirectories,
  getConsoleAndFileLogger,
  readCorpusJsonFile,
  writeCorpusJsonFile,
  readAlphaRecStream,
  hasCorpusFile,
  setLogLabel,
  expandDir,
  prettyPrint,
  putStrLn,
  AlphaRecord,
} from 'commons';

import parseUrl from 'url-parse';

import path from 'path';

import {
  Arrow,
  // ExtractionEnv,
  PerhapsW,
  ExtractionEnv
} from './extraction-prelude';


import fs from 'fs-extra';
import { ExtractContext, initExtractionEnv } from './extraction-process-v2';
import { Metadata } from '~/spidering/data-formats';

import * as TE from 'fp-ts/TaskEither';
import * as E from 'fp-ts/Either';
import { AbstractFieldAttempts } from './extraction-rules';
import { radix } from 'commons';

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

import Async from 'async';
import { makeHashEncodedPath } from '~/utils/hash-encoded-paths';
import { Field } from './extraction-records';
import { getBasicLogger } from '~/utils/basic-logging';

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
  dropN: number,
  takeN: number,
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

function writeExtractionRecords(env: ExtractionEnv, messages: string[]) {
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

}

      // const { responseUrl } = metadata;
      // const parsedUrl = parseUrl(responseUrl);
      // const { host } = parsedUrl;
      // const paths = parsedUrl.pathname.split('/');
      // const [, path1] = paths.slice(0, paths.length - 1);
      // const hostAndPath = `${host}/${path1}`;

      // const urlIsMarked = markedUrls.has(host) || markedUrls.has(hostAndPath);

      // if (urlIsMarked) {
      //   ctx.log.info(`Entry URL host ${host} / and maybe path ${path1} was previously marked, skipping...`);
      //   return;
      // }

      // // const hasExtractionRecord = hasCorpusFile(entryPath, 'extracted-fields', extractionRecordFileName);
      // const isEntryOkay = hasCorpusFile(entryPath, 'extracted-fields', `${extractionRecordFileName}.entry_okay.gt`);
      // const isHostOkay = hasCorpusFile(entryPath, 'extracted-fields', `${extractionRecordFileName}.host_okay.gt`);
      // const isHostPathOkay = hasCorpusFile(entryPath, 'extracted-fields', `${extractionRecordFileName}.host_path_okay.gt`);
      // const isBuryHost = hasCorpusFile(entryPath, 'extracted-fields', `${extractionRecordFileName}.bury_host.gt`);

      // const isMarked = hasCorpusFile(entryPath, 'extracted-fields', `${extractionRecordFileName}.mark.gt`);

      // if (isHostOkay) {
      //   ctx.log.info(`Entry has Host-Okay mark, will skip similar hosts ${host} ...`);
      //   markedUrls.add(host);
      //   return;
      // }

      // if (isHostPathOkay) {
      //   ctx.log.info(`Entry has Host-Path-Okay mark, will skip similar hosts ${hostAndPath} ...`);
      //   markedUrls.add(hostAndPath);
      //   return;
      // }

      // if (isEntryOkay) {
      //   ctx.log.info('Entry has Entry-Okay mark, skipping ...');
      //   return;
      // }

      // if (hasExtractionRecord) {
      //   ctx.log.info('Entry has Extraction Records, skipping...');
      //   return;
      // }

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
