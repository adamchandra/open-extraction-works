import _ from 'lodash';
import {
  readMetaProps,
  runFileVerification,
  runHtmlTidy,
  runCssNormalize,
  runLoadResponseBody,
  verifyHttpResponseCode,
  readCachedNormalFile,
  traceLog
} from '~/extract/core/field-extract';

import { pipe } from 'fp-ts/pipeable';
import * as Arr from 'fp-ts/Array';
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import { isLeft } from 'fp-ts/Either'
import Async from 'async';


import { Logger } from 'winston';
import { AbstractCleaningRules } from './data-clean-abstracts';
import { ExtractionFunction, ExtractionEnv, applyCleaningRules, flatMapTasksEA } from '../core/extraction-process';
import { hasCorpusFile, writeCorpusJsonFile, readCorpusJsonFile, expandDir } from 'commons';
import { ExtractionRecord, ExtractionErrors, foldExtractionRec, ExtractedFields, FieldInstances  } from '../core/extraction-records';
import { AbstractPipeline } from './rules-pipeline';


// TODO: track how often a rule 'fires' (use log entry which tracks evidence (as a string), and index#)
// TODO: figure out how to review abstract finding filtered by rule/url/author/year/venue/etc
//       : rule    filter=[(/evidence=/) && /meta/ && /@DCTerms/]
//       : url
//       : author
//       : year
//       : venue
// TODO: use titles to help find abstracts
// TODO: extract titles, pdf links, author names
// TODO: create REST API for openreview based on html extraction
// TODO: handle multi-metadataLine findInMeta examples
// TODO: what is the correct behavior when only a partial abstract field is found? Use it? mark it 'partial'?


export const extractionRecordFileName = 'extraction-records.json';

function extractionLogExists(entryPath: string): boolean {
  return hasCorpusFile(entryPath, 'extracted-fields', extractionRecordFileName)
}

export function readExtractionRecord(entryPath: string): ExtractionRecord | undefined {
  return readCorpusJsonFile(entryPath, 'extracted-fields', extractionRecordFileName)
}

function writeExtractionRecord(entryPath: string, content: any): boolean {
  return writeCorpusJsonFile(entryPath, 'extracted-fields', extractionRecordFileName, content);
}

export const skipIfAbstractLogExisits = (entryPath: string): boolean => {
  const exists = extractionLogExists(entryPath);
  if (exists) {
    console.log(`skipping: file ${extractionRecordFileName} already exists`);
  }
  return !exists;
};

export interface ExtractionAppContext {
  log: Logger;
}

const cleaningRuleExtractionFunction: ExtractionFunction = (env: ExtractionEnv) => {
  const rec = env.extractionRecord;
  foldExtractionRec(rec, {
    onFields: (fieldRec: ExtractedFields) => {
      const abstractFieldInstances = fieldRec.fields['abstract'];
      const fields = abstractFieldInstances.instances;
      let validFieldInstances = 0;

      _.each(fields, field => {
        const fieldValue = field.value;
        let cleaned: string | undefined;
        if (fieldValue) {
          const [cleaned0, cleaningRuleResults] = applyCleaningRules(AbstractCleaningRules, fieldValue);
          const ruleNames = _.map(cleaningRuleResults, r => {
            return `clean: ${r.rule}`;
          })
          cleaned = cleaned0;
          field.evidence.push(...ruleNames);
        }
        if (cleaned && cleaned.length > 0) {
          field.value = cleaned;
          validFieldInstances += 1;
        } else {
          field.value = undefined;
        }
      });
      abstractFieldInstances.count = validFieldInstances;
      abstractFieldInstances.exists = validFieldInstances > 0;
    }
  });

  return TE.right(env);
};

export const extractAbstractTransform =
  async (entryPath: string, ctx: ExtractionAppContext): Promise<void> => {
    const { log } = ctx;
    log.info(`starting field extraction on ${entryPath}`);

    return runAbstractFinders(ctx, AbstractPipeline, entryPath)
      .then((extrFields) => writeExtractionRecord(entryPath, extrFields))
      .then(() => console.log(`extracted ${entryPath}`))
      ;
  };


const verifyIsHtmlOrXml = runFileVerification(/(html|xml)/i);
const readCachedTidyNorm = readCachedNormalFile('tidy-norm');
const readCachedCssNorm = readCachedNormalFile('css-norm');

const PipelineLeadingFunctions = [
  traceLog({ readMetaProps }),
  traceLog({ verifyIsHtmlOrXml }),
  traceLog({ verifyHttpResponseCode }),
  traceLog({ runLoadResponseBody }),
  traceLog({ readCachedTidyNorm }),
  traceLog({ runHtmlTidy }),
  traceLog({ readCachedCssNorm }),
  traceLog({ runCssNormalize }),
];


export async function runAbstractFinders(
  ctx: ExtractionAppContext,
  extractionPipeline: ExtractionFunction[][],
  entryPath: string
): Promise<ExtractionRecord> {
  const { log } = ctx;

  const entryFiles = expandDir(entryPath);

  const responseFrames = _.filter(
    entryFiles.files, f => f.startsWith('response-frame')
  );

  log.debug(`runAbstractFinders: found ${responseFrames.length} response-frames`);

  const inputFiles = _.concat(['response-body'], responseFrames);
  const extractedFields = await Async.mapSeries<string, ExtractionRecord>(
    inputFiles,
    async f => runAbstractFindersOnFile(
      ctx, extractionPipeline, entryPath, f
    )
  );

  const fieldRecs = _.filter(extractedFields, efs => efs.kind === 'fields');
  const mergedFields: ExtractedFields = {
    kind: 'fields',
    fields: {}
  };
  _.merge(mergedFields, ...fieldRecs);
  const hasFields = _.size(mergedFields.fields) > 0;
  if (hasFields) {
    // sort field instances by score
    _.each(mergedFields.fields, fields => {

      const scoredInstances = _.map(
        fields.instances, (instance) => {
          let score = 0;

          const instanceScores = _.map(instance.evidence, e => {
            if (/score/.test(e)) {
              // TODO parse score
              return 1;
            }
            return 0
          });
          score = _.sum([score, ...instanceScores]);

          score = instance.value? score + instance.value.length : -1;

          return [instance, score] as const;
        }
      );
      const sortedInstances = _.map(
        _.sortBy(scoredInstances, (si) => -si[1]),
        si => si[0]
      );
      fields.instances = sortedInstances;
    });
    return mergedFields;
  }

  const errorRecs = _.filter(extractedFields, efs => efs.kind === 'errors');
  const mergedErrors: ExtractionErrors = {
    kind: 'errors',
    errors: []
  };
  _.merge(mergedErrors, ...errorRecs);

  return mergedErrors;
}

export async function runAbstractFindersOnFile(
  ctx: ExtractionAppContext,
  extractionPipeline: ExtractionFunction[][],
  entryPath: string,
  inputFile: string,
): Promise<ExtractionRecord> {
  const { log } = ctx;

  log.debug(`runAbstractFindersOnFile ${entryPath} / ${inputFile}`);

  const init: ExtractionEnv = {
    log,
    entryPath,
    inputFile,
    fileContentMap: {},
    extractionRecord: { kind: 'fields', fields: {} },
    evidence: []
  };

  const leadingPipeline = flatMapTasksEA(PipelineLeadingFunctions);
  const maybeEnv = await leadingPipeline(init)();

  if (isLeft(maybeEnv)) {
    const errors = maybeEnv.left;
    const extractErrors: ExtractionErrors = {
      kind: 'errors',
      errors: [
        errors
      ]
    };

    return extractErrors;
  }
  const leadingEnv = maybeEnv.right;

  const attemptTask = _.map(extractionPipeline, (ep) => {
    const initAttemptEnv: ExtractionEnv = _.merge({}, leadingEnv);
    const attemptFuncs = _.concat(ep, cleaningRuleExtractionFunction)
    const attemptPipeline = flatMapTasksEA(attemptFuncs);
    return pipe(
      initAttemptEnv,
      attemptPipeline,
      TE.fold<string, ExtractionEnv, ExtractionEnv>(
        (error: string) => {
          // TODO the error state should return something more than a string
          const extractErrors: ExtractionErrors = {
            kind: 'errors',
            errors: [error]
          };
          initAttemptEnv.extractionRecord = extractErrors;
          return () => Promise.resolve(initAttemptEnv)
        },
        (succ: ExtractionEnv) => {
          const { evidence, extractionRecord } = succ;
          if (extractionRecord.kind === 'fields') {
            _.each(
              extractionRecord.fields,
              f => _.each(
                f.instances,
                (inst) => inst.evidence.push(...evidence)
              ));
          }

          return () => Promise.resolve(succ)
        }
      )
    );
  });

  const sequenceArrOfTask = Arr.array.sequence(Task.taskSeq);
  // const attemptedTasks = await sequenceArrOfTask(attemptTask)();

  const initRec: FieldInstances = {
    exists: false,
    count: 0,
    instances: []
  };

  const combinedInstances = initRec;
  // const combinedInstances = _.reduce<ExtractionEnv, FieldInstances>(
  //   attemptedTasks,
  //   (acc, e) => {
  //     const newAcc = foldExtractionRec(
  //       e.extractionRecord, {
  //       onFields: (extractedFields) => {
  //         const abstractInstances = extractedFields.fields['abstract'];
  //         const { exists, count, instances } = abstractInstances;
  //         return {
  //           exists: exists || acc.exists,
  //           count: count + acc.count,
  //           instances: _.concat(acc.instances, instances)
  //         };
  //       }
  //     });
  //     if (newAcc) return newAcc;
  //     return acc;
  //   },
  //   initRec
  // );

  const combinedFields: ExtractedFields = {
    kind: 'fields',
    fields: { 'abstract': combinedInstances }
  }

  return combinedFields;
}
