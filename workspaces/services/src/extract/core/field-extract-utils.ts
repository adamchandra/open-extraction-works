import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import { Field, ExtractionEnv, ExtractionFunction } from "./extraction-process";

import * as TE from 'fp-ts/lib/TaskEither';
import { makeCssTreeNormalFormFromNode } from './html-to-css-normal';
import { addFieldInstance } from './extraction-records';
import { cheerioLoad } from './cheerio-loader';
import { prettyPrint } from 'commons';

export function readFile(
  leading: string,
  ...more: string[]
): string | undefined {
  const filepath = path.join(leading, ...more);
  const exists = fs.existsSync(filepath);
  if (exists) {
    const buf = fs.readFileSync(filepath);
    const fileContent = buf.toString().trim();
    return fileContent;
  }
  return undefined;
}

export function indentLevel(s: string): number {
  if (!s) return -1;

  let i = 0;
  const l = s.length;
  while (i < l && s.charAt(i) === " ") i++;
  return i;
}

export function filterText(lines: string[]): string[] {
  return _
    .map(lines, _.trim)
    .filter(l => l.startsWith("|"))
    .map(l => l.substr(1));
}

export function findIndexForLines(
  fileLines: string[],
  matchLines: string[],
  startIndex: number = 0,
): number {
  if (matchLines.length === 0) {
    return -1;
  }
  const ms = _.map(matchLines, m => new RegExp(m));
  const index = fileLines.findIndex((_line, lineNum) => {
    if (lineNum < startIndex) return false;

    return _.every(ms, (regex, matchNum) => {
      const currLine = fileLines[lineNum + matchNum];
      const haveMatch = regex.test(currLine); //  currLine.match(matchLine);
      return currLine && haveMatch;
    });
  });

  return index;
}

export function findSubContentAtIndex(
  fileLines: string[],
  startIndex: number,
  endIndex: number,
  indentOffset: number
): string[] {
  const line0 = fileLines[startIndex];
  const indent0 = indentLevel(line0) + indentOffset;
  const ls = fileLines.slice(startIndex, endIndex);

  const sub = _.takeWhile(ls, lineN => {
    const indentN = indentLevel(lineN);
    return indent0 <= indentN;
  });

  return sub;
}


export function queryContent(
  query: string,
  fileContent: string,
): [Field, Cheerio, CheerioStatic] {
  const field: Field = {
    name: "abstract",
    evidence: [`jquery:[${query}]`],
  };
  const $ = cheerioLoad(fileContent);
  return [field, $(query), $]
}

function _findByQuery(
  query: string,
  fileContent: string,
): Field {
  const [field, maybeAbstract] = queryContent(query, fileContent);
  const cssNormal = makeCssTreeNormalFormFromNode(maybeAbstract);
  const asdf = maybeAbstract.attr('data-abstract');
  prettyPrint({ msg: '_findByQuery', query, field, cssNormal, asdf })
  field.value = getSubtextOrUndef(cssNormal);
  return field;
}


export interface LineMatchOptions {
  lineOffset: number;
  lineCount: number;
  indentOffset: number;
  evidenceEnd: string[];
}

export const defaultLineMatchOptions: LineMatchOptions = {
  lineOffset: 0,
  lineCount: 0,
  indentOffset: 0,
  evidenceEnd: [],
};

export function getMatchingLines(
  evidence: string[],
  options: LineMatchOptions,
  cssNormLines: string[],
): string[] {
  const { lineOffset, lineCount, evidenceEnd } = options;

  const evidenceStartIndex = findIndexForLines(cssNormLines, evidence);

  if (evidenceStartIndex > -1) {
    const fromIndex = evidenceStartIndex + evidence.length + lineOffset;

    let toIndex = lineCount > 0 ? fromIndex + lineCount : cssNormLines.length;

    if (evidenceEnd.length > 0) {
      toIndex = findIndexForLines(cssNormLines, evidenceEnd, fromIndex);
    }

    return cssNormLines.slice(fromIndex, toIndex);
  }
  return [];
}

export function _byLineMatch(
  evidence: string[],
  options: LineMatchOptions,
  cssNormLines: string[],
): Field {
  const { indentOffset } = options;
  const anchoredEvidence = _.map(evidence, ev => `^ +${_.escapeRegExp(ev)}`)
  const evType = _.join(_.map(anchoredEvidence, (e) => `/${e}/`), " _ ");

  const field: Field = {
    name: "abstract",
    evidence: [`lines:[${evType}]`],
  };

  const matchingLines = getMatchingLines(anchoredEvidence, options, cssNormLines);
  if (matchingLines.length === 0) return field;

  const sub = findSubContentAtIndex(
    matchingLines,
    0,
    matchingLines.length,
    indentOffset
  );

  field.value = getSubtextOrUndef(sub);
  return field;
}

export const findInMetaTE: (key: string) => ExtractionFunction =
  (key: string) => (env: ExtractionEnv) => {
    const { fileContentMap } = env;

    const fileContent = fileContentMap['css-norm'];
    if (!fileContent) {
      return TE.left('findInMetaTE');
    }
    const fileContentLines = fileContent.lines;
    const regExp = new RegExp(`^ *meta.+${key}`);
    const metadataLines = _.filter(
      fileContentLines,
      metadataLine => regExp.test(metadataLine)
    );
    const keyValueLine = metadataLines[0];

    if (keyValueLine) {
      const start = "content='";
      const i = keyValueLine.indexOf(start);
      const ilast = keyValueLine.lastIndexOf("'")
      const justValue = keyValueLine.slice(i + start.length, ilast);

      const field: Field = {
        name: "abstract",
        evidence: [`use-input:html-tidy`, `meta:[${key}]`],
        value: justValue,
      };
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    }
    return TE.left('findInMetaTE');
  };


export function findByLineMatchTE(
  evidence: string[],
  options?: Partial<LineMatchOptions>,
): ExtractionFunction {
  const opts = _.assign({}, defaultLineMatchOptions, options);

  return (env: ExtractionEnv) => {
    const { fileContentMap } = env;
    const fileContent = fileContentMap['css-norm'];
    if (!fileContent) {
      return TE.left('findByLineMatchTE: no css-normal-form available');
    }
    const fileContentLines = fileContent.lines;
    const field = _byLineMatch(evidence, opts, fileContentLines)
    if (field.value) {
      field.evidence.unshift(`use-input:css-norm`)
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    }
    return TE.left('findByLineMatchTE');
  }
}
export function findByQuery(
  query: string,
): ExtractionFunction {
  return (env: ExtractionEnv) => {
    const { fileContentMap } = env;

    const fileContent = fileContentMap['tidy-norm'];
    if (!fileContent) {
      return TE.left('findByQuery: no tidy-normal-form available');
    }

    const field = _findByQuery(query, fileContent.content)
    if (field.value) {
      field.evidence.unshift(`use-input:tidy-norm`)
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    }
    return TE.left('findByQuery');
  }
}

export function selectElemAttr(
  elemQuery: string,
  attr: string,
): ExtractionFunction {
  return (env: ExtractionEnv) => {
    const { fileContentMap } = env;

    const fileContent = fileContentMap['tidy-norm'];
    if (!fileContent) {
      return TE.left('selectElemAttr: no tidy-normal-form available');
    }

    const [field, maybeAbstract] = queryContent(elemQuery, fileContent.content);
    field.value = maybeAbstract.attr(attr);
    if (field.value) {
      field.evidence.unshift(`use-input:tidy-norm`);
      field.evidence.push(`select-attr:${attr}`);
      field.evidence.push('score:+1');
      addFieldInstance(env.extractionRecord, field);
      return TE.right(env);
    }
    return TE.left('selectElemAttr');
  }
}



export function getSubtextOrUndef(strs: string[]): string | undefined {
  const justText = filterText(strs);
  const abs = _.join(justText, " ").trim();

  if (abs.length > 0) {
    return abs;
  }
  return undefined;
}
