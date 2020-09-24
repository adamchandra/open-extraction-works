import 'chai/register-should';

import _ from 'lodash';

import { isLeft, isRight } from 'fp-ts/Either'
import { prettyPrint, stripMargin } from 'commons';
import { selectElementAttr, _queryOne, _queryAll, getOuterHtml, getOuterHtmls } from './html-queries';

import puppeteer from 'puppeteer-extra'
import { Browser } from 'puppeteer';



const tmpHtml = stripMargin(`
|<html>
|  <head>
|    <meta name="citation_author" content="Holte, Robert C." />
|    <meta name="citation_author" content="Burch, Neil" />
|    <meta name="citation_title" content="Automatic move pruning for single-agent search" />
|  </head>
|<body> </body>
|</html>
`);

describe('Field Extraction Pipeline', () => {

  it('puppeteer-based css selection/jquery', async (done) => {

    const attr0 = await selectElementAttr(tmpHtml, 'meta[name=citation_title]', 'content');
    const attr1 = await selectElementAttr(tmpHtml, 'meta[name=citation_title]', 'content_');
    const attr2 = await selectElementAttr(tmpHtml, 'meta[name=empty]', 'content');
    expect(isRight(attr0)).toBeTruthy();
    expect(isLeft(attr1)).toBeTruthy();
    expect(isLeft(attr2)).toBeTruthy();
    // prettyPrint({ attr0, attr1, attr2 });

    done();
  });


  it('query one/all', async (done) => {

    const browser: Browser = await puppeteer.launch({
      headless: true
    });

    try {

      const oneResult = await _queryOne(browser, tmpHtml, 'meta[name=citation_author]');
      const outerOne = await getOuterHtml(oneResult);
      prettyPrint({ outerOne });

      const multiResult = await _queryAll(browser, tmpHtml, 'meta[name=citation_author]');
      const outerMulti = await getOuterHtmls(multiResult);
      prettyPrint({ outerMulti });

    } catch (error) {
      //
      console.log(error)
    }

    await browser.close();
    done();
  });

});
