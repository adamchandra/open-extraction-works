
import "./extraction-cli";
import { arglib } from "commons";

arglib.YArgs
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .help()
  .fail(() => undefined)
  .argv;
