import yargs, { Argv } from 'yargs';

import { prettyPrint } from '~/util/pretty-print';
import { yall, opt } from './arglib';
import { normalizeHtmls } from '~/extract/reshape-html';
import { extractAbstractFromHtmls } from '~/extract/field-extract-abstract';
import { normalizeCmd } from './corpus-cli';

yargs.commandDir('.', {
  recurse: false,
  extensions: ['ts'],
  include: /.*-cmd.ts/,
});

yargs.command(
  'write-norms',
  'desc.',
  (yargs: Argv) => {
    yall(yargs, [
      opt.existingDir('corpus-root: root directory for downloaded files'),
    ]);
  },
  (argv: any) => {
    const { corpusRoot } = argv;
    normalizeHtmls(corpusRoot);
  }
);

yargs.command(
  'find-abstracts',
  'find all abstracts',
  (yargs: Argv) => {
    yall(yargs, [
      opt.existingDir('corpus-root: root directory for downloaded files'),
    ]);
  },
  (argv: any) => {
    const { corpusRoot } = argv;
    extractAbstractFromHtmls(corpusRoot);
  }
);

yargs
  .demandCommand(1, 'You need at least one command before moving on')
  .strict()
  .help()
  .fail(function (msg, err, _yargs) {
    const errmsg = err? `${err.name}: ${err.message}` : '';
    prettyPrint({ msg, errmsg });
    process.exit(1)
  })
  .argv
;
