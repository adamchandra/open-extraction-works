import "chai/register-should";

import _ from "lodash";

import { prettyPrint } from "commons";
import { getMatchingLines } from '../core/field-extract-utils';

describe("Abstract Field Extraction", () => {
  const testDirPath = './test/resources/htmls';

  it("byLineMatch", () => {
    const block = `
html
  head prefix='og: http://ogp.me/ns# fb: http://ogp.me/ns/fb# article: http://ogp.me/ns/article#'
    link href='/assets/fec5338686fb0ac9089648624f85525a9c6ed51a/css/default.css' rel='stylesheet' type='text/css'
    meta @citation_author content='Pascal Massart'
    meta @citation_inbook_title content='Concentration Inequalities'
    comment
      ## End Google Scholar Citation
    meta @description content='This monograph presents a mathematical theory of concentration inequalities ..'
    meta content='Concentration Inequalities' property='http://purl.org/dc/terms/title' typeof='http://schema.org/Book'
`;
    const lines = block.split("\n");
    const opts = {
      lineOffset: -1,
      lineCount: 1,
      indentOffset: 0,
      evidenceEnd: [],
    };

    const evidence = '@description content';
    const ev = `^ *meta.+${evidence}`;
    const res = getMatchingLines([ev], opts, lines);
    prettyPrint({ res });

  });

  // it("should use jquery-like queries to pick out abstracts", () => {
  //   const htmlFiles = [
  //     'download-dfa01ecc.html',
  //     // 'nospace.html'
  //   ]
  //   _.each(htmlFiles, f => {
  //     const htmlFile = path.resolve(testDirPath, f);
  //     const htmlFileContent = fs.readFileSync(htmlFile).toString();
  //     const fields = _.map(AbstractPipelineUpdate, pf => {
  //       return pf([], htmlFileContent);
  //     }).filter(f => f.value);

  //     prettyPrint({ fields });

  //     // expect(fields.length).toBe(1);
  //     // const field = fields[0];
  //     // expect(field.value).toBeDefined;
  //     // expect(field.value).toMatch(/^TrueAbstract/);
  //   })
  // });


//   it("should find metadata content", () => {
//     const metadata = `{
// "authors":[{"name":"Simon J.D. Prince","affiliation":"University College London"}],
// "pdfUrl":"/stamp/stamp.jsp?tp=&arnumber=4459336","openUrlFullLink":"//sfxhosted.exlibrisgroup.com/umass?url_ver","formulaStrippedArticleTitle":"Tied Factor Analysis for Face Recognition across Large Pose Differences",
// "title":"Tied Factor Analysis for Face Recognition across Large Pose Differences",
// "abstract":"TrueAbstract: Face recognition algorithms perform very unreliably when the pose of the probe face is different "
// }`;
//     const meta = _.join(_.split(metadata, "\n"), "");
//     const block = `
// <html>
// <body>
// <script>
// var global = {};
//   global.document.metadata=${meta}
//   global.document.userLoggedIn=true;
// </script>
// </body>
// </html>
// `;
//     // const lines = stripMargin(block.split("\n"));
//     const fields = findAbstractV2([], block);
//     expect(fields.value).toBeDefined;
//     expect(fields.value).toMatch(/^TrueAbstract/);
//   });


});
