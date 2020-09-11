//
import * as cheerio from 'cheerio';

export function cheerioLoad(
  fileContent: string,
  useXmlMode: boolean = true
): CheerioStatic {
  const $ = cheerio.load(fileContent, {
    _useHtmlParser2: true,
    recognizeSelfClosing: true,
    normalizeWhitespace: false,
    xmlMode: useXmlMode,
    decodeEntities: true
  });
  return $;
}
