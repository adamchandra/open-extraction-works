import _ from "lodash";

import yargs from "yargs";
import { arglib, prettyPrint } from "commons";
import {  } from "commons";
import { createSpider } from '~/spider/spidering';

const { opt, config } = arglib;

yargs.command(
  "crawl",
  "Start the spider/crawler",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
    opt.existingDir("logpath: directory to put log files"),
    opt.existingFile("input: spidering records"),
    opt.ion("interactive", { type: "boolean", default: false }),
    opt.ion("useBrowser", { type: "boolean", default: false })
  ),

  (spiderOpts: any) => {
    prettyPrint({ spiderOpts });
    createSpider(spiderOpts);
  }
);
