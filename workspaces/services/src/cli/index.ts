import './extraction-cli';
import { arglib } from 'commons';
import { registerCLICommands } from '~/workflow/workflow-cli';
import '~/http-servers/extraction-rest-portal/rest-server';
import '~/spidering/commands';

registerCLICommands(arglib.YArgs);

arglib.YArgs
  .demandCommand(1, 'You need at least one command before moving on')
  .strict()
  .help()
  .fail((err) => {
    console.log('Error', err);
    arglib.YArgs.showHelp();
  })
  .argv;
