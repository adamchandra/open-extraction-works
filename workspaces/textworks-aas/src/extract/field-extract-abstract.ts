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
  getSubtextOrUndef,
  findByQuery,
  queryContent,
  urlGuard,
  findInMeta,
} from "~/extract/field-extract-utils";

import { prettyPrint, BufferedLogger, ExpandedDir, expandDir } from "commons";
import { writeDefaultEntryLogs, readMetaFile } from '~/qa-editing/qa-logging';
import { ReviewEnv } from './qa-review-abstracts';

type PipelineFunction = (lines: string[], content: string, url?: string, httpStatus?: number) => Partial<Field>;

export function findAbstractV2(cssNormLines: string[]): Field {
  const field = findByLineMatch(["global.document.metadata"], { lineOffset: -1, lineCount: 1 })(cssNormLines);

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

// "http://www.bmva.org/bmvc/2014/papers/paper025/index.html"

export const AbstractPipeline: PipelineFunction[] = [
  urlGuard(
    ["oxfordscholarship.com"],
    findInMeta('description content')
  ),

  urlGuard(
    ["easychair.org"],
    findByLineMatch(
      ["h3", "| Abstract", "|"],
      { lineOffset: -1 }
    ),
  ),
  urlGuard(
    ["www.igi-global.com"],
    findByLineMatch(
      ['span', 'h2', '| Abstract', '|'],
      { lineOffset: -3 }
    ),
  ),

  findByQuery("div.hlFld-Abstract div.abstractInFull"),
  findByLineMatch(["div #abstract"]),
  findAbstractV2,

  findByLineMatch(["section.*.Abstract", "h2.*.Heading", "Abstract"]),

  findByLineMatch(["div .hlFld-Abstract", "div", "div", "h2"], { lineOffset: 2 }),

  findByLineMatch(["div", "h3.*.label", "Abstract"]),

  findByLineMatch(
    ["div.*#abstract", "h4", "Abstract"],
    { evidenceEnd: ["div.*#paperSubject", "h4", "Keywords"] }
  ),

  findAbstractV7,
  findAbstractV8,

  findByQuery("div#body > div#main > div#content > div#abstract"),

  findByQuery("div#content-inner > div#abs > blockquote"), //

  findByQuery("div#Abs1-content > p"),
  findByQuery("div.main-container > div > p.abstract"),

  findByQuery("div > div > div.w3-container > p"),

  findByLineMatch(["div.itemprop='about'"]),
  findByLineMatch(["div", "div", "h5", "Abstract", "div"]),
  findByLineMatch(["h3", "ABSTRACT", "p"], { lineOffset: 2 }),

  findByLineMatch(["span.+ContentPlaceHolder.+LabelAbstractPopUp"]),

  findByLineMatch(["div", "article", "section", "h2", "^ +| Abstract", "div", "p"]),

  findByLineMatch(["p #contentAbstract_full", "article", "section", "h2", "^ +| Abstract", "div", "p"]),
  findByLineMatch(['.field-name-field-paper-description']),
  findByLineMatch(["| Abstract", "td itemprop='description'"]),

  // Maybe superceded by the one after
  // findByLineMatch(["Abstract", "section .abstract", "p .chapter-para", "strong", "Summary:"]),
  // findByLineMatch([
  //   "h2.+abstract-title",
  //   "^ +| Abstract",
  //   "section .abstract",
  //   "p .chapter-para"
  // ]),

  findByLineMatch([
    "div .abstract itemprop='description'",
  ]),

  findByLineMatch([
    "section .abstract",
  ]),

  findByLineMatch([
    "div .abstractSection",
    "p"
  ]),
  findByQuery("div.metadata  div.abstract"),
  findByLineMatch([".cPageSubtitle", "| Abstract"], {
    evidenceEnd: [".cPageSubtitle", "| \\w"],
  }),

  // Maybe superceded by the one after
  // findByLineMatch(["^ +p", "^ +b", "^ +| Abstract:"], {
  //   indentOffset: -2,
  //   lineCount: 1,
  // }),

  findByLineMatch(["^ +p", "^ +b", "^ +| Abstract:"], {
    indentOffset: -2,
    evidenceEnd: ["^ +p", "^ +b"],
  }),

  findByLineMatch(["^ +i", "^ +b", "^ +| Abstract:"], {
    indentOffset: -4,
    evidenceEnd: ["^ +p"],
  }),

  findByLineMatch(["p", "span .subAbstract"]),

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
    const metafile = path.resolve(exDir.dir, 'meta');

    if (fs.existsSync(extrAbsFilename)) {
      console.log(
        `skipping: abstracts file already exists: ${extrAbsFilename}`,
      );
      return;
    }

    const metaProps = readMetaFile(metafile);

    if (!metaProps) {
      log.append(`error=NoMetaFileFound`);
      return;
    }

    const { responseUrl, status } = metaProps;
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

    let resultField: Partial<Field> = {};

    _.each(AbstractPipeline, (pf, pfNum) => {
      const { value, complete } = resultField;
      if (complete || value) return;

      const res: Partial<Field> = pf(cssNormalForm, htmlContent, responseUrl, status);
      if (res.value !== undefined) {
        resultField = res;
        log.append(`field.abstract.extract.method=${pfNum + 1}`);
      }
    });

    if (resultField.value !== undefined) {
      log.append(`field.abstract.extract=true`);
      fs.writeJsonSync(extrAbsFilename, [resultField]);
    } else {
      log.append(`field.abstract.extract=false`);
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
