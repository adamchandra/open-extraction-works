//
import _ from 'lodash';
// import { cheerioLoad } from './html-queries';

type Attrs = { [k: string]: string };

function parseAttrs(attrs: Attrs): string[][] {
  const keys = _.keys(attrs);

  const kvs: string[][] = [];
  const stdKeys = [
    ['id', '#'],
    ['class', '.'],
    ['href', 'href'],
    ['src', 'src'],
    ['name', '@'],
    ['lang', 'lang'],
    ['xml:lang', 'xml:lang'],
    ['property', 'prop'],
  ];
  _.each(stdKeys, ([k, abbr]) => {
    const v = attrs[k];
    if (v) {
      if (v.includes(' ')) {
        const words = v
          .split(' ')
          .map(_.trim)
          .filter(_.negate(_.isEmpty));

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
  const otherKeys = keys.filter(ok => !_.some(stdKeys, ([k]) => k === ok));
  const sorted = _.sortBy(otherKeys);
  _.each(sorted, k => {
    const v = attrs[k];
    if (v) {
      kvs.push([k, v, k]);
    }
  });

  return kvs;
}

function indentStrings(strs: string[], lpad: string | number): string[] {
  let p = lpad;
  if (typeof lpad === 'number') {
    p = ''.padStart(lpad);
  }
  return _.map(strs, str => p + str);
}


type Cheerio = any;
export function makeCssTreeNormalFormFromNode(root: any): string[] {
  return ['TODO'];
}
// export function makeCssTreeNormalFormFromNode(root: Cheerio): string[] {
//   const finalTree: string[] = [];

//   _.each(_.range(root.length), rootIndex => {
//     const elem = root[rootIndex];

//     mapHtmlTree(elem, (node: CheerioElement, depth, _index, _sibcount) => {
//       const tn = node.tagName;
//       const tp = node['type'];

//       const lpad = ''.padStart(depth * 2);
//       const attrs = node.attribs;
//       let attrsStr = '';
//       if (attrs) {
//         const attrPairs = parseAttrs(attrs);

//         const attrstr0 = _.map(attrPairs, ([_k, v, abbr]) => {
//           if (abbr.length === 1) {
//             return `${abbr}${v}`;
//           }
//           return `${abbr}='${v}'`;
//         });
//         attrsStr = _.join(attrstr0, ' ');
//       }

//       // prettyPrint({ depth, tn, tp, attrs });

//       switch (tp) {
//         case 'tag': {
//           const line = `${lpad}${tn} ${attrsStr}`;
//           finalTree.push(line);
//           break;
//         }

//         case 'text': {
//           const d = node.data ? node.data.trim() : undefined;
//           if (d && d.length > 0) {
//             const lines = d.split('\n');
//             const indentedLines = indentStrings(
//               indentStrings(lines, '| '),
//               depth * 2,
//             );
//             _.each(indentedLines, l => finalTree.push(l));
//           }
//           break;
//         }

//         case 'comment': {
//           const line = `${lpad}comment`;
//           finalTree.push(line);
//           const d = node.data ? node.data.trim() : undefined;
//           if (d && d.length > 0) {
//             const lines = d.split('\n');
//             const indentedLines = indentStrings(
//               indentStrings(lines, '## '),
//               (depth + 1) * 2,
//             );
//             _.each(indentedLines, l => finalTree.push(l));
//           }
//           break;
//         }

//         default: {
//           const line = `${lpad}${tn}[${tp}] ${attrsStr}`;
//           finalTree.push(line);
//         }
//       }
//     });
//   });

//   return finalTree;
// }

export function makeCssTreeNormalForm(htmlFile: string, useXmlMode: boolean = true): string[] {
  // const $ = cheerioLoad(htmlFile, useXmlMode);
  // const root: Cheerio = $(':root');
  throw new Error('unimplemented');
  // return makeCssTreeNormalFormFromNode(root);
}

// function mapHtmlTree(
//   rootElem: CheerioElement,
//   f: (
//     node: CheerioElement,
//     depth: number,
//     index: number,
//     siblings: number,
//   ) => any,
// ) {
//   function _inner(
//     elem: CheerioElement,
//     dpt: number,
//     idx: number,
//     sibs: number,
//   ) {
//     f(elem, dpt, idx, sibs);
//     const childs = elem.children;
//     // // dbg
//     // const tn = elem.tagName;
//     // const tp = elem["type"];
//     // const ccs = _.map(childs, c => {
//     //   const tn = c.tagName;
//     //   const tp = c["type"];
//     //   return `${tn}::${tp}`;
//     // });
//     // const ccsstr = _.join(ccs, " ; ");
//     // const xxxstr = `${dpt}. ${tn}:${tp}  >>  ${ccsstr}`;
//     // console.log('mapHtmlTree', xxxstr);

//     if (childs) {
//       const chsibs = childs.length;
//       const chdpt = dpt + 1;
//       _.each(childs, (child, chidx) => {
//         _inner(child, chdpt, chidx, chsibs);
//       });
//     }
//   }
//   _inner(rootElem, 0, 0, 1);
// }
