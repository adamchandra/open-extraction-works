import _ from "lodash";
import {
  readMetaProps,
  filterUrl,
  runFileVerification,
  runHtmlTidy,
  runCssNormalize,
  runLoadResponseBody,
  verifyHttpResponseCode,
  readCachedNormalFile,
} from "~/extract/core/field-extract";

import { pipe } from 'fp-ts/pipeable';
import * as Arr from 'fp-ts/Array';
// import * as Opt from 'fp-ts/Option';
// import * as Ap from 'fp-ts/Apply';
import * as TE from 'fp-ts/TaskEither';
import * as Task from 'fp-ts/Task';
import { isLeft } from 'fp-ts/Either'

import {
  findByLineMatchTE,
  findInMetaTE,
} from "~/extract/core/field-extract-utils";

import { Logger } from "winston";
import { AbstractCleaningRules } from './data-clean-abstracts';
import { ExtractionFunction, Field, ExtractionEnv, applyCleaningRules, flatMapTasksEA } from '../core/extraction-process';
import { hasCorpusFile, writeCorpusJsonFile, readCorpusJsonFile } from 'commons';
import { ExtractionRecord, ExtractionErrors, foldExtractionRec, ExtractedFields, FieldInstances, addFieldInstance } from '../core/extraction-records';


export const findInGlobalDocumentMetadata: ExtractionFunction =
  env => {
    const { fileContentMap } = env;
    const fileContent = fileContentMap['html-tidy'];
    if (!fileContent) {
      return TE.left('findInMetaTE');
    }
    const fileContentLines = fileContent.lines;

    const metadataLine = _.filter(
      fileContentLines,
      metadataLine => /global.document.metadata/.test(metadataLine)
    )[0];

    if (!metadataLine) {
      return TE.left(`findInGlobalDocumentMetadata: metadata line not found`);
    }

    const jsonStart = metadataLine.indexOf("{");
    const jsonEnd = metadataLine.lastIndexOf("}");
    const lineJson = metadataLine.slice(jsonStart, jsonEnd + 1);
    try {
      const field: Field = {
        name: "abstract",
        evidence: [`use-input:html-tidy`, `global.document.metadata:['abstract']`],
      };
      const metadataObj = JSON.parse(lineJson);
      const abst = metadataObj["abstract"];
      field.value = abst;
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    } catch (e) {
      return TE.left(e.toString());
    }
  };


// TODO: track how often a rule 'fires' (use log entry which tracks evidence (as a string), and index#)
// TODO: figure out how to review abstract finding filtered by rule/url/author/year/venue/etc
//       : rule    filter=[(/evidence=/) && /meta/ && /@DCTerms/]
//       : url
//       : author
//       : year
//       : venue
// TODO: use titles to help find abstracts
// TODO: expand spidering to crawl sub-frames
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
        // field.evidence = _.concat(evidence, field.evidence);
        let cleaned: string | undefined;
        if (fieldValue) {
          const [cleaned0, cleaningRuleResults] = applyCleaningRules(AbstractCleaningRules, fieldValue);
          const ruleNames = _.map(cleaningRuleResults, r => {
            return `clean: ${r.rule}`;
          })
          cleaned = cleaned0;
          field.evidence.push(...ruleNames);
          // TODO only output these with a --verbose flag
          // if (cleaningRuleResults.length > 0) {
          //   field.cleaning = cleaningRuleResults;
          // }
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

export const AbstractPipeline: ExtractionFunction[][] = [

  [findInMetaTE('@description content')],
  [findInMetaTE('@DCTERMS.abstract content')],
  [findInMetaTE('@citation_abstract content')],
  [findInMetaTE('@abstract content')],
  [findInMetaTE('@DC.[Dd]escription content')],
  [findInMetaTE("prop='og:description'")],

  [
    filterUrl(/bmva.rog/),
    findByLineMatchTE(
      ["p", "h2", "| Abstract"],
      { lineOffset: -2 }
    )
  ], [
    filterUrl(/easychair.org/),
    findByLineMatchTE(
      ["h3", "| Abstract", "|"],
      { lineOffset: -1 }
    )
  ],
  [
    filterUrl(/igi-global.com/),
    findByLineMatchTE(
      ['span', 'h2', '| Abstract'],
      { lineOffset: 0, evidenceEnd: ['footer'] }
    )
  ], [
    filterUrl(/ijcai.org\/Abstract/),
    findByLineMatchTE(
      ['|', 'p', '|'],
      { lineOffset: -1, lineCount: 1 }
    )
  ], [
    filterUrl(/etheses.whiterose.ac.uk/),
    findByLineMatchTE(
      ['h2', '| Abstract'],
      { lineOffset: -1 }
    )
  ], [
    filterUrl(/ndss-symposium.org\/ndss-paper/),
    findByLineMatchTE(
      [' +|', ' +p', ' +p', ' +|'],
      { lineOffset: 1 }
    )
  ], [
    filterUrl(/openreview.net/),
    findByLineMatchTE(
      ['.note-content-field', '| Abstract', '.note-content-value'],
      { lineOffset: 2 }
    )
  ], [
    filterUrl(/ieee.org/),
    findInGlobalDocumentMetadata,
  ],

  // 13. www.lrec-conf.org/
  [findByLineMatchTE(['tr', 'td', '| Abstract', 'td'])],

  // eccc.weizmann.ac.il/report
  [findByLineMatchTE(['b', '| Abstract', 'br', 'p', '|'], { lineOffset: 3 })],

  // [ findByQuery("div.hlFld-Abstract div.abstractInFull")],
  [findByLineMatchTE(["div #abstract"])],

  // // [ findAbstractV2, ]

  [findByLineMatchTE(["section.*.Abstract", "h2.*.Heading", "Abstract"])],

  [findByLineMatchTE(["div .hlFld-Abstract", "div", "div", "h2"], { lineOffset: 2 })],

  [findByLineMatchTE(["div", "h3.*.label", "Abstract"])],

  [findByLineMatchTE(["div", "strong", "| Abstract"])],

  [findByLineMatchTE(["section .full-abstract", "h2", "| Abstract"])],

  [findByLineMatchTE(
    ["div.*#abstract", "h4", "Abstract"],
    { evidenceEnd: ["div.*#paperSubject", "h4", "Keywords"] }
  )],

  [findByLineMatchTE(
    ['div', 'h4', '| Abstract', 'p'],
    { evidenceEnd: ['div'] }
  )],
  // 23.
  [findByLineMatchTE(["div.itemprop='about'"])],
  [findByLineMatchTE(["div", "div", "h5", "Abstract", "div"])],
  [findByLineMatchTE(["h3", "ABSTRACT", "p"], { lineOffset: 2 })],

  [findByLineMatchTE(["h3", "| Abstract", "p .abstract"], { lineOffset: 0 })],

  [findByLineMatchTE(["span.+ContentPlaceHolder.+LabelAbstractPopUp"])],
  [findByLineMatchTE(["div", "article", "section", "h2", "^ +| Abstract", "div", "p"])],
  [findByLineMatchTE(["p #contentAbstract_full", "article", "section", "h2", "^ +| Abstract", "div", "p"])],
  [findByLineMatchTE(['.field-name-field-paper-description'])],
  [findByLineMatchTE(["| Abstract", "td itemprop='description'"])],

  [findByLineMatchTE(["div .abstract itemprop='description'"])],
  [findByLineMatchTE(["section .abstract"])],
  [findByLineMatchTE(["div .abstractSection", "p"])],

  // [ findByQuery("div.metadata  div.abstract")],
  [
    findByLineMatchTE(
      [".cPageSubtitle", "| Abstract"],
      { evidenceEnd: [".cPageSubtitle", "| \\w"], }
    )
  ],

  [
    findByLineMatchTE(
      ["^ +p", "^ +b", "^ +| Abstract:"],
      { indentOffset: -2, evidenceEnd: ["^ +p", "^ +b"], }
    )
  ],

  [
    findByLineMatchTE(
      ["^ +i", "^ +b", "^ +| Abstract:"],
      { indentOffset: -4, evidenceEnd: ["^ +p"] }
    )
  ],

  [findByLineMatchTE(["p", "span .subAbstract"])],
];


// Run once before any inidiviual rules/attempts
const PipelineLeadingFunctions = [
  readMetaProps,
  runFileVerification(/(html|xml)/i),
  verifyHttpResponseCode,
  runLoadResponseBody,
  readCachedNormalFile('html-tidy'),
  runHtmlTidy,
  readCachedNormalFile('css-normal'),
  runCssNormalize,
];


export async function runAbstractFinders(
  ctx: ExtractionAppContext,
  extractionPipeline: ExtractionFunction[][],
  entryPath: string
): Promise<ExtractionRecord> {
  const { log } = ctx;

  const init: ExtractionEnv = {
    log,
    entryPath,
    fileContentMap: {},
    extractionRecord: { kind: "fields", fields: {} },
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
        (succ: ExtractionEnv) => () => Promise.resolve(succ)
      )
    );
  });

  const sequenceArrOfTask = Arr.array.sequence(Task.taskSeq);
  const attemptedTasks = await sequenceArrOfTask(attemptTask)();

  const initRec: FieldInstances = {
    exists: false,
    count: 0,
    instances: []
  };

  const combinedInstances = _.reduce<ExtractionEnv, FieldInstances>(
    attemptedTasks,
    (acc, e) => {
      const newAcc = foldExtractionRec(
        e.extractionRecord, {
        onFields: (extractedFields) => {
          const abstractInstances = extractedFields.fields['abstract'];
          const { exists, count, instances } = abstractInstances;
          return {
            exists: exists || acc.exists,
            count: count + acc.count,
            instances: _.concat(acc.instances, instances)
          };
        }
      });
      if (newAcc) return newAcc;
      return acc;
    },
    initRec
  );

  const combinedFields: ExtractedFields = {
    kind: "fields",
    fields: { "abstract": combinedInstances }
  }

  return combinedFields;
}
