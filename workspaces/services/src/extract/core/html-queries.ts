import puppeteer from 'puppeteer-extra'
import * as E from 'fp-ts/Either';
import { pipe } from 'fp-ts/function'
import { isRight } from 'fp-ts/Either'
import Async from 'async';

import {
  Page,
  Browser,
  ElementHandle,
} from 'puppeteer';



// export function cheerioLoad(
//   fileContent: string,
//   useXmlMode: boolean = true
// ): CheerioStatic {
//   const $ = cheerio.load(fileContent, {
//     _useHtmlParser2: true,
//     recognizeSelfClosing: true,
//     normalizeWhitespace: false,
//     xmlMode: useXmlMode,
//     decodeEntities: true
//   });
//   return $;
// }

// export interface HtmlBrowser {
//   browser: Browser;
//   htmlSource: string;
//   setHtmlSource(s: string): void;
//   queryOne(q: string): Promise<ElemSelectOne>;
//   queryAll(q: string): Promise<ElemSelectAll>;
// }
export type AttrSelection = E.Either<string, string>;

export type Elem = ElementHandle<Element>;
export type ElemSelectOne = E.Either<string, Elem>;
export type ElemSelectAll = E.Either<string, Elem[]>;

export async function _queryAll(
  browser: Browser,
  sourceHtml: string,
  query: string
): Promise<ElemSelectAll> {
  const page: Page = await browser.newPage();

  try {

    await page.setContent(sourceHtml);
    const elems: ElementHandle<Element>[] = await page.$$(query);
    return E.right(elems);

  } catch (error) {
    if (error instanceof Error) {
      return E.left(`${error.name}: ${error.message}`);
    }
    return E.left(error);
  }
}

export async function _queryOne(
  browser: Browser,
  sourceHtml: string,
  query: string
): Promise<ElemSelectOne> {
  return _queryAll(browser, sourceHtml, query)
    .then(elems => {
      return pipe(elems, E.chain(es => {
        return es.length > 0
          ? E.right(es[0])
          : E.left(`empty selection '${query}'`);
      }));
    });
}

export async function queryOne(
  sourceHtml: string,
  elementSelector: string,
): Promise<ElemSelectOne> {
  const browser: Browser = await puppeteer.launch({});

  const result = await _queryOne(browser, sourceHtml, elementSelector);

  await browser.close();
  return result;
}

export async function queryAll(
  sourceHtml: string,
  elementSelector: string,
): Promise<ElemSelectAll> {
  const browser: Browser = await puppeteer.launch({});

  const result = await _queryAll(browser, sourceHtml, elementSelector);

  await browser.close();
  return result;
}

export async function selectElementAttr(
  sourceHtml: string,
  elementSelector: string,
  attributeName: string
): Promise<AttrSelection> {
  const browser: Browser = await puppeteer.launch({
    headless: true
  });

  const result: AttrSelection = await _selectElementAttr(
    browser,
    sourceHtml,
    elementSelector,
    attributeName
  );

  await browser.close();
  return result;
}


export async function _selectElementAttr(
  browser: Browser,
  sourceHtml: string,
  elementSelector: string,
  attributeName: string
): Promise<AttrSelection> {
  const page: Page = await browser.newPage();
  try {
    await page.setContent(sourceHtml);

    const maybeAttr = await page.$eval(elementSelector, (elem, attr) => {
      const attrValue = elem.getAttribute(attr);
      const elemHtml = elem.outerHTML;
      return { elemHtml, attrValue };
    }, attributeName);

    if (maybeAttr === null) return E.left(`empty selection '${elementSelector}'`);

    const { attrValue } = maybeAttr;
    if (attrValue === null) return E.left(`no attr ${attributeName} in select('${elementSelector}')`);

    return E.right(attrValue);
  } catch (error) {
    if (error instanceof Error) {
      return E.left(`${error.name}: ${error.message}`);
    }
    return E.left(error);
  }
}

export async function getOuterHtml(maybeElem: ElemSelectOne): Promise<string> {
  if (isRight(maybeElem)) {
    const elem = maybeElem.right;
    return await elem.evaluate((e) => e.outerHTML);
  }
  return '(error)'
}


export async function getOuterHtmls(maybeElems: ElemSelectAll): Promise<string[]> {
  if (isRight(maybeElems)) {
    const elems = maybeElems.right;

    const outers = await Async.map<Elem, string>(elems, async (elem) => {
      return await elem.evaluate((e) => e.outerHTML)
    })
    return outers;
  }
  return ['(error)'];
}

export async function getTextContent(elem: Elem): Promise<string> {
  const text = await elem.evaluate((e) => e.textContent);
  return text === null ? '' : text;
}
