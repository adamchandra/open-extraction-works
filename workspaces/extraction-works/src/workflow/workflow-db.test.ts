import "chai/register-should";

import _ from "lodash";
// import path from "path";
// import { initTestCorpusDirs, createEmptyDB } from './test-utils';

describe("DB-Driven Workflows", () => {

  it("should run end-to-end, from db init to spider to bundled abstracts/pdf-links/etc", () => {
    // const serverFiles = "./test/resources";
    // const scratchDir = path.join(".", "scratch.d");
    // const { corpusRoot, corpusPath, spiderInputCSV } = initTestCorpusDirs(scratchDir);
    // const db = await createEmptyDB();


    /**
     *
     *  - [ ] populate database with input csv records
     *  [noteId, paperUrl, venueUrl] (pdf? pdfUrl?)
     *  artifactType: field/abstract, field/title html/pdf-link
     *  ArtifactRequest: [noteTuple, artifactType, requestTransactionId]
     *  RequestTransaction: [requestId, parentRequestId, status(open, success, failure)]
     *  TransactionLog: [requestId, messageKey, message]
     *
     *  - [ ] query database/logs to see the state of un/spidered/extracted records
     *  - [ ] Scrape/crawl any unspidered records
     *  - [ ] Extract
     *
     *
     **/
    // const app = await startTestHTTPServer(serverFiles);

    // const spideringOptions = {
    //   interactive: false,
    //   useBrowser: false,
    //   cwd: scratchDir,
    //   corpusRoot,
    //   logpath: scratchDir,
    //   input: spiderInputCSV,
    // };

    // await createSpider(spideringOptions);

    // const logpath = scratchDir;

    // await runAbstractFinderOnCorpus({
    //   corpusRoot: corpusPath,
    //   logpath
    // });

    // await delay(200);

    // const inputlog = path.resolve(path.join(scratchDir, 'qa-review-abstract-finder-log.json'));
    // const outputlog = path.resolve( path.join(scratchDir, 'clean-abstracts.json'));
    // const outputAbstractsFile = path.resolve( path.join(scratchDir, 'collected-abstracts.json'));
    // const filters: string[] = [];
    // prettyPrint({ inputlog, outputlog });

    // await cleanAbstracts({ corpusRoot, logpath, inputlog, outputlog, filters });

    // await collectAbstractExtractionStats(outputlog, outputAbstractsFile, [])

    // app.close(() => {
    //   console.log('we are done');
    //   done();
    // });

    // await db.close();

    // done();
  });
});
