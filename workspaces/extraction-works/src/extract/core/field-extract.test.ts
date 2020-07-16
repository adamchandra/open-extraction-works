import "chai/register-should";

import _ from "lodash";

import { prettyPrint } from "commons";
import * as TE from 'fp-ts/lib/TaskEither';
import { pipe } from 'fp-ts/lib/pipeable';
import { readMetaProps, filterUrl, runFileVerification, runHtmlTidy, initialEnv } from './field-extract';
import { ExtractionEnv } from './extraction-process';

describe("Field Extraction Pipeline", () => {

  const testEntryPath = './test/resources/scrapy-cache-entry';

  it("should have a terse syntax", async (done) => {

    // doPipeline(
    //   { ...initialEnv, entryPath: testEntryPath },
    //   [readMetaProps,
    //     filterUrl(/sdf/),
    //     runFileVerification(/html/i),
    //     runHtmlTidy],
    // ).then((result) => {
    //   prettyPrint({ result });
    //   done();
    // });
  });

  it("should run a single extraction stage", async (done) => {
    // TE.map((env: ExtractionEnv) => { prettyPrint({ env }); return env; } ),
    const res = pipe(
      TE.right<string, ExtractionEnv>({ ...initialEnv, entryPath: testEntryPath }),
      TE.chain(readMetaProps),
      TE.chain(filterUrl(/ieee.org/)),
      TE.chain(runFileVerification(/html/i)),
      TE.chain(runHtmlTidy),
      // TE.chain(parseJson(global.document.metadata)),
      TE.map((env: ExtractionEnv) => {
        prettyPrint({ msg: "success", env });
        done()
        return env;
      }),
      TE.mapLeft((err: string) => {
        prettyPrint({ msg: "error", err });
        done();
        return err;
      }),
    );

    res();
  });

  it.only("should extract from embedded json rec global.document.metadata", async (done) => {
    // const finderFunctions: ExtractionFunction[][] = [
    //   [
    //     readMetaProps,
    //     filterUrl(/ieee.org/),
    //     runFileVerification(/html/i),
    //     runHtmlTidy,
    //     findInGlobalDocumentMetadata,
    //     // findByLineMatchTE(
    //     //   [' +|', ' +p', ' +p', ' +|'],
    //     //   { lineOffset: 1 }
    //     // )
    //   ]
    // ];

    // await runAbstractFinders(AbstractPipelineUpdate, testEntryPath)
    // await runAbstractFinders(finderFunctions, testEntryPath)

    done();

    // const res = pipe(
    //   TE.right<string, ExtractionEnv>({ ...initialEnv, entryPath: testEntryPath }),
    //   TE.chain(readMetaProps),
    //   TE.chain(filterUrl(/ieee.org/)),
    //   TE.chain(runFileVerification(/html/i)),
    //   TE.chain(runHtmlTidy),
    //   // TE.chain(parseJson(global.document.metadata)),
    //   TE.map((env: ExtractionEnv) => {
    //     prettyPrint({ msg: "success", env });
    //     done()
    //     return env;
    //   }),
    //   TE.mapLeft((err: string) => {
    //     prettyPrint({ msg: "error", err });
    //     done();
    //     return err;
    //   }),
    // );

  });
});
