import _ from "lodash";

import { arglib } from "commons";
import { runMainExtractAbstracts, runMainGatherAbstracts, runMainUpdateGroundTruths } from '~/extract/abstracts/cli-main';

const { opt, config, registerCmd } = arglib;

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
  "gather-abstracts",
  "gather all extracted abstracts",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
    opt.existingFile("alpha-recs: csv file with alpha records")
  )
)((args: any) => {

  const { corpusRoot, alphaRecs } = args;

  runMainGatherAbstracts(
    corpusRoot,
    alphaRecs
  ).then(() => {
    console.log('done');
  });
});

registerCmd(
  arglib.YArgs,
  "update-ground-truths",
  "update and/or initialize the ground-truth entries",
  config(
    opt.cwd,
    opt.existingDir("corpus-root: root directory for corpus files"),
  )
)((args: any) => {

  const { corpusRoot } = args;

  runMainUpdateGroundTruths(
    corpusRoot,
  ).then(() => {
    console.log('done');
  });
});
