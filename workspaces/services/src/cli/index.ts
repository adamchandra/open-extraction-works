import "./extraction-cli";
import { arglib } from "commons";
import { registerCLICommands } from '~/workflow/workflow-cli';

registerCLICommands(arglib.YArgs);

arglib.YArgs
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .help()
  .fail(() => undefined)
  .argv;
