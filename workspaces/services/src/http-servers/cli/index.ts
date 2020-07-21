import { arglib } from "commons";

import "~/extraction-rest-portal/rest-server";

arglib.YArgs
  .demandCommand(1, "You need at least one command before moving on")
  .strict()
  .help()
  .fail(() => undefined)
  .argv;
