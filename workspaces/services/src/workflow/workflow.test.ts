import "chai/register-should";

import _ from "lodash";
import winston, {
  createLogger,
  format,
  transports,
} from "winston";

// import { putStrLn, delay } from 'commons';
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';
import { getWorkflowServiceLogger } from './service-comm';


describe("End-to-end Extraction workflows", () => {

  it("should execute hub, service startup/shutdown", async (done) => {
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames, (service) => {
        return runService(service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    await hubService.broadcast('shutdown');
    await hubService.quit();
    done();
  });

  it.only("should demo end-to-end processing", async (done) => {
    const log = getWorkflowServiceLogger();
    log.level = 'info';
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames, (service) => {
        return runService(service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    const restPortal = _.filter(satellites, s => s.serviceName === 'rest-portal')[0];

    // Fake a 'done' message;
    await restPortal.getServiceComm().sendTo('hub', 'done');

    hubService.addHandlers('inbox', {
      async 'field-extractor:done'() {
        await hubService.broadcast('shutdown');
        await hubService.quit();
        done();
      }

    })
  });

  it("test logging",  () => {
    // const cli = winston.config.cli;
    // const logger = createLogger({
    //   level: 'silly',
    //   levels: cli.levels,
    //   transports: [
    //     new transports.Console({
    //       format: format.combine(
    //         format.colorize(),
    //         format.simple(),
    //       ),
    //     }),
    //     new transports.Console({
    //       format: format.combine(
    //         format.colorize(),
    //         format.splat(),
    //       ),
    //     }),
    //   ],
    // });

    // logger.error('some message');
    // logger.warn('some message');
    // logger.help('some message');
    // logger.data('some message');
    // logger.info('some message', "more", {a: 2});
    // logger.debug('some message');
    // logger.prompt('some message');
    // logger.verbose('some message');
    // logger.input('some message');
    // logger.silly('some message');

  });

});
