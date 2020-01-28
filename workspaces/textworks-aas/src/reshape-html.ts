//
import fs from 'fs-extra';
import path from 'path';
// import prompts from 'prompts';


import _ from 'lodash';
import * as cheerio from 'cheerio';

// TODO use npm lib surgeon to extract fields
// TODO peruse: https://github.com/lorien/awesome-web-scraping/blob/master/javascript.md

// import { prettyPrint } from './pretty-print';
import { walkFileCorpus, CorpusEntry } from './corpora/file-corpus';
import { prettyPrint } from './pretty-print';

type Attrs = { [k: string]: string };

function parseAttrs(attrs: Attrs): string[][] {
  const keys = _.keys(attrs);
  let kvs: string[][] = [];
  const stdKeys = [['id', '#'], ['class', '.'], ['href', 'href'], ['src', 'src'], ['name', '@']];
  _.each(stdKeys, ([k, abbr]) => {
    const v = attrs[k];
    if (v) {
      if (v.includes(' ')) {
        const words = v.split(' ').map(_.trim).filter(_.isEmpty);
        _.each(words, w => {
          kvs.push([k, w, abbr]);
        });
      } else if (_.isArray(v)) {
        _.each(v, v0 => {
          kvs.push([k, v0, abbr]);
        });
      } else {
        kvs.push([k, v, abbr]);
      }
    }
  });
  const otherKeys = keys.filter(ok => !_.some(stdKeys, ([k]) => k===ok));
  const sorted = _.sortBy(otherKeys);
  _.each(sorted, k => {
    const v = attrs[k];
    if (v) {
      kvs.push([k, v, k]);
    }
  });

  return kvs;
}


function indentStrings(strs: string[], lpad: string|number): string[] {
  let p = lpad;
  if (typeof lpad === 'number') {
    p = ''.padStart(lpad)
  }
  return _.map(strs, str => p+str);
}

export function makeCssTreeNormalFormFromNode(root: Cheerio): string[] {

  const finalTree: string[] = [];

  _.each(_.range(root.length), (rootIndex) => {
    const elem = root[rootIndex]

    mapHtmlTree(elem, (node: CheerioElement, depth, _index, _sibcount) => {
      const tn = node.tagName
      const tp = node['type'];

      let lpad = ''.padStart(depth*2);
      const attrs = node.attribs;
      let attrsStr = '';
      if (attrs) {
        const attrPairs = parseAttrs(attrs);
        const attrstr0 = _.map(attrPairs, ([_k, v, abbr]) => {
          if (abbr.length===1) {
            return `${abbr}${v}`;
          }
          return `${abbr}='${v}'`;
        });
        attrsStr = _.join(attrstr0, ' ');
      }

      switch (tp) {
        case 'tag': {
          const line = `${lpad}${tn} ${attrsStr}`;
          finalTree.push(line)
          break;
        }

        case 'text': {
          const d = node.data?.trim();
          if (d && d.length > 0) {
            const lines = d.split('\n');
            const indentedLines =
              indentStrings(
                indentStrings(lines, '| ' ),
                depth*2
              );
            _.each(indentedLines, l => finalTree.push(l));
          }
          break;
        }

        case 'comment': {
          const line = `${lpad}comment`;
          finalTree.push(line)
          const d = node.data?.trim();
          if (d && d.length > 0) {
            const lines = d.split('\n');
            const indentedLines =
              indentStrings(
                indentStrings(lines, '## ' ),
                (depth+1)*2
              );
            _.each(indentedLines, l => finalTree.push(l));
          }
          break;
        }

        default:
          const line = `${lpad}${tn}[${tp}] ${attrsStr}`;
          finalTree.push(line)
      }

    });
  });

  return finalTree;
}

export function makeCssTreeNormalForm(htmlFile: string): string[] {
  const $ = cheerio.load(htmlFile);
  const root: Cheerio = $(':root');
  return makeCssTreeNormalFormFromNode(root);
}

function mapHtmlTree(
  rootElem: CheerioElement,
  f: (node: CheerioElement, depth: number, index: number, siblings: number) => any
) {

  function _inner(elem: CheerioElement, dpt: number, idx: number, sibs: number) {
    f(elem, dpt, idx, sibs);
    const childs = elem.children;
    if (childs) {
      const chsibs = childs.length;
      const chdpt = dpt+1;
      _.each(childs, (child, chidx) => {
        _inner(child, chdpt, chidx, chsibs);
      });
    }
  }
  _inner(rootElem, 0, 0, 1);
}


export async function viewNormalizedHtmls(corpusRoot: string) {
  return walkFileCorpus(corpusRoot,  (entry: CorpusEntry) => {
    const htmlFile = path.join(entry.path, 'download.html');
    const metaFile = path.join(entry.path, 'entry-meta.json');
    const fileContent = readFile(htmlFile);
    const metaFileContent = readFile(metaFile);

    if (!metaFileContent) {
      prettyPrint({ msg: 'file could not be read' });
      return;
    }

    const meta = JSON.parse(metaFileContent);


    if (!fileContent) {
      prettyPrint({ msg: 'file could not be read' });
      return;
    }

    if (fileContent.length === 0) {
      prettyPrint({ msg: 'file is empty' });
      return;
    }

    const cssNormalForm = makeCssTreeNormalForm(fileContent);
    const cssNormal = _.join(cssNormalForm, '\n');
    console.log(meta);
    console.log(cssNormal);

  }).then(() => {
    console.log('done walking');
  });
}

function readFile(leading: string, ...more: string[]): string|undefined {
  const filepath = path.join(leading, ...more);
  const exists = fs.existsSync(filepath);
  if (exists) {
    const buf = fs.readFileSync(filepath);
    const fileContent = buf.toString().trim();
    return fileContent;
  }
  return undefined;
}
// get-css
// $.prototype.getUniqueSelector = function () {
//     var el = this;
//     var parents = el.parents();
//     if (!parents[0]) {
//       // Element doesn't have any parents
//       return ':root';
//     }
//     var selector = getElementSelector(el);
//     var i = 0;
//     var elementSelector;

//     if (selector[0] === '#' || selector === 'body') {
//       return selector;
//     }

//     do {
//       elementSelector = getElementSelector($(parents[i]));
//       selector = elementSelector + ' > ' + selector;
//       i++;
//     } while (i < parents.length - 1 && elementSelector[0] !== '#'); // Stop before we reach the html element parent
//     return selector;
//   };

//   function getElementSelector(el) {
//     if (el.attr('id')) {
//       return '#' + el.attr('id');
//     } else {
//       var tagName = el.get(0).tagName;
//       if (tagName === 'body') {
//         return tagName;
//       }
//       if (el.siblings().length === 0) {
//         return el.get(0).tagName;
//       }
//       if (el.index() === 0) {
//         return el.get(0).tagName + ':first-child';
//       }
//       if (el.index() === el.siblings().length){
//         return el.get(0).tagName + ':last-child';
//       }
//       return el.get(0).tagName+ ':nth-child(' + (el.index() + 1) + ')';
//     }
//   }
// }
