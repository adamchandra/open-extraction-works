//
import "chai/register-should";

import _ from "lodash";
import fs from "fs-extra";
import path from "path";
import * as cheerio from "cheerio";

import { prettyPrint } from "commons";
import { makeCssTreeNormalFormFromNode } from './reshape-html';
import { cheerioLoad } from './field-extract-utils';

describe("Normalize htmls", () => {
  const testDirPath = './test/resources/htmls';

  it("smokescreen", () => {
    const htmlFile = path.resolve(testDirPath, 'nospace.html');
    const htmlFileContent = fs.readFileSync(htmlFile);

    const $ = cheerioLoad(htmlFileContent.toString());
    const root: Cheerio = $(":root");
    const normalForm = makeCssTreeNormalFormFromNode(root);
    const abIndex = normalForm.findIndex(l => /article__body/.test(l));
    const lines = normalForm.slice(abIndex-5, abIndex+20);
    prettyPrint({ htmlFile, lines });
  });

  it("reshape.test.html", () => {
    const htmlFile = path.resolve(testDirPath, 'reshape.test.html');
    const htmlFileContent = fs.readFileSync(htmlFile);

    const $ = cheerioLoad(htmlFileContent.toString());
    const root: Cheerio = $(":root");
    const normalForm = makeCssTreeNormalFormFromNode(root);
    // const abIndex = normalForm.findIndex(l => /article__body/.test(l));
    // const lines = normalForm.slice(abIndex-5, abIndex+20);
    const lines = _.join(normalForm, '\n');
    // prettyPrint({ htmlFile, lines });
    console.log(lines);
  });

  it("should handle self-closing tags", () => {
    //
  });

  it("should handle script tags", () => {
    //
  });


});