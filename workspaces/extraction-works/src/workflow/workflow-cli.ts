
import yargs  from "yargs";
import { arglib } from 'commons';
import { WorkflowServiceNames, runService } from './workflow-server';
const { opt, config, registerCmd } = arglib;

export function registerCLICommands(yargv: yargs.Argv) {
  registerCmd(
    yargv,
    "start-service",
    "start workflow service hub",
    config(
      opt.ion("dockerize", { boolean: true, default: false }),
      opt.ion("service-name: name of service to launch", {
        choices: WorkflowServiceNames
      })
    )
  )((args: any) => {
    const { serviceName, dockerize } = args;
    runService(serviceName, dockerize);
  });
}
