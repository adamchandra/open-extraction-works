import _ from "lodash";

import path from "path";
import { arglib } from "commons";
import { runMainExtractAbstracts, runMainWriteAlphaRecords, runMainInteractiveFieldReview } from '~/extract/abstracts/cli-main';
// import { pruneCrawledFromCSV } from '~/spidering/spider-service';

const { opt, config, registerCmd } = arglib;

// registerCmd(
//   arglib.YArgs,
//   "openreview-prune-csv",
//   "remove records from csv that have already been spidered",
//   config(
//     opt.cwd,
//     opt.existingFile("scrapyLog: ..."),
//     opt.existingFile("csv: ..."),
//   )
// )((opts: any) => {
//   const { scrapyLog, csv } = opts;
//   Promise.all([
//     pruneCrawledFromCSV(scrapyLog, csv)
//   ]).then(() => {
//     console.log('done');
//   })
// });


registerCmd(
  arglib.YArgs,
  "write-alpha-records",
  "write out alpha-recs",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
  ),
)((args: any) => {
  const { corpusRoot } = args;
  const scrapyLog = path.resolve(corpusRoot, 'crawler.log');
  const csvFile = path.resolve(corpusRoot, 'dblp_urls.csv');

  runMainWriteAlphaRecords(
    corpusRoot,
    scrapyLog,
    csvFile,
  ).then(() => {
    console.log('done');
  });
})

registerCmd(
  arglib.YArgs,
  "extract-abstracts",
  "run the abstract field extractors over htmls in corpus",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
    // opt.ion('overwrite: force overwrite of existing files', { boolean: false })
  )
)((args: any) => {

  const { corpusRoot } = args;
  const logpath = corpusRoot;

  runMainExtractAbstracts(
    corpusRoot,
    logpath,
  ).then(() => {
    console.log('done');
  });
});

registerCmd(
  arglib.YArgs,
  "review-extraction",
  "interactively review the extraction process",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
  )
)((args: any) => {

  const { corpusRoot } = args;

  runMainInteractiveFieldReview(
    corpusRoot
  );
});
