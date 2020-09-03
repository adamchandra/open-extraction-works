import _ from "lodash";

import {
  findByLineMatchTE,
  findInMetaTE,
  selectElemAttr,
} from "~/extract/core/field-extract-utils";
import { ExtractionFunction } from '../core/extraction-process';
import { filterUrl, findInGlobalDocumentMetadata } from '../core/field-extract';

export const PdfLinkPipeline: ExtractionFunction[][] = [
  [selectElemAttr('meta[name=citation_pdf_url]', 'content')],

  // sel('a[href^=/doi/pdf/])
  // <a href="/doi/pdf/10.1145/3306346.3323011"
];

export const AbstractPipeline: ExtractionFunction[][] = [

  [findInMetaTE('@description content')],
  [findInMetaTE('@DCTERMS.abstract content')],
  [findInMetaTE('@citation_abstract content')],
  [findInMetaTE('@abstract content')],
  [findInMetaTE('@DC.[Dd]escription content')],
  [findInMetaTE("prop='og:description'")],

  [
    // "https://content.iospress.com/articles/ai-communications/aic605",
    filterUrl(/content.iospress.com/),
    selectElemAttr('h1[data-abstract]', 'data-abstract')
  ],

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

