import _ from "lodash";

import { arglib } from "commons";
import { runMainExtractAbstracts, runMainInteractiveFieldReview } from '~/extract/abstracts/cli-main';

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
