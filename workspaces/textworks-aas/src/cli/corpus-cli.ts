import _ from "lodash";

import path from "path";
import yargs from "yargs";
import { arglib } from "commons";

import { pruneCrawledFromCSV, verifyCrawledRecords } from '~/openreview/workflow';
import { runAbstractFinderOnScrapyCache } from '~/extract/abstracts/cli-main';
import { runInteractiveFieldReview } from '~/extract/abstracts/data-clean-abstracts';

const { opt, config } = arglib;

yargs.command(
  "openreview-prune-csv",
  "remove records from csv that have already been spidered",
  config(
    opt.cwd,
    opt.existingFile("scrapyLog: ..."),
    opt.existingFile("csv: ..."),
  ),
  (opts: any) => {
    const { scrapyLog, csv } = opts;
    Promise.all([
      pruneCrawledFromCSV(scrapyLog, csv)
    ]).then(() => {
      console.log('done');
    })
  },
);

yargs.command(
  "openreview-verify-crawled",
  "verify the logs/csv/extracted abstracts",
  config(
    opt.cwd,
    opt.existingFile("scrapyLog: ..."),
    opt.existingFile("csv: ..."),
  ),
  (opts: any) => {
    const { scrapyLog, csv } = opts;
    Promise.all([
      verifyCrawledRecords(scrapyLog, csv)
    ]).then(() => {
      console.log('done');
    })
  },
);

yargs.command(
  "find-abstracts-in-cache",
  "run the abstract field extractors over htmls in corpus",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
    opt.ion('overwrite: force overwrite of existing files', { boolean: true })
  ),
  (args: any) => {

    const { corpusRoot, overwrite } = args;
    const scrapyLog = path.resolve(corpusRoot, 'crawler.log');
    const logpath = corpusRoot;
    const csvFile = path.resolve(corpusRoot, 'dblp_urls.csv');

    runAbstractFinderOnScrapyCache(
      corpusRoot,
      logpath,
      scrapyLog,
      csvFile,
      overwrite,
    ).then(() => {
      console.log('done');
    });
  },
);

yargs.command(
  "review-extraction",
  "review the extraction process",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
  ),
  (args: any) => {

    const { corpusRoot } = args;
    // const scrapyLog = path.resolve(corpusRoot, 'crawler.log');
    const logpath = corpusRoot;
    // const csvFile = path.resolve(corpusRoot, 'dblp_urls.csv');

    runInteractiveFieldReview(
      corpusRoot,
      logpath,
    );
  },
);
