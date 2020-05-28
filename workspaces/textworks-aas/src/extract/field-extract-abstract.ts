import _ from "lodash";
import path from "path";
import { Transform } from "stream";
import through from "through2";
import fs from "fs-extra";
import { Field } from "~/extract/field-extract";


import { makeCssTreeNormalFormFromNode, writeNormalizedHtml } from "./reshape-html";

import {
  readFile,
  findByLineMatch,
  findByLineMatchEnd,
  getSubtextOrUndef,
  findByQuery,
  queryContent,
} from "~/extract/field-extract-utils";

import { prettyPrint, BufferedLogger, ExpandedDir, expandDir } from "commons";
import { writeDefaultEntryLogs } from '~/qa-editing/qa-logging';
import { ReviewEnv } from './qa-review-abstracts';

type PipelineFunction = (lines: string[], content: string) => Field;

export function findAbstractV2(cssNormLines: string[]): Field {
  const field = findByLineMatch(
    ["global.document.metadata"],
    0,
    cssNormLines,
  );

  const line = field.value;
  field.value = undefined;
  if (line) {
    const jsonStart = line.indexOf("{");
    const jsonEnd = line.lastIndexOf("}");
    const lineJson = line.slice(jsonStart, jsonEnd + 1);
    try {
      const metadataObj = JSON.parse(lineJson);
      const abst = metadataObj["abstract"];
      field.value = abst;
    } catch (e) {
      prettyPrint({ e, lineJson });
    }
  }
  return field;
}

export function findAbstractV7(
  _cssNormLines: string[],
  fileContent: string,
): Field {

  const query = "section#main .card-title";
  const [field, maybeAbstract, $] = queryContent(query, fileContent);
  const abstrParent = maybeAbstract.parents()[0];

  const cssNormalParent = makeCssTreeNormalFormFromNode($(abstrParent));
  field.value = getSubtextOrUndef(cssNormalParent);

  return field;
}

export function findAbstractV8(
  _normLines: string[],
  fileContent: string,
): Field {
  const query = "div.content > div > div.row > div.col-md-12";
  const [field, maybeAbstract] = queryContent(query, fileContent);
  const cssNormal = makeCssTreeNormalFormFromNode(maybeAbstract);
  const maybeAbstr = _.takeWhile(
    cssNormal.slice(1),
    l => !l.includes("col-md-12"),
  );
  field.value = getSubtextOrUndef(maybeAbstr);

  return field;
}

export const AbstractPipeline: PipelineFunction[] = [
  findByLineMatch(["div #abstract"], 0),
  findAbstractV2,

  findByLineMatch(["section.*.Abstract", "h2.*.Heading", "Abstract"], 0),
  findByLineMatch([".hlFld-Abstract", "div"], 0),
  findByLineMatch(["div", "h3.*.label", "Abstract"], 0),

  findByLineMatchEnd(
    ["div.*#abstract", "h4", "Abstract"],
    ["div.*#paperSubject", "h4", "Keywords"],
    0,
  ),

  findAbstractV7,
  findAbstractV8,

  findByQuery("div#body > div#main > div#content > div#abstract"),
  findByQuery("div#content-inner > div#abs > blockquote"),
  findByQuery("div#Abs1-content > p"),
  findByLineMatch(["h3", "ABSTRACT", "p"], 2),
  findByQuery("div.article__body > div.hlFld-Abstract > div > p"),
];

function extractAbstract(exDirInit: ExpandedDir, log: BufferedLogger): void {
  // Re-expand the directory
  const exDir = expandDir(exDirInit.dir);
  const entryBasename = path.basename(exDir.dir);
  log.append(`field.abstract.extract.entry=${entryBasename}`);

  const htmlFiles = exDir.files
    .filter(f => f.endsWith(".html"))
    .map(f => path.resolve(exDir.dir, f));

  _.each(htmlFiles, htmlFile => {
    const extrAbsFilename = `${htmlFile}.ex.abs.json`;

    if (fs.existsSync(extrAbsFilename)) {
      console.log(
        `skipping: abstracts file already exists: ${extrAbsFilename}`,
      );
      return;
    }

    const fileBase = path.basename(htmlFile);
    log.append(`field.abstract.extract.file=${fileBase}`);
    console.log(`extracting abstract from ${htmlFile}`);

    writeNormalizedHtml(htmlFile);

    const cssNormFile = `${htmlFile}.norm.txt`;

    const htmlContent = readFile(htmlFile);
    const normFileContent = readFile(cssNormFile);

    if (!(htmlContent && normFileContent)) {
      console.log(`.html and .norm.txt did not exist in ${exDir}`);
      return;
    }

    const cssNormalForm = normFileContent.split("\n");
    const fields = _.map(AbstractPipeline, (pf, pfNum) => {
      const res = pf(cssNormalForm, htmlContent);
      if (res.value !== undefined) {
        log.append(`field.abstract.extract.method=${pfNum + 1}`);
      }
      return res;
    });

    const abstractFields: Field[] = fields.filter(f => f.value);

    const writeAbstracts = true;

    if (writeAbstracts) {
      if (abstractFields.length > 0) {
        console.log(`writing ${abstractFields.length} abstracts to ${extrAbsFilename}`);
        log.append(`field.abstract.extract=true`);
        log.append(`field.abstract.extract.count=${abstractFields.length}`);
        fs.writeJsonSync(extrAbsFilename, abstractFields);
      } else {
        log.append(`field.abstract.extract=false`);
      }
    }
    return;
  });
}

export function extractAbstractTransformFromScrapy(log: BufferedLogger, env: ReviewEnv): Transform {
  return through.obj(
    (exDir: ExpandedDir, _enc: string, next: (err: any, v: any) => void) => {
      try {
        log.append(`action=extractAbstractTransformFromScrapy`);
        writeDefaultEntryLogs(log, exDir, env);
        extractAbstract(exDir, log);
      } catch (err) {
        console.log(`err ${err}`);
      }
      log.commitLogs();
      return next(null, exDir);
    },
  );
}
