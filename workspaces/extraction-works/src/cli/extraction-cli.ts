import _ from "lodash";

import path from "path";
import { arglib } from "commons";
import { pruneCrawledFromCSV } from '~/openreview/workflow';
import { runMainExtractAbstracts, runMainWriteAlphaRecords, runMainInteractiveFieldReview } from '~/extract/abstracts/cli-main';
import { interactiveUIAppMain } from '~/qa-editing/interactive-ui';

const { opt, config, registerCmd } = arglib;

registerCmd(
  "openreview-prune-csv",
  "remove records from csv that have already been spidered",
  config(
    opt.cwd,
    opt.existingFile("scrapyLog: ..."),
    opt.existingFile("csv: ..."),
  )
)((opts: any) => {
  const { scrapyLog, csv } = opts;
  Promise.all([
    pruneCrawledFromCSV(scrapyLog, csv)
  ]).then(() => {
    console.log('done');
  })
});


registerCmd(
  "write-alpha-records",
  "write out alpha-recs, ",
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
