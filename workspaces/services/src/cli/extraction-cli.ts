import _ from 'lodash';

import { arglib } from 'commons';
import { runMainTestExtractFields } from '~/extract/core/extraction-cli';

const { opt, config, registerCmd } = arglib;

registerCmd(
  arglib.YArgs,
  'run-field-extractors',
  'run field extractors',
  config(
    opt.cwd,
    opt.existingDir('corpus-root: root directory for corpus files'),
    opt.ion('drop', {
      type: 'number',
      required: false,
      default: 0
    }),
    opt.ion('take', {
      type: 'number',
      required: false,
      default: Number.MAX_SAFE_INTEGER,
    }),
    opt.ion('log-level', {
      required: false,
      default: 'info'
    }),
  )
)((args: any) => {
  const { corpusRoot, logLevel, drop, take } = args;
  const logpath = corpusRoot;

  runMainTestExtractFields(
    corpusRoot,
    logpath,
    logLevel,
    drop, take
  ).then(() => {
    console.log('done');
  });
});
