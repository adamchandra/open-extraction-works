import "chai/register-should";

import _ from "lodash";
import { runServiceHub, runService, WorkflowServiceNames } from './workflow-services';
import { HandlerSet } from './service-comm';
import { defineSatelliteService, createSatelliteService, createHubService, SatelliteService, ServiceHub } from './service-hub';
import { slidingWindow, putStrLn } from 'commons';
import Async from 'async';


async function createTestServices(n: number): Promise<[ServiceHub, Array<SatelliteService<void>>]> {
  const serviceNames = _.map(_.range(n), (i) => `service-${i}`);
  const hubPool = await createHubService('hub')

  // Make hub aware of service names, so that it will wait for them to start before continuing
  const satelliteInits = _.map(serviceNames, serviceName => {
    return hubPool.addSatelliteService(serviceName);
  });

  const pairWise = slidingWindow(2);
  const servicePairs = pairWise(serviceNames);
  const handlerSet: HandlerSet = {};
  _.each(servicePairs, ([svc1, svc2]) => {
    const onEvent = `${svc1}:done`;
    handlerSet[onEvent] = async () => {
      await hubPool.getComm().sendTo(`${svc2}`, 'run');
    };
  });

  hubPool.getComm().addHandlers('inbox', handlerSet);

  // TODO Async.mapXX seem to be buggy; if iterator fn is not declared as async (v) => {}, it doesn't work
  const satelliteServices = await Async.map<string, SatelliteService<void>, Error>(
    serviceNames, async (serviceName) => {
      const serviceDef = defineSatelliteService<void>(
        async () => undefined, {
      });
      return createSatelliteService(serviceName, serviceDef);
    });

  await Promise.all(satelliteInits);
  putStrLn('createSatelliteService: after satelliteInits resolved')
  return [hubPool, satelliteServices];
}

describe("Service Communication Hub lifecycle", () => {
  it.only("should run hub, service lifecycles", async (done) => {
    const [hub, satellites] = await createTestServices(3);

    // TODO wait for all-ready signal
    await hub.getComm().broadcast('shutdown');
    await hub.getComm().quit();
    done();
  });

  it("should execute hub, service startup/shutdown", async (done) => {
    const hubService = await runServiceHub(false);
    const satellitePs = _.map(
      WorkflowServiceNames, (service) => {
        return runService(service, false);
      }
    );

    const satellites = await Promise.all(satellitePs);
    await hubService.getComm().broadcast('shutdown');
    await hubService.getComm().quit();
    done();
  });

  it("should demo end-to-end startup/run/shutdown", async (done) => {
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

    hubService.getComm().addHandlers('inbox', {
      async 'field-extractor:done'() {
        await hubService.getComm().broadcast('shutdown');
        await hubService.getComm().quit();
        done();
      }

    })
  });

  it("test logging", () => {
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
